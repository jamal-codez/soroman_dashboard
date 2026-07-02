import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  format, parseISO, isToday, isYesterday, isThisWeek, isThisMonth, isThisYear,
  isBefore, isAfter, startOfDay, endOfDay,
} from 'date-fns';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { apiClient, fetchAllPages } from '@/api/client';
import {
  CheckCircle2, XCircle, FileText, Loader2, Clock,
  Truck, Package, ShieldCheck, DollarSign, Activity,
  CalendarDays, MapPin, ArrowUpDown, RefreshCw, X,
} from 'lucide-react';
import ExcelJS from 'exceljs';

// ─────────────────────────────────────────────────────────────────────────────
// Types & helpers
// ─────────────────────────────────────────────────────────────────────────────
interface Order {
  id: number;
  user?: { first_name?: string; last_name?: string; email?: string };
  companyName?: string;
  company_name?: string;
  location_name?: string;
  pfi_number?: string;
  products?: Array<{ name?: string }>;
  quantity?: number | string;
  status: string;
  created_at: string;
  updated_at?: string;
  truck_tickets_count?: number;
  reference?: string;
}

type TimePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';
type SortDir    = 'desc' | 'asc';

const PRESETS: { key: TimePreset; label: string }[] = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week',      label: 'This Week' },
  { key: 'month',     label: 'This Month' },
  { key: 'year',      label: 'This Year' },
  { key: 'all',       label: 'All Time' },
];

const STATUS_RANK: Record<string, number> = { pending: 0, paid: 1, released: 2, loaded: 3, sold: 4, canceled: -1 };

const toNum = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const customerName = (o: Order) => {
  const full = `${o.user?.first_name ?? ''} ${o.user?.last_name ?? ''}`.trim();
  return full || o.companyName || o.company_name || o.user?.email || '—';
};

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd MMM yyyy, HH:mm'); }
  catch { return iso; }
};

