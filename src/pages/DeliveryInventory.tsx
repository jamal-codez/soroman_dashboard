// filepath: /Users/sableboxx/soroman_dashboard-2/src/pages/DeliveryInventory.tsx
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
  Plus, Search, Download, Loader2, Trash2,
  Truck, DropletIcon, FileText, MapPin,
  CheckCircle2, Clock, AlertTriangle, CircleDot,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface FleetTruck {
  id: number;
  plate_number: string;
  driver_name: string;
  driver_phone?: string;
  max_capacity?: number;
  is_active?: boolean;
}

interface DeliveryCustomer {
  id: number;
  customer_name: string;
  phone_number?: string;
  status: string;
}

interface DepotState {
  id: number;
  name: string;
  classifier?: string;
}

interface TruckLoading {
  id: number;
  truck: number | null;
  truck_number?: string;
  pfi: number | null;
  pfi_number?: string;
  pfi_product?: string;
  depot?: string;
  customer: number | null;
  customer_name?: string;
  quantity_allocated: number | string;
  date_allocated: string;
  date_offloaded?: string | null;
  loading_status?: 'loaded' | 'offloaded' | 'empty';
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  notes?: string;
  // Legacy fields the backend might still send
  location?: string;
  pfi_location?: string;
}

type EnrichedLoading = TruckLoading & {
  status: string;
  truckPlate: string;
  driverName: string;
  destination: string;
  depotDisplay: string;
  custName: string;
  qty: number;
};

type PagedResponse<T> = { count: number; results: T[] };
type StatusFilter = 'all' | 'loaded' | 'offloaded' | 'empty';

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

const inferStatus = (entry: TruckLoading): 'loaded' | 'offloaded' | 'empty' => {
  if (entry.loading_status) return entry.loading_status;
  if (entry.date_offloaded) return 'offloaded';
  if (toNum(entry.quantity_allocated) > 0) return 'loaded';
  return 'empty';
};

