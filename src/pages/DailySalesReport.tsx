import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, startOfDay, endOfDay, isWithinInterval, subDays } from 'date-fns';
import * as XLSX from 'xlsx';

import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { apiClient, fetchAllPages } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CalendarDays, Download, Lock, Save } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type OrderLike = {
  id: number;
  status?: string | null;
  created_at?: string | null;
  location?: string | null;
  location_name?: string | null;
  state?: string | null;
  total_price?: string | number | null;
  amount?: string | number | null;
  quantity?: string | number | null;
  qty?: string | number | null;
  litres?: string | number | null;
  // ticket count fields — backend may return any of these
  truck_tickets?: Array<unknown> | null;
  ticket_count?: number | null;
  tickets_count?: number | null;
  num_tickets?: number | null;
  products?: Array<{
    name?: string | null;
    unit_price?: string | number | null;
    unitPrice?: string | number | null;
    price?: string | number | null;
    quantity?: string | number | null;
    qty?: string | number | null;
    litres?: string | number | null;
  }>;
};

type BackendPfi = {
  id: number;
  status?: 'active' | 'finished' | string;
  location_name?: string | null;
  starting_qty_litres?: number | null;
  sold_qty_litres?: number | null;
  sold_qty?: number | null;
  total_quantity_litres?: number | string | null;
};

type StaffUser = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  username?: string | null;
  full_name?: string | null;
};

type ManualLocationInputs = {
  amountPaid: string;
  staffName: string;
  openingLitres: string;
  carriedOverLoading: string;
};

type DailyReportSnapshot = {
  date: string;
  depots: Record<string, ManualLocationInputs>;
  tankBalanceAtSave?: Record<string, number>;
};

// ═══════════════════════════════════════════════════════════════════════════
// Storage keys
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_PREFIX = 'daily-sales-report/v1';
const historyKey = `${STORAGE_PREFIX}/history`;
const draftKey = (date: string) => `${STORAGE_PREFIX}/draft/${date}`;
const snapshotKey = (date: string) => `${STORAGE_PREFIX}/snapshot/${date}`;
const ALIASES_KEY = `${STORAGE_PREFIX}/aliases`;

const DEFAULT_MANUAL: ManualLocationInputs = {
  amountPaid: '',
  staffName: '',
  openingLitres: '',
  carriedOverLoading: '',
};

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const toNum = (v: unknown): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtMoney = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const safeJsonParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
};

const normalizeStatus = (s: unknown) => String(s || '').trim().toLowerCase();
const isSalesStatus = (st: string) => st === 'paid' || st === 'released' || st === 'loaded';
const isReleasedMetricStatus = (st: string) => st === 'paid' || st === 'released';

const getOrderLocation = (o: OrderLike): string =>
  String(o.location_name || o.location || o.state || '').trim() || '—';

const getOrderQty = (o: OrderLike): number => {
  const p0 = o.products?.[0];
  return toNum(o.quantity) || toNum(o.qty) || toNum(o.litres) ||
    toNum(p0?.quantity) || toNum(p0?.qty) || toNum(p0?.litres) || 0;
};

const getOrderAmount = (o: OrderLike): number => toNum(o.total_price ?? o.amount);

const getOrderUnitPrice = (o: OrderLike): number => {
  const p0 = o.products?.[0];
  return toNum(p0?.unit_price ?? p0?.unitPrice ?? p0?.price);
};

const inDate = (iso: string | null | undefined, date: Date): boolean => {
  if (!iso) return false;
  try {
    const d = parseISO(iso);
    return isWithinInterval(d, { start: startOfDay(date), end: endOfDay(date) });
  } catch {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return isWithinInterval(d, { start: startOfDay(date), end: endOfDay(date) });
  }
};

const distinct = (arr: string[]) => Array.from(new Set(arr));

const getActivePfiRemainingLitres = (pfi: BackendPfi): number => {
  const starting = toNum(pfi.starting_qty_litres);
  const sold = toNum(pfi.sold_qty_litres) || toNum(pfi.total_quantity_litres) || toNum(pfi.sold_qty);
  return Math.max(0, starting - sold);
};

