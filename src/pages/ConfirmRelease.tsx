import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Search, Loader2, CheckCircle2, XCircle,
  Package, Clock, ShieldCheck, ShieldX,
  Eye, DollarSign, MapPin, User, Phone, Building2,
  FileText, Hash, Fuel, CalendarDays, X,
} from 'lucide-react';
import { format, parseISO, isToday, isYesterday, isThisWeek, isThisMonth, isThisYear, addDays, isAfter, isBefore, isSameDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiClient, fetchAllPages } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { isCurrentUserReadOnly } from '@/roles';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface PaidOrder {
  id: number;
  user: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number?: string;
    phone?: string;
    companyName?: string;
    company_name?: string;
    company?: string;
  };
  companyName?: string;
  company_name?: string;
  customer?: {
    companyName?: string;
    company_name?: string;
    company?: string;
  };
  pickup?: {
    pickup_date?: string;
    pickup_time?: string;
    state?: string;
  };
  location_name?: string;
  location?: string;
  state?: string;
  total_price: string;
  status: string;
  created_at: string;
  products: Array<{
    name: string;
    unit_price?: number | string;
    unitPrice?: number | string;
    price?: number | string;
  }>;
  quantity: number;
  release_type: 'pickup' | 'delivery';
  reference: string;
  pfi_id?: number | null;
  pfi_number?: string | null;
}

interface ReleaseRow {
  _type: 'order';
  _id: number;
  reference: string;
  customer: string;
  company: string;
  contactPhone: string;
  contactEmail: string;
  product: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  location: string;
  pfi: string;
  status: string;
  date: string;
  _order?: PaidOrder;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const toNum = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtMoney = (n: number) => `₦${fmtNum(n)}`;

const getCompany = (o: PaidOrder): string =>
  o.user?.companyName || o.user?.company_name || o.user?.company ||
  o.companyName || o.company_name ||
  o.customer?.companyName || o.customer?.company_name || o.customer?.company ||
  '—';

const getPhone = (o: PaidOrder): string =>
  o.user?.phone_number || o.user?.phone || '—';

const getOrderRef = (o: PaidOrder): string => {
  if (o.reference) return o.reference;
  return `ORD-${String(o.id).padStart(5, '0')}`;
};

const getUnitPrice = (o: PaidOrder): number => {
  const p = (o.products || [])[0];
  if (!p) return 0;
  return toNum(p.unit_price ?? p.unitPrice ?? p.price ?? 0);
};

const getLocation = (o: PaidOrder): string =>
  o.location_name || o.location || o.state || o.pickup?.state || '—';

const buildOrderRow = (o: PaidOrder): ReleaseRow => {
  const qty = toNum(o.quantity);
  const up = getUnitPrice(o);
  return {
    _type: 'order',
    _id: o.id,
    reference: getOrderRef(o),
    customer: `${o.user.first_name} ${o.user.last_name}`.trim(),
    company: getCompany(o),
    contactPhone: getPhone(o),
    contactEmail: o.user?.email || '—',
    product: (o.products || []).map(p => p.name).join(', ') || '—',
    quantity: qty > 0 ? `${fmtQty(qty)} L` : '—',
    unitPrice: up > 0 ? fmtMoney(up) : '—',
    amount: fmtMoney(toNum(o.total_price)),
    location: getLocation(o),
    pfi: o.pfi_number || '—',
    status: o.status,
    date: o.created_at,
    _order: o,
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function ConfirmRelease() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'year' | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });

  const [selectedRow, setSelectedRow] = useState<ReleaseRow | null>(null);
  const [dialogMode, setDialogMode] = useState<'view' | 'confirm' | 'reject' | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const userRole = useMemo(() => {
    try {
      const r = localStorage.getItem('role');
      return r !== null ? Number(r) : null;
    } catch { return null; }
  }, []);
  const isAuthorized = userRole !== null && [0, 1, 7, 8].includes(userRole);
  const readOnly = isCurrentUserReadOnly();

