import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Download, Search, CalendarDays, X,
  Package, Truck, Fuel, CheckCircle2, Clock, Ticket,
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiClient, fetchAllPages } from '@/api/client';
import * as XLSX from 'xlsx';
import {
  format, parseISO,
  isToday, isYesterday, isThisWeek, isThisMonth, isThisYear,
  addDays, isAfter, isBefore, isSameDay,
} from 'date-fns';
import { useToast } from '@/hooks/use-toast';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ReleasedOrder {
  id: number;
  reference?: string;
  status: string;
  created_at: string;
  released_at?: string | null;
  ticket_generated_at?: string | null;
  truck_exit_at?: string | null;

  total_price?: string | number;
  amount?: string | number;

  pfi_id?: string | number | null;
  pfi_number?: string | number | null;
  pfi?: string | number | null;

  truck_number?: string | null;

  user?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    phone?: string;
    company_name?: string;
    companyName?: string;
  };
  companyName?: string;
  company_name?: string;
  customer?: {
    companyName?: string;
    company_name?: string;
  };

  products?: Array<{
    name?: string;
    abbreviation?: string;
    quantity?: string | number;
    qty?: string | number;
    litres?: string | number;
    unit_price?: string | number;
    unitPrice?: string | number;
    price?: string | number;
  }>;

  quantity?: number | string;
  qty?: number | string;
  litres?: number | string;

  state?: string;
  location?: string;
  location_name?: string;
  pickup?: { state?: string };

  // release actor snapshot
  released_by?: string | null;
  release_user_name?: string | null;
  release_actor_full_name?: string | null;
  release_actor_obj?: { full_name?: string | null; label?: string | null } | null;

  // ticket actor snapshot
  ticket_user_name?: string | null;
  ticket_actor_full_name?: string | null;
  ticket_actor_obj?: { full_name?: string | null } | null;

  customer_details?: Record<string, unknown> | null;
}

interface OrdersResponse {
  count: number;
  results: ReleasedOrder[];
}