const matchesPreset = (iso: string, preset: TimePreset, from: string, to: string): boolean => {
  try {
    const d = parseISO(iso);
    switch (preset) {
      case 'today':     return isToday(d);
      case 'yesterday': return isYesterday(d);
      case 'week':      return isThisWeek(d, { weekStartsOn: 1 });
      case 'month':     return isThisMonth(d);
      case 'year':      return isThisYear(d);
      case 'all':       return true;
      case 'custom': {
        if (from && isBefore(d, startOfDay(parseISO(from)))) return false;
        if (to   && isAfter(d,  endOfDay(parseISO(to))))     return false;
        return true;
      }
    }
  } catch { return false; }
  return false;
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Pending',  cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  paid:     { label: 'Paid',     cls: 'bg-green-50 text-green-700 border border-green-200' },
  released: { label: 'Released', cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  loaded:   { label: 'Loaded',   cls: 'bg-violet-50 text-violet-700 border border-violet-200' },
  canceled: { label: 'Canceled', cls: 'bg-red-50 text-red-700 border border-red-200' },
  sold:     { label: 'Sold',     cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
};

const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS_MAP[status?.toLowerCase()] ?? { label: status, cls: 'bg-slate-50 text-slate-600 border border-slate-200' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>;
};

const Tick = ({ done }: { done: boolean }) =>
  done
    ? <CheckCircle2 size={14} className="text-emerald-500 mx-auto" />
    : <XCircle      size={13} className="text-slate-200 mx-auto" />;

// Pipeline step column definitions
const STEPS: Array<{ key: string; colLabel: string; check: (o: Order) => boolean }> = [
  { key: 'pending',  colLabel: 'PENDING',       check: () => true },
  { key: 'paid',     colLabel: 'PAID',          check: o => (STATUS_RANK[o.status] ?? -1) >= STATUS_RANK['paid'] },
  { key: 'released', colLabel: 'RELEASED',      check: o => (STATUS_RANK[o.status] ?? -1) >= STATUS_RANK['released'] },
  { key: 'ticket',   colLabel: 'TICKET GEN',    check: o => (o.truck_tickets_count ?? 0) > 0 },
  { key: 'exit',     colLabel: 'SECURITY EXIT', check: o => o.status === 'sold' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function SalesManagerView() {
  const [preset,     setPreset]     = useState<TimePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [calRange,   setCalRange]   = useState<{ from?: Date; to?: Date }>({});
  const [calOpen,    setCalOpen]    = useState(false);
  const [locFilter,  setLocFilter]  = useState('all');
  const [pfiFilter,  setPfiFilter]  = useState('all');
  const [statFilter, setStatFilter] = useState('all');
  const [sortDir,    setSortDir]    = useState<SortDir>('desc');
  const [exporting,  setExporting]  = useState(false);

  const scopedLocations = useMemo<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('location_names') || '[]'); }
    catch { return []; }
  }, []);
  const scopedPfis = useMemo<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('pfi_numbers') || '[]'); }
    catch { return []; }
  }, []);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['sales-manager-orders'],
    queryFn: () => fetchAllPages<Order>(
      p => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size }),
    ),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const allOrders: Order[] = data?.results ?? [];

  // Derive scoped filter options
  const uniqueLocations = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { if (o.location_name) s.add(o.location_name); });
    return Array.from(s).filter(l => scopedLocations.length === 0 || scopedLocations.includes(l)).sort();
  }, [allOrders, scopedLocations]);

  const uniquePfis = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { if (o.pfi_number) s.add(o.pfi_number); });
    return Array.from(s).filter(p => scopedPfis.length === 0 || scopedPfis.includes(p)).sort();
  }, [allOrders, scopedPfis]);

  const uniqueStatuses = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { if (o.status) s.add(o.status.toLowerCase()); });
    return Array.from(s).sort();
  }, [allOrders]);

  // Base = scoped + date + location + PFI filtered (for summary cards, ignores status filter)
  const base = useMemo(() => {
    return allOrders.filter(o => {
      if (scopedLocations.length > 0 && !scopedLocations.includes(o.location_name ?? '')) return false;
      if (scopedPfis.length     > 0 && !scopedPfis.includes(o.pfi_number ?? ''))          return false;
      if (!matchesPreset(o.created_at, preset, customFrom, customTo))                      return false;
      if (locFilter !== 'all' && o.location_name !== locFilter) return false;
      if (pfiFilter !== 'all' && o.pfi_number    !== pfiFilter) return false;
      return true;
    });
  }, [allOrders, scopedLocations, scopedPfis, preset, customFrom, customTo, locFilter, pfiFilter]);

  // Table rows = base + status filter + sort
  const filtered = useMemo(() => {
    return base
      .filter(o => statFilter === 'all' || o.status?.toLowerCase() === statFilter)
      .sort((a, b) =>
        sortDir === 'desc'
          ? b.created_at.localeCompare(a.created_at)
          : a.created_at.localeCompare(b.created_at),
      );
  }, [base, statFilter, sortDir]);

  const summaryCards = useMemo((): SummaryCard[] => {
    const total    = base.length;
    const pending  = base.filter(o => o.status === 'pending').length;
    const paid     = base.filter(o => (STATUS_RANK[o.status] ?? -1) >= STATUS_RANK['paid']).length;
    const released = base.filter(o => (STATUS_RANK[o.status] ?? -1) >= STATUS_RANK['released']).length;
    const ticketed = base.filter(o => (o.truck_tickets_count ?? 0) > 0).length;
    const exited   = base.filter(o => o.status === 'sold').length;
    const trucks   = base.reduce((s, o) => s + (o.truck_tickets_count ?? 0), 0);
    return [
      { title: 'Total Orders',      value: String(total),    icon: <Activity      size={20} />, tone: 'neutral', description: `${pending} pending payment` },
      { title: 'Paid',              value: String(paid),     icon: <DollarSign    size={20} />, tone: 'green',   description: 'cumulative' },
      { title: 'Released',          value: String(released), icon: <ShieldCheck   size={20} />, tone: 'blue',    description: 'cumulative' },
      { title: 'Tickets Generated', value: String(ticketed), icon: <Package       size={20} />, tone: 'neutral', description: `${trucks} trucks total` },
      { title: 'Security Exit',     value: String(exited),   icon: <CheckCircle2  size={20} />, tone: 'green',   description: 'marked sold' },
    ];
  }, [base]);

  const clearFilters = () => {
    setPreset('all'); setCustomFrom(''); setCustomTo(''); setCalRange({});
    setLocFilter('all'); setPfiFilter('all'); setStatFilter('all');
  };

  const hasFilters = preset !== 'all' || locFilter !== 'all' || pfiFilter !== 'all' || statFilter !== 'all';

  const presetLabel = () => {
    if (preset !== 'custom') return PRESETS.find(p => p.key === preset)?.label ?? '';
    if (calRange.from) return calRange.to
      ? `${format(calRange.from, 'dd MMM')} – ${format(calRange.to, 'dd MMM yyyy')}`
      : format(calRange.from, 'dd MMM yyyy');
    return 'Custom Range';
  };

  const handleExport = async () => {
    if (!filtered.length) return;
    setExporting(true);
    try {
      const NAVY = 'FF1E293B'; const WHITE = 'FFFFFFFF'; const BAND = 'FFEFF3F8';
      const thin = { style: 'thin' as const, color: { argb: 'FFB0C4DE' } };
      const borders = { top: thin, left: thin, bottom: thin, right: thin };
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sales Pipeline', { views: [{ showGridLines: false }] });
      const hdrs = ['#','DATE PLACED','REFERENCE','CUSTOMER','LOCATION','PFI','PRODUCT','QTY','TRUCKS','STATUS','PENDING','PAID','RELEASED','TICKET GEN','SECURITY EXIT','LAST UPDATED'];
      const widths = [6,22,20,28,22,16,18,14,10,14,10,10,10,12,14,22];
      ws.mergeCells('A1:P1');
      const t = ws.getCell('A1');
      t.value = 'SALES PIPELINE'; t.font = { name: 'Calibri', bold: true, size: 14, color: { argb: WHITE } };
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      t.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 26;
      const hRow = ws.getRow(3); hRow.height = 20;
      hdrs.forEach((h, i) => { const c = hRow.getCell(i + 1); c.value = h; c.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; c.border = borders; c.alignment = { vertical: 'middle', horizontal: 'center' }; });
      filtered.forEach((o, i) => {
        const r = ws.getRow(i + 4); r.height = 16;
        const rank = STATUS_RANK[o.status] ?? -1;
        const vals = [i+1, fmtDateTime(o.created_at), o.reference??`ORD-${o.id}`, customerName(o).toUpperCase(), (o.location_name??'—').toUpperCase(), (o.pfi_number??'—').toUpperCase(), (o.products?.[0]?.name??'—').toUpperCase(), toNum(o.quantity), o.truck_tickets_count??0, o.status.toUpperCase(), '✓', rank>=STATUS_RANK['paid']?'✓':'—', rank>=STATUS_RANK['released']?'✓':'—', (o.truck_tickets_count??0)>0?'✓':'—', o.status==='sold'?'✓':'—', fmtDateTime(o.updated_at)];
        vals.forEach((v, ci) => { const c = r.getCell(ci+1); c.value = v; c.font = { name: 'Calibri', size: 9.5 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i%2===0?WHITE:BAND } }; c.border = borders; c.alignment = { vertical: 'middle', horizontal: [7,8].includes(ci)?'right':'left' }; });
      });
      widths.forEach((w, i) => { ws.getColumn(i+1).width = w; });
      ws.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      Object.assign(document.createElement('a'), { href: url, download: `Sales_Pipeline_${format(new Date(),'ddMMyy')}.xlsx` }).click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            <PageHeader
              title="Sales Pipeline"
              description={scopedLocations.length > 0 ? `Scoped to: ${scopedLocations.join(', ')}` : 'Track orders through each stage of the sales pipeline.'}
              actions={
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting || !filtered.length}>
                    {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Export Excel
                  </Button>
                </div>
              }
            />

            <SummaryCards cards={summaryCards} gridClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" />

            {/* ── Filter Panel ── */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">

              {/* Date presets + calendar */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays size={12} /> Date Period
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setPreset(key); setCustomFrom(''); setCustomTo(''); setCalRange({}); }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${preset === key
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}`}
                    >
                      {label}
                    </button>
                  ))}
                  <Popover open={calOpen} onOpenChange={setCalOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setPreset('custom')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all flex items-center gap-1.5 ${preset === 'custom'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}`}
                      >
                        <CalendarDays size={11} />
                        {preset === 'custom' && calRange.from
                          ? calRange.to
                            ? `${format(calRange.from, 'dd MMM')} – ${format(calRange.to, 'dd MMM yyyy')}`
                            : format(calRange.from, 'dd MMM yyyy')
                          : 'Pick Date'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{ from: calRange.from, to: calRange.to }}
                        onSelect={r => {
                          setCalRange(r ?? {});
                          setPreset('custom');
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

              <div className="border-t border-slate-100" />

              {/* Location, PFI, Status dropdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={12} /> Location
                  </p>
                  <select
                    aria-label="Filter by location"
                    value={locFilter}
                    onChange={e => setLocFilter(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="all">All Locations</option>
                    {uniqueLocations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={12} /> PFI
                  </p>
                  <select
                    aria-label="Filter by PFI"
                    value={pfiFilter}
                    onChange={e => setPfiFilter(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="all">All PFIs</option>
                    {uniquePfis.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> Status
                  </p>
                  <select
                    aria-label="Filter by status"
                    value={statFilter}
                    onChange={e => setStatFilter(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="all">All Statuses</option>
                    {uniqueStatuses.map(s => <option key={s} value={s}>{STATUS_MAP[s]?.label ?? s}</option>)}
                  </select>
                </div>
              </div>

              {/* Active chips + clear */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  {preset !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <CalendarDays size={11} /> {presetLabel()}
                      <button type="button" title="Remove date filter" onClick={() => { setPreset('today'); setCustomFrom(''); setCustomTo(''); setCalRange({}); }} className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {locFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <MapPin size={11} /> {locFilter}
                      <button type="button" title="Remove location filter" onClick={() => setLocFilter('all')} className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {pfiFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      PFI: {pfiFilter}
                      <button type="button" title="Remove PFI filter" onClick={() => setPfiFilter('all')} className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {statFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      {STATUS_MAP[statFilter]?.label ?? statFilter}
                      <button type="button" title="Remove status filter" onClick={() => setStatFilter('all')} className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{filtered.length} order{filtered.length !== 1 ? 's' : ''}</span>
                </div>
                {hasFilters && (
                  <button type="button" onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2">
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {/* ── Table ── */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 border-b border-slate-200 [&>th]:py-3 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:text-slate-500 [&>th]:uppercase [&>th]:tracking-wider [&>th]:whitespace-nowrap">
                      <TableHead className="w-8 text-center">#</TableHead>
                      <TableHead>
                        <button
                          type="button"
                          title={sortDir === 'desc' ? 'Sort oldest first' : 'Sort newest first'}
                          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                          className="flex items-center gap-1 hover:text-slate-800 transition-colors"
                        >
                          Date Placed <ArrowUpDown size={11} className={sortDir === 'asc' ? 'rotate-180 transition-transform' : 'transition-transform'} />
                        </button>
                      </TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>PFI</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty (L)</TableHead>
                      <TableHead className="text-center">Trucks</TableHead>
                      <TableHead>Status</TableHead>
                      {STEPS.map(s => (
                        <TableHead key={s.key} className="text-center">{s.colLabel}</TableHead>
                      ))}
                      <TableHead>Last Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 7 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 16 }).map((__, j) => (
                            <TableCell key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : isError ? (
                      <TableRow>
                        <TableCell colSpan={16} className="text-center py-16 text-slate-400">
                          <XCircle size={32} className="mx-auto mb-2 text-red-300" />
                          <p className="font-medium text-slate-600">Failed to load orders</p>
                          <button type="button" onClick={() => refetch()} className="mt-3 text-sm text-slate-500 underline hover:text-slate-800">Try again</button>
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={16} className="text-center py-16 text-slate-400">
                          <Package size={30} className="mx-auto mb-2 text-slate-200" />
                          <p className="font-medium">{allOrders.length > 0 ? 'No orders match the current filters.' : 'No orders in the system yet.'}</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((o, i) => (
                        <TableRow key={o.id} className={`text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-blue-50/40 transition-colors`}>
                          <TableCell className="px-3 py-2.5 text-center text-xs text-slate-400">{i + 1}</TableCell>
                          <TableCell className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{fmtDateTime(o.created_at)}</TableCell>
                          <TableCell className="px-3 py-2.5 font-mono text-xs text-slate-700">{o.reference ?? `ORD-${o.id}`}</TableCell>
                          <TableCell className="px-3 py-2.5 text-sm text-slate-800 max-w-[160px] truncate">{customerName(o)}</TableCell>
                          <TableCell className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{o.location_name ?? '—'}</TableCell>
                          <TableCell className="px-3 py-2.5 text-xs font-medium text-slate-700">{o.pfi_number ?? '—'}</TableCell>
                          <TableCell className="px-3 py-2.5 text-xs text-slate-600">{o.products?.[0]?.name ?? '—'}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right text-xs font-medium text-slate-700">{toNum(o.quantity).toLocaleString()}</TableCell>
                          <TableCell className="px-3 py-2.5 text-center">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                              <Truck size={11} className="text-slate-400" />{o.truck_tickets_count ?? 0}
                            </span>
                          </TableCell>
                          <TableCell className="px-3 py-2.5"><StatusBadge status={o.status} /></TableCell>
                          {STEPS.map(s => (
                            <TableCell key={s.key} className="px-3 py-2.5 text-center">
                              <Tick done={s.check(o)} />
                            </TableCell>
                          ))}
                          <TableCell className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(o.updated_at)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