  // ═══════════════════════════════════════════════════════════════════
  // Queries — paid orders + loaded inventory
  // ═══════════════════════════════════════════════════════════════════

  // Fetch paid orders — single request, large page
  const paidOrdersQuery = useQuery({
    queryKey: ['all-orders', 'paid'],
    queryFn: async () => {
      const res = await fetchAllPages<PaidOrder>(
        (p) => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size, status: 'paid' }),
      );
      return res.results;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    enabled: isAuthorized,
  });

  const ordersQuery = {
    data: paidOrdersQuery.data ?? [],
    isLoading: paidOrdersQuery.isLoading,
    isError: paidOrdersQuery.isError,
  };

  // ═══════════════════════════════════════════════════════════════════
  // Build rows — only customer orders (no delivery inventory mixing)
  // ═══════════════════════════════════════════════════════════════════

  const allRows = useMemo(() => {
    const orderRows = (ordersQuery.data || []).map(buildOrderRow);
    orderRows.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });
    return orderRows;
  }, [ordersQuery.data]);

  // ── Unique filter options ──────────────────────────────────────────
  const uniqueLocations = useMemo(() => {
    const locs = allRows.map(r => r.location).filter(v => v && v !== '—');
    return Array.from(new Set(locs)).sort();
  }, [allRows]);

  const uniqueProducts = useMemo(() => {
    const names = (ordersQuery.data || [])
      .flatMap(o => (o.products || []).map(p => p?.name))
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return Array.from(new Set(names)).sort();
  }, [ordersQuery.data]);

  const hasActiveFilters = !!(locationFilter || productFilter || filterType || dateRange.from);

  const clearAllFilters = () => {
    setLocationFilter(null);
    setProductFilter(null);
    setFilterType(null);
    setDateRange({ from: null, to: null });
    setSearchQuery('');
  };

  const filtered = useMemo(() => {
    let list = allRows;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        r.reference.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q) ||
        r.company.toLowerCase().includes(q) ||
        r.product.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.pfi.toLowerCase().includes(q) ||
        r.contactPhone.toLowerCase().includes(q)
      );
    }
    if (locationFilter) {
      list = list.filter(r => r.location === locationFilter);
    }
    if (productFilter) {
      list = list.filter(r => r.product.includes(productFilter));
    }
    if (dateRange.from && dateRange.to) {
      list = list.filter(r => {
        if (!r.date) return false;
        const d = new Date(r.date);
        return (isSameDay(d, dateRange.from!) || isAfter(d, dateRange.from!)) &&
               (isSameDay(d, dateRange.to!) || isBefore(d, addDays(dateRange.to!, 1)));
      });
    } else if (filterType) {
      list = list.filter(r => {
        if (!r.date) return false;
        const d = new Date(r.date);
        if (filterType === 'today') return isToday(d);
        if (filterType === 'yesterday') return isYesterday(d);
        if (filterType === 'week') return isThisWeek(d);
        if (filterType === 'month') return isThisMonth(d);
        if (filterType === 'year') return isThisYear(d);
        return true;
      });
    }
    return list;
  }, [allRows, searchQuery, locationFilter, productFilter, filterType, dateRange]);

  // ═══════════════════════════════════════════════════════════════════
  // Summaries
  // ═══════════════════════════════════════════════════════════════════

  const totals = useMemo(() => {
    const total = allRows.length;
    const totalQty = allRows.reduce((s, r) => s + toNum(r.quantity.replace(/[^0-9.]/g, '')), 0);
    const totalAmt = allRows.reduce((s, r) => s + toNum(r.amount.replace(/[₦,]/g, '')), 0);
    return { total, totalQty, totalAmt };
  }, [allRows]);

  const summaryCards = useMemo((): SummaryCard[] => [
    { title: 'Awaiting Release', value: String(totals.total), icon: <Clock size={20} />, tone: totals.total > 0 ? 'amber' : 'neutral' },
    { title: 'Total Volume', value: `${fmtQty(totals.totalQty)} L`, icon: <Fuel size={20} />, tone: 'green' },
    { title: 'Total Value', value: fmtMoney(totals.totalAmt), icon: <DollarSign size={20} />, tone: 'green' },
  ], [totals]);

  // ═══════════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════════

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['all-orders'] });
    qc.invalidateQueries({ queryKey: ['sidebar'] });
  }, [qc]);

  const openDialog = (row: ReleaseRow, mode: 'view' | 'confirm' | 'reject') => {
    setSelectedRow(row);
    setDialogMode(mode);
    setActionNotes('');
  };
  const closeDialog = () => {
    setSelectedRow(null);
    setDialogMode(null);
    setActionNotes('');
  };

  const handleConfirm = useCallback(async () => {
    if (!selectedRow) return;
    setActionLoading(true);
    try {
      // Use the confirm-release endpoint: paid → released
      await apiClient.admin.confirmReleaseOrder(selectedRow._id, {
        notes: actionNotes.trim() || undefined,
      });
      toast({ title: 'Release confirmed', description: `${selectedRow.reference} has been approved for release.` });
      closeDialog();
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to confirm release',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  }, [selectedRow, actionNotes, toast, invalidateAll]);

  const handleReject = useCallback(async () => {
    if (!selectedRow || !actionNotes.trim()) return;
    setActionLoading(true);
    try {
      // Try the dedicated reject endpoint first, fall back to cancel
      try {
        await apiClient.admin.confirmReleaseAction(selectedRow._id, {
          action: 'reject',
          rejection_reason: actionNotes.trim(),
        });
      } catch {
        await apiClient.admin.cancleOrder(selectedRow._id);
      }
      toast({ title: 'Release rejected', description: `${selectedRow.reference} has been rejected.`, variant: 'destructive' });
      closeDialog();
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to reject release',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  }, [selectedRow, actionNotes, toast, invalidateAll]);

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  const isLoading = ordersQuery.isLoading;

  if (!isAuthorized) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <MobileNav />
          <TopBar />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <ShieldX className="mx-auto text-red-300" size={48} />
              <h2 className="text-lg font-semibold text-slate-700">Access Denied</h2>
              <p className="text-sm text-slate-500">You don&apos;t have permission to view this page.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />

      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-5">

            <PageHeader
              title="Confirm Release"
              description="Review and approve paid orders and loaded trucks before they proceed to Loading Tickets."
            />

            <SummaryCards cards={summaryCards} />

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col gap-3">
                {/* Row 1: Search + quick timeframe buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      placeholder="Search reference, customer, company, product…"
                      className="pl-10"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {(['today', 'yesterday', 'week', 'month', 'year'] as const).map(tf => (
                      <Button
                        key={tf}
                        size="sm"
                        variant={filterType === tf ? 'default' : 'outline'}
                        className="h-9 text-xs capitalize"
                        onClick={() => {
                          setFilterType(filterType === tf ? null : tf);
                          setDateRange({ from: null, to: null });
                        }}
                      >
                        {tf}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Row 2: Location, Product, Date Range, Clear */}
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Location</label>
                    <select
                      className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={locationFilter ?? ''}
                      onChange={e => setLocationFilter(e.target.value || null)}
                    >
                      <option value="">All Locations</option>
                      {uniqueLocations.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Product</label>
                    <select
                      className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={productFilter ?? ''}
                      onChange={e => setProductFilter(e.target.value || null)}
                    >
                      <option value="">All Products</option>
                      {uniqueProducts.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 min-w-[200px]">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Date Range</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full h-9 justify-start text-left font-normal text-sm">
                          <CalendarDays className="mr-2 h-4 w-4 text-slate-400" />
                          {dateRange.from && dateRange.to
                            ? `${format(dateRange.from, 'dd MMM')} – ${format(dateRange.to, 'dd MMM yyyy')}`
                            : 'Pick date range'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="range"
                          selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined}
                          onSelect={(range) => {
                            setDateRange({ from: range?.from ?? null, to: range?.to ?? null });
                            if (range?.from) setFilterType(null);
                          }}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {hasActiveFilters && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 gap-1 text-slate-500 hover:text-red-600 shrink-0"
                      onClick={clearAllFilters}
                    >
                      <X size={14} />
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-10 text-center">
                  <Package className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No items pending release</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {allRows.length > 0
                      ? 'Adjust your filters or search.'
                      : 'Paid orders and loaded trucks will appear here automatically.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700 text-center w-[48px]">#</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date</TableHead>
                        <TableHead className="font-semibold text-slate-700">Reference</TableHead>
                        <TableHead className="font-semibold text-slate-700">Location</TableHead>
                        <TableHead className="font-semibold text-slate-700">Customer</TableHead>
                        <TableHead className="font-semibold text-slate-700">Quantity</TableHead>
                        <TableHead className="font-semibold text-slate-700">Amount Paid</TableHead>
                        {/* <TableHead className="font-semibold text-slate-700">Status</TableHead> */}
                        <TableHead className="font-semibold text-slate-700 text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((row, idx) => {
                        return (
                          <TableRow key={`${row._type}-${row._id}`} className="hover:bg-slate-50/60 transition-colors">
                            <TableCell className="text-slate-500 text-center text-sm">{idx + 1}</TableCell>
                            <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                              {row.date ? format(parseISO(row.date), 'dd MMM yyyy') : '—'}
                            </TableCell>
                            <TableCell className="font-medium text-slate-800 whitespace-nowrap">{row.reference}</TableCell>
                            <TableCell className="text-sm text-slate-600">{row.location}</TableCell>
                            <TableCell className="max-w-[160px]" title={`${row.company} – ${row.customer}`}>
                              <div className="text-sm font-medium text-slate-800">{row.company}</div>
                              <div className="text-xs text-slate-500 truncate uppercase">{row.customer}</div>
                            </TableCell>
                            <TableCell className="text-sm text-slate-600" title={row.product}>
                              <div className="text-sm font-medium text-black whitespace-nowrap">{row.quantity} of {row.product}</div>
                              <div className="text-xs text-green-700 whitespace-nowrap">Price: {row.unitPrice}</div>
                            </TableCell>
                            <TableCell className="text-sm text-slate-800 whitespace-nowrap font-semibold">{row.amount}</TableCell>
                            {/* <TableCell>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-green-50 text-green-700 border-green-200">
                                <DollarSign size={11} /> Paid
                              </span>
                            </TableCell> */}
                            <TableCell>
                              <div className="flex gap-1">
                                {/* <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700 hover:bg-slate-100" title="View details" onClick={() => openDialog(row, 'view')}>
                                  <Eye size={15} />
                                </Button> */}
                                {!readOnly && (
                                  <>
                                    <Button size="sm" variant="default" title="Confirm release" onClick={() => openDialog(row, 'confirm')}>
                                      <CheckCircle2 size={15} /> Release
                                    </Button>
                                    {/* <Button size="sm" variant="ghost" className="h-8 px-2 gap-1 text-red-500 hover:text-red-700 hover:bg-red-50" title="Reject" onClick={() => openDialog(row, 'reject')}>
                                      <XCircle size={15} /> Decline
                                    </Button> */}
                                  </>
                                )}
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

          </div>
        </div>
      </div>

      {/* Action Dialog */}
      <Dialog open={!!selectedRow && !!dialogMode} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                dialogMode === 'confirm' ? 'bg-emerald-100' :
                dialogMode === 'reject' ? 'bg-red-100' :
                'bg-slate-100'
              }`}>
                {dialogMode === 'confirm' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                {dialogMode === 'reject' && <XCircle className="w-5 h-5 text-red-600" />}
                {dialogMode === 'view' && <Eye className="w-5 h-5 text-slate-600" />}
              </div>
              <span>
                {dialogMode === 'confirm' && 'Confirm Release'}
                {dialogMode === 'reject' && 'Reject Release'}
                {dialogMode === 'view' && 'Release Details'}
              </span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              {dialogMode === 'view' ? 'View release details' : `${dialogMode} this release request`}
            </DialogDescription>
          </DialogHeader>

          {selectedRow && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2.5 text-sm">
                <DetailRow icon={<Hash size={14} />} label="Reference" value={selectedRow.reference} bold />
                <DetailRow icon={<Building2 size={14} />} label="Company" value={selectedRow.company} />
                <DetailRow icon={<User size={14} />} label="Customer's Name" value={selectedRow.customer} />
                <DetailRow icon={<Phone size={14} />} label="Phone Number" value={selectedRow.contactPhone} />
                <div className="border-t border-slate-200 my-1" />
                <DetailRow icon={<Fuel size={14} />} label="Product" value={selectedRow.product} />
                <DetailRow icon={<Package size={14} />} label="Quantity" value={selectedRow.quantity} />
                <DetailRow icon={<DollarSign size={14} />} label="Unit Price" value={selectedRow.unitPrice} />
                <DetailRow icon={<DollarSign size={14} />} label="Amount Paid" value={selectedRow.amount} bold />
                <div className="border-t border-slate-200 my-1" />
                <DetailRow icon={<MapPin size={14} />} label="Location" value={selectedRow.location} />
                {/* <DetailRow icon={<FileText size={14} />} label="PFI" value={selectedRow.pfi} /> */}
                {/* <DetailRow icon={<Clock size={14} />} label="Status" value={
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-green-50 text-green-700 border-green-200">
                    <DollarSign size={10} /> Paid
                  </span>
                } /> */}
                <DetailRow icon={<Clock size={14} />} label="Date" value={selectedRow.date ? format(parseISO(selectedRow.date), 'dd MMM yyyy, HH:mm') : '—'} />
              </div>

              {dialogMode === 'confirm' && (
                <div className="space-y-2">
                  {/* <Label className="text-sm font-medium text-slate-700">Notes (optional)</Label> */}
                  {/* <Textarea placeholder="Add any notes for this release confirmation…" rows={2} value={actionNotes} onChange={e => setActionNotes(e.target.value)} /> */}
                  <p className="text-xs text-amber-600 flex items-center gap-1.5">
                    <ShieldCheck size={13} />
                    Confirming will approve this item for release and move it to Loading Tickets.
                  </p>
                </div>
              )}

              {dialogMode === 'reject' && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">
                    Rejection Reason <span className="text-red-500">*</span>
                  </Label>
                  <Textarea placeholder="Why is this release being rejected?" rows={2} value={actionNotes} onChange={e => setActionNotes(e.target.value)} />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeDialog} disabled={actionLoading}>
              {dialogMode === 'view' ? 'Close' : 'Cancel'}
            </Button>

            {dialogMode === 'confirm' && (
              <Button onClick={handleConfirm} disabled={actionLoading} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {actionLoading ? 'Confirming…' : 'Confirm Release'}
              </Button>
            )}

            {dialogMode === 'reject' && (
              <Button variant="destructive" onClick={handleReject} disabled={actionLoading || !actionNotes.trim()} className="gap-2">
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                {actionLoading ? 'Rejecting…' : 'Reject'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-component
// ═══════════════════════════════════════════════════════════════════════════

function DetailRow({ icon, label, value, bold }: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex items-center gap-2 text-slate-500 shrink-0">
        {icon}
        {label}
      </span>
      <span className={`text-right ${bold ? 'font-bold text-slate-800' : 'font-medium text-slate-700'}`}>
        {value}
      </span>
    </div>
  );
}