/** Returns the number of truck tickets generated for an order (falls back to 1). */
const getOrderTicketCount = (o: OrderLike): number => {
  if (Array.isArray(o.truck_tickets)) return o.truck_tickets.length;
  const direct = toNum(o.ticket_count ?? o.tickets_count ?? o.num_tickets);
  return direct > 0 ? direct : 1;
};

const getStaffDisplayName = (u: StaffUser): string => {
  if (u.full_name) return u.full_name;
  const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  return full || u.username || u.email || `User #${u.id}`;
};

// ═══════════════════════════════════════════════════════════════════════════
// Row definitions
// ═══════════════════════════════════════════════════════════════════════════

type RowKind =
  | 'manual-carried'
  | 'manual-opening'
  | 'auto-sold-all'
  | 'auto-sold-released'
  | 'auto-unit-price'
  | 'auto-tank-balance'
  | 'auto-tickets'
  | 'manual-amount-paid'
  | 'auto-revenue'
  | 'auto-differentials'
  | 'auto-loading-leftover'
  | 'manual-staff';

const ROWS: { label: string; kind: RowKind; isManual: boolean }[] = [
  { label: "Yesterday's carried over loading", kind: 'manual-carried', isManual: true },
  { label: 'Product brought forward (opening litres)', kind: 'manual-opening', isManual: true },
  { label: 'Litres sold today', kind: 'auto-sold-all', isManual: false },
//   { label: 'Litres released', kind: 'auto-sold-released', isManual: false },
  { label: 'Unit price(s)', kind: 'auto-unit-price', isManual: false },
  { label: 'Tank balance (litres)', kind: 'auto-tank-balance', isManual: false },
  { label: 'No. of trucks loaded', kind: 'auto-tickets', isManual: false },
  { label: 'Total amount paid', kind: 'manual-amount-paid', isManual: true },
  { label: 'Total sales amount', kind: 'auto-revenue', isManual: false },
  { label: 'Differentials', kind: 'auto-differentials', isManual: false },
  { label: 'Loading left over', kind: 'auto-loading-leftover', isManual: false },
//   { label: 'Staff name', kind: 'manual-staff', isManual: true },
];

