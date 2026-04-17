import { useMemo, useState, useCallback } from 'react';
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
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Download, Plus, Search, ArrowUpDown, ArrowUp, ArrowDown,
  DropletIcon, FileSearch2, Package, Banknote, Loader2, CheckCircle2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type PfiStatus = 'active' | 'finished';

type BackendPfi = {
  id: number;
  pfi_number: string;
  status: PfiStatus;
  location?: string | number;
  product?: string | number;
  location_name?: string;
  product_name?: string;
  starting_qty_litres?: number;
  sold_qty_litres?: number;
  sold_qty?: number;
  created_at?: string;
  createdAt?: string;
  finished_at?: string | null;
  finishedAt?: string | null;
  orders_count?: number;
  total_quantity_litres?: number | string;
  total_amount?: number | string;
  totalAmount?: number | string;
  amount?: number | string;
  unit_price?: number | string;
  unitPrice?: number | string;
};

type BackendProduct = { id: number; name: string };
type BackendLocation = { id: number; name?: string; state_name?: string; state?: string };

type SortKey =
  | 'pfi_number' | 'product' | 'location' | 'starting' | 'sold'
  | 'remaining' | 'pct' | 'orders' | 'amount' | 'status' | 'created';
type SortDir = 'asc' | 'desc';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const coerceNumber = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmtQty = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const fmtCurrency = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const coerceSoldLitres = (p: BackendPfi): number => {
  const fromOrders = p.total_quantity_litres;
  const n = Number(String(fromOrders ?? '').replace(/,/g, ''));
  if (Number.isFinite(n) && n >= 0) return n;
  return coerceNumber(p.sold_qty_litres ?? p.sold_qty);
};

