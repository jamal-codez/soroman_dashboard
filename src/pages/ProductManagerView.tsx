import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  Truck, Package, ShieldCheck, ClipboardList, DollarSign,
  CalendarDays, MapPin, ArrowUpDown, RefreshCw, X,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { DailyReportPanel } from '@/components/DailyReportPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Order {
  id: number;
  user?: {
    first_name?: string; last_name?: string; email?: string;
    companyName?: string; company_name?: string;
  };
  companyName?: string;
  company_name?: string;
  customer?: { companyName?: string; company_name?: string };
  location_name?: string;
  state?: string;
  pfi_number?: string;
  products?: Array<{ name?: string; unit_price?: number | string; unitPrice?: number | string; price?: number | string }>;
  quantity?: number | string;
  total_price?: number | string;
  truck_tickets_qty?: number | string;
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

const fmt = (n: number) =>
  `N${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtQty = (n: number) => n.toLocaleString('en-NG', { maximumFractionDigits: 0 });

// Location: prefer location_name, fall back to state (matches DepotView behaviour)
const getLocation = (o: Order) => o.location_name || o.state || '—';

const getCustomerName = (o: Order) => {
  const full = `${o.user?.first_name ?? ''} ${o.user?.last_name ?? ''}`.trim();
  return full || o.companyName || o.company_name || o.user?.email || '—';
};

const getCompanyName = (o: Order) =>
  o.user?.companyName || o.user?.company_name ||
  o.companyName || o.company_name ||
  o.customer?.companyName || o.customer?.company_name || '—';

const getUnitPrice = (o: Order) => {
  const p = o.products?.[0] as Record<string, unknown> | undefined;
  return toNum(p?.unit_price ?? p?.unitPrice ?? p?.price);
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

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ProductManagerView() {
  const location = useLocation();
  const navigate = useNavigate();
  const autoOpenReport = new URLSearchParams(location.search).get('report') === 'true';

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

  // Scoped from localStorage
  const scopedLocations = useMemo<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('location_names') || '[]'); }
    catch { return []; }
  }, []);
  const scopedPfis = useMemo<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('pfi_numbers') || '[]'); }
    catch { return []; }
  }, []);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['product-manager-orders'],
    queryFn: () => fetchAllPages<Order>(
      p => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size }),
    ),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const allOrders: Order[] = data?.results ?? [];

  // Derive scoped filter options — use getLocation() for consistency
  const uniqueLocations = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { const l = getLocation(o); if (l !== '—') s.add(l); });
    return Array.from(s)
      .filter(l => scopedLocations.length === 0 || scopedLocations.includes(l))
      .sort();
  }, [allOrders, scopedLocations]);

  const uniquePfis = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { if (o.pfi_number) s.add(o.pfi_number); });
    return Array.from(s)
      .filter(p => scopedPfis.length === 0 || scopedPfis.includes(p))
      .sort();
  }, [allOrders, scopedPfis]);

  const uniqueStatuses = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { if (o.status) s.add(o.status.toLowerCase()); });
    return Array.from(s).sort();
  }, [allOrders]);

  const filtered = useMemo(() => {
    return allOrders
      .filter(o => {
        const loc = getLocation(o);
        if (scopedLocations.length > 0 && !scopedLocations.includes(loc)) return false;
        if (scopedPfis.length > 0 && !scopedPfis.includes(o.pfi_number ?? ''))  return false;
        if (!matchesPreset(o.created_at, preset, customFrom, customTo))          return false;
        if (locFilter  !== 'all' && loc !== locFilter)                           return false;
        if (pfiFilter  !== 'all' && o.pfi_number !== pfiFilter)                  return false;
        if (statFilter !== 'all' && o.status?.toLowerCase() !== statFilter)      return false;
        return true;
      })
      .sort((a, b) =>
        sortDir === 'desc'
          ? b.created_at.localeCompare(a.created_at)
          : a.created_at.localeCompare(b.created_at),
      );
  }, [allOrders, scopedLocations, scopedPfis, preset, customFrom, customTo, locFilter, pfiFilter, statFilter, sortDir]);

  const summaryCards = useMemo((): SummaryCard[] => {
    const total    = filtered.length;
    const pending  = filtered.filter(o => o.status === 'pending').length;
    const released = filtered.filter(o => (STATUS_RANK[o.status] ?? -1) >= STATUS_RANK['released']).length;
    const trucks   = filtered.reduce((s, o) => s + (o.truck_tickets_count ?? 0), 0);
    const qty      = filtered.reduce((s, o) => s + toNum(o.quantity), 0);
    const amount   = filtered.reduce((s, o) => s + toNum(o.total_price), 0);
    const loaded   = filtered.filter(o => (STATUS_RANK[o.status] ?? -1) >= STATUS_RANK['loaded']).length;
    return [
      { title: 'Total Orders',     value: String(total),    icon: <ClipboardList size={20} />, tone: 'neutral', description: `${pending} pending payment` },
      { title: 'Pending Payment',  value: String(pending),  icon: <Clock        size={20} />, tone: 'amber',   description: 'awaiting payment' },
      { title: 'Released',         value: String(released), icon: <ShieldCheck  size={20} />, tone: 'blue',    description: 'cumulative' },
      { title: 'Loaded / Sold',    value: String(loaded),   icon: <Truck        size={20} />, tone: 'neutral', description: `${trucks} trucks total` },
      { title: 'Total Qty (L)',    value: fmtQty(qty),      icon: <Package      size={20} />, tone: 'neutral' },
      { title: 'Total Amount',     value: amount > 0 ? `N${Math.round(amount).toLocaleString()}` : 'N0', icon: <DollarSign size={20} />, tone: 'green' },
    ];
  }, [filtered]);

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

  // ── Excel export ─────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!filtered.length) return;
    setExporting(true);
    try {
      const NAVY   = 'FF1E293B';
      const WHITE  = 'FFFFFFFF';
      const LIGHT  = 'FFF5F8FC';
      const BAND   = 'FFEFF3F8';
      const TOTBG  = 'FFE2E8F0';
      const thin   = { style: 'thin' as const, color: { argb: 'FFB0C4DE' } };
      const borders = { top: thin, left: thin, bottom: thin, right: thin };

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Soroman Dashboard';
      const ws = wb.addWorksheet('Orders View', { views: [{ showGridLines: false }] });

      // ── Heading meta block ─────────────────────────────────────────────
      const locationLabel = locFilter !== 'all' ? locFilter
        : scopedLocations.length > 0 ? scopedLocations.join(', ')
        : 'ALL LOCATIONS';
      const pfiLabel = pfiFilter !== 'all' ? pfiFilter
        : scopedPfis.length > 0 ? scopedPfis.join(', ')
        : 'ALL PFIS';
      const periodLabel = preset === 'custom' && calRange.from
        ? calRange.to
          ? `${format(calRange.from, 'dd MMM yyyy')} – ${format(calRange.to, 'dd MMM yyyy')}`
          : format(calRange.from, 'dd MMM yyyy')
        : PRESETS.find(p => p.key === preset)?.label ?? 'ALL TIME';

      // Aggregates for summary
      const totalOrders   = filtered.length;
      const totalQtyOrd   = filtered.reduce((s, o) => s + toNum(o.quantity), 0);
      const totalAmount   = filtered.reduce((s, o) => s + toNum(o.total_price), 0);
      const totalTrucks   = filtered.reduce((s, o) => s + (o.truck_tickets_count ?? 0), 0);
      const totalQtyLoad  = filtered.reduce((s, o) => s + toNum(o.truck_tickets_qty), 0);
      const totalQtyRel   = filtered
        .filter(o => (STATUS_RANK[o.status] ?? -1) >= STATUS_RANK['released'])
        .reduce((s, o) => s + toNum(o.quantity), 0);

      // Unique rates in this period
      const rateMap = new Map<number, number>(); // rate → total qty at that rate
      filtered.forEach(o => {
        const rate = getUnitPrice(o);
        if (rate > 0) rateMap.set(rate, (rateMap.get(rate) ?? 0) + toNum(o.quantity));
      });
      const rateLines = Array.from(rateMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([r, q]) => `N${r.toLocaleString()}/L × ${fmtQty(q)}L = N${(r * q).toLocaleString()}`)
        .join('  |  ');

      const meta: Array<[string, string, string, string]> = [
        ['Report Generated', format(new Date(), 'dd MMM yyyy, HH:mm'), 'Period', periodLabel.toUpperCase()],
        ['Location', locationLabel.toUpperCase(), 'PFI', pfiLabel.toUpperCase()],
        ['Total Orders', String(totalOrders), 'Total Qty Ordered (L)', fmtQty(totalQtyOrd)],
        ['Total Amount', `N${totalAmount.toLocaleString()}`, 'Total Trucks', String(totalTrucks)],
      ];

      // Title row
      const COL_COUNT = 16;
      const lastLetter = ws.getColumn(COL_COUNT).letter;
      ws.mergeCells(`A1:${lastLetter}1`);
      const titleCell = ws.getCell('A1');
      titleCell.value = 'ORDERS VIEW REPORT';
      titleCell.font  = { name: 'Calibri', bold: true, size: 16, color: { argb: WHITE } };
      titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 26;

      // Meta block (rows 3–6)
      let r = 3;
      meta.forEach(([l1, v1, l2, v2]) => {
        const row = ws.getRow(r); row.height = 18;
        ([[1, l1, true], [2, v1, false], [3, l2, true], [4, v2, false]] as const).forEach(([col, val, isLabel]) => {
          const c = row.getCell(col);
          c.value = val;
          c.font  = { name: 'Calibri', bold: isLabel, size: 10, color: { argb: 'FF1E3A5F' } };
          c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: isLabel ? LIGHT : WHITE } };
          c.border = borders;
          c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        });
        r++;
      });
      ws.getColumn(1).width = 24; ws.getColumn(2).width = 28;
      ws.getColumn(3).width = 24; ws.getColumn(4).width = 28;

      // Data header (row 8)
      r = 8;
      const hdrs = [
        '#', 'DATE PLACED', 'REFERENCE', 'CUSTOMER', 'COMPANY', 'LOCATION', 'PFI',
        'PRODUCT', 'RATE (N/L)', 'QTY ORD (L)', 'TOTAL AMOUNT', 'TRUCKS',
        'STATUS', 'PLACED', 'RELEASED', 'TICKET GEN',
      ];
      const hRow = ws.getRow(r); hRow.height = 22;
      hdrs.forEach((h, i) => {
        const c = hRow.getCell(i + 1);
        c.value = h;
        c.font  = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
        c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        c.border = borders;
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
      r++;

      // Data rows
      const ALIGN: Array<'left'|'center'|'right'> = [
        'center','left','left','left','left','left','left',
        'left','right','right','right','center',
        'center','center','center','center',
      ];
      filtered.forEach((o, i) => {
        const row  = ws.getRow(r); row.height = 16;
        const rank = STATUS_RANK[o.status] ?? -1;
        const rate = getUnitPrice(o);
        const qty  = toNum(o.quantity);
        const amt  = toNum(o.total_price) || (rate > 0 ? rate * qty : 0);
        const vals: (string | number)[] = [
          i + 1,
          fmtDateTime(o.created_at),
          (o.reference ?? `ORD-${o.id}`).toUpperCase(),
          getCustomerName(o).toUpperCase(),
          getCompanyName(o).toUpperCase(),
          getLocation(o).toUpperCase(),
          (o.pfi_number ?? '—').toUpperCase(),
          (o.products?.[0]?.name ?? '—').toUpperCase(),
          rate > 0 ? rate : '—',
          qty,
          amt > 0 ? amt : '—',
          o.truck_tickets_count ?? 0,
          o.status.toUpperCase(),
          '✓',
          rank >= STATUS_RANK['released'] ? '✓' : '—',
          (o.truck_tickets_count ?? 0) > 0 ? '✓' : '—',
        ];
        vals.forEach((v, ci) => {
          const c = row.getCell(ci + 1);
          c.value = v;
          c.font  = { name: 'Calibri', size: 9.5 };
          c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? WHITE : BAND } };
          c.border = borders;
          c.alignment = { vertical: 'middle', horizontal: ALIGN[ci] };
          if (ci === 8 && typeof v === 'number') c.numFmt = '#,##0.00';
          if (ci === 9 && typeof v === 'number') c.numFmt = '#,##0';
          if (ci === 10 && typeof v === 'number') c.numFmt = '#,##0.00';
        });
        r++;
      });

      // ── Summary block below data ─────────────────────────────────────
      r++;
      const summaryRows: Array<[string, string]> = [
        ['TOTAL ORDERS',             String(totalOrders)],
        ['TOTAL QTY ORDERED (L)',    fmtQty(totalQtyOrd)],
        ['TOTAL QTY RELEASED (L)',   fmtQty(totalQtyRel)],
        ['TOTAL QTY LOADED (L)',     fmtQty(totalQtyLoad)],
        ['TOTAL TRUCKS LOADED',      String(totalTrucks)],
        ['TOTAL AMOUNT',             `N${totalAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`],
        ['RATES BREAKDOWN',          rateLines || '—'],
      ];

      // Section header
      ws.mergeCells(`A${r}:D${r}`);
      const secHdr = ws.getCell(`A${r}`);
      secHdr.value = 'SUMMARY';
      secHdr.font  = { name: 'Calibri', bold: true, size: 11, color: { argb: WHITE } };
      secHdr.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      secHdr.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      ws.getRow(r).height = 20;
      r++;

      summaryRows.forEach(([label, value]) => {
        const row = ws.getRow(r); row.height = 18;
        const lc = row.getCell(1);
        lc.value = label;
        lc.font  = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF1E3A5F' } };
        lc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
        lc.border = borders;
        lc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        ws.mergeCells(`B${r}:D${r}`);
        const vc = row.getCell(2);
        vc.value = value;
        vc.font  = { name: 'Calibri', bold: true, size: 10 };
        vc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTBG } };
        vc.border = borders;
        vc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        r++;
      });

      // Column widths
      const widths = [6, 22, 20, 26, 26, 22, 16, 18, 14, 14, 18, 10, 12, 9, 10, 12];
      widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      ws.views = [{ state: 'frozen', ySplit: 8, showGridLines: false }];

      const buf = await wb.xlsx.writeBuffer();
      const safeLabel = locationLabel.replace(/[/\\*?:[\]]/g, '-');
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      Object.assign(document.createElement('a'), {
        href: url,
        download: `ORDERS VIEW ${safeLabel} - ${format(new Date(), 'ddMMyy')}.xlsx`,
      }).click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            <PageHeader
              title="Orders View"
              description={
                scopedLocations.length > 0
                  ? `Scoped to: ${scopedLocations.join(', ')}${scopedPfis.length > 0 ? ` — PFI: ${scopedPfis.join(', ')}` : ''}`
                  : 'Read-only view of all orders and their lifecycle status.'
              }
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

            <SummaryCards cards={summaryCards} gridClassName="grid-cols-2 sm:grid-cols-3" />

            {/* ── Filter Panel ── */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
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
                        onSelect={rv => {
                          setCalRange(rv ?? {});
                          setPreset('custom');
                          if (rv?.from) setCustomFrom(format(rv.from, 'yyyy-MM-dd'));
                          if (rv?.to)   setCustomTo(format(rv.to, 'yyyy-MM-dd'));
                          if (rv?.from && rv?.to) setCalOpen(false);
                        }}
                        initialFocus
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="border-t border-slate-100" />

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

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  {preset !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <CalendarDays size={11} /> {presetLabel()}
                      <button type="button" title="Remove date filter" onClick={() => { setPreset('all'); setCustomFrom(''); setCustomTo(''); setCalRange({}); }} className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
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
                          Date Placed <ArrowUpDown size={11} />
                        </button>
                      </TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>PFI</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Rate (N/L)</TableHead>
                      <TableHead className="text-right">Qty (L)</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-center">Trucks</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Placed</TableHead>
                      <TableHead className="text-center">Released</TableHead>
                      <TableHead className="text-center">Ticket Gen</TableHead>
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
                      filtered.map((o, i) => {
                        const rank  = STATUS_RANK[o.status] ?? -1;
                        const rate  = getUnitPrice(o);
                        const qty   = toNum(o.quantity);
                        const amt   = toNum(o.total_price) || (rate > 0 ? rate * qty : 0);
                        return (
                          <TableRow key={o.id} className={`text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-blue-50/40 transition-colors`}>
                            <TableCell className="px-3 py-2.5 text-center text-xs text-slate-400">{i + 1}</TableCell>
                            <TableCell className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{fmtDateTime(o.created_at)}</TableCell>
                            <TableCell className="px-3 py-2.5 font-mono text-xs text-slate-700">{o.reference ?? `ORD-${o.id}`}</TableCell>
                            <TableCell className="px-3 py-2.5 text-sm text-slate-800 max-w-[140px] truncate">{getCustomerName(o)}</TableCell>
                            <TableCell className="px-3 py-2.5 text-xs text-slate-600 max-w-[140px] truncate">{getCompanyName(o)}</TableCell>
                            <TableCell className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{getLocation(o)}</TableCell>
                            <TableCell className="px-3 py-2.5 text-xs font-medium text-slate-700">{o.pfi_number ?? '—'}</TableCell>
                            <TableCell className="px-3 py-2.5 text-xs text-slate-600">{o.products?.[0]?.name ?? '—'}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right text-xs font-medium text-slate-700">
                              {rate > 0 ? `N${rate.toLocaleString()}` : '—'}
                            </TableCell>
                            <TableCell className="px-3 py-2.5 text-right text-xs font-medium text-slate-700">{fmtQty(qty)}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right text-xs font-semibold text-slate-800">
                              {amt > 0 ? fmt(amt) : '—'}
                            </TableCell>
                            <TableCell className="px-3 py-2.5 text-center">
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                                <Truck size={11} className="text-slate-400" />{o.truck_tickets_count ?? 0}
                              </span>
                            </TableCell>
                            <TableCell className="px-3 py-2.5"><StatusBadge status={o.status} /></TableCell>
                            <TableCell className="px-3 py-2.5 text-center"><Tick done /></TableCell>
                            <TableCell className="px-3 py-2.5 text-center"><Tick done={rank >= STATUS_RANK['released']} /></TableCell>
                            <TableCell className="px-3 py-2.5 text-center"><Tick done={(o.truck_tickets_count ?? 0) > 0} /></TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DailyReportPanel pageRole="PRODUCT_MANAGER" initialOpen={autoOpenReport} />

          </div>
        </div>
      </div>
    </div>
  );
}