const statusConfig = {
  loaded:    { label: 'Loaded',    cls: 'text-blue-700 bg-blue-50 border-blue-200',     icon: Truck },
  offloaded: { label: 'Offloaded', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  empty:     { label: 'Empty',     cls: 'text-slate-600 bg-slate-50 border-slate-200',  icon: CircleDot },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function DeliveryInventory() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Load dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    truck: '',
    depot: '',
    destination: '',
    customer: '',
    quantity_allocated: '',
    date_allocated: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  // Offload dialog
  const [offloadTarget, setOffloadTarget] = useState<EnrichedLoading | null>(null);
  const [offloadDate, setOffloadDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [offloading, setOffloading] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ═══════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════

  const inventoryQuery = useQuery({
    queryKey: ['delivery-inventory'],
    queryFn: async () =>
      safePaged<TruckLoading>(
        await apiClient.admin.getDeliveryInventory({ page_size: 5000 }),
      ),
    staleTime: 30_000,
  });
  const allLoadings = useMemo(() => {
    const entries = inventoryQuery.data?.results || [];
    // Only show truck loadings — entries that have a truck assigned.
    // PFI-only allocations (no truck) belong on the PFI Allocations page.
    return entries.filter(e => e.truck || e.truck_number || e.loading_status);
  }, [inventoryQuery.data]);

  const trucksQuery = useQuery({
    queryKey: ['fleet-trucks'],
    queryFn: async () =>
      safePaged<FleetTruck>(
        await apiClient.admin.getFleetTrucks({ page_size: 1000 }),
      ),
    staleTime: 60_000,
  });
  const allTrucks = useMemo(() => {
    const trucks = trucksQuery.data?.results || [];
    return trucks.filter(t => t.is_active !== false).sort((a, b) => a.plate_number.localeCompare(b.plate_number));
  }, [trucksQuery.data]);

  const customersQuery = useQuery({
    queryKey: ['delivery-customers-list'],
    queryFn: async () =>
      safePaged<DeliveryCustomer>(
        await apiClient.admin.getDeliveryCustomers({ page_size: 5000 }),
      ),
    staleTime: 60_000,
  });
  const customers = useMemo(
    () => (customersQuery.data?.results || []).filter(c => c.status === 'active'),
    [customersQuery.data],
  );

  const depotsQuery = useQuery<DepotState[]>({
    queryKey: ['states'],
    queryFn: async () => {
      const res = await apiClient.admin.getStates();
      const arr = Array.isArray(res) ? res : Array.isArray(res?.results) ? res.results : [];
      return arr as DepotState[];
    },
    staleTime: 5 * 60_000,
  });
  const depots = useMemo(
    () => (depotsQuery.data || []).filter(s => s.classifier?.toLowerCase() === 'depot'),
    [depotsQuery.data],
  );

  // ═══════════════════════════════════════════════════════════════════
  // Lookup maps
  // ═══════════════════════════════════════════════════════════════════

  const truckMap = useMemo(() => {
    const m = new Map<number, FleetTruck>();
    (trucksQuery.data?.results || []).forEach(t => m.set(t.id, t));
    return m;
  }, [trucksQuery.data]);

  const customerMap = useMemo(() => {
    const m = new Map<number, DeliveryCustomer>();
    (customersQuery.data?.results || []).forEach(c => m.set(c.id, c));
    return m;
  }, [customersQuery.data]);

  // ═══════════════════════════════════════════════════════════════════
  // Enriched entries
  // ═══════════════════════════════════════════════════════════════════

  const enriched = useMemo(() => {
    return allLoadings.map(entry => {
      const truck = entry.truck ? truckMap.get(entry.truck) : null;
      const customer = entry.customer ? customerMap.get(entry.customer) : null;
      const status = inferStatus(entry);
      const truckPlate = entry.truck_number || truck?.plate_number || '—';
      const driverName = truck?.driver_name || '';
      const destination = entry.location || '—';
      const depot = entry.depot || entry.pfi_location || '—';
      const custName = entry.customer_name || customer?.customer_name || '—';
      const qty = toNum(entry.quantity_allocated);

      return { ...entry, status, truckPlate, driverName, destination, depotDisplay: depot, custName, qty };
    });
  }, [allLoadings, truckMap, customerMap]);

  // ═══════════════════════════════════════════════════════════════════
  // Filtering
  // ═══════════════════════════════════════════════════════════════════

  const filtered = useMemo(() => {
    let list = enriched;

    if (statusFilter !== 'all') {
      list = list.filter(e => e.status === statusFilter);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(e =>
        e.truckPlate.toLowerCase().includes(q) ||
        e.driverName.toLowerCase().includes(q) ||
        e.destination.toLowerCase().includes(q) ||
        e.depotDisplay.toLowerCase().includes(q) ||
        e.custName.toLowerCase().includes(q),
      );
    }

    const statusOrder = { loaded: 0, offloaded: 1, empty: 2 };
    return [...list].sort((a, b) => {
      const sDiff = statusOrder[a.status] - statusOrder[b.status];
      if (sDiff !== 0) return sDiff;
      return (b.date_allocated || '').localeCompare(a.date_allocated || '');
    });
  }, [enriched, statusFilter, searchQuery]);

  // ═══════════════════════════════════════════════════════════════════
  // Summaries
  // ═══════════════════════════════════════════════════════════════════

  const totals = useMemo(() => {
    let loaded = 0, offloaded = 0, totalQtyLoaded = 0, totalQtyOffloaded = 0;
    enriched.forEach(e => {
      if (e.status === 'loaded') { loaded++; totalQtyLoaded += e.qty; }
      else if (e.status === 'offloaded') { offloaded++; totalQtyOffloaded += e.qty; }
    });
    return { total: enriched.length, loaded, offloaded, totalQtyLoaded, totalQtyOffloaded };
  }, [enriched]);

  const loadedTruckPlates = useMemo(() => {
    const set = new Set<string>();
    enriched.forEach(e => { if (e.status === 'loaded') set.add(e.truckPlate); });
    return set;
  }, [enriched]);

  const summaryCards = useMemo((): SummaryCard[] => [
    // { title: 'Total Entries', value: String(totals.total), icon: <FileText size={20} />, tone: 'neutral' },
    { title: 'Currently Loaded', value: String(totals.loaded), description: `${fmtQty(totals.totalQtyLoaded)} L on trucks`, icon: <Truck size={20} />, tone: totals.loaded > 0 ? 'amber' : 'neutral' },
    { title: 'Offloaded/Delivered', value: String(totals.offloaded), description: `${fmtQty(totals.totalQtyOffloaded)} L delivered`, icon: <CheckCircle2 size={20} />, tone: 'green' },
    { title: 'Empty Trucks', value: String(Math.max(0, allTrucks.length - totals.loaded)), description: `out of ${allTrucks.length} trucks`, icon: <CircleDot size={20} />, tone: 'green' },
  ], [totals, allTrucks.length]);

  const availableTrucks = useMemo(() => {
    return allTrucks.filter(t => !loadedTruckPlates.has(t.plate_number));
  }, [allTrucks, loadedTruckPlates]);

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['delivery-inventory'] });
    qc.invalidateQueries({ queryKey: ['delivery-inventory-all'] });
    qc.invalidateQueries({ queryKey: ['delivery-sales'] });
  }, [qc]);

  const openLoadDialog = () => {
    setForm({
      truck: '', depot: '', destination: '', customer: '', quantity_allocated: '',
      date_allocated: format(new Date(), 'yyyy-MM-dd'), notes: '',
    });
    setDialogOpen(true);
  };

  const handleLoad = useCallback(async () => {
    if (!form.truck) { toast({ title: 'Please select a truck', variant: 'destructive' }); return; }
    if (!form.depot) { toast({ title: 'Please select a depot', variant: 'destructive' }); return; }
    const qty = Number(stripCommas(form.quantity_allocated));
    if (!qty || qty <= 0) { toast({ title: 'Quantity must be greater than 0', variant: 'destructive' }); return; }

    setSaving(true);
    try {
      const selectedTruck = allTrucks.find(t => String(t.id) === form.truck);
      const payload = {
        truck: Number(form.truck),
        truck_number: selectedTruck?.plate_number || '',
        depot: form.depot,
        location: form.destination.trim() || undefined,
        customer: form.customer ? Number(form.customer) : undefined,
        customer_name: form.customer ? customers.find(c => String(c.id) === form.customer)?.customer_name : undefined,
        quantity_allocated: qty,
        date_allocated: form.date_allocated || format(new Date(), 'yyyy-MM-dd'),
        loading_status: 'loaded' as const,
        notes: form.notes.trim() || undefined,
      };

      await apiClient.admin.createDeliveryInventory(payload);
      toast({ title: 'Truck loaded successfully' });
      setDialogOpen(false);
      invalidateAll();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load truck', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [form, allTrucks, customers, toast, invalidateAll]);

  const handleOffload = useCallback(async () => {
    if (!offloadTarget) return;
    setOffloading(true);
    try {
      await apiClient.admin.updateDeliveryInventory(offloadTarget.id, {
        loading_status: 'offloaded',
        date_offloaded: offloadDate,
      });
      toast({ title: 'Truck marked as offloaded' });
      setOffloadTarget(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to offload', variant: 'destructive' });
    } finally {
      setOffloading(false);
    }
  }, [offloadTarget, offloadDate, toast, invalidateAll]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.admin.deleteDeliveryInventory(deleteTarget.id);
      toast({ title: 'Entry deleted' });
      setDeleteTarget(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Delete failed', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, toast, invalidateAll]);

  const exportExcel = useCallback(() => {
    if (!filtered.length) return;
    const rows = filtered.map((e, idx) => ({
      'S/N': idx + 1,
      'Truck': e.truckPlate,
      'Driver': e.driverName || '—',
      'Status': e.status.charAt(0).toUpperCase() + e.status.slice(1),
      'Depot': e.depotDisplay,
      'Destination': e.destination,
      'Customer': e.custName,
      'Quantity (L)': e.qty,
      'Date Loaded': e.date_allocated ? format(parseISO(e.date_allocated), 'dd/MM/yyyy') : '',
      'Date Offloaded': e.date_offloaded ? format(parseISO(e.date_offloaded), 'dd/MM/yyyy') : '',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Truck Loadings');
    XLSX.writeFile(wb, `TRUCK-LOADINGS-${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
  }, [filtered]);

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  const isLoading = inventoryQuery.isLoading || trucksQuery.isLoading;

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            <PageHeader
              title="Truck Loading Tracker"
              description="Track which trucks are loaded, empty, or offloaded."
              actions={
                <>
                  <Button variant="outline" className="gap-2" onClick={exportExcel} disabled={filtered.length === 0}>
                    <Download size={16} /> Export
                  </Button>
                  <Button className="gap-2" onClick={openLoadDialog}>
                    <Plus size={16} /> Load Truck
                  </Button>
                </>
              }
            />

            <SummaryCards cards={summaryCards} />

            {/* Search + Filter */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input placeholder="Search by truck, driver, product, depot, customer…" className="pl-10" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className="h-10 w-full sm:w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="all">All Statuses</option>
                  <option value="loaded">🚛 Loaded</option>
                  <option value="offloaded">✅ Offloaded</option>
                  <option value="empty">⭕ Empty</option>
                </select>
                <div className="text-sm text-slate-500 self-center whitespace-nowrap">
                  {isLoading ? '…' : `${filtered.length} entr${filtered.length !== 1 ? 'ies' : 'y'}`}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="p-10 text-center">
                  <Truck className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No truck loadings found</p>
                  <p className="text-sm text-slate-400 mt-1">{enriched.length > 0 ? 'Adjust your filters or search.' : 'Click "Load Truck" to get started.'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700 w-[48px]">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700">Truck</TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Quantity</TableHead>
                        <TableHead className="font-semibold text-slate-700">Depot Loaded</TableHead>
                        <TableHead className="font-semibold text-slate-700">Destination</TableHead>
                        <TableHead className="font-semibold text-slate-700">Customer</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date Loaded</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date Offloaded</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[160px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((e, idx) => {
                        const sc = statusConfig[e.status];
                        const StatusIcon = sc.icon;
                        return (
                          <TableRow key={e.id} className={`hover:bg-slate-50/60 transition-colors ${e.status === 'loaded' ? 'bg-blue-50/30' : ''}`}>
                            <TableCell className="text-slate-500">{idx + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {/* <Truck size={14} className="text-slate-400 shrink-0" /> */}
                                <div>
                                  <div className="font-semibold text-slate-800">{e.truckPlate}</div>
                                  {/* {e.driverName && <div className="text-[11px] text-slate-500">{e.driverName}</div>} */}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${sc.cls}`}>
                                <StatusIcon size={12} />
                                {sc.label}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-bold text-slate-800">{e.qty > 0 ? fmtQty(e.qty) : '—'}</TableCell>
                            <TableCell className="text-slate-600">{e.depotDisplay}</TableCell>
                            <TableCell className="text-slate-600">{e.destination}</TableCell>
                            <TableCell className="font-medium text-slate-700 capitalize whitespace-nowrap">{e.custName}</TableCell>
                            <TableCell className="whitespace-nowrap text-slate-600">
                              {e.date_allocated ? format(parseISO(e.date_allocated), 'dd MMM yyyy') : '—'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-slate-600">
                              {e.date_offloaded
                                ? format(parseISO(e.date_offloaded), 'dd MMM yyyy')
                                : e.status === 'loaded'
                                  ? <span className="text-amber-600 text-xs font-medium">In transit</span>
                                  : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {e.status === 'loaded' && (
                                  <Button size="sm" variant="outline" className="gap-1.5 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => { setOffloadTarget(e); setOffloadDate(format(new Date(), 'yyyy-MM-dd')); }} title="Mark as offloaded">
                                    <CheckCircle2 size={13} /> Offload
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-700" title="Delete entry" onClick={() => setDeleteTarget({ id: e.id, label: `${e.truckPlate} — ${fmtQty(e.qty)} L` })}>
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {!isLoading && filtered.length > 0 && (
              <p className="text-xs text-slate-400 text-right">Showing {filtered.length} of {enriched.length} entries</p>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Load Truck Dialog                                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Truck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Load Truck</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">Select a truck, depot, quantity, and assign a customer.</p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Load a truck with product</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Truck */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Truck size={15} className="text-slate-500" /> Truck <span className="text-red-500">*</span>
              </Label>
              <select aria-label="Select truck" value={form.truck} onChange={e => setForm(f => ({ ...f, truck: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select empty truck…</option>
                {availableTrucks.map(t => (
                  <option key={t.id} value={String(t.id)}>
                    {t.plate_number}{t.driver_name ? ` — ${t.driver_name}` : ''}{t.max_capacity ? ` (${fmtQty(t.max_capacity)} L)` : ''}
                  </option>
                ))}
              </select>
              {availableTrucks.length === 0 && allTrucks.length > 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle size={12} /> All trucks are currently loaded</p>
              )}
            </div>

            {/* Depot (Loading Location) */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <MapPin size={15} className="text-slate-500" /> Depot (Loading Location) <span className="text-red-500">*</span>
              </Label>
              <select aria-label="Select depot" value={form.depot} onChange={e => setForm(f => ({ ...f, depot: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select depot…</option>
                {depots.map(d => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Destination */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <MapPin size={15} className="text-slate-500" /> Destination / Location
              </Label>
              <Input placeholder="e.g. Kano, Abuja, Jos…" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} />
            </div>

            {/* Customer */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <MapPin size={15} className="text-slate-500" /> Assigned Customer
              </Label>
              <select aria-label="Select customer" value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select customer…</option>
                {customers.map(c => <option key={c.id} value={String(c.id)}>{c.customer_name}</option>)}
              </select>
            </div>

            {/* Qty + Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <DropletIcon size={15} className="text-slate-500" /> Quantity (Litres) <span className="text-red-500">*</span>
                </Label>
                <Input type="text" inputMode="decimal" placeholder="e.g. 45,000" value={form.quantity_allocated} onChange={e => setForm(f => ({ ...f, quantity_allocated: formatWithCommas(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Clock size={15} className="text-slate-500" /> Date Loaded
                </Label>
                <Input type="date" value={form.date_allocated} onChange={e => setForm(f => ({ ...f, date_allocated: e.target.value }))} />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Notes (optional)</Label>
              <Input placeholder="e.g. compartment info, special instructions…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleLoad} disabled={saving} className="gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
              {saving ? 'Loading…' : 'Load Truck'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Offload Dialog                                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!offloadTarget} onOpenChange={open => { if (!open) setOffloadTarget(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-emerald-100 p-2 rounded-lg"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
              <span>Mark as Offloaded</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Mark <strong>{offloadTarget?.truckPlate}</strong> ({fmtQty(offloadTarget?.qty || 0)} L) as offloaded / delivered.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Date Offloaded</Label>
              <Input type="date" value={offloadDate} onChange={e => setOffloadDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOffloadTarget(null)} disabled={offloading}>Cancel</Button>
            <Button onClick={handleOffload} disabled={offloading} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {offloading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {offloading ? 'Offloading…' : 'Confirm Offload'}
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
              <div className="bg-red-100 p-2 rounded-lg"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <span>Delete Entry?</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Are you sure you want to delete <strong>{deleteTarget?.label}</strong>? This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
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