const coerceAmount = (p: BackendPfi, soldLitres: number): number => {
  const direct = p.total_amount ?? p.totalAmount ?? p.amount;
  const directNum = Number(String(direct ?? '').replace(/,/g, ''));
  if (Number.isFinite(directNum) && directNum >= 0) return directNum;
  const unit = p.unit_price ?? p.unitPrice;
  const unitNum = Number(String(unit ?? '').replace(/,/g, ''));
  if (Number.isFinite(unitNum) && unitNum > 0) return soldLitres * unitNum;
  return 0;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

type FinishConfirmState = { open: boolean; pfiId?: number };

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function PFIPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Filters ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | PfiStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('pfi_number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── Create dialog ──────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    pfiNumber: '',
    location: '',
    product: '',
    startingQty: '',
    notes: '',
  });
  const [createErrors, setCreateErrors] = useState<{
    conflict?: string;
    fields?: Record<string, string[]>;
    message?: string;
  }>({});
  const [creating, setCreating] = useState(false);

  // ── Finish confirm ─────────────────────────────────────────────────
  const [finishConfirm, setFinishConfirm] = useState<FinishConfirmState>({ open: false });
  const [finishing, setFinishing] = useState(false);

  // ═══════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════

  const pfiQuery = useQuery<{ results?: BackendPfi[] } & Record<string, unknown>>({
    queryKey: ['pfis'],
    queryFn: async () => apiClient.admin.getPfis({ page: 1, page_size: 1000 }),
    staleTime: 30_000,
    retry: 1,
  });

  const productsQuery = useQuery<{ results?: BackendProduct[] } & Record<string, unknown>>({
    queryKey: ['products'],
    queryFn: async () => apiClient.admin.getProducts({ page: 1, page_size: 500 }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const productOptions = useMemo(() => {
    const rec = isRecord(productsQuery.data) ? productsQuery.data : null;
    const raw = (rec?.results as unknown) ?? (Array.isArray(productsQuery.data) ? productsQuery.data : []);
    return ((raw || []) as BackendProduct[])
      .filter(p => p && typeof p.id === 'number' && typeof p.name === 'string')
      .map(p => ({ id: p.id, label: p.name }));
  }, [productsQuery.data]);

  const locationsQuery = useQuery<{ results?: BackendLocation[] } & Record<string, unknown>>({
    queryKey: ['locations'],
    queryFn: async () => apiClient.admin.getStates(),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const locationOptions = useMemo(() => {
    const rec = isRecord(locationsQuery.data) ? locationsQuery.data : null;
    const raw = (rec?.results as unknown) ?? (Array.isArray(locationsQuery.data) ? locationsQuery.data : []);
    return ((raw || []) as BackendLocation[])
      .filter(l => l && typeof l.id === 'number')
      .map(l => ({ id: l.id, label: String(l.name ?? l.state_name ?? l.state ?? `Location ${l.id}`) }));
  }, [locationsQuery.data]);

  // ═══════════════════════════════════════════════════════════════════
  // Derived data
  // ═══════════════════════════════════════════════════════════════════

  const pfis: BackendPfi[] = useMemo(() => {
    const rec = isRecord(pfiQuery.data) ? pfiQuery.data : null;
    const raw = (rec?.results as unknown) ?? (Array.isArray(pfiQuery.data) ? pfiQuery.data : []);
    return (raw || []) as BackendPfi[];
  }, [pfiQuery.data]);

  // Enriched rows
  const enriched = useMemo(() => {
    return pfis.map(p => {
      const starting = coerceNumber(p.starting_qty_litres);
      const sold = coerceSoldLitres(p);
      const remaining = Math.max(0, starting - sold);
      const pct = starting > 0 ? Math.min(100, (sold / starting) * 100) : 0;
      const totalAmount = coerceAmount(p, sold);
      const orders = coerceNumber(p.orders_count);
      const locationLabel = String(p.location_name ?? p.location ?? '');
      const productLabel = String(p.product_name ?? p.product ?? '');
      const createdAtStr = String(p.created_at ?? p.createdAt ?? '');
      const finishedAtStr = String(p.finished_at ?? p.finishedAt ?? '');
      return {
        ...p, starting, sold, remaining, pct, totalAmount, orders,
        locationLabel, productLabel, createdAtStr, finishedAtStr,
      };
    });
  }, [pfis]);

  // Filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched
      .filter(p => status === 'all' || p.status === status)
      .filter(p => {
        if (!q) return true;
        return (
          p.pfi_number.toLowerCase().includes(q) ||
          p.locationLabel.toLowerCase().includes(q) ||
          p.productLabel.toLowerCase().includes(q)
        );
      });
  }, [enriched, search, status]);

  // Sort — active PFIs always first, then finished; user sort applied within each group
  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      // Active first, finished last — always
      if (a.status !== b.status) {
        return a.status === 'active' ? -1 : 1;
      }
      // Within the same status group, apply user sort
      let cmp = 0;
      switch (sortKey) {
        case 'pfi_number': cmp = a.pfi_number.localeCompare(b.pfi_number, undefined, { numeric: true }); break;
        case 'product': cmp = a.productLabel.localeCompare(b.productLabel); break;
        case 'location': cmp = a.locationLabel.localeCompare(b.locationLabel); break;
        case 'starting': cmp = a.starting - b.starting; break;
        case 'sold': cmp = a.sold - b.sold; break;
        case 'remaining': cmp = a.remaining - b.remaining; break;
        case 'pct': cmp = a.pct - b.pct; break;
        case 'orders': cmp = a.orders - b.orders; break;
        case 'amount': cmp = a.totalAmount - b.totalAmount; break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'created': cmp = a.createdAtStr.localeCompare(b.createdAtStr); break;
      }
      return cmp * dir;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  // ═══════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════

  const totals = useMemo(() => {
    let totalStarting = 0;
    let totalSold = 0;
    let totalRemaining = 0;
    let totalAmount = 0;
    let activeCount = 0;
    let finishedCount = 0;
    let totalOrders = 0;
    enriched.forEach(p => {
      totalStarting += p.starting;
      totalSold += p.sold;
      totalRemaining += p.remaining;
      totalAmount += p.totalAmount;
      totalOrders += p.orders;
      if (p.status === 'active') activeCount++;
      else finishedCount++;
    });
    return {
      totalStarting, totalSold, totalRemaining, totalAmount,
      activeCount, finishedCount, totalOrders, total: enriched.length,
    };
  }, [enriched]);

  const summaryCards = useMemo((): SummaryCard[] => [
    {
      title: 'Active PFIs',
      value: String(totals.activeCount),
      // description: `of ${totals.total} total`,
      icon: <FileSearch2 size={20} />,
      tone: 'green',
    },
    {
      title: 'Completed PFIs',
      value: String(totals.finishedCount),
      // description: `of ${totals.total} total`,
      icon: <CheckCircle2 size={20} />,
      tone: 'red',
    },
    // {
    //   title: 'Total Quantity',
    //   value: `${fmtQty(totals.totalStarting)} L`,
    //   icon: <DropletIcon size={20} />,
    //   tone: 'neutral',
    // },
    // {
    //   title: 'Total Sold',
    //   value: `${fmtQty(totals.totalSold)} L`,
    //   description: totals.totalStarting > 0
    //     ? `${((totals.totalSold / totals.totalStarting) * 100).toFixed(1)}% sold`
    //     : undefined,
    //   icon: <Package size={20} />,
    //   tone: 'green',
    // },
    {
      title: 'Quantity Remaining',
      value: `${fmtQty(totals.totalRemaining)} L`,
      icon: <DropletIcon size={20} />,
      tone: totals.totalRemaining > 0 ? 'amber' : 'green',
    },
    {
      title: 'Total Revenue',
      value: fmtCurrency(totals.totalAmount),
      icon: <Banknote size={20} />,
      tone: 'green',
    },
  ], [totals]);

  // ═══════════════════════════════════════════════════════════════════
  // Sorting toggle
  // ═══════════════════════════════════════════════════════════════════

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown size={13} className="text-slate-400" />;
    return sortDir === 'asc'
      ? <ArrowUp size={13} className="text-slate-700" />
      : <ArrowDown size={13} className="text-slate-700" />;
  };

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const onCreate = useCallback(async () => {
    setCreateErrors({});
    const pfi_number = createForm.pfiNumber.trim();
    const location = Number(String(createForm.location).trim());
    const product = Number(String(createForm.product).trim());
    const starting_qty_litres = String(createForm.startingQty).replace(/,/g, '').trim();
    const startingAsNumber = Number(starting_qty_litres);

    if (
      !pfi_number ||
      !Number.isFinite(location) ||
      !Number.isFinite(product) ||
      !Number.isFinite(startingAsNumber) ||
      startingAsNumber <= 0
    ) {
      toast({
        title: 'Missing information',
        description: 'Provide PFI number, location, product, and valid starting quantity.',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      await apiClient.admin.createPfi({
        pfi_number,
        location,
        product,
        starting_qty_litres: `${startingAsNumber.toFixed(2)}`,
        notes: createForm.notes.trim() || undefined,
      });
      setCreateOpen(false);
      setCreateForm({ pfiNumber: '', location: '', product: '', startingQty: '', notes: '' });
      await queryClient.invalidateQueries({ queryKey: ['pfis'] });
      toast({ title: 'PFI created', description: `${pfi_number} created.` });
    } catch (e) {
      const err = e as Error;
      const message = err?.message || 'Request failed';

      if (message.includes('409') || /conflict/i.test(message)) {
        setCreateErrors({ conflict: 'Active PFI already exists for that location + product.' });
        return;
      }

      let parsedFields: Record<string, string[]> | undefined;
      const jsonStart = message.indexOf('{');
      if (jsonStart >= 0) {
        const maybeJson = message.slice(jsonStart);
        try {
          const body = JSON.parse(maybeJson) as unknown;
          if (isRecord(body)) {
            const fieldErrors: Record<string, string[]> = {};
            Object.entries(body).forEach(([k, v]) => {
              if (Array.isArray(v)) fieldErrors[k] = v.map(x => String(x));
              else if (typeof v === 'string') fieldErrors[k] = [v];
            });
            if (Object.keys(fieldErrors).length) parsedFields = fieldErrors;
          }
        } catch { /* ignore */ }
      }

      setCreateErrors({ fields: parsedFields, message: parsedFields ? undefined : message });
      toast({ title: 'Failed to create PFI', description: message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }, [createForm, toast, queryClient]);

  const finishPfi = useCallback(async (id: number) => {
    setFinishing(true);
    try {
      await apiClient.admin.finishPfi(id);
      await queryClient.invalidateQueries({ queryKey: ['pfis'] });
      toast({ title: 'PFI finished', description: 'This PFI is now marked as finished.' });
    } catch (e) {
      toast({
        title: 'Failed to finish PFI',
        description: (e as Error)?.message || 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setFinishing(false);
    }
  }, [toast, queryClient]);

  const selectedFinishPfi = useMemo(
    () => enriched.find(p => p.id === finishConfirm.pfiId),
    [finishConfirm.pfiId, enriched],
  );

  // ═══════════════════════════════════════════════════════════════════
  // Excel export
  // ═══════════════════════════════════════════════════════════════════

  const exportExcel = useCallback(() => {
    if (!sorted.length) return;
    const rows = sorted.map((p, idx) => ({
      'S/N': idx + 1,
      'PFI Number': p.pfi_number,
      'Product': p.productLabel,
      'Location': p.locationLabel,
      'Starting Qty (L)': p.starting,
      'Sold Qty (L)': p.sold,
      'Remaining (L)': p.remaining,
      '% Sold': `${p.pct.toFixed(1)}%`,
      'Orders': p.orders,
      'Total Amount (₦)': p.totalAmount,
      'Status': p.status.charAt(0).toUpperCase() + p.status.slice(1),
      'Created': p.createdAtStr ? new Date(p.createdAtStr).toLocaleDateString() : '',
      'Finished': p.finishedAtStr ? new Date(p.finishedAtStr).toLocaleDateString() : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PFI Tracking');
    XLSX.writeFile(wb, 'PFI-TRACKING.xlsx');
  }, [sorted]);

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  const isLoading = pfiQuery.isLoading;

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
              title="PFI Tracking"
              description="Track PFIs by location and product — monitor sold & remaining litres, orders, and total amounts."
              actions={
                <>
                  <Button variant="outline" className="gap-2" onClick={exportExcel} disabled={sorted.length === 0}>
                    <Download size={16} /> Export
                  </Button>
                  <Button className="gap-2" onClick={() => setCreateOpen(true)}>
                    <Plus size={16} /> Add PFI
                  </Button>
                </>
              }
            />

            {/* ── Summary Cards ─────────────────────────────────────── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Search + Filter ───────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    className="pl-10"
                    placeholder="Search by PFI number, product, or location…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter by status"
                  value={status}
                  onChange={e => setStatus(e.target.value as 'all' | PfiStatus)}
                  className="h-10 w-full sm:w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="finished">Finished</option>
                </select>
                <div className="text-sm text-slate-500 self-center whitespace-nowrap">
                  {isLoading ? '…' : `${sorted.length} PFI${sorted.length !== 1 ? 's' : ''}`}
                </div>
              </div>
            </div>

            {/* ── Table ───────────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : sorted.length === 0 ? (
                <div className="p-10 text-center">
                  <FileSearch2 className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No PFIs found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {enriched.length > 0
                      ? 'Adjust your search or filter.'
                      : 'Click "Add PFI" to create a new PFI.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700 w-[48px]">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('pfi_number')}>
                            PFI Number <SortIcon col="pfi_number" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('product')}>
                            Product <SortIcon col="product" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('location')}>
                            Location <SortIcon col="location" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">
                          <button type="button" className="inline-flex items-center gap-1 ml-auto" onClick={() => toggleSort('starting')}>
                            Starting <SortIcon col="starting" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-emerald-700">
                          <button type="button" className="inline-flex items-center gap-1 ml-auto" onClick={() => toggleSort('sold')}>
                            Sold <SortIcon col="sold" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-amber-700">
                          <button type="button" className="inline-flex items-center gap-1 ml-auto" onClick={() => toggleSort('remaining')}>
                            Remaining <SortIcon col="remaining" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[130px]">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('pct')}>
                            Progress <SortIcon col="pct" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">
                          <button type="button" className="inline-flex items-center gap-1 ml-auto" onClick={() => toggleSort('orders')}>
                            Orders <SortIcon col="orders" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-emerald-700 text-right">
                          <button type="button" className="inline-flex items-center gap-1 ml-auto" onClick={() => toggleSort('amount')}>
                            Amount <SortIcon col="amount" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('status')}>
                            Status <SortIcon col="status" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('created')}>
                            Created <SortIcon col="created" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((p, idx) => {
                        const isActive = p.status === 'active';
                        return (
                          <TableRow
                            key={p.id}
                            className={
                              isActive
                                ? 'hover:bg-slate-50/60 transition-colors'
                                : 'bg-red-50/60 hover:bg-red-100/60 transition-colors'
                            }
                          >
                            <TableCell className={isActive ? 'text-slate-500' : 'text-red-400'}>{idx + 1}</TableCell>
                            <TableCell className={`font-semibold whitespace-nowrap ${isActive ? 'text-slate-800' : 'text-red-700'}`}>
                              {p.pfi_number}
                            </TableCell>
                            <TableCell className={`whitespace-nowrap ${isActive ? 'text-slate-700' : 'text-red-600'}`}>
                              {p.productLabel || '—'}
                            </TableCell>
                            <TableCell className={isActive ? 'text-slate-600' : 'text-red-600'}>
                              {p.locationLabel || '—'}
                            </TableCell>
                            <TableCell className={`text-left font-medium ${isActive ? 'text-slate-800' : 'text-red-700'}`}>
                              {fmtQty(p.starting)} Litres
                            </TableCell>
                            <TableCell className={`text font-medium ${isActive ? 'text-emerald-700' : 'text-red-600'}`}>
                              {p.sold > 0 ? fmtQty(p.sold) : '—'} Litres
                            </TableCell>
                            <TableCell className={`text-left font-bold ${
                              !isActive ? 'text-red-500' : p.remaining > 0 ? 'text-amber-600' : 'text-slate-400'
                            }`}>
                              {fmtQty(p.remaining)} Litres
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress
                                  value={p.pct}
                                  className={`h-2 flex-1 ${isActive ? 'bg-emerald-100' : 'bg-red-100'}`}
                                />
                                <span className={`text-xs w-[38px] text-right ${isActive ? 'text-slate-500' : 'text-red-500'}`}>
                                  {p.pct.toFixed(0)}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className={`text-right ${isActive ? 'text-slate-700' : 'text-red-600'}`}>
                              {p.orders > 0 ? fmtQty(p.orders) : '—'}
                            </TableCell>
                            <TableCell className={`text-right font-medium ${isActive ? 'text-emerald-700' : 'text-red-600'}`}>
                              {p.totalAmount > 0 ? fmtCurrency(p.totalAmount) : '—'}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                                isActive
                                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                  : 'text-rose-700 bg-rose-50 border-rose-200'
                              }`}>
                                {isActive ? 'Active' : 'Finished'}
                              </span>
                            </TableCell>
                            <TableCell className={`text-xs whitespace-nowrap ${isActive ? 'text-slate-500' : 'text-red-400'}`}>
                              {p.createdAtStr ? new Date(p.createdAtStr).toLocaleDateString() : '—'}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant={isActive ? 'default' : 'outline'}
                                disabled={!isActive}
                                onClick={() => setFinishConfirm({ open: true, pfiId: p.id })}
                                className="text-xs"
                              >
                                Close PFI
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {!isLoading && sorted.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {sorted.length} of {enriched.length} PFIs
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Create PFI Dialog                                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={open => {
        setCreateOpen(open);
        if (open) setCreateErrors({});
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <FileSearch2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Create New PFI</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  Select location and product, then set the starting quantity.
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Create new PFI</DialogDescription>
          </DialogHeader>

          {createErrors.conflict && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {createErrors.conflict}
            </div>
          )}

          {createErrors.message && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {createErrors.message}
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pfiNumber" className="text-sm font-medium text-slate-700">
                PFI Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="pfiNumber"
                placeholder="e.g. PFI 50"
                value={createForm.pfiNumber}
                onChange={e => setCreateForm(f => ({ ...f, pfiNumber: e.target.value }))}
              />
              {createErrors.fields?.pfi_number?.length ? (
                <p className="text-xs text-red-600">{createErrors.fields.pfi_number.join(' ')}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location" className="text-sm font-medium text-slate-700">
                  Location <span className="text-red-500">*</span>
                </Label>
                <select
                  id="location"
                  aria-label="Location"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={createForm.location}
                  onChange={e => setCreateForm(f => ({ ...f, location: e.target.value }))}
                >
                  <option value="">Select location</option>
                  {locationOptions.map(l => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
                {locationsQuery.isError && (
                  <p className="text-xs text-red-600">Failed to load locations</p>
                )}
                {createErrors.fields?.location?.length ? (
                  <p className="text-xs text-red-600">{createErrors.fields.location.join(' ')}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="product" className="text-sm font-medium text-slate-700">
                  Product <span className="text-red-500">*</span>
                </Label>
                <select
                  id="product"
                  aria-label="Product"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={createForm.product}
                  onChange={e => setCreateForm(f => ({ ...f, product: e.target.value }))}
                >
                  <option value="">Select product</option>
                  {productOptions.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                {productsQuery.isError && (
                  <p className="text-xs text-red-600">Failed to load products</p>
                )}
                {createErrors.fields?.product?.length ? (
                  <p className="text-xs text-red-600">{createErrors.fields.product.join(' ')}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startingQty" className="text-sm font-medium text-slate-700">
                Starting Quantity (Litres) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="startingQty"
                inputMode="decimal"
                placeholder="e.g. 1,000,000"
                value={createForm.startingQty}
                onChange={e => setCreateForm(f => ({ ...f, startingQty: e.target.value }))}
              />
              {createErrors.fields?.starting_qty_litres?.length ? (
                <p className="text-xs text-red-600">{createErrors.fields.starting_qty_litres.join(' ')}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={onCreate} disabled={creating} className="gap-2">
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {creating ? 'Creating…' : 'Create PFI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Finish PFI Confirmation                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={finishConfirm.open} onOpenChange={open => setFinishConfirm(s => ({ ...s, open }))}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-amber-100 p-2 rounded-lg">
                <FileSearch2 className="w-5 h-5 text-amber-600" />
              </div>
              <span>Close PFI?</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              This will mark the PFI as <strong>finished</strong>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {selectedFinishPfi && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-1">
              <p className="font-semibold text-slate-900">{selectedFinishPfi.pfi_number}</p>
              <p className="text-sm text-slate-700">
                {selectedFinishPfi.productLabel} · {selectedFinishPfi.locationLabel}
              </p>
              <div className="flex gap-4 mt-2 text-xs text-slate-600">
                <span>Starting: <strong>{fmtQty(selectedFinishPfi.starting)} L</strong></span>
                <span>Sold: <strong>{fmtQty(selectedFinishPfi.sold)} L</strong></span>
                <span>Remaining: <strong>{fmtQty(selectedFinishPfi.remaining)} L</strong></span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setFinishConfirm({ open: false })} disabled={finishing}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (finishConfirm.pfiId) void finishPfi(finishConfirm.pfiId);
                setFinishConfirm({ open: false });
              }}
              disabled={finishing}
              className="gap-2"
            >
              {finishing ? <Loader2 size={16} className="animate-spin" /> : null}
              {finishing ? 'Finishing…' : 'Yes, close PFI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