type QuickFilter = 'today' | 'yesterday' | 'week' | 'month' | 'year' | null;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const toNum = (v: unknown): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (n: number) =>
  `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtQty = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const fmtDate = (raw?: string | null): string => {
  if (!raw) return '—';
  try { return format(parseISO(raw), 'dd MMM yyyy'); } catch { return String(raw); }
};

const fmtTs = (raw?: string | null): string => {
  if (!raw) return '—';
  try { return format(parseISO(raw), 'dd MMM yyyy, HH:mm'); } catch { return String(raw); }
};

const getRef = (o: ReleasedOrder) =>
  o.reference || `ORD-${String(o.id).padStart(5, '0')}`;

const getCustomerName = (o: ReleasedOrder) => {
  const u = o.user;
  if (!u) return '—';
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || '—';
};

const getCompany = (o: ReleasedOrder) =>
  o.user?.companyName ||
  o.user?.company_name ||
  o.companyName ||
  o.company_name ||
  o.customer?.companyName ||
  o.customer?.company_name ||
  '—';

const getProduct = (o: ReleasedOrder): string => {
  const prods = o.products || [];
  if (prods.length) return prods.map(p => p.name || p.abbreviation || '').filter(Boolean).join(', ');
  return '—';
};

const getQty = (o: ReleasedOrder): number => {
  const v = o.quantity ?? o.qty ?? o.litres ??
    o.products?.[0]?.quantity ?? o.products?.[0]?.qty ?? o.products?.[0]?.litres;
  return toNum(v);
};

const getAmount = (o: ReleasedOrder) => toNum(o.total_price ?? o.amount);

const getLocation = (o: ReleasedOrder) =>
  o.location_name || o.location || o.state || o.pickup?.state || '—';

const getPfi = (o: ReleasedOrder): string => {
  const rec = o as unknown as Record<string, unknown>;
  const v = rec.pfi_number ?? rec.pfi ?? rec.pfi_id ?? rec.pfi_ref ?? '';
  return String(v).trim();
};

const getTruckNumber = (o: ReleasedOrder): string => {
  const rec = o as unknown as Record<string, unknown>;
  const cd = (o.customer_details || {}) as Record<string, unknown>;
  const rt = (rec.release_ticket || rec.releaseTicket || {}) as Record<string, unknown>;
  return String(
    (rec.truck_number as string) ||
    (rt.truck_number as string) || (rt.truckNumber as string) ||
    (cd.truck_number as string) || (cd.truckNumber as string) ||
    ''
  ).trim();
};

const getReleaseActor = (o: ReleasedOrder): string =>
  o.release_actor_obj?.full_name ||
  o.release_actor_obj?.label ||
  o.release_actor_full_name ||
  o.release_user_name ||
  o.released_by ||
  '—';

const getTicketActor = (o: ReleasedOrder): string =>
  o.ticket_actor_obj?.full_name ||
  o.ticket_actor_full_name ||
  o.ticket_user_name ||
  '—';

const matchesQuickFilter = (o: ReleasedOrder, filter: QuickFilter): boolean => {
  if (!filter) return true;
  const raw = o.released_at || o.created_at;
  if (!raw) return false;
  const d = parseISO(raw);
  switch (filter) {
    case 'today':     return isToday(d);
    case 'yesterday': return isYesterday(d);
    case 'week':      return isThisWeek(d, { weekStartsOn: 1 });
    case 'month':     return isThisMonth(d);
    case 'year':      return isThisYear(d);
  }
};

const matchesDateRange = (o: ReleasedOrder, from: Date | null, to: Date | null): boolean => {
  if (!from && !to) return true;
  const raw = o.released_at || o.created_at;
  if (!raw) return false;
  try {
    const d = parseISO(raw);
    if (from && to)  return (isAfter(d, addDays(from, -1)) && isBefore(d, addDays(to, 1))) || isSameDay(d, from) || isSameDay(d, to);
    if (from) return isAfter(d, addDays(from, -1)) || isSameDay(d, from);
    if (to)   return isBefore(d, addDays(to, 1))  || isSameDay(d, to);
    return true;
  } catch { return true; }
};

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function ReleasedOrders() {
  const { toast } = useToast();

  const [search, setSearch]             = useState('');
  const [quickFilter, setQuickFilter]   = useState<QuickFilter>(null);
  const [locationFilter, setLocationFilter] = useState('');
  const [productFilter, setProductFilter]   = useState('');
  const [dateRange, setDateRange]       = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });

  // ── Fetch all orders, filter to released/loaded ────────────────────
  const listQuery = useQuery<OrdersResponse>({
    queryKey: ['all-orders', 'shared'],
    queryFn: () =>
      fetchAllPages<ReleasedOrder>(p =>
        apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size }),
      ),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const allOrders = useMemo(() => listQuery.data?.results ?? [], [listQuery.data]);

  const releasedOrders = useMemo(() => {
    const s = (v: unknown) => String(v || '').toLowerCase();
    return allOrders.filter(o => {
      const st = s(o.status);
      return st === 'released' || st === 'loaded';
    });
  }, [allOrders]);

  // ── Derived filter options ─────────────────────────────────────────
  const uniqueLocations = useMemo(() =>
    Array.from(new Set(releasedOrders.map(getLocation).filter(v => v && v !== '—'))).sort(),
    [releasedOrders]
  );

  const uniqueProducts = useMemo(() =>
    Array.from(new Set(releasedOrders.map(getProduct).filter(v => v && v !== '—'))).sort(),
    [releasedOrders]
  );

  const hasActiveFilters = !!(search || quickFilter || locationFilter || productFilter || dateRange.from);

  const clearFilters = () => {
    setSearch('');
    setQuickFilter(null);
    setLocationFilter('');
    setProductFilter('');
    setDateRange({ from: null, to: null });
  };

  // ── Filtered list ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = releasedOrders;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(o =>
        getRef(o).toLowerCase().includes(q) ||
        getCustomerName(o).toLowerCase().includes(q) ||
        getCompany(o).toLowerCase().includes(q) ||
        getProduct(o).toLowerCase().includes(q) ||
        getLocation(o).toLowerCase().includes(q) ||
        getReleaseActor(o).toLowerCase().includes(q) ||
        getTruckNumber(o).toLowerCase().includes(q)
      );
    }

    if (quickFilter) rows = rows.filter(o => matchesQuickFilter(o, quickFilter));
    if (dateRange.from || dateRange.to) rows = rows.filter(o => matchesDateRange(o, dateRange.from, dateRange.to));
    if (locationFilter) rows = rows.filter(o => getLocation(o).toLowerCase().includes(locationFilter.toLowerCase()));
    if (productFilter) rows = rows.filter(o => getProduct(o).toLowerCase().includes(productFilter.toLowerCase()));

    return [...rows].sort((a, b) => {
      const da = new Date(a.released_at || a.created_at).getTime();
      const db = new Date(b.released_at || b.created_at).getTime();
      return db - da;
    });
  }, [releasedOrders, search, quickFilter, locationFilter, productFilter, dateRange]);

  // ── Summary cards ─────────────────────────────────────────────────
  const summaryCards = useMemo((): SummaryCard[] => {
    const totalVol   = filtered.reduce((s, o) => s + getQty(o), 0);
    const totalAmt   = filtered.reduce((s, o) => s + getAmount(o), 0);
    const withTicket = filtered.filter(o => !!o.ticket_generated_at).length;
    const exited     = filtered.filter(o => !!o.truck_exit_at).length;
    const pending    = filtered.filter(o => !o.truck_exit_at).length;

    return [
      { title: 'Total Released',    value: String(filtered.length),       icon: <CheckCircle2 size={20} />, tone: 'green'   },
      { title: 'Total Volume',      value: `${fmtQty(totalVol)} L`,       icon: <Fuel size={20} />,         tone: 'neutral' },
      { title: 'Total Value',       value: fmtMoney(totalAmt),            icon: <Package size={20} />,      tone: 'neutral' },
    //   { title: 'Tickets Generated', value: String(withTicket),            icon: <Ticket size={20} />,       tone: 'neutral' },
    //   { title: 'Security Cleared',  value: String(exited),                icon: <Truck size={20} />,        tone: 'green'   },
    //   { title: 'Awaiting Exit',     value: String(pending),               icon: <Clock size={20} />,        tone: pending > 0 ? 'amber' : 'neutral' },
    ];
  }, [filtered]);

  // ── Export ─────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!filtered.length) return;
    const rows = filtered.map((o, i) => ({
      'S/N': i + 1,
      'Reference': getRef(o),
      'Released Date': fmtTs(o.released_at || o.created_at),
      'Customer': getCustomerName(o),
      'Company': getCompany(o),
      'Product': getProduct(o),
      'Quantity (L)': getQty(o),
      'Amount (₦)': getAmount(o),
      'Location': getLocation(o),
    //   'PFI': getPfi(o),
      'Truck No.': getTruckNumber(o),
    //   'Released By': getReleaseActor(o),
    //   'Ticket Generated By': getTicketActor(o),
    //   'Ticket Generated At': fmtTs(o.ticket_generated_at),
    //   'Security Exit At': fmtTs(o.truck_exit_at),
    //   'Status': o.status,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Released Orders');
    XLSX.writeFile(wb, `RELEASED-ORDERS-${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
    toast({ title: 'Exported successfully' });
  };

  // ── Ticket badge ───────────────────────────────────────────────────
  const TicketBadge = ({ o }: { o: ReleasedOrder }) => {
    if (o.truck_exit_at) return <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs font-medium">Exited</Badge>;
    if (o.ticket_generated_at) return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs font-medium">Ticketed</Badge>;
    return <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-medium">Released</Badge>;
  };

  const QUICK_FILTERS: { label: string; value: QuickFilter }[] = [
    { label: 'Today',     value: 'today'     },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'This Week', value: 'week'      },
    { label: 'This Month',value: 'month'     },
    { label: 'This Year', value: 'year'      },
  ];

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            <PageHeader
              title="Released Orders"
              description="All orders that have been confirmed and released"
              actions={
                <Button variant="outline" className="gap-2" onClick={handleExport} disabled={!filtered.length}>
                  <Download size={16} /> Export
                </Button>
              }
            />

            <SummaryCards cards={summaryCards} />

            {/* ── Filters ─────────────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3">
              {/* Row 1: Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input
                  placeholder="Search by reference, customer, company, product, location, truck…"
                  className="pl-10"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {/* Row 2: Quick time filters */}
              <div className="flex flex-wrap gap-2 items-center">
                {QUICK_FILTERS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setQuickFilter(prev => prev === f.value ? null : f.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      quickFilter === f.value
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Row 3: Location + Product + Date range + Clear */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center pt-2 border-t border-slate-100">
                <select
                  aria-label="Filter by location"
                  value={locationFilter}
                  onChange={e => setLocationFilter(e.target.value)}
                  className="h-10 px-3 rounded-md border border-input bg-background text-sm min-w-[160px]"
                >
                  <option value="">All Locations</option>
                  {uniqueLocations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>

                <select
                  aria-label="Filter by product"
                  value={productFilter}
                  onChange={e => setProductFilter(e.target.value)}
                  className="h-10 px-3 rounded-md border border-input bg-background text-sm min-w-[160px]"
                >
                  <option value="">All Products</option>
                  {uniqueProducts.map(p => <option key={p} value={p}>{p}</option>)}
                </select>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-10 justify-start text-left font-normal text-sm gap-2 min-w-[230px]">
                      <CalendarDays size={15} className="text-slate-400" />
                      {dateRange.from && dateRange.to
                        ? `${format(dateRange.from, 'dd MMM yyyy')} – ${format(dateRange.to, 'dd MMM yyyy')}`
                        : 'Pick date range'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined}
                      onSelect={r => setDateRange({ from: r?.from ?? null, to: r?.to ?? null })}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>

                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-slate-500 hover:text-red-600" onClick={clearFilters}>
                    <X size={14} /> Clear filters
                  </Button>
                )}

                <span className="ml-auto text-xs text-slate-400 hidden sm:block">
                  {listQuery.isFetching
                    ? 'Loading…'
                    : `${filtered.length.toLocaleString()} record${filtered.length !== 1 ? 's' : ''}`}
                </span>
              </div>
            </div>

            {/* ── Table ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="w-12 font-semibold text-slate-700">#</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Date & Time</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Order Reference</TableHead>
                      <TableHead className="font-semibold text-slate-700">Customer</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Quantity</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Amount</TableHead>
                      <TableHead className="font-semibold text-slate-700">Location</TableHead>
                      {/* <TableHead className="font-semibold text-slate-700">PFI</TableHead> */}
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Truck No.</TableHead>
                      {/* <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                          Released By
                        </span>
                      </TableHead> */}
                      {/* <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                          Ticket By
                        </span>
                      </TableHead> */}
                      {/* <TableHead className="font-semibold text-slate-700">Stage</TableHead> */}
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {listQuery.isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={12}><Skeleton className="h-10 w-full" /></TableCell>
                        </TableRow>
                      ))
                    ) : listQuery.isError ? (
                      <TableRow>
                        <TableCell colSpan={12} className="py-10 text-center text-red-600">
                          {(listQuery.error as Error)?.message || 'Failed to load orders.'}
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="py-14 text-center">
                          <Package className="mx-auto text-slate-300 mb-3" size={40} />
                          <p className="text-slate-500 font-medium">No released orders found</p>
                          <p className="text-sm text-slate-400 mt-1">
                            {hasActiveFilters ? 'Try adjusting your filters.' : 'Released orders will appear here.'}
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((o, idx) => {
                        const qty    = getQty(o);
                        const amount = getAmount(o);
                        const pfi    = getPfi(o);
                        const truck  = getTruckNumber(o);

                        return (
                          <TableRow key={o.id} className="hover:bg-blue-50/30 transition-colors">
                            <TableCell className="text-slate-400 text-xs">{idx + 1}</TableCell>

                            <TableCell className="whitespace-nowrap text-slate-600 text-xs">
                              {fmtTs(o.released_at || o.created_at)}
                            </TableCell>

                            <TableCell className="font-semibold text-slate-800 whitespace-nowrap">
                              {getRef(o)}
                            </TableCell>

                            <TableCell className="max-w-[160px]">
                              <div className="text-sm font-medium text-slate-800 uppercase leading-tight">
                                {getCustomerName(o)}
                              </div>
                              {getCompany(o) !== '—' && (
                                <div className="text-xs uppercase text-slate-500 mt-0.5">
                                  {getCompany(o)}
                                </div>
                              )}
                            </TableCell>

                            <TableCell className="whitespace-nowrap">
                              {qty > 0 && (
                                <div className="text-sm font-semibold text-black">{fmtQty(qty)} Litres</div>
                              )}
                              <div className="text-xs text-slate-500">{getProduct(o)}</div>
                            </TableCell>

                            <TableCell className="font-semibold text-slate-800 whitespace-nowrap">
                              {amount > 0 ? fmtMoney(amount) : '—'}
                            </TableCell>

                            <TableCell className="text-slate-600 max-w-[120px]">
                              {getLocation(o)}
                            </TableCell>

                            {/* <TableCell className="text-slate-600 text-sm whitespace-nowrap">
                              {pfi || '—'}
                            </TableCell> */}

                            <TableCell className="text-slate-700 text-sm font-medium whitespace-nowrap">
                              {truck || '—'}
                            </TableCell>

                            {/* Released By */}
                            {/* <TableCell>
                              {getReleaseActor(o) !== '—' ? (
                                <div>
                                  <div className="text-sm font-semibold text-slate-800 leading-tight">
                                    {getReleaseActor(o)}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {fmtDate(o.released_at)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </TableCell> */}

                            {/* Ticket By */}
                            {/* <TableCell>
                              {o.ticket_generated_at ? (
                                <div>
                                  <div className="text-sm font-semibold text-slate-800 leading-tight">
                                    {getTicketActor(o) !== '—' ? getTicketActor(o) : <span className="text-slate-400 font-normal">Unknown</span>}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {fmtDate(o.ticket_generated_at)}
                                  </div>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />
                                  Pending
                                </span>
                              )}
                            </TableCell> */}

                            {/* Stage badge */}
                            {/* <TableCell>
                              <TicketBadge o={o} />
                            </TableCell> */}
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {!listQuery.isLoading && filtered.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-white">
                  <span className="text-xs text-slate-500">
                    Showing <strong>{filtered.length.toLocaleString()}</strong> of{' '}
                    <strong>{releasedOrders.length.toLocaleString()}</strong> released orders
                  </span>
                  <span className="text-xs text-slate-500">
                    Total Value:{' '}
                    <strong className="text-slate-700">
                      {fmtMoney(filtered.reduce((s, o) => s + getAmount(o), 0))}
                    </strong>
                    {' · '}
                    Total Volume:{' '}
                    <strong className="text-slate-700">
                      {fmtQty(filtered.reduce((s, o) => s + getQty(o), 0))} L
                    </strong>
                  </span>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