// Rows where we draw a section divider above
const SECTION_STARTS = new Set<RowKind>(['auto-sold-all', 'manual-amount-paid']);

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function DailySalesReport() {
  const { toast } = useToast();

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => format(today, 'yyyy-MM-dd'), [today]);

  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const selectedDate = useMemo(() => parseISO(`${selectedDateKey}T00:00:00`), [selectedDateKey]);
  const isToday = selectedDateKey === todayKey;

  // Editable depot display-name aliases (keyed by real depot name)
  const [aliases, setAliases] = useState<Record<string, string>>(
    () => safeJsonParse<Record<string, string>>(localStorage.getItem(ALIASES_KEY), {})
  );
  const getAlias = (depot: string) => aliases[depot] ?? depot;
  const setAlias = (depot: string, name: string) => {
    setAliases(prev => {
      const next = { ...prev, [depot]: name };
      localStorage.setItem(ALIASES_KEY, JSON.stringify(next));
      return next;
    });
  };

  // ── Queries ────────────────────────────────────────────────────────

  const ordersQuery = useQuery({
    queryKey: ['all-orders', 'shared'],
    queryFn: () => fetchAllPages<OrderLike>((p) => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size })),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const pfisQuery = useQuery({
    queryKey: ['pfis'],
    queryFn: async () => apiClient.admin.getPfis({ page: 1, page_size: 2000 }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.admin.getUsers(),
    staleTime: 60_000,
  });

  const allOrders: OrderLike[] = useMemo(() => {
    const r = ordersQuery.data as { results?: OrderLike[] } | undefined;
    return r?.results ?? [];
  }, [ordersQuery.data]);

  const allPfis: BackendPfi[] = useMemo(() => {
    const rec = (pfisQuery.data && typeof pfisQuery.data === 'object') ? (pfisQuery.data as Record<string, unknown>) : null;
    const raw = (rec?.results as unknown) ?? (Array.isArray(pfisQuery.data) ? pfisQuery.data : []);
    return (Array.isArray(raw) ? (raw as BackendPfi[]) : []).filter(p => p && typeof p.id === 'number');
  }, [pfisQuery.data]);

  const staffList: StaffUser[] = useMemo(() => {
    const raw = usersQuery.data;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as StaffUser[];
    const rec = raw as Record<string, unknown>;
    if (Array.isArray(rec.results)) return rec.results as StaffUser[];
    return [];
  }, [usersQuery.data]);

  // ── Depots ─────────────────────────────────────────────────────────

  const depots = useMemo(() => {
    const fromOrders = allOrders.map(getOrderLocation).filter(l => l && l !== '—');
    const fromPfis = allPfis.map(p => String(p.location_name || '').trim()).filter(Boolean);
    return distinct([...fromOrders, ...fromPfis]).sort((a, b) => a.localeCompare(b));
  }, [allOrders, allPfis]);

  // ── Snapshot / locking ─────────────────────────────────────────────

  const snapshot: DailyReportSnapshot | null = useMemo(() => {
    const raw = localStorage.getItem(snapshotKey(selectedDateKey));
    return safeJsonParse<DailyReportSnapshot | null>(raw, null);
  }, [selectedDateKey]);

  const locked = !!snapshot && !isToday;

  const [manualByDepot, setManualByDepot] = useState<Record<string, ManualLocationInputs>>({});

  useEffect(() => {
    const base = snapshot?.depots
      ?? safeJsonParse<Record<string, ManualLocationInputs>>(localStorage.getItem(draftKey(selectedDateKey)), {});
    const next: Record<string, ManualLocationInputs> = {};
    depots.forEach(d => { next[d] = { ...DEFAULT_MANUAL, ...(base[d] || {}) }; });
    Object.entries(base || {}).forEach(([k, v]) => {
      if (!next[k]) next[k] = { ...DEFAULT_MANUAL, ...(v || {}) };
    });
    setManualByDepot(next);
  }, [selectedDateKey, depots, snapshot]);

  const updateManual = useCallback((depot: string, patch: Partial<ManualLocationInputs>) => {
    setManualByDepot(prev => {
      const next = { ...prev, [depot]: { ...DEFAULT_MANUAL, ...(prev[depot] || {}), ...patch } };
      if (selectedDateKey === todayKey) {
        localStorage.setItem(draftKey(selectedDateKey), JSON.stringify(next));
      }
      return next;
    });
  }, [selectedDateKey, todayKey]);

  // ── Metrics ────────────────────────────────────────────────────────

  const dayOrders = useMemo(() => {
    const sel = selectedDate;
    return allOrders.filter(o => {
      const st = normalizeStatus(o.status);
      if (!isSalesStatus(st) && !isReleasedMetricStatus(st)) return false;
      return inDate(o.created_at, sel);
    });
  }, [allOrders, selectedDate]);

  const metricsByDepot = useMemo(() => {
    const map: Record<string, {
      litresSoldAll: number;
      litresSoldReleased: number;
      ticketsAll: number;
      revenueAll: number;
      unitPrices: number[];
    }> = {};

    depots.forEach(d => {
      map[d] = { litresSoldAll: 0, litresSoldReleased: 0, ticketsAll: 0, revenueAll: 0, unitPrices: [] };
    });

    dayOrders.forEach(o => {
      const depot = getOrderLocation(o);
      if (!depot || depot === '—') return;
      if (!map[depot]) map[depot] = { litresSoldAll: 0, litresSoldReleased: 0, ticketsAll: 0, revenueAll: 0, unitPrices: [] };

      const st = normalizeStatus(o.status);
      const qty = getOrderQty(o);
      const amt = getOrderAmount(o);
      const up = getOrderUnitPrice(o);

      if (isSalesStatus(st)) {
        map[depot].ticketsAll += getOrderTicketCount(o);
        map[depot].litresSoldAll += qty;
        map[depot].revenueAll += amt;
        if (up > 0) map[depot].unitPrices.push(up);
      }
      if (isReleasedMetricStatus(st)) {
        map[depot].litresSoldReleased += qty;
      }
    });

    Object.values(map).forEach(v => {
      v.unitPrices = Array.from(new Set(v.unitPrices)).sort((a, b) => a - b);
    });

    return map;
  }, [dayOrders, depots]);

  const activePfiByDepot = useMemo(() => {
    const m = new Map<string, BackendPfi[]>();
    allPfis.forEach(p => {
      const depot = String(p.location_name || '').trim();
      if (!depot) return;
      if (!m.has(depot)) m.set(depot, []);
      m.get(depot)!.push(p);
    });

    const out: Record<string, { active: BackendPfi[]; remainingLitres: number }> = {};
    depots.forEach(d => {
      const pfis = m.get(d) || [];
      const active = pfis.filter(p => String(p.status || '').toLowerCase() === 'active');
      const remaining = active.reduce((s, p) => s + getActivePfiRemainingLitres(p), 0);
      out[d] = { active, remainingLitres: remaining };
    });
    return out;
  }, [allPfis, depots]);

  // Tank balance: use snapshotted value for past/locked days
  const tankBalanceByDepot = useMemo(() => {
    const out: Record<string, number> = {};
    depots.forEach(d => {
      out[d] = snapshot?.tankBalanceAtSave?.[d] ?? activePfiByDepot[d]?.remainingLitres ?? 0;
    });
    return out;
  }, [depots, snapshot, activePfiByDepot]);

  const differentialsByDepot = useMemo(() => {
    const out: Record<string, number> = {};
    depots.forEach(d => {
      const opening = toNum(manualByDepot[d]?.openingLitres);
      const carried = toNum(manualByDepot[d]?.carriedOverLoading);
      const sold = metricsByDepot[d]?.litresSoldAll ?? 0;
      const tank = tankBalanceByDepot[d] ?? 0;
      out[d] = (opening + carried) - sold - tank;
    });
    return out;
  }, [depots, manualByDepot, metricsByDepot, tankBalanceByDepot]);

  const totals = useMemo(() => {
    const t = {
      carriedOver: 0, opening: 0,
      litresSoldAll: 0, litresSoldReleased: 0,
      ticketsAll: 0,
      revenueAll: 0, amountPaid: 0,
      tankBalance: 0, loadingLeftOver: 0,
    };
    depots.forEach(d => {
      const man = manualByDepot[d] || DEFAULT_MANUAL;
      const met = metricsByDepot[d] || { litresSoldAll: 0, litresSoldReleased: 0, ticketsAll: 0, revenueAll: 0 };
      const tank = tankBalanceByDepot[d] ?? 0;
      t.carriedOver += toNum(man.carriedOverLoading);
      t.opening += toNum(man.openingLitres);
      t.litresSoldAll += met.litresSoldAll;
      t.litresSoldReleased += met.litresSoldReleased;
      t.ticketsAll += met.ticketsAll;
      t.revenueAll += met.revenueAll;
      t.amountPaid += toNum(man.amountPaid);
      t.tankBalance += tank;
      t.loadingLeftOver += tank;
    });
    return t;
  }, [depots, manualByDepot, metricsByDepot, tankBalanceByDepot]);

  // ── Save ───────────────────────────────────────────────────────────

  const saveTodaySnapshot = useCallback(() => {
    if (!isToday) return;
    const tankBalanceAtSave: Record<string, number> = {};
    depots.forEach(d => { tankBalanceAtSave[d] = activePfiByDepot[d]?.remainingLitres ?? 0; });

    const snap: DailyReportSnapshot = { date: selectedDateKey, depots: manualByDepot, tankBalanceAtSave };
    localStorage.setItem(snapshotKey(selectedDateKey), JSON.stringify(snap));

    const hist = safeJsonParse<string[]>(localStorage.getItem(historyKey), []);
    const nextHist = Array.from(new Set([selectedDateKey, ...hist])).sort((a, b) => b.localeCompare(a));
    localStorage.setItem(historyKey, JSON.stringify(nextHist));

    toast({ title: 'Report saved', description: `${selectedDateKey} has been locked. It will be read-only after today.` });
  }, [isToday, manualByDepot, selectedDateKey, depots, activePfiByDepot, toast]);

  const historyDates = useMemo(() => safeJsonParse<string[]>(localStorage.getItem(historyKey), []), []);

  // ── Export ─────────────────────────────────────────────────────────

  const exportXlsx = useCallback(() => {
    if (depots.length === 0) return;
    const header = ['Metric', ...depots.map(d => getAlias(d)), 'Total'];
    const row = (label: string, values: (string | number)[], total: string | number) => [label, ...values, total];

    const wsData: Array<Array<string | number>> = [
      [`Daily Sales Report — ${selectedDateKey}`],
      [],
      header,
      row("Yesterday's carried over loading", depots.map(d => toNum(manualByDepot[d]?.carriedOverLoading)), totals.carriedOver),
      row('Product brought forward (opening litres)', depots.map(d => toNum(manualByDepot[d]?.openingLitres)), totals.opening),
      row('Litres sold today', depots.map(d => metricsByDepot[d]?.litresSoldAll ?? 0), totals.litresSoldAll),
    //   row('Litres released (paid + released)', depots.map(d => metricsByDepot[d]?.litresSoldReleased ?? 0), totals.litresSoldReleased),
      row('Unit price(s)', depots.map(d => { const ups = metricsByDepot[d]?.unitPrices ?? []; return ups.length ? ups.map(u => u.toLocaleString()).join(', ') : '—'; }), '—'),
      row('Tank balance (litres)', depots.map(d => tankBalanceByDepot[d] ?? 0), totals.tankBalance),
      row('No. of trucks sold', depots.map(d => metricsByDepot[d]?.ticketsAll ?? 0), totals.ticketsAll),
      row('Total amount paid', depots.map(d => toNum(manualByDepot[d]?.amountPaid)), totals.amountPaid),
      row('Total sales amount', depots.map(d => metricsByDepot[d]?.revenueAll ?? 0), totals.revenueAll),
      row('Differentials', depots.map(d => differentialsByDepot[d] ?? 0), Object.values(differentialsByDepot).reduce((s, n) => s + n, 0)),
      row('Loading left over', depots.map(d => tankBalanceByDepot[d] ?? 0), totals.loadingLeftOver),
    //   row('Staff name', depots.map(d => manualByDepot[d]?.staffName || ''), ''),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Report');
    XLSX.writeFile(wb, `Daily-Sales-Report-${selectedDateKey}.xlsx`);
  }, [depots, differentialsByDepot, manualByDepot, metricsByDepot, selectedDateKey, tankBalanceByDepot, totals]);

  const isLoading = ordersQuery.isLoading || pfisQuery.isLoading;

  // ── Cell renderers ─────────────────────────────────────────────────
  // NOTE: All input rendering is done inline (not as sub-components) to
  // prevent React from unmounting/remounting inputs on every render,
  // which would cause focus loss after each keystroke.

  const renderDepotCell = (depot: string, row: typeof ROWS[number]) => {
    const met = metricsByDepot[depot] || { litresSoldAll: 0, litresSoldReleased: 0, ticketsAll: 0, revenueAll: 0, unitPrices: [] as number[] };
    const isReadOnly = locked || !isToday;

    switch (row.kind) {
      case 'manual-carried':
        return (
          <input
            value={manualByDepot[depot]?.carriedOverLoading ?? ''}
            disabled={isReadOnly}
            onChange={(e) => updateManual(depot, { carriedOverLoading: e.target.value.replace(/,/g, '') })}
            onBlur={(e) => {
              const n = toNum(e.target.value);
              if (n > 0) updateManual(depot, { carriedOverLoading: n.toLocaleString() });
            }}
            onFocus={(e) => updateManual(depot, { carriedOverLoading: e.target.value.replace(/,/g, '') })}
            inputMode="numeric"
            placeholder="0"
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
          />
        );
      case 'manual-opening':
        return (
          <input
            value={manualByDepot[depot]?.openingLitres ?? ''}
            disabled={isReadOnly}
            onChange={(e) => updateManual(depot, { openingLitres: e.target.value.replace(/,/g, '') })}
            onBlur={(e) => {
              const n = toNum(e.target.value);
              if (n > 0) updateManual(depot, { openingLitres: n.toLocaleString() });
            }}
            onFocus={(e) => updateManual(depot, { openingLitres: e.target.value.replace(/,/g, '') })}
            inputMode="numeric"
            placeholder="0"
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
          />
        );
      case 'manual-amount-paid':
        return (
          <input
            value={manualByDepot[depot]?.amountPaid ?? ''}
            disabled={isReadOnly}
            onChange={(e) => updateManual(depot, { amountPaid: e.target.value.replace(/,/g, '') })}
            onBlur={(e) => {
              const n = toNum(e.target.value);
              if (n > 0) updateManual(depot, { amountPaid: n.toLocaleString() });
            }}
            onFocus={(e) => updateManual(depot, { amountPaid: e.target.value.replace(/,/g, '') })}
            inputMode="numeric"
            placeholder="0"
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
          />
        );
      case 'manual-staff': {
        const v = manualByDepot[depot]?.staffName ?? '';
        if (isReadOnly) return <span className="text-sm text-slate-700">{v || <span className="text-slate-400">—</span>}</span>;
        return (
          <select
            aria-label="Staff name"
            value={v}
            onChange={(e) => updateManual(depot, { staffName: e.target.value })}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">Select staff…</option>
            {staffList.map(u => (
              <option key={u.id} value={getStaffDisplayName(u)}>{getStaffDisplayName(u)}</option>
            ))}
          </select>
        );
      }
      case 'auto-sold-all':      return <span className="text-sm">{fmtQty(met.litresSoldAll)}</span>;
      case 'auto-sold-released': return <span className="text-sm">{fmtQty(met.litresSoldReleased)}</span>;
      case 'auto-unit-price': {
        const ups = met.unitPrices;
        return <span className="text-sm text-slate-600">{ups.length ? ups.map(u => u.toLocaleString()).join(', ') : '—'}</span>;
      }
      case 'auto-tank-balance':      return <span className="text-sm">{fmtQty(tankBalanceByDepot[depot] ?? 0)}</span>;
      case 'auto-tickets':           return <span className="text-sm">{(met.ticketsAll).toLocaleString()}</span>;
      case 'auto-revenue':           return <span className="text-sm font-medium text-emerald-700">{fmtMoney(met.revenueAll)}</span>;
      case 'auto-differentials': {
        const v = differentialsByDepot[depot] ?? 0;
        return <span className={cn('text-sm font-medium', v === 0 ? 'text-slate-400' : v > 0 ? 'text-amber-700' : 'text-red-600')}>{fmtQty(v)}</span>;
      }
      case 'auto-loading-leftover':  return <span className="text-sm">{fmtQty(tankBalanceByDepot[depot] ?? 0)}</span>;
    }
  };

  // ── Render ─────────────────────────────────────────────────────────

  const renderTotalCell = (row: typeof ROWS[number]): string => {
    switch (row.kind) {
      case 'manual-carried':        return fmtQty(totals.carriedOver);
      case 'manual-opening':        return fmtQty(totals.opening);
      case 'auto-sold-all':         return fmtQty(totals.litresSoldAll);
      case 'auto-sold-released':    return fmtQty(totals.litresSoldReleased);
      case 'auto-unit-price':       return '—';
      case 'auto-tank-balance':     return fmtQty(totals.tankBalance);
      case 'auto-tickets':          return totals.ticketsAll.toLocaleString();
      case 'manual-amount-paid':    return fmtMoney(totals.amountPaid);
      case 'auto-revenue':          return fmtMoney(totals.revenueAll);
      case 'auto-differentials':    return fmtQty(Object.values(differentialsByDepot).reduce((s, n) => s + n, 0));
      case 'auto-loading-leftover': return fmtQty(totals.loadingLeftOver);
      case 'manual-staff':          return '—';
    }
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            <PageHeader
              title="Daily Sales Report"
              description={
                locked
                  ? `Viewing saved report for ${selectedDateKey} — read-only.`
                  : isToday
                    ? 'Fill in the manual fields and save when ready.'
                    : 'Select a date to view a saved report.'
              }
              actions={
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 border border-slate-200 rounded-md bg-white px-2.5 h-9">
                    <CalendarDays size={15} className="text-slate-400" />
                    <input
                      aria-label="Select report date"
                      type="date"
                      className="text-sm bg-transparent outline-none"
                      value={selectedDateKey}
                      max={todayKey}
                      onChange={(e) => setSelectedDateKey(e.target.value)}
                    />
                  </div>

                  {historyDates.length > 0 && (
                    <select
                      aria-label="Report history"
                      className="h-9 px-2.5 rounded-md border border-slate-200 bg-white text-sm outline-none"
                      value={selectedDateKey}
                      onChange={(e) => setSelectedDateKey(e.target.value)}
                    >
                      <option value={todayKey}>Today</option>
                      {historyDates
                        .filter(d => d !== todayKey)
                        .slice(0, 60)
                        .map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}

                  {/* <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-sm"
                    onClick={() => setSelectedDateKey(format(subDays(today, 1), 'yyyy-MM-dd'))}
                  >
                    Yesterday
                  </Button> */}

                  <div className="h-5 w-px bg-slate-200" />

                  <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportXlsx} disabled={depots.length === 0}>
                    <Download size={14} /> Export
                  </Button>

                  <Button
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={saveTodaySnapshot}
                    disabled={!isToday || locked}
                    title={!isToday ? 'Only today can be saved' : locked ? 'Already saved' : "Save today's report"}
                  >
                    {locked ? <Lock size={14} /> : <Save size={14} />}
                    {locked ? 'Saved' : 'Save today'}
                  </Button>
                </div>
              }
            />

            {/* Status strip */}
            {/* <div className={cn(
              'rounded-lg border px-4 py-3 flex items-center justify-between gap-3',
              locked ? 'bg-slate-50 border-slate-200'
                : isToday ? 'bg-emerald-50 border-emerald-200'
                : 'bg-amber-50 border-amber-200'
            )}>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-800">
                  {locked ? 'Saved & locked' : isToday ? 'Today — editable' : 'Past day — view only'}
                </span>
                <span className="text-xs text-slate-500 bg-white border border-slate-200 rounded px-2 py-0.5">{selectedDateKey}</span>
              </div>
              {locked && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Lock size={11} /> Read-only
                </span>
              )}
              {!locked && isToday && (
                <span className="text-xs text-slate-400 hidden sm:block">Click a column header to rename it. Fill in the input fields and save when ready.</span>
              )}
            </div> */}

            {/* Main table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 border-b border-slate-200">
                      <TableHead className="min-w-[260px] py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Metric</TableHead>
                      {depots.map(d => (
                        <TableHead key={d} className="min-w-[150px] py-3">
                          <input
                            value={getAlias(d)}
                            onChange={(e) => setAlias(d, e.target.value)}
                            placeholder={d}
                            className="w-full bg-transparent text-xs font-semibold text-slate-500 uppercase tracking-wide focus:outline-none focus:text-slate-800 border-b border-transparent focus:border-slate-300 pb-0.5"
                          />
                        </TableHead>
                      ))}
                      <TableHead className="min-w-[140px] py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-100/80">Total</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={Math.max(2, depots.length + 2)}>
                            <Skeleton className="h-9 w-full rounded" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : depots.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="py-16 text-center text-slate-400 text-sm">
                          No depot locations found yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      ROWS.map(row => (
                        <TableRow
                          key={row.kind}
                          className={cn(
                            'transition-colors hover:bg-slate-50/60',
                            SECTION_STARTS.has(row.kind) && 'border-t-2 border-slate-200',
                          )}
                        >
                          <TableCell className="py-2.5 pr-4">
                            <div className="text-sm text-slate-800">{row.label}</div>
                          </TableCell>

                          {depots.map(d => (
                            <TableCell key={d} className="py-2">
                              {renderDepotCell(d, row)}
                            </TableCell>
                          ))}

                          <TableCell className={cn(
                            'py-2.5 text-sm font-medium bg-slate-50',
                            row.kind === 'auto-revenue' ? 'text-emerald-700' : 'text-slate-700',
                          )}>
                            {renderTotalCell(row)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* {!locked && isToday && (
              <p className="text-xs text-slate-400 text-center pb-2">
                Click <strong className="text-slate-600">Save today</strong> to lock this report. After today it becomes read-only.
              </p>
            )} */}

          </div>
        </div>
      </div>
    </div>
  );
}
