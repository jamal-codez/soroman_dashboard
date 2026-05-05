//
// DEPOT MANAGER VIEW — Read-only dashboard showing all orders with full
// details. Default filter: today. Filters: date preset, date range,
// location, product, status, PFI, search. No actions — view only.
//
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Search, X, CalendarDays, Eye,
  Truck, Package, DollarSign, Clock, CheckCircle2, XCircle,
  MapPin, User, Phone, Hash, Building2, Fuel, FileText,
  ShieldCheck, ListFilter, RefreshCw,
  FuelIcon,
} from 'lucide-react';
import {
  format, parseISO, isToday, isYesterday, isThisWeek, isThisMonth, isThisYear,
  addDays, isAfter, isBefore, isSameDay, startOfDay, endOfDay,
} from 'date-fns';
import { apiClient, fetchAllPages } from '@/api/client';
import { getOrderReference } from '@/lib/orderReference';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface Order {
  id: number;
  user: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    phone?: string;
    companyName?: string;
    company_name?: string;
  };
  companyName?: string;
  company_name?: string;
  customer?: {
    companyName?: string;
    company_name?: string;
  };
  pickup?: {
    pickup_date?: string;
    pickup_time?: string;
    state?: string;
  };
  location_name?: string;
  location?: string | number;
  state?: string;
  total_price?: string | number;
  status: string;
  created_at: string;
  products: Array<{
    name?: string;
    unit_price?: number | string;
    unitPrice?: number | string;
    price?: number | string;
  }>;
  quantity?: number | string;
  release_type?: 'pickup' | 'delivery';
  reference?: string;
  truck_number?: string;
  driver_name?: string;
  driver_phone?: string;
  customer_details?: Record<string, unknown>;
  pfi_id?: number | null;
  pfi_number?: string | null;
  narration?: string;
  agent?: unknown;
  assigned_agent?: unknown;
  meta?: Record<string, unknown>;
}

type TimePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const toNum = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number) =>
  `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtQty = (n: number) =>
  n.toLocaleString('en-NG', { maximumFractionDigits: 0 });

const fmtDateTime = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy, HH:mm'); }
  catch { return iso; }
};

const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy'); }
  catch { return iso; }
};

const getCustomerName = (o: Order): string => {
  const fn = o.user?.first_name ?? '';
  const ln = o.user?.last_name ?? '';
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  return (
    o.companyName ||
    o.company_name ||
    o.customer?.companyName ||
    o.customer?.company_name ||
    o.user?.email ||
    '—'
  );
};

const getPhone = (o: Order): string =>
  o.user?.phone_number || o.user?.phone || '—';

const getProductName = (o: Order): string =>
  o.products?.[0]?.name || '—';

const getUnitPrice = (o: Order): number => {
  const p = o.products?.[0] as Record<string, unknown> | undefined;
  const raw = p?.unit_price ?? p?.unitPrice ?? p?.price;
  return toNum(raw);
};

const getLocation = (o: Order): string =>
  o.location_name || o.state || o.pickup?.state || '—';

const getTruckNumber = (o: Order): string =>
  o.truck_number ||
  String(o.customer_details?.truckNumber || o.customer_details?.truck_number || '') ||
  '—';

const getDriverName = (o: Order): string =>
  o.driver_name ||
  String(o.customer_details?.driverName || o.customer_details?.driver_name || '') ||
  '—';

const getDriverPhone = (o: Order): string =>
  o.driver_phone ||
  String(o.customer_details?.driverPhone || o.customer_details?.driver_phone || '') ||
  '—';

// Status display
const STATUS_MAP: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:  { label: 'Pending',  cls: 'bg-amber-50 text-amber-700 border border-amber-200',   icon: <Clock size={12} /> },
  paid:     { label: 'Paid',     cls: 'bg-green-50 text-green-700 border border-green-200',    icon: <DollarSign size={12} /> },
  released: { label: 'Released', cls: 'bg-blue-50 text-blue-700 border border-blue-200',       icon: <ShieldCheck size={12} /> },
  loaded:   { label: 'Loaded',   cls: 'bg-violet-50 text-violet-700 border border-violet-200', icon: <Truck size={12} /> },
  canceled: { label: 'Canceled', cls: 'bg-red-50 text-red-700 border border-red-200',          icon: <XCircle size={12} /> },
  sold:     { label: 'Sold',     cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: <CheckCircle2 size={12} /> },
};

const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS_MAP[status?.toLowerCase()] ?? {
    label: status, cls: 'bg-slate-50 text-slate-600 border border-slate-200', icon: null,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
};

const matchesPreset = (iso: string, preset: TimePreset): boolean => {
  try {
    const d = parseISO(iso);
    switch (preset) {
      case 'today':     return isToday(d);
      case 'yesterday': return isYesterday(d);
      case 'week':      return isThisWeek(d, { weekStartsOn: 1 });
      case 'month':     return isThisMonth(d);
      case 'year':      return isThisYear(d);
      case 'all':       return true;
      default:          return true;
    }
  } catch { return false; }
};

// ═══════════════════════════════════════════════════════════════════════════
// Detail Dialog
// ═══════════════════════════════════════════════════════════════════════════

const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">{label}</span>
    <span className="text-sm text-slate-800 font-medium">{value || '—'}</span>
  </div>
);

const OrderDetailDialog = ({
  order,
  open,
  onClose,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
}) => {
  if (!order) return null;
  const qty       = toNum(order.quantity);
  const total     = toNum(order.total_price);
  const unitPrice = getUnitPrice(order);
  const ref       = getOrderReference(order);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <FuelIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Order Details</h2>
              <p className="text-sm font-normal text-slate-500 mt-0.5">
                Ref: <span className="text-slate-700">{ref}</span>
              </p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Full order details view</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Status + type */}
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={order.status} />
            {/* {order.release_type && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                order.release_type === 'pickup'
                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}>
                {order.release_type === 'pickup' ? <Building2 size={12} /> : <Truck size={12} />}
                {order.release_type === 'pickup' ? 'Pickup' : 'Delivery'}
              </span>
            )} */}
            {order.pfi_number && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200">
                <FileText size={12} />{order.pfi_number}
              </span>
            )}
          </div>

          {/* Customer */}
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <User size={12} /> Customer
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DetailRow label="Name" value={getCustomerName(order)} />
              <DetailRow label="Phone" value={getPhone(order)} />
              <DetailRow label="Email" value={order.user?.email} />
              <DetailRow label="Company" value={order.user?.companyName || order.user?.company_name || order.companyName || order.company_name} />
              <DetailRow label="Location" value={getLocation(order)} />
              <DetailRow label="Order Date" value={fmtDateTime(order.created_at)} />
            </div>
          </div>

          {/* Order */}
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Package size={12} /> Order Info
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DetailRow label="Reference" value={<span>{ref}</span>} />
              <DetailRow label="Product" value={getProductName(order)} />
              <DetailRow label="Quantity (L)" value={qty > 0 ? fmtQty(qty) : '—'} />
              <DetailRow label="Unit Price" value={unitPrice > 0 ? fmt(unitPrice) : '—'} />
              <DetailRow label="Total Amount" value={total > 0 ? fmt(total) : '—'} />
              {/* <DetailRow label="PFI Number" value={order.pfi_number} /> */}
            </div>
          </div>

          {/* Pickup / Delivery info */}
          {order.pickup && (
            <div className="bg-sky-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-sky-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <MapPin size={12} /> Pickup Details
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <DetailRow label="Pickup Date" value={order.pickup.pickup_date ? fmtDate(order.pickup.pickup_date) : undefined} />
                <DetailRow label="Pickup Time" value={order.pickup.pickup_time} />
                <DetailRow label="State" value={order.pickup.state} />
              </div>
            </div>
          )}

          {/* Truck info (if loaded/delivery) */}
          {(getTruckNumber(order) !== '—' || getDriverName(order) !== '—') && (
            <div className="bg-violet-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Truck size={12} /> Truck / Driver
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <DetailRow label="Truck No." value={getTruckNumber(order)} />
                <DetailRow label="Driver" value={getDriverName(order)} />
                <DetailRow label="Driver Phone" value={getDriverPhone(order)} />
              </div>
            </div>
          )}

          {/* Narration */}
          {order.narration && (
            <div className="bg-amber-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">Narration / Remarks</p>
              <p className="text-sm text-slate-700">{order.narration}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

export default function DepotView() {
  // ── Filters ──────────────────────────────────────────────────────
  const [timePreset, setTimePreset]     = useState<TimePreset>('today');
  const [customFrom, setCustomFrom]     = useState('');
  const [customTo, setCustomTo]         = useState('');
  const [calOpen, setCalOpen]           = useState(false);
  const [calRange, setCalRange]         = useState<{ from?: Date; to?: Date }>({});
  const [searchQuery, setSearchQuery]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [productFilter, setProductFilter]   = useState('all');
  const [releaseTypeFilter, setReleaseTypeFilter] = useState('all');

  // ── Detail dialog ─────────────────────────────────────────────────
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // ── Data ──────────────────────────────────────────────────────────
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['depot-view-orders'],
    queryFn: () => fetchAllPages<Order>(
      p => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size }),
    ),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const allOrders: Order[] = data?.results ?? [];

  // ── Derived filter options ────────────────────────────────────────
  const uniqueLocations = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { const l = getLocation(o); if (l !== '—') s.add(l); });
    return Array.from(s).sort();
  }, [allOrders]);

  const uniqueProducts = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { const p = getProductName(o); if (p !== '—') s.add(p); });
    return Array.from(s).sort();
  }, [allOrders]);

  const uniqueStatuses = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { if (o.status) s.add(o.status.toLowerCase()); });
    return Array.from(s).sort();
  }, [allOrders]);

  // ── Filtered orders ───────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    return allOrders.filter(o => {
      // Date filter
      const dateStr = o.created_at;
      if (timePreset === 'custom') {
        if (customFrom || customTo) {
          try {
            const d = parseISO(dateStr);
            if (customFrom && isBefore(d, startOfDay(parseISO(customFrom)))) return false;
            if (customTo   && isAfter(d, endOfDay(parseISO(customTo))))     return false;
          } catch { return false; }
        }
      } else {
        if (!matchesPreset(dateStr, timePreset)) return false;
      }

      // Status
      if (statusFilter !== 'all' && o.status?.toLowerCase() !== statusFilter) return false;

      // Location
      if (locationFilter !== 'all' && getLocation(o) !== locationFilter) return false;

      // Product
      if (productFilter !== 'all' && getProductName(o) !== productFilter) return false;

      // Release type
      if (releaseTypeFilter !== 'all' && o.release_type !== releaseTypeFilter) return false;

      // Search
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const ref  = getOrderReference(o).toLowerCase();
        const name = getCustomerName(o).toLowerCase();
        const loc  = getLocation(o).toLowerCase();
        const prod = getProductName(o).toLowerCase();
        const truck = getTruckNumber(o).toLowerCase();
        const driver = getDriverName(o).toLowerCase();
        const pfi  = String(o.pfi_number ?? '').toLowerCase();
        if (
          !ref.includes(q) && !name.includes(q) && !loc.includes(q) &&
          !prod.includes(q) && !truck.includes(q) && !driver.includes(q) &&
          !pfi.includes(q) && !String(o.id).includes(q)
        ) return false;
      }

      return true;
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [allOrders, timePreset, customFrom, customTo, statusFilter, locationFilter, productFilter, releaseTypeFilter, searchQuery]);

  // ── Summary cards ─────────────────────────────────────────────────
  const summaryCards = useMemo((): SummaryCard[] => {
    const total      = filteredOrders.length;
    const paid       = filteredOrders.filter(o => ['paid','released','loaded','sold'].includes(o.status?.toLowerCase())).length;
    const pending    = filteredOrders.filter(o => o.status?.toLowerCase() === 'pending').length;
    const totalQty   = filteredOrders.reduce((s, o) => s + toNum(o.quantity), 0);

    const releasedOrders = filteredOrders.filter(o => o.status?.toLowerCase() === 'released');
    const loadedOrders   = filteredOrders.filter(o => o.status?.toLowerCase() === 'loaded');
    const releasedQty    = releasedOrders.reduce((s, o) => s + toNum(o.quantity), 0);
    const loadedQty      = loadedOrders.reduce((s, o) => s + toNum(o.quantity), 0);

    return [
      { title: 'Total Orders',      value: String(total),                               icon: <FileText size={20} />,     tone: 'neutral' },
      { title: 'Paid & Released',    value: String(paid),                                icon: <CheckCircle2 size={20} />, tone: 'green' },
      { title: 'Payment Not Confirmed',           value: String(pending),                             icon: <Clock size={20} />,        tone: pending > 0 ? 'amber' : 'neutral' },
      { title: 'Total Qty (L)',     value: totalQty > 0 ? fmtQty(totalQty) : '0',      icon: <Fuel size={20} />,         tone: 'neutral' },
      { title: 'Released Qty (L)',  value: releasedQty > 0 ? fmtQty(releasedQty) : '0', icon: <ShieldCheck size={20} />, tone: 'neutral' },
      { title: 'Loaded Qty (L)',    value: loadedQty > 0 ? fmtQty(loadedQty) : '0',    icon: <Truck size={20} />,        tone: 'neutral' },
      
    ];
  }, [filteredOrders]);

  const hasFilters = searchQuery || statusFilter !== 'all' || locationFilter !== 'all' ||
    productFilter !== 'all' || releaseTypeFilter !== 'all' ||
    timePreset !== 'today' || customFrom || customTo;

  const clearFilters = () => {
    setTimePreset('today');
    setCustomFrom(''); setCustomTo('');
    setCalRange({});
    setSearchQuery('');
    setStatusFilter('all');
    setLocationFilter('all');
    setProductFilter('all');
    setReleaseTypeFilter('all');
  };

  const PRESETS: { key: TimePreset; label: string }[] = [
    { key: 'today',     label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week',      label: 'This Week' },
    { key: 'month',     label: 'This Month' },
    { key: 'year',      label: 'This Year' },
    { key: 'all',       label: 'All Time' },
    { key: 'custom',    label: 'Date Range' },
  ];

  // ── Render ────────────────────────────────────────────────────────
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
              title="Orders Overview"
              description="Live overview of all orders — status, quantities, customers, trucks and PFI assignments."
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                  Refresh
                </Button>
              }
            />

            {/* ── Filter Panel ──────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">

              {/* Search bar — full width, prominent */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  placeholder="Search by customer name, reference number, truck, driver or PFI…"
                  className="pl-10 h-10 text-sm bg-slate-50 border-slate-200 focus:bg-white"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    title="Clear search"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-slate-100" />

              {/* Row: Date Period — full width */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays size={12} /> Date Period
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.filter(p => p.key !== 'custom').map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => { setTimePreset(key); setCustomFrom(''); setCustomTo(''); setCalRange({}); }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                        timePreset === key
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  {/* Custom range button */}
                  <Popover open={calOpen} onOpenChange={setCalOpen}>
                    <PopoverTrigger asChild>
                      <button
                        title="Pick a custom date range"
                        onClick={() => setTimePreset('custom')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all flex items-center gap-1.5 ${
                          timePreset === 'custom'
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <CalendarDays size={11} />
                        {timePreset === 'custom' && calRange.from
                          ? calRange.to
                            ? `${format(calRange.from, 'dd MMM')} – ${format(calRange.to, 'dd MMM yyyy')}`
                            : format(calRange.from, 'dd MMM yyyy')
                          : 'Custom Range'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{ from: calRange.from, to: calRange.to }}
                        onSelect={r => {
                          setCalRange(r ?? {});
                          setTimePreset('custom');
                          if (r?.from) setCustomFrom(format(r.from, 'yyyy-MM-dd'));
                          if (r?.to)   setCustomTo(format(r.to, 'yyyy-MM-dd'));
                          if (r?.from && r?.to) setCalOpen(false);
                        }}
                        initialFocus
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-100" />

              {/* Filter rows */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                {/* Order Status */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> Order Status
                  </p>
                  <select
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="all">All Orders</option>
                    {uniqueStatuses.map(s => (
                      <option key={s} value={s}>
                        {STATUS_MAP[s]?.label ?? s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={12} /> Location
                  </p>
                  <select
                    aria-label="Filter by location"
                    value={locationFilter}
                    onChange={e => setLocationFilter(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="all">All Locations</option>
                    {uniqueLocations.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>

                {/* Product */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Fuel size={12} /> Product
                  </p>
                  <select
                    aria-label="Filter by product"
                    value={productFilter}
                    onChange={e => setProductFilter(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="all">All Products</option>
                    {uniqueProducts.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Bottom bar: active filter summary + clear */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Active filter chips */}
                  {timePreset !== 'today' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <CalendarDays size={11} />
                      {timePreset === 'custom' && calRange.from
                        ? calRange.to
                          ? `${format(calRange.from, 'dd MMM')} – ${format(calRange.to, 'dd MMM yyyy')}`
                          : format(calRange.from, 'dd MMM yyyy')
                        : PRESETS.find(p => p.key === timePreset)?.label}
                      <button onClick={() => { setTimePreset('today'); setCustomFrom(''); setCustomTo(''); setCalRange({}); }} title="Remove date filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {statusFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      {STATUS_MAP[statusFilter]?.label ?? statusFilter}
                      <button onClick={() => setStatusFilter('all')} title="Remove status filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {locationFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <MapPin size={10} />{locationFilter}
                      <button onClick={() => setLocationFilter('all')} title="Remove location filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {productFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <Fuel size={10} />{productFilter}
                      <button onClick={() => setProductFilter('all')} title="Remove product filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {releaseTypeFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      {releaseTypeFilter === 'pickup' ? 'Pickup' : 'Delivery'}
                      <button onClick={() => setReleaseTypeFilter('all')} title="Remove type filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <Search size={10} />"{searchQuery}"
                      <button onClick={() => setSearchQuery('')} title="Clear search" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {hasFilters && (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500 h-8 text-xs" onClick={clearFilters}>
                      <X size={13} /> Clear all filters
                    </Button>
                  )}
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                    {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} shown
                  </span>
                </div>
              </div>
            </div>

            {/* ── Summary Cards ─────────────────────────────────────── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Table ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : isError ? (
                <div className="p-10 text-center">
                  <XCircle className="mx-auto text-red-300 mb-3" size={40} />
                  <p className="text-slate-600 font-medium">Failed to load orders</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                    Try Again
                  </Button>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-10 text-center">
                  <Package className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No orders found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {allOrders.length > 0 ? 'Try adjusting your filters.' : 'No orders in the system yet.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="w-[48px] font-semibold text-slate-700">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700">Reference</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date</TableHead>
                        <TableHead className="font-semibold text-slate-700">Customer</TableHead>
                        <TableHead className="font-semibold text-slate-700">Phone</TableHead>
                        <TableHead className="font-semibold text-slate-700">Truck No.</TableHead>
                        {/* <TableHead className="font-semibold text-slate-700">Location</TableHead> */}
                        {/* <TableHead className="font-semibold text-slate-700">Product</TableHead> */}
                        <TableHead className="font-semibold text-slate-700">Qty (L)</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Unit Price</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Total</TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700">PFI</TableHead>
                        {/* <TableHead className="font-semibold text-slate-700">Driver</TableHead> */}
                        <TableHead className="font-semibold text-slate-700 w-[60px]">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((o, idx) => {
                        const qty       = toNum(o.quantity);
                        const total     = toNum(o.total_price);
                        const unitPrice = getUnitPrice(o);
                        const truck     = getTruckNumber(o);
                        const driver    = getDriverName(o);
                        const ref       = getOrderReference(o);
                        const status    = o.status?.toLowerCase();

                        return (
                          <TableRow
                            key={o.id}
                            className={`hover:bg-slate-50/60 transition-colors ${
                              status === 'canceled' ? 'opacity-60' : ''
                            } ${status === 'loaded' ? 'bg-violet-50/20' : ''}`}
                          >
                            <TableCell className="text-center text-slate-400">{idx + 1}</TableCell>

                            <TableCell className="text-sm text-slate-700 whitespace-nowrap">
                              {ref}
                            </TableCell>

                            <TableCell className="text-slate-600 whitespace-nowrap text-sm">
                              {fmtDateTime(o.created_at)}
                            </TableCell>

                            <TableCell className="font-medium text-slate-900 whitespace-nowrap">
                              {(() => {
                                const company = o.user?.companyName || o.user?.company_name || o.companyName || o.company_name || o.customer?.companyName || o.customer?.company_name;
                                const name = getCustomerName(o);
                                if (company) return (
                                  <div>
                                    <p className="font-semibold uppercase text-black">{company}</p>
                                    <p className="text-xs uppercase text-slate-700 font-normal">{name}</p>
                                  </div>
                                );
                                return name;
                              })()}
                            </TableCell>

                            <TableCell className="text-black whitespace-nowrap text-sm">
                              {getPhone(o)}
                            </TableCell>

                            <TableCell className="text-blue-700 whitespace-nowrap text-sm font-medium">
                              {truck !== '—' ? (
                                <span className="flex items-center gap-1">
                                  <Truck size={11} className="text-slate-600" />{truck}
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </TableCell>

                            {/* <TableCell className="text-slate-700 whitespace-nowrap">
                              <span className="flex items-center gap-1">
                                <MapPin size={11} className="text-slate-400 shrink-0" />
                                {getLocation(o)}
                              </span>
                            </TableCell> */}

                            {/* <TableCell className="text-slate-700 whitespace-nowrap">
                              <span className="flex items-center gap-1">
                                <Fuel size={11} className="text-slate-400 shrink-0" />
                                {getProductName(o)}
                              </span>
                            </TableCell> */}

                            <TableCell className="font-semibold text-black">
                              {qty > 0 ? fmtQty(qty) : '—'}
                              <span className="flex items-center text-xs font-normal gap-1">
                                <Fuel size={11} className="text-slate-400 shrink-0" />
                                {getProductName(o)}
                              </span>
                            </TableCell>

                            <TableCell className="text-right text-slate-900">
                              {unitPrice > 0 ? fmt(unitPrice) : '—'}
                            </TableCell>

                            <TableCell className="text-right font-bold text-slate-800">
                              {total > 0 ? fmt(total) : '—'}
                            </TableCell>

                            <TableCell>
                              <StatusBadge status={o.status} />
                            </TableCell>

                            <TableCell className="text-slate-600 text-xs whitespace-nowrap">
                              {o.pfi_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">
                                  <FileText size={11} />{o.pfi_number}
                                </span>
                              ) : <span className="text-slate-400">—</span>}
                            </TableCell>

                            {/* <TableCell className="text-slate-700 whitespace-nowrap text-xs">
                              {driver !== '—' ? (
                                <div>
                                  <p className="font-medium">{driver}</p>
                                  {getDriverPhone(o) !== '—' && (
                                    <p className="text-slate-400 flex items-center gap-0.5">
                                      <Phone size={10} />{getDriverPhone(o)}
                                    </p>
                                  )}
                                </div>
                              ) : <span className="text-slate-400">—</span>}
                            </TableCell> */}

                            <TableCell>
                              <Button
                                size="sm" variant="ghost"
                                className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                title="View full details"
                                onClick={() => setSelectedOrder(o)}
                              >
                                <Eye size={14} />
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

            {/* Footer count */}
            {!isLoading && filteredOrders.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {filteredOrders.length} of {allOrders.length} total orders
              </p>
            )}

          </div>
        </div>
      </div>

      {/* Detail dialog */}
      <OrderDetailDialog
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}
