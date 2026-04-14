import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Plus, Search, Download, Loader2, Pencil, Trash2,
  Package, DropletIcon, FileText, UserCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface BackendPfi {
  id: number;
  pfi_number: string;
  status: 'active' | 'finished';
  location_name?: string;
  product_name?: string;
  starting_qty_litres?: number;
  sold_qty_litres?: number;
  orders_count?: number;
  total_amount?: number | string;
}

interface DeliveryAllocation {
  id: number;
  pfi: number;
  pfi_number?: string;
  pfi_product?: string;
  pfi_location?: string;
  depot?: string;
  location?: string;
  quantity_allocated: number | string;
  quantity_sold?: number | string;
  quantity_remaining?: number | string;
  revenue_collected?: number | string;
  date_allocated: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

interface TruckLoading {
  id: number;
  truck?: number | null;
  truck_number?: string;
  loading_status?: string;
  quantity_allocated: string | number;
}

type PagedResponse<T> = { count: number; results: T[] };

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const toNum = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmtQty = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const formatWithCommas = (v: string): string => {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const intPart = (parts[0] || '').replace(/^0+(?=\d)/, '');
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (parts.length > 1) return `${formatted}.${parts[1]}`;
  return formatted;
};

const stripCommas = (v: string): string => v.replace(/,/g, '');

const safePaged = <T,>(raw: unknown): PagedResponse<T> => {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.results))
      return { count: Number(r.count ?? r.results.length), results: r.results as T[] };
    if (Array.isArray(raw)) return { count: (raw as T[]).length, results: raw as T[] };
  }
  return { count: 0, results: [] };
};

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function DeliveryPFIAllocations() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Filters ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── Dialog state ───────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryAllocation | null>(null);
  const [form, setForm] = useState({ pfi: '', quantity_allocated: '' });
  const [saving, setSaving] = useState(false);

  // ── Delete confirm ─────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ═══════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════

  const inventoryQuery = useQuery({
    queryKey: ['delivery-inventory-all'],
    queryFn: async () =>
      safePaged<DeliveryAllocation & { truck?: number | null; truck_number?: string; loading_status?: string }>(
        await apiClient.admin.getDeliveryInventory({ page_size: 5000 }),
      ),
    staleTime: 30_000,
  });

  // Split: PFI allocations = entries WITHOUT a truck, truck loadings = entries WITH a truck
  const allEntries = useMemo(() => inventoryQuery.data?.results || [], [inventoryQuery.data]);

  const allAllocations = useMemo(
    () => allEntries.filter(e => !e.truck && !e.truck_number && !e.loading_status) as DeliveryAllocation[],
    [allEntries],
  );

  const truckLoadingQty = useMemo(() => {
    let total = 0;
    allEntries.forEach(e => {
      if (e.truck || e.truck_number || e.loading_status) {
        total += toNum(e.quantity_allocated);
      }
    });
    return total;
  }, [allEntries]);

  const pfisQuery = useQuery({
    queryKey: ['pfis-for-delivery'],
    queryFn: async () =>
      safePaged<BackendPfi>(
        await apiClient.admin.getPfis({ page_size: 1000 }),
      ),
    staleTime: 60_000,
  });
  const allPfis = useMemo(() => pfisQuery.data?.results || [], [pfisQuery.data]);

  // ═══════════════════════════════════════════════════════════════════
  // Lookup maps
  // ═══════════════════════════════════════════════════════════════════

  const pfiMap = useMemo(() => {
    const m = new Map<number, BackendPfi>();
    allPfis.forEach(p => m.set(p.id, p));
    return m;
  }, [allPfis]);

  // ═══════════════════════════════════════════════════════════════════
  // Enriched allocations — product & depot come from PFI automatically
  // ═══════════════════════════════════════════════════════════════════

  const enriched = useMemo(() => {
    return allAllocations.map(alloc => {
      const pfi = pfiMap.get(alloc.pfi);
      const pfiNumber = alloc.pfi_number || pfi?.pfi_number || `PFI-${alloc.pfi}`;
      const product = alloc.pfi_product || pfi?.product_name || '—';
      const depot = alloc.depot || alloc.pfi_location || pfi?.location_name || '—';
      const allocated = toNum(alloc.quantity_allocated);

      return { ...alloc, pfiNumber, product, depotDisplay: depot, allocated };
    });
  }, [allAllocations, pfiMap]);

  // ═══════════════════════════════════════════════════════════════════
  // Filtering — most recent first
  // ═══════════════════════════════════════════════════════════════════

  const filtered = useMemo(() => {
    let list = enriched;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(a =>
        a.product.toLowerCase().includes(q) ||
        a.depotDisplay.toLowerCase().includes(q) ||
        a.pfiNumber.toLowerCase().includes(q) ||
        (a.created_by || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) =>
      (b.date_allocated || '').localeCompare(a.date_allocated || ''),
    );
  }, [enriched, searchQuery]);

  // ═══════════════════════════════════════════════════════════════════
  // Cumulative summary
  // ═══════════════════════════════════════════════════════════════════

  const totals = useMemo(() => {
    let totalAllocated = 0;
    enriched.forEach(a => { totalAllocated += a.allocated; });

    const uniquePfis = new Set(enriched.map(a => a.pfi).filter(Boolean));

    const totalRemaining = Math.max(0, totalAllocated - truckLoadingQty);

    return {
      totalAllocated,
      totalLoaded: truckLoadingQty,
      totalRemaining,
      pfiCount: uniquePfis.size,
      entryCount: enriched.length,
    };
  }, [enriched, truckLoadingQty]);

  const summaryCards = useMemo((): SummaryCard[] => [
    {
      title: 'Total Allocated',
      value: `${fmtQty(totals.totalAllocated)} L`,
    //   description: `${totals.pfiCount} PFI${totals.pfiCount !== 1 ? 's' : ''} · ${totals.entryCount} entr${totals.entryCount !== 1 ? 'ies' : 'y'}`,
      icon: <Package size={20} />,
      tone: 'neutral',
    },
    {
      title: 'Loaded onto Trucks',
      value: `${fmtQty(totals.totalLoaded)} L`,
    //   description: totals.totalAllocated > 0
    //     ? `${((totals.totalLoaded / totals.totalAllocated) * 100).toFixed(1)}% of allocated stock`
    //     : undefined,
      icon: <DropletIcon size={20} />,
      tone: 'green',
    },
    {
      title: 'Remaining in Depot',
      value: `${fmtQty(totals.totalRemaining)} L`,
    //   description: 'Allocated − Loaded',
      icon: <Package size={20} />,
      tone: totals.totalRemaining > 0 ? 'amber' : 'green',
    },
  ], [totals]);

  // ═══════════════════════════════════════════════════════════════════
  // PFI selector options
  // ═══════════════════════════════════════════════════════════════════

  const pfiOptions = useMemo(() => {
    return allPfis
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return a.pfi_number.localeCompare(b.pfi_number);
      })
      .map(p => ({
        id: p.id,
        label: `${p.pfi_number} — ${p.product_name || 'N/A'} · ${p.location_name || 'N/A'}${p.status === 'finished' ? '  (finished)' : ''}`,
      }));
  }, [allPfis]);

  const selectedPfi = useMemo(() => {
    if (!form.pfi) return null;
    return pfiMap.get(Number(form.pfi)) || null;
  }, [form.pfi, pfiMap]);

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['delivery-inventory-all'] });
    qc.invalidateQueries({ queryKey: ['delivery-inventory'] });
  }, [qc]);

  const openAdd = () => {
    setEditing(null);
    setForm({ pfi: '', quantity_allocated: '' });
    setDialogOpen(true);
  };

  const openEdit = (a: DeliveryAllocation) => {
    setEditing(a);
    setForm({
      pfi: String(a.pfi || ''),
      quantity_allocated: toNum(a.quantity_allocated) > 0
        ? formatWithCommas(String(toNum(a.quantity_allocated)))
        : '',
    });
    setDialogOpen(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.pfi) {
      toast({ title: 'Please select a PFI', variant: 'destructive' });
      return;
    }
    const qty = Number(stripCommas(form.quantity_allocated));
    if (!qty || qty <= 0) {
      toast({ title: 'Quantity must be greater than 0', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        pfi: Number(form.pfi),
        quantity_allocated: qty,
        date_allocated: format(new Date(), 'yyyy-MM-dd'),
      };

      if (editing) {
        await apiClient.admin.updateDeliveryInventory(editing.id, payload);
        toast({ title: 'Allocation updated' });
      } else {
        await apiClient.admin.createDeliveryInventory(payload);
        toast({ title: 'Allocation added' });
      }
      setDialogOpen(false);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [form, editing, toast, invalidateAll]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.admin.deleteDeliveryInventory(deleteTarget.id);
      toast({ title: 'Allocation deleted' });
      setDeleteTarget(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Delete failed',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, toast, invalidateAll]);

  // ═══════════════════════════════════════════════════════════════════
  // Excel export
  // ═══════════════════════════════════════════════════════════════════

  const exportExcel = useCallback(() => {
    if (!filtered.length) return;
    const rows = filtered.map((a, idx) => ({
      'S/N': idx + 1,
      'PFI': a.pfiNumber,
      'Depot': a.depotDisplay,
      'Product': a.product,
      'Quantity Added (L)': a.allocated,
      'Date Added': a.date_allocated ? format(parseISO(a.date_allocated), 'dd/MM/yyyy') : '',
      'Added By': a.created_by || '—',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'PFI Allocations');
    XLSX.writeFile(wb, `PFI-ALLOCATIONS-${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
  }, [filtered]);

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  const isLoading = inventoryQuery.isLoading || pfisQuery.isLoading;

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />

      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            {/* Header */}
            <PageHeader
              title="Truck Deliveries Inventory"
              description="Add stock from PFIs into the truck-out deliveries."
              actions={
                <>
                  <Button variant="outline" className="gap-2" onClick={exportExcel} disabled={filtered.length === 0}>
                    <Download size={16} /> Export
                  </Button>
                  <Button className="gap-2" onClick={openAdd}>
                    <Plus size={16} /> Add Allocation
                  </Button>
                </>
              }
            />

            {/* ── Summary Cards ─────────────────────────────────────── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Search ───────────────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search PFI, product, depot, added by…"
                    className="pl-10"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="text-sm text-slate-500 self-center whitespace-nowrap">
                  {isLoading ? '…' : `${filtered.length} entr${filtered.length !== 1 ? 'ies' : 'y'}`}
                </div>
              </div>
            </div>

            {/* ── Table ───────────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-10 text-center">
                  <Package className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No allocations found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {enriched.length > 0
                      ? 'Try adjusting your search.'
                      : 'Click "Add Allocation" to get started.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700 w-[48px]">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700">PFI</TableHead>
                        <TableHead className="font-semibold text-slate-700">Depot</TableHead>
                        <TableHead className="font-semibold text-slate-700">Product</TableHead>
                        <TableHead className="font-semibold text-slate-700">Quantity (L)</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date Added</TableHead>
                        {/* <TableHead className="font-semibold text-slate-700">Added By</TableHead> */}
                        <TableHead className="font-semibold text-slate-700 w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((a, idx) => (
                        <TableRow key={a.id} className="hover:bg-slate-50/60 transition-colors">
                          <TableCell className="text-slate-500">{idx + 1}</TableCell>

                          <TableCell className="font-semibold text-black whitespace-nowrap">
                            {a.pfiNumber}
                          </TableCell>

                          <TableCell className="text-slate-600">{a.depotDisplay}</TableCell>

                          <TableCell className="font-medium text-slate-800 whitespace-nowrap">
                            {a.product}
                          </TableCell>

                          <TableCell className="font-bold text-slate-800">
                            {fmtQty(a.allocated)}
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-slate-600">
                            {a.date_allocated
                              ? format(parseISO(a.date_allocated), 'dd MMM yyyy')
                              : '—'}
                          </TableCell>

                          {/* <TableCell className="text-slate-500 text-xs">
                            {a.created_by || '—'}
                          </TableCell> */}

                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => openEdit(a)}>
                                <Pencil size={13} /> Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                title="Delete allocation"
                                onClick={() =>
                                  setDeleteTarget({
                                    id: a.id,
                                    label: `${a.pfiNumber} — ${a.product} — ${fmtQty(a.allocated)} L`,
                                  })
                                }
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {!isLoading && filtered.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {filtered.length} of {enriched.length} entries
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Add / Edit Dialog                                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100">
                <Package className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  {editing ? 'Edit Allocation' : 'Add Allocation'}
                </h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  {editing
                    ? 'Update this allocation entry.'
                    : 'Select a PFI — product & depot are filled automatically.'}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editing ? 'Edit allocation' : 'Add allocation'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* PFI selector */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <FileText size={15} className="text-slate-500" />
                PFI <span className="text-red-500">*</span>
              </Label>
              <select
                aria-label="Select PFI"
                value={form.pfi}
                onChange={e => setForm(f => ({ ...f, pfi: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select PFI…</option>
                {pfiOptions.map(o => (
                  <option key={o.id} value={String(o.id)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Auto-filled info from selected PFI */}
            {/* {selectedPfi && (
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-2">
                  Auto-filled from PFI
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <span className="text-slate-500 text-xs">Product:</span>{' '}
                    <span className="font-medium text-slate-800">
                      {selectedPfi.product_name || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Depot / Location:</span>{' '}
                    <span className="font-medium text-slate-800">
                      {selectedPfi.location_name || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">PFI Qty:</span>{' '}
                    <span className="font-medium text-slate-800">
                      {selectedPfi.starting_qty_litres
                        ? `${fmtQty(selectedPfi.starting_qty_litres)} L`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Status:</span>{' '}
                    <span className={`font-medium ${
                      selectedPfi.status === 'active' ? 'text-emerald-700' : 'text-slate-500'
                    }`}>
                      {selectedPfi.status === 'active' ? 'Active' : 'Finished'}
                    </span>
                  </div>
                </div>
              </div>
            )} */}

            {/* Quantity */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <DropletIcon size={15} className="text-slate-500" />
                Quantity (Litres) <span className="text-red-500">*</span>
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 33,000"
                value={form.quantity_allocated}
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    quantity_allocated: formatWithCommas(e.target.value),
                  }))
                }
              />
            </div>

            {/* Auto date + user — read only */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
              {/* <div className="flex items-center gap-2 text-sm text-slate-600">
                <UserCircle size={16} className="text-slate-400" />
                <span className="text-xs text-slate-500">Added by:</span>
                <span className="font-medium text-slate-700">
                  {localStorage.getItem('fullname') || 'Current user'}
                </span>
              </div> */}
              <div className="text-sm text-slate-600 font-medium">
                Date: {format(new Date(), 'dd MMM yyyy')}
              </div>
            </div>

            {/* Summary preview */}
            {form.quantity_allocated && selectedPfi && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-xs text-emerald-700 font-semibold mb-1">Summary</p>
                <p className="text-lg font-bold text-slate-800">
                  {formatWithCommas(stripCommas(form.quantity_allocated))} L
                </p>
                <p className="text-xs text-slate-500">
                  {selectedPfi.product_name || '—'} · {selectedPfi.location_name || '—'} · {selectedPfi.pfi_number}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : editing ? (
                <Pencil size={16} />
              ) : (
                <Plus size={16} />
              )}
              {saving ? 'Saving…' : editing ? 'Update' : 'Add Allocation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Delete Confirmation                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-red-100 p-2 rounded-lg">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <span>Delete Allocation?</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Are you sure you want to delete{' '}
              <strong>{deleteTarget?.label}</strong>? This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
