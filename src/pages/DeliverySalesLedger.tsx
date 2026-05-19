import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  Plus, Search, Download, Loader2, Trash2, Pencil,
  Truck, Wallet, FileText,
  TrendingUp, Banknote, Building2,
  Calendar as CalendarIcon, UserPlus, X, Fuel,
  MapPin, Users, LayoutGrid, Filter, AlertTriangle, Tag,
} from 'lucide-react';
import {
  format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, isWithinInterval,
} from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { isCurrentUserReadOnly } from '@/roles';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

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
  location?: string;
  pfi_location?: string;
}

interface DeliveryCustomer {
  id: number;
  customer_name: string;
  phone_number?: string;
  contact_person?: string;        // manager's name (filling stations)
  contact_person_phone?: string;  // manager's phone (filling stations)
  status: string;
  customer_type?: 'customer' | 'filling_station';  // ← real API field
  notes?: string;                                   // kept for legacy display only
}

// Filling station detection — reads the real customer_type field.
// Falls back to checking the legacy notes prefix for any records not yet migrated.
const LEGACY_FS_PREFIX = '__type:filling_station__';
const isFillingStation = (c: DeliveryCustomer | undefined | null): boolean =>
  c?.customer_type === 'filling_station' ||
  (c?.customer_type == null && !!c?.notes?.startsWith(LEGACY_FS_PREFIX));

interface DeliverySale {
  id: number;
  truck_number: string;
  date_loaded: string;
  depot_loaded: string;
  customer: number;
  customer_name?: string;
  location: string;
  quantity: string | number;
  rate: string | number;
  sales_value: string | number;
  payment_amount: string | number;
  balance: string | number;
  payer_name: string;
  bank: string;
  date_of_payment: string | null;
  phone_number: string;
  remarks: string;
  entered_by?: string;
  created_at?: string;
  updated_at?: string;
}

type PagedResponse<T> = { count: number; results: T[] };
type TimePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';

// One customer row inside the "Record Payment" dialog
interface SaleRow {
  uid: string;
  customer: string;        // customer id string
  customer_name: string;
  location: string;        // destination
  quantity: string;
  rate: string;
  rateLocked: boolean;     // true when this customer already has a rate for this truck
  sales_value: string;     // auto-computed
  payment_amount: string;
  payer_name: string;
  bank_account_id: string;
  date_of_payment: string;
  phone_number: string;
  remarks: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Hardcoded Bank Accounts
// ═══════════════════════════════════════════════════════════════════════════

interface BankAccount {
  id: number;
  account_name: string;
  account_number: string;
  bank_name: string;
  is_active: boolean;
}

const BANK_ACCOUNTS: BankAccount[] = [
  { id: 1, account_name: 'Soroman Energy Ltd', account_number: '1311924986', bank_name: 'Zenith Bank', is_active: true },
  { id: 2, account_name: 'Action Energy Ltd', account_number: '1017185599', bank_name: 'Zenith Bank', is_active: true },
  // { id: 3, account_name: 'Soroman Energy Ltd', account_number: '5432109876', bank_name: 'Zenith Bank', is_active: true },
  // { id: 4, account_name: 'Soroman Energy Ltd', account_number: '1122334455', bank_name: 'Access Bank', is_active: true },
  // { id: 5, account_name: 'Soroman Energy Ltd', account_number: '6677889900', bank_name: 'UBA', is_active: true },
];

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const toNum = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

const matchesDateRange = (
  dateStr: string | undefined | null,
  from: Date | null,
  to: Date | null,
): boolean => {
  if (!dateStr || (!from && !to)) return true;
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    if (from && to) return isWithinInterval(d, { start: startOfDay(from), end: endOfDay(to) });
    if (from) return d >= startOfDay(from);
    if (to) return d <= endOfDay(to);
    return true;
  } catch {
    return true;
  }
};

const getPresetRange = (preset: TimePreset): { from: Date | null; to: Date | null } => {
  const now = new Date();
  switch (preset) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case 'week': return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month': return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'year': return { from: startOfYear(now), to: endOfYear(now) };
    case 'all': return { from: null, to: null };
    case 'custom': return { from: null, to: null };
  }
};

const makeSaleRow = (): SaleRow => ({
  uid: crypto.randomUUID(),
  customer: '',
  customer_name: '',
  location: '',
  quantity: '',
  rate: '',
  rateLocked: false,
  sales_value: '',
  payment_amount: '',
  payer_name: '',
  bank_account_id: '',
  date_of_payment: format(new Date(), 'yyyy-MM-dd'),
  phone_number: '',
  remarks: '',
});

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function DeliverySalesLedger() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const readOnly = isCurrentUserReadOnly();

  // ── Filters ────────────────────────────────────────────────────────
  const [timePreset, setTimePreset] = useState<TimePreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [truckFilter, setTruckFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [depotFilter, setDepotFilter] = useState<string>('all');
  const [cycleFilter, setCycleFilter] = useState<string>('all'); // 'all' | '1' | '2' | ...

  // ── Trip Codes (localStorage-managed) ────────────────────────────
  const [tripCodes, setTripCodes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('dsl_trip_codes') || '[]'); } catch { return []; }
  });
  const [saleTripMap, setSaleTripMap] = useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem('dsl_sale_trip_map') || '{}'); } catch { return {}; }
  });
  const [tripCodeFilter, setTripCodeFilter] = useState<string>('all');
  const [dialogTripCode, setDialogTripCode] = useState<string>('');
  const [editTripCode, setEditTripCode] = useState<string>('');
  const [showTripCodeManager, setShowTripCodeManager] = useState(false);
  const [newTripCodeInput, setNewTripCodeInput] = useState<string>('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [bulkTripCode, setBulkTripCode] = useState<string>('');

  // ── Payment Dialog ─────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  // Shared truck-level fields
  const [dialogTruckLoadingId, setDialogTruckLoadingId] = useState('');
  const [dialogTruckNumber, setDialogTruckNumber] = useState('');
  const [dialogDateLoaded, setDialogDateLoaded] = useState('');
  const [dialogDepot, setDialogDepot] = useState('');
  // Cycle override — 'auto' uses date from loading record; 'custom' lets user type a date
  const [dialogCycleMode, setDialogCycleMode] = useState<'auto' | 'custom'>('auto');
  const [dialogCustomDate, setDialogCustomDate] = useState('');
  // Per-customer rows
  const [saleRows, setSaleRows] = useState<SaleRow[]>([makeSaleRow()]);
  const [rowErrors, setRowErrors] = useState<Record<string, Partial<Record<keyof SaleRow, string>>>>({});
  const [saving, setSaving] = useState(false);

  // ── Delete ─────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Edit ───────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<DeliverySale | null>(null);
  const [editForm, setEditForm] = useState<{
    rate: string; sales_value: string; payment_amount: string;
    payer_name: string; bank_account_id: string; date_of_payment: string;
    remarks: string; phone_number: string; location: string; quantity: string;
    date_loaded: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // ═══════════════════════════════════════════════════════════════════
  // Persist trip codes to localStorage
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    localStorage.setItem('dsl_trip_codes', JSON.stringify(tripCodes));
  }, [tripCodes]);

  useEffect(() => {
    localStorage.setItem('dsl_sale_trip_map', JSON.stringify(saleTripMap));
  }, [saleTripMap]);

  // ═══════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════

  const truckLoadingsQuery = useQuery({
    queryKey: ['delivery-inventory'],
    queryFn: async () =>
      safePaged<TruckLoading>(
        await apiClient.admin.getDeliveryInventory({ page_size: 5000 }),
      ),
    staleTime: 30_000,
  });
  const allLoadings = useMemo(() => {
    return truckLoadingsQuery.data?.results || [];
  }, [truckLoadingsQuery.data]);

  const customersQuery = useQuery({
    queryKey: ['delivery-customers-list'],
    queryFn: async () =>
      safePaged<DeliveryCustomer>(
        await apiClient.admin.getDeliveryCustomers({ page_size: 5000 }),
      ),
    staleTime: 60_000,
  });
  const customers = useMemo(
    () => customersQuery.data?.results || [],
    [customersQuery.data],
  );

  const salesQuery = useQuery({
    queryKey: ['delivery-sales'],
    queryFn: async () =>
      safePaged<DeliverySale>(
        await apiClient.admin.getDeliverySales({ page_size: 5000 }),
      ),
    staleTime: 30_000,
  });
  const allSales = useMemo(() => salesQuery.data?.results || [], [salesQuery.data]);

  // ═══════════════════════════════════════════════════════════════════
  // Lookup maps
  // ═══════════════════════════════════════════════════════════════════

  const customerMap = useMemo(() => {
    const m = new Map<number, DeliveryCustomer>();
    customers.forEach(c => m.set(c.id, c));
    return m;
  }, [customers]);

  const bankMap = useMemo(() => {
    const m = new Map<number, BankAccount>();
    BANK_ACCOUNTS.forEach(b => m.set(b.id, b));
    return m;
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // Cycle key — one cycle = one loading event = (truck + date_loaded)
  // This is the primary grouping unit; replaces bare truck_number so
  // that two loadings of the same truck are tracked independently.
  // ═══════════════════════════════════════════════════════════════════

  const getCycleKey = (truckNum: string, dateLoaded: string | undefined | null): string =>
    `${truckNum}||${dateLoaded || ''}`;

  // ═══════════════════════════════════════════════════════════════════
  // Per-cycle aggregation: expected amount & total paid so far
  // ═══════════════════════════════════════════════════════════════════

  const cyclePaymentSummary = useMemo(() => {
    const map = new Map<string, {
      truckNumber: string;
      dateLoaded: string;
      totalExpected: number;
      totalPaid: number;
      entries: DeliverySale[];
    }>();

    // First pass: collect entries and total paid per cycle
    allSales.forEach(s => {
      const key = getCycleKey(s.truck_number, s.date_loaded);
      const existing = map.get(key) || {
        truckNumber: s.truck_number,
        dateLoaded: s.date_loaded || '',
        totalExpected: 0,
        totalPaid: 0,
        entries: [],
      };
      existing.totalPaid += toNum(s.payment_amount);
      existing.entries.push(s);
      map.set(key, existing);
    });

    // Second pass: totalExpected = sum of MAX sales_value per customer WITHIN this cycle
    map.forEach((cycle) => {
      const perCustMax = new Map<number, number>();
      cycle.entries.forEach(s => {
        const sv = toNum(s.sales_value);
        if (sv > 0) perCustMax.set(s.customer, Math.max(perCustMax.get(s.customer) || 0, sv));
      });
      cycle.totalExpected = Array.from(perCustMax.values()).reduce((a, b) => a + b, 0);
    });

    return map;
  }, [allSales]);

  // Cycle number per truck: "Cycle 1", "Cycle 2" ... sorted by date_loaded ascending
  // Only trucks that appear MORE than once (multiple distinct date_loaded values) get
  // cycle numbers > 1. Trucks with a single load always have cycleNum = 1, totalCycles = 1.
  // Entries with no date_loaded are bucketed with the truck's earliest known load date
  // so they never accidentally create a phantom "Cycle 2".
  const cycleNumberMap = useMemo(() => {
    // All entries for a truck belong to Cycle 1 until a genuine second loading
    // event is recorded. We never infer a new cycle from differing date_loaded
    // strings alone — that was causing phantom "Cycle 2" groups for trucks that
    // only have one physical load but whose entries carry slightly different dates.
    const map = new Map<string, { cycleNum: number; totalCycles: number }>();
    cyclePaymentSummary.forEach((cycle) => {
      map.set(getCycleKey(cycle.truckNumber, cycle.dateLoaded), {
        cycleNum: 1,
        totalCycles: 1,
      });
    });
    return map;
  }, [cyclePaymentSummary]);

  // Keep a truck-level view for the dialog outstanding banner
  // (shows how much is still owed across ALL cycles of the selected truck)
  const truckPaymentSummary = useMemo(() => {
    const map = new Map<string, { totalExpected: number; totalPaid: number }>();
    cyclePaymentSummary.forEach((cycle) => {
      const t = map.get(cycle.truckNumber) || { totalExpected: 0, totalPaid: 0 };
      t.totalExpected += cycle.totalExpected;
      t.totalPaid     += cycle.totalPaid;
      map.set(cycle.truckNumber, t);
    });
    return map;
  }, [cyclePaymentSummary]);

  // ═══════════════════════════════════════════════════════════════════
  // Date range
  // ═══════════════════════════════════════════════════════════════════

  const dateRange = useMemo(() => {
    if (timePreset === 'custom') {
      return {
        from: customFrom ? parseISO(customFrom) : null,
        to: customTo ? parseISO(customTo) : null,
      };
    }
    return getPresetRange(timePreset);
  }, [timePreset, customFrom, customTo]);

  // ═══════════════════════════════════════════════════════════════════
  // Filtered & sorted
  // ═══════════════════════════════════════════════════════════════════

  const timeFilteredSales = useMemo(
    () => allSales.filter(s => {
      const dateField = s.date_of_payment || s.date_loaded;
      return matchesDateRange(dateField, dateRange.from, dateRange.to);
    }),
    [allSales, dateRange],
  );

  const filteredSales = useMemo(() => {
    let result = timeFilteredSales;
    if (truckFilter !== 'all') {
      result = result.filter(s => s.truck_number === truckFilter);
    }
    if (locationFilter !== 'all') {
      result = result.filter(s => s.location === locationFilter);
    }
    if (customerFilter !== 'all') {
      result = result.filter(s => String(s.customer) === customerFilter);
    }
    if (depotFilter !== 'all') {
      result = result.filter(s => s.depot_loaded === depotFilter);
    }
    if (cycleFilter !== 'all') {
      const targetCycleNum = Number(cycleFilter);
      result = result.filter(s => {
        const info = cycleNumberMap.get(getCycleKey(s.truck_number, s.date_loaded));
        return info?.cycleNum === targetCycleNum;
      });
    }
    if (tripCodeFilter !== 'all') {
      result = result.filter(s => saleTripMap[s.id] === tripCodeFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(s =>
        s.truck_number.toLowerCase().includes(q) ||
        (s.depot_loaded || '').toLowerCase().includes(q) ||
        (s.location || '').toLowerCase().includes(q) ||
        (s.payer_name || '').toLowerCase().includes(q) ||
        (s.bank || '').toLowerCase().includes(q) ||
        (s.customer_name || customerMap.get(s.customer)?.customer_name || '').toLowerCase().includes(q) ||
        (s.remarks || '').toLowerCase().includes(q) ||
        (saleTripMap[s.id] || '').toLowerCase().includes(q),
      );
    }
    return result.sort((a, b) => {
      const dateA = a.date_of_payment || a.date_loaded || '';
      const dateB = b.date_of_payment || b.date_loaded || '';
      return dateB.localeCompare(dateA);
    });
  }, [timeFilteredSales, truckFilter, locationFilter, customerFilter, depotFilter, cycleFilter, tripCodeFilter, searchQuery, customerMap, saleTripMap, cycleNumberMap]);

  // ═══════════════════════════════════════════════════════════════════
  // Running balance per row — scoped per cycle (truck + date_loaded)
  // ═══════════════════════════════════════════════════════════════════

  const rowBalances = useMemo(() => {
    const balanceMap = new Map<number, number>();

    cyclePaymentSummary.forEach((cycle) => {
      const sorted = [...cycle.entries].sort((a, b) => {
        const dateA = a.date_of_payment || a.date_loaded || a.created_at || '';
        const dateB = b.date_of_payment || b.date_loaded || b.created_at || '';
        return dateA.localeCompare(dateB) || a.id - b.id;
      });

      // totalExpected within this cycle only
      const perCustMax = new Map<number, number>();
      sorted.forEach(s => {
        const sv = toNum(s.sales_value);
        if (sv > 0) perCustMax.set(s.customer, Math.max(perCustMax.get(s.customer) || 0, sv));
      });
      const totalExpected = Array.from(perCustMax.values()).reduce((a, b) => a + b, 0);

      let cumulativePaid = 0;
      sorted.forEach(s => {
        cumulativePaid += toNum(s.payment_amount);
        balanceMap.set(s.id, totalExpected - cumulativePaid);
      });
    });

    return balanceMap;
  }, [cyclePaymentSummary]);

  // ═══════════════════════════════════════════════════════════════════
  // Summaries
  // ═══════════════════════════════════════════════════════════════════

  const totals = useMemo(() => {
    // Build cycle-level aggregates from filteredSales only
    // so every dropdown/search filter is reflected in the summary cards.
    const cycleMap = new Map<string, {
      entries: DeliverySale[];
      totalPaid: number;
    }>();

    filteredSales.forEach(s => {
      const key = getCycleKey(s.truck_number, s.date_loaded);
      const c = cycleMap.get(key) || { entries: [], totalPaid: 0 };
      c.entries.push(s);
      c.totalPaid += toNum(s.payment_amount);
      cycleMap.set(key, c);
    });

    let totalExpected = 0;
    let totalPaid = 0;
    let totalQty = 0;
    const uniqueTrucks = new Set<string>();
    const uniqueCustomers = new Set<number>();
    let totalOutstanding = 0;
    let totalOverpaid = 0;

    cycleMap.forEach((cycle, key) => {
      const truckNum = key.split('||')[0];
      uniqueTrucks.add(truckNum);

      const perCustMaxSv  = new Map<number, number>();
      const perCustMaxQty = new Map<number, number>();
      cycle.entries.forEach(s => {
        uniqueCustomers.add(s.customer);
        const sv = toNum(s.sales_value);
        const q  = toNum(s.quantity);
        if (sv > 0) perCustMaxSv.set(s.customer,  Math.max(perCustMaxSv.get(s.customer)  ?? 0, sv));
        if (q  > 0) perCustMaxQty.set(s.customer, Math.max(perCustMaxQty.get(s.customer) ?? 0, q));
      });

      let cycleExp = 0;
      perCustMaxSv.forEach(v  => { cycleExp   += v; });
      perCustMaxQty.forEach(v => { totalQty   += v; });

      totalExpected += cycleExp;
      totalPaid     += cycle.totalPaid;

      const bal = cycleExp - cycle.totalPaid;
      if (bal > 0) totalOutstanding += bal;
      else if (bal < 0) totalOverpaid += Math.abs(bal);
    });

    return {
      entries: filteredSales.length,
      totalExpected,
      totalPaid,
      totalQty,
      outstanding: totalExpected - totalPaid,
      totalOutstanding,
      totalOverpaid,
      truckCount: uniqueTrucks.size,
      customerCount: uniqueCustomers.size,
    };
  }, [filteredSales]);

  const summaryCards = useMemo((): SummaryCard[] => {
    // totalOutstanding = sum of per-truck deficits (before netting overpayments)
    // totalOverpaid    = sum of per-truck surpluses
    // netBalance       = what is truly still owed after offsetting overpayments
    const netBalance = totals.totalOutstanding - totals.totalOverpaid;

    const cards: SummaryCard[] = [
      { title: 'Qty Sold (Ltrs)',  value: totals.totalQty > 0 ? totals.totalQty.toLocaleString() : '0', icon: <Truck size={20} />,      tone: 'neutral' },
      { title: 'Expected Revenue', value: fmt(totals.totalExpected),                                     icon: <TrendingUp size={20} />, tone: 'neutral' },
      { title: 'Total Paid',       value: fmt(totals.totalPaid),                                         icon: <Banknote size={20} />,   tone: 'green'   },
      {
        // Raw outstanding — what trucks still owe before netting any overpayments
        title: 'Outstanding',
        value: totals.totalOutstanding > 0 ? fmt(totals.totalOutstanding) : 'Fully Settled',
        icon:  <Wallet size={20} />,
        tone:  totals.totalOutstanding > 0 ? ('red' as const) : ('green' as const),
      },
      {
        // How much was overpaid across trucks
        title: 'Overpaid',
        value: totals.totalOverpaid > 0 ? `+${fmt(totals.totalOverpaid)}` : '—',
        icon:  <Banknote size={20} />,
        tone:  totals.totalOverpaid > 0 ? ('blue' as const) : ('neutral' as const),
      },
      {
        // Net = Outstanding minus Overpaid — the true remaining liability
        title: 'Net Balance',
        value: netBalance <= 0 ? (netBalance < 0 ? `+${fmt(Math.abs(netBalance))} excess` : 'Fully Settled') : fmt(netBalance),
        icon:  <TrendingUp size={20} />,
        tone:  netBalance <= 0 ? ('blue' as const) : ('red' as const),
      },
    ];

    return cards;
  }, [totals]);

  const periodLabel =
    timePreset === 'custom'
      ? `${customFrom ? format(parseISO(customFrom), 'dd MMM') : '?'} – ${customTo ? format(parseISO(customTo), 'dd MMM yyyy') : '?'}`
      : timePreset === 'all' ? 'All Time' : timePreset.charAt(0).toUpperCase() + timePreset.slice(1);

  // Group filteredSales by cycle (truck + date_loaded), preserving sort order within each group
  const groupedByCycle = useMemo(() => {
    const map = new Map<string, DeliverySale[]>();
    filteredSales.forEach(s => {
      const key = getCycleKey(s.truck_number, s.date_loaded);
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    });
    return map;
  }, [filteredSales]);

  // Which cycle groups are collapsed (default: all expanded)
  const [collapsedTrucks, setCollapsedTrucks] = useState<Set<string>>(new Set());
  const toggleTruck = (cycleKey: string) =>
    setCollapsedTrucks(prev => {
      const next = new Set(prev);
      next.has(cycleKey) ? next.delete(cycleKey) : next.add(cycleKey);
      return next;
    });

  // Unique truck numbers for filter dropdown
  const uniqueTruckNumbers = useMemo(() => {
    const set = new Set<string>();
    allSales.forEach(s => set.add(s.truck_number));
    return Array.from(set).sort();
  }, [allSales]);

  // Unique locations/destinations
  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    allSales.forEach(s => { if (s.location) set.add(s.location); });
    return Array.from(set).sort();
  }, [allSales]);

  // Unique customers (id→name pairs)
  const uniqueCustomerOptions = useMemo(() => {
    const map = new Map<number, string>();
    allSales.forEach(s => {
      const name = s.customer_name || customerMap.get(s.customer)?.customer_name || '';
      if (s.customer && name) map.set(s.customer, name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSales, customerMap]);

  // Unique depots
  const uniqueDepots = useMemo(() => {
    const set = new Set<string>();
    allSales.forEach(s => { if (s.depot_loaded) set.add(s.depot_loaded); });
    return Array.from(set).sort();
  }, [allSales]);

  // Unique cycle numbers across all trucks — e.g. "Cycle 1", "Cycle 2"
  // Cycle 1 = a truck's first load, Cycle 2 = same truck reloaded, etc.
  const uniqueCycleOptions = useMemo(() => {
    const maxCycle = Array.from(cycleNumberMap.values()).reduce((m, v) => Math.max(m, v.cycleNum), 0);
    if (maxCycle <= 1) return []; // no multi-cycle trucks — hide the filter
    return Array.from({ length: maxCycle }, (_, i) => i + 1);
  }, [cycleNumberMap]);

  // Loaded trucks for the dialog — show trucks that:
  // 1. Have a truck_number or truck ID, AND
  // 2. Are NOT (offloaded AND fully paid with no outstanding balance for this specific cycle)
  const loadedTrucks = useMemo(() => {
    return allLoadings.filter(t => {
      if (!(t.truck_number || t.truck)) return false;
      if (t.loading_status === 'offloaded') {
        const cycleKey = getCycleKey(t.truck_number || '', t.date_allocated || '');
        const cycle = cyclePaymentSummary.get(cycleKey);
        if (cycle) {
          const outstanding = cycle.totalExpected - cycle.totalPaid;
          if (outstanding <= 0 && cycle.totalExpected > 0) return false;
        }
      }
      return true;
    });
  }, [allLoadings, cyclePaymentSummary]);

  // Per-cycle-per-customer locked rate: cycleKey → customerId → rate string
  const cycleCustomerRateMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    allSales.forEach(s => {
      const r = toNum(s.rate);
      if (!r || !s.truck_number || !s.customer) return;
      const cycleKey = getCycleKey(s.truck_number, s.date_loaded);
      if (!map.has(cycleKey)) map.set(cycleKey, new Map());
      const inner = map.get(cycleKey)!;
      if (!inner.has(String(s.customer))) {
        inner.set(String(s.customer), formatWithCommas(String(r)));
      }
    });
    return map;
  }, [allSales]);

  // Known loading dates per truck — from inventory records (allLoadings)
  // Used in the add/edit dialogs to let users pick which cycle an entry belongs to
  const truckLoadingDates = useMemo(() => {
    const map = new Map<string, string[]>(); // truckNumber → sorted unique dates
    allLoadings.forEach(t => {
      const truck = t.truck_number || '';
      const date = t.date_allocated || '';
      if (!truck || !date) return;
      const arr = map.get(truck) || [];
      if (!arr.includes(date)) arr.push(date);
      map.set(truck, arr);
    });
    map.forEach((dates, truck) => map.set(truck, [...dates].sort()));
    return map;
  }, [allLoadings]);

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['delivery-sales'] });
    qc.invalidateQueries({ queryKey: ['delivery-customers'] });
    qc.invalidateQueries({ queryKey: ['delivery-customers-list'] });
    qc.invalidateQueries({ queryKey: ['delivery-inventory'] });
  };

  // ── Trip Code Management ───────────────────────────────────────────

  const addTripCode = () => {
    const code = newTripCodeInput.trim().toUpperCase().replace(/\s+/g, '-');
    if (!code) {
      toast({ title: 'Enter a code first', variant: 'destructive' });
      return;
    }
    if (tripCodes.includes(code)) {
      toast({ title: `Code "${code}" already exists`, variant: 'destructive' });
      return;
    }
    setTripCodes(prev => [...prev, code].sort());
    setNewTripCodeInput('');
    toast({ title: `Trip code "${code}" created` });
  };

  const deleteTripCode = (code: string) => {
    setTripCodes(prev => prev.filter(c => c !== code));
    setSaleTripMap(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (next[Number(k)] === code) delete next[Number(k)]; });
      return next;
    });
    if (tripCodeFilter === code) setTripCodeFilter('all');
    toast({ title: `Trip code "${code}" deleted` });
  };

  const bulkAssignTripCode = () => {
    if (!bulkTripCode || selectedRows.size === 0) return;
    const count = selectedRows.size;
    if (bulkTripCode === '__remove__') {
      setSaleTripMap(prev => {
        const next = { ...prev };
        selectedRows.forEach(id => delete next[id]);
        return next;
      });
    } else {
      const updates: Record<number, string> = {};
      selectedRows.forEach(id => { updates[id] = bulkTripCode; });
      setSaleTripMap(prev => ({ ...prev, ...updates }));
    }
    setSelectedRows(new Set());
    setBulkTripCode('');
    toast({ title: `${count} ${count === 1 ? 'entry' : 'entries'} updated` });
  };

  const handlePresetChange = (preset: TimePreset) => {
    setTimePreset(preset);
    if (preset !== 'custom') { setCustomFrom(''); setCustomTo(''); }
  };

  const autoCalcSalesValue = (quantity: string, rate: string) => {
    const q = Number(stripCommas(quantity)) || 0;
    const r = Number(stripCommas(rate)) || 0;
    return q * r > 0 ? formatWithCommas(String(q * r)) : '';
  };

  const openPaymentDialog = () => {
    setDialogTruckLoadingId('');
    setDialogTruckNumber('');
    setDialogDateLoaded('');
    setDialogDepot('');
    setDialogCycleMode('auto');
    setDialogCustomDate('');
    setDialogTripCode('');
    setSaleRows([makeSaleRow()]);
    setRowErrors({});
    setDialogOpen(true);
  };

  const handleTruckSelect = (loadingId: string) => {
    setDialogTruckLoadingId(loadingId);
    setDialogCycleMode('auto');
    setDialogCustomDate('');
    const loading = loadedTrucks.find(t => String(t.id) === loadingId);
    if (!loading) {
      setDialogTruckNumber('');
      setDialogDateLoaded('');
      setDialogDepot('');
      setSaleRows([makeSaleRow()]);
      return;
    }

    const depot = loading.depot || loading.pfi_location || loading.location || '';
    setDialogTruckNumber(loading.truck_number || '');
    setDialogDateLoaded(loading.date_allocated || '');
    setDialogDepot(depot);

    // Pre-fill first row from the loading record (customer + destination + qty)
    const custId = loading.customer ? String(loading.customer) : '';
    const custObj = loading.customer ? customerMap.get(loading.customer) : null;
    const custName = loading.customer_name || custObj?.customer_name || '';
    const destination = loading.location || '';
    const qty = toNum(loading.quantity_allocated);

    // Check for existing rate for this cycle+customer combo
    const cycleKey = getCycleKey(loading.truck_number || '', loading.date_allocated || '');
    const cycleRates = cycleCustomerRateMap.get(cycleKey);
    const existingRate = (custId && cycleRates?.get(custId)) || '';
    const rateLocked = !!existingRate;

    const qtyStr = qty > 0 ? formatWithCommas(String(qty)) : '';
    const sv = existingRate && qtyStr
      ? formatWithCommas(String(Number(stripCommas(qtyStr)) * Number(stripCommas(existingRate))))
      : '';

    // Auto-fill phone for filling station customers
    const autoPhone = (custObj && isFillingStation(custObj) && custObj.phone_number) ? custObj.phone_number : '';
    const autoPayerName = (custObj && isFillingStation(custObj) && custObj.contact_person) ? custObj.contact_person : '';
    const autoPayerPhone = (custObj && isFillingStation(custObj) && custObj.contact_person_phone)
      ? custObj.contact_person_phone
      : autoPhone;

    setSaleRows([{
      ...makeSaleRow(),
      customer: custId,
      customer_name: custName,
      location: destination,
      quantity: qtyStr,
      rate: existingRate,
      rateLocked,
      sales_value: sv,
      phone_number: autoPayerPhone,
      payer_name: autoPayerName,
    }]);
  };

  const updateSaleRow = (uid: string, field: keyof Omit<SaleRow, 'uid'>, value: string) => {
    // Clear error for this field on change
    if (rowErrors[uid]?.[field]) {
      setRowErrors(prev => {
        const next = { ...prev };
        if (next[uid]) { next[uid] = { ...next[uid] }; delete next[uid][field]; }
        return next;
      });
    }
    setSaleRows(prev => prev.map(row => {
      if (row.uid !== uid) return row;
      // Prevent changing rate when it's locked for this row
      if (field === 'rate' && row.rateLocked) return row;

      const updated = { ...row, [field]: field === 'quantity' || field === 'rate' || field === 'payment_amount' || field === 'sales_value'
        ? (field === 'sales_value' ? value : formatWithCommas(value))
        : value };

      // When customer is selected, check if they already have a rate for this cycle
      // Also auto-fill phone for filling stations
      if (field === 'customer') {
        const cycleKey = getCycleKey(dialogTruckNumber, dialogDateLoaded);
        const cycleRates = cycleCustomerRateMap.get(cycleKey);
        const priorRate = value ? cycleRates?.get(value) : undefined;
        if (priorRate) {
          updated.rate = priorRate;
          updated.rateLocked = true;
          const q = Number(stripCommas(updated.quantity)) || 0;
          const r = Number(stripCommas(priorRate)) || 0;
          updated.sales_value = q * r > 0 ? formatWithCommas(String(q * r)) : '';
        } else {
          updated.rateLocked = false;
        }
        // Auto-fill phone number and payer name from customer profile for filling stations
        const selectedCust = value ? customerMap.get(Number(value)) : null;
        if (selectedCust && isFillingStation(selectedCust)) {
          if (selectedCust.contact_person) updated.payer_name = selectedCust.contact_person;
          if (selectedCust.contact_person_phone) updated.phone_number = selectedCust.contact_person_phone;
          else if (selectedCust.phone_number) updated.phone_number = selectedCust.phone_number;
        }
      }

      // Auto-calc sales_value when qty or rate changes
      if (field === 'quantity' || field === 'rate') {
        const q = Number(stripCommas(field === 'quantity' ? value : row.quantity)) || 0;
        const r = Number(stripCommas(field === 'rate' ? value : row.rate)) || 0;
        updated.sales_value = q * r > 0 ? formatWithCommas(String(q * r)) : '';
      }
      return updated;
    }));
  };

  const addSaleRow = () => setSaleRows(prev => [...prev, makeSaleRow()]);

  const removeSaleRow = (uid: string) => {
    setSaleRows(prev => prev.length > 1 ? prev.filter(r => r.uid !== uid) : prev);
  };

  const handleSave = useCallback(async () => {
    if (!dialogTruckNumber.trim()) {
      toast({ title: 'Please select a truck', variant: 'destructive' });
      return;
    }

    // Validate rows — keep any row that has a customer selected or any data entered
    const filledRows = saleRows.filter(r => r.customer || r.payment_amount || r.rate || r.quantity);
    if (filledRows.length === 0) {
      toast({ title: 'Add at least one customer row', variant: 'destructive' });
      return;
    }

    // Per-field validation
    const errors: Record<string, Partial<Record<keyof SaleRow, string>>> = {};
    const nameOnlyRegex = /^[A-Za-z\s'\-\.]+$/;

    filledRows.forEach(row => {
      const e: Partial<Record<keyof SaleRow, string>> = {};
      const custObj = row.customer ? customerMap.get(Number(row.customer)) : null;
      const isFS = isFillingStation(custObj);

      if (!row.customer) e.customer = 'Customer is required';
      if (!row.location.trim()) e.location = 'Destination is required';

      // Filling stations: only qty needed — rate/bank/date optional (entered later)
      if (!isFS) {
        if (!row.rate || Number(stripCommas(row.rate)) <= 0) e.rate = 'Rate is required';
        if (!row.bank_account_id) e.bank_account_id = 'Select a bank account';
        if (!row.date_of_payment) e.date_of_payment = 'Payment date is required';
        if (row.payer_name.trim() && !nameOnlyRegex.test(row.payer_name.trim())) {
          e.payer_name = 'Payer name should contain letters only — no numbers';
        }
      }

      if (Object.keys(e).length) errors[row.uid] = e;
    });

    if (Object.keys(errors).length) {
      setRowErrors(errors);
      toast({ title: 'Please fix the highlighted fields', variant: 'destructive' });
      return;
    }
    setRowErrors({});

    setSaving(true);
    try {
      const currentUser = localStorage.getItem('fullname') || 'Unknown';
      const promises = filledRows.map(row => {
        const bankAcct = row.bank_account_id ? bankMap.get(Number(row.bank_account_id)) : null;
        const bankStr = bankAcct
          ? `${bankAcct.account_number} · ${bankAcct.bank_name}`
          : '';
        const custObj = row.customer ? customerMap.get(Number(row.customer)) : null;

        return apiClient.admin.createDeliverySale({
          truck_number: dialogTruckNumber.trim(),
          date_loaded: (dialogCycleMode === 'custom' ? dialogCustomDate : dialogDateLoaded) || format(new Date(), 'yyyy-MM-dd'),
          depot_loaded: dialogDepot.trim() || undefined,
          customer: row.customer ? Number(row.customer) : 0,
          location: row.location.trim() || undefined,
          quantity: Number(stripCommas(row.quantity)) || undefined,
          rate: Number(stripCommas(row.rate)) || undefined,
          sales_value: Number(stripCommas(row.sales_value)) || undefined,
          payment_amount: Number(stripCommas(row.payment_amount)) || undefined,
          payer_name: row.payer_name.trim() || undefined,
          bank: bankStr || undefined,
          date_of_payment: row.date_of_payment || undefined,
          phone_number: row.phone_number.trim() || undefined,
          remarks: row.remarks.trim() || undefined,
          entered_by: currentUser,
        });
      });

      const savedEntries = await Promise.all(promises);

      // Store trip code mapping for new entries if a trip code was selected
      if (dialogTripCode) {
        const updates: Record<number, string> = {};
        savedEntries.forEach((r: unknown) => {
          const record = r as { id?: number };
          if (record?.id) updates[record.id] = dialogTripCode;
        });
        if (Object.keys(updates).length > 0) {
          setSaleTripMap(prev => ({ ...prev, ...updates }));
        }
      }

      // Write customer(s) & destination(s) back to the inventory entry
      // For multi-row, update the inventory entry with the first row's customer/location
      // (subsequent rows are additional allocations from the same loading)
      const loadingId = Number(dialogTruckLoadingId);
      if (loadingId) {
        try {
          const firstRow = filledRows[0];
          const custName = firstRow.customer
            ? (customerMap.get(Number(firstRow.customer))?.customer_name || firstRow.customer_name)
            : '';
          await apiClient.admin.updateDeliveryInventory(loadingId, {
            ...(firstRow.customer ? { customer: Number(firstRow.customer), customer_name: custName } : {}),
            ...(firstRow.location.trim() ? { location: firstRow.location.trim() } : {}),
          });
        } catch {
          // Non-critical
        }
      }

      toast({
        title: `${filledRows.length} entry${filledRows.length > 1 ? ' entries' : ''} recorded`,
        description: `Truck ${dialogTruckNumber} · ${filledRows.length} customer${filledRows.length > 1 ? 's' : ''}`,
      });
      setDialogOpen(false);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save entry',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [dialogTruckNumber, dialogDateLoaded, dialogCycleMode, dialogCustomDate, dialogDepot, dialogTruckLoadingId, dialogTripCode, saleRows, toast, bankMap, customerMap]);
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.admin.deleteDeliverySale(deleteTarget.id);
      toast({ title: 'Entry deleted' });
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
  }, [deleteTarget, toast]);

  // Reverse-match bank account from stored "ACCT · BankName" string
  const bankStringToId = (bankStr: string): string => {
    if (!bankStr) return '';
    const match = BANK_ACCOUNTS.find(b =>
      bankStr.startsWith(b.account_number) || bankStr.includes(b.account_number),
    );
    return match ? String(match.id) : '';
  };

  const openEditDialog = (sale: DeliverySale) => {
    setEditTarget(sale);
    setEditTripCode(saleTripMap[sale.id] || '');
    const rate = toNum(sale.rate);
    const sv = toNum(sale.sales_value);
    const pa = toNum(sale.payment_amount);
    const qty = toNum(sale.quantity);
    setEditForm({
      quantity:         qty > 0 ? formatWithCommas(String(qty)) : '',
      rate:             rate > 0 ? formatWithCommas(String(rate)) : '',
      sales_value:      sv > 0 ? formatWithCommas(String(sv)) : '',
      payment_amount:   pa > 0 ? formatWithCommas(String(pa)) : '',
      payer_name:       sale.payer_name || '',
      bank_account_id:  bankStringToId(sale.bank || ''),
      date_of_payment:  sale.date_of_payment || '',
      remarks:          sale.remarks || '',
      phone_number:     sale.phone_number || '',
      location:         sale.location || '',
      date_loaded:      sale.date_loaded || '',
    });
  };

  const handleEditSave = useCallback(async () => {
    if (!editTarget || !editForm) return;
    setEditSaving(true);

    // Determine lock states at save time (same logic as the form UI)
    const editRateIsLocked = toNum(editTarget.rate) > 0;
    const editDopIsLocked  = !!editTarget.date_of_payment;

    try {
      const bankAcct = editForm.bank_account_id
        ? BANK_ACCOUNTS.find(b => String(b.id) === editForm.bank_account_id)
        : null;
      const bankStr = bankAcct
        ? `${bankAcct.account_number} · ${bankAcct.bank_name}`
        : editTarget.bank || undefined;

      const qty   = Number(stripCommas(editForm.quantity))       || undefined;
      // Only send rate if it wasn't locked (i.e. it had no value before)
      const rate  = editRateIsLocked
        ? (toNum(editTarget.rate) || undefined)
        : (Number(stripCommas(editForm.rate)) || undefined);
      const sv    = Number(stripCommas(editForm.sales_value))    || undefined;
      const pa    = Number(stripCommas(editForm.payment_amount)) || undefined;

      // Auto-compute sales_value if qty + rate are set but sv wasn't manually entered
      const computedSv = qty && rate && !sv ? qty * rate : sv;

      // Only send date_of_payment if it wasn't already set
      const dop = editDopIsLocked
        ? (editTarget.date_of_payment || undefined)
        : (editForm.date_of_payment || undefined);

      await apiClient.admin.updateDeliverySale(editTarget.id, {
        quantity:         qty,
        rate:             rate,
        sales_value:      computedSv,
        payment_amount:   pa,
        payer_name:       editForm.payer_name.trim() || undefined,
        bank:             bankStr,
        date_of_payment:  dop,
        remarks:          editForm.remarks.trim() || undefined,
        phone_number:     editForm.phone_number.trim() || undefined,
        location:         editForm.location.trim() || undefined,
        // Only send date_loaded if the user changed it (cycle reassignment)
        ...(editForm.date_loaded && editForm.date_loaded !== editTarget.date_loaded
          ? { date_loaded: editForm.date_loaded }
          : {}),
      });

      // Persist trip code assignment locally
      if (editTripCode) {
        setSaleTripMap(prev => ({ ...prev, [editTarget.id]: editTripCode }));
      } else {
        setSaleTripMap(prev => { const next = { ...prev }; delete next[editTarget.id]; return next; });
      }
      toast({ title: 'Entry updated' });
      setEditTarget(null);
      setEditForm(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
    } finally {
      setEditSaving(false);
    }
  }, [editTarget, editForm, editTripCode, toast]);

  const exportExcel = useCallback(() => {
    if (!filteredSales.length) return;
    const period = timePreset === 'custom'
      ? `${customFrom || '?'}_TO_${customTo || '?'}`
      : timePreset.toUpperCase();

    const n = (v: number) => v > 0 ? v.toLocaleString('en-NG') : '—';
    const u = (s: string) => (s || '').toUpperCase();

    // ── Build cycle groups (truck + date_loaded), each sorted chronologically ─
    const exportCycleMap = new Map<string, DeliverySale[]>();
    filteredSales.forEach(s => {
      const key = getCycleKey(s.truck_number, s.date_loaded);
      const arr = exportCycleMap.get(key) ?? [];
      arr.push(s);
      exportCycleMap.set(key, arr);
    });
    exportCycleMap.forEach(entries => {
      entries.sort((a, b) => {
        const da = a.date_of_payment || a.date_loaded || '';
        const db = b.date_of_payment || b.date_loaded || '';
        return da.localeCompare(db) || a.id - b.id;
      });
    });

    // Grand totals — per cycle to avoid cross-cycle double-counting
    let grandExpected  = 0;
    let grandPaid      = 0;
    let grandQty       = 0;
    let grandOutstanding = 0;
    let grandOverpaid    = 0;
    exportCycleMap.forEach(entries => {
      const perCustMaxSv  = new Map<number, number>();
      const perCustMaxQty = new Map<number, number>();
      let cyclePaidLocal = 0;
      entries.forEach(s => {
        const sv = toNum(s.sales_value);
        const q  = toNum(s.quantity);
        if (sv > 0) perCustMaxSv.set(s.customer,  Math.max(perCustMaxSv.get(s.customer)  ?? 0, sv));
        if (q  > 0) perCustMaxQty.set(s.customer, Math.max(perCustMaxQty.get(s.customer) ?? 0, q));
        grandPaid      += toNum(s.payment_amount);
        cyclePaidLocal += toNum(s.payment_amount);
      });
      let cycleExp = 0;
      perCustMaxSv.forEach(v  => { grandExpected += v; cycleExp += v; });
      perCustMaxQty.forEach(v => { grandQty      += v; });
      const cycleBal = cycleExp - cyclePaidLocal;
      if (cycleBal > 0) grandOutstanding += cycleBal;
      else if (cycleBal < 0) grandOverpaid += Math.abs(cycleBal);
    });
    const grandBalance = grandExpected - grandPaid;
    const totalCycles  = exportCycleMap.size;
    const totalTrucks  = new Set(filteredSales.map(s => s.truck_number)).size;

    // ── Build AOA (array-of-arrays) for the sheet ───────────────────
    const COLS = [
      'S/N', 'TRUCK NO.', 'TRIP CODE', 'DATE LOADED', 'DEPOT', 'DESTINATION', 'CUSTOMER',
      'QTY (LTRS)', 'RATE (₦)', 'EXPECTED (₦)', 'PAYMENT (₦)', 'BALANCE (₦)',
      'PAYER', 'CONTACT', 'BANK', 'PAYMENT DATE', 'ENTERED BY',
    ] as const;

    const aoa: (string | number)[][] = [];

    // Net balance label
    const netBalanceLabel = (() => {
      if (grandBalance === 0) return 'FULLY SETTLED';
      if (grandBalance < 0)  return `${n(Math.abs(grandBalance))} OVERPAID`;
      if (grandOverpaid > 0) return `${n(grandBalance)} (${n(grandOverpaid)} overpaid on some cycles)`;
      return n(grandBalance);
    })();

    aoa.push(['TRUCK SALES LEDGER — ' + period]);
    aoa.push([]);
    aoa.push(['TOTAL QTY SOLD (LTRS)',  n(grandQty)]);
    aoa.push(['TOTAL TRUCKS',           totalTrucks]);
    aoa.push(['TOTAL CYCLES',           totalCycles]);
    aoa.push(['EXPECTED REVENUE (₦)',   n(grandExpected)]);
    aoa.push(['TOTAL PAID (₦)',         n(grandPaid)]);
    aoa.push(['BALANCE (₦)',            netBalanceLabel]);
    aoa.push([]);

    // Column headers
    aoa.push([...COLS]);

    let rowNum = 0;

    exportCycleMap.forEach((entries, cycleKey) => {
      const firstEntry = entries[0];
      const truckNum = firstEntry?.truck_number || cycleKey.split('||')[0];
      const exportCycleInfo = cycleNumberMap.get(cycleKey);
      const cycleTag = exportCycleInfo && exportCycleInfo.totalCycles > 1
        ? ` [CYCLE ${exportCycleInfo.cycleNum}/${exportCycleInfo.totalCycles}]`
        : '';

      // Per-cycle totals
      const perCustMaxSv  = new Map<number, number>();
      const perCustMaxQty = new Map<number, number>();
      let cyclePaid = 0;
      entries.forEach(s => {
        const sv = toNum(s.sales_value);
        const q  = toNum(s.quantity);
        if (sv > 0) perCustMaxSv.set(s.customer,  Math.max(perCustMaxSv.get(s.customer)  ?? 0, sv));
        if (q  > 0) perCustMaxQty.set(s.customer, Math.max(perCustMaxQty.get(s.customer) ?? 0, q));
        cyclePaid += toNum(s.payment_amount);
      });
      let cycleExpected = 0; perCustMaxSv.forEach(v  => { cycleExpected += v; });
      let cycleQty      = 0; perCustMaxQty.forEach(v => { cycleQty      += v; });
      const cycleBalance = cycleExpected - cyclePaid;

      // Individual entry rows — carry-forward suppression within each cycle
      let prevCycleShown = false;
      let prevQty        = '';
      let prevRate       = '';
      let prevCustName   = '';

      entries.forEach(s => {
        rowNum += 1;
        const custName  = u(s.customer_name || customerMap.get(s.customer)?.customer_name || '');
        const balance   = rowBalances.get(s.id) ?? 0;
        const thisQty   = toNum(s.quantity) > 0 ? n(toNum(s.quantity))  : '—';
        const thisRate  = toNum(s.rate)     > 0 ? n(toNum(s.rate))      : '—';

        // Cycle-level fields: only on the first row of this cycle group
        const truckCell = !prevCycleShown ? `${u(s.truck_number)}${cycleTag}` : '';
        const dateCell  = !prevCycleShown && s.date_loaded
                            ? format(parseISO(s.date_loaded), 'dd/MM/yyyy') : '';
        const depotCell = !prevCycleShown ? u(s.depot_loaded || '') : '';
        const destCell  = !prevCycleShown ? u(s.location     || '') : '';

        // Qty & Rate: show only when value changes
        const qtyCell  = thisQty  !== prevQty  ? thisQty  : '';
        const rateCell = thisRate !== prevRate  ? thisRate : '';

        // Customer: carry-forward suppression
        const custCell = custName !== prevCustName ? custName : '';

        const balanceCell = balance > 0
          ? n(balance)
          : balance < 0
          ? `+${n(Math.abs(balance))} OVERPAID`
          : 'FULLY PAID';

        aoa.push([
          rowNum,
          truckCell,
          !prevCycleShown ? (saleTripMap[s.id] || '') : '',   // TRIP CODE — only on first row of cycle
          dateCell,
          depotCell,
          destCell,
          custCell,
          qtyCell,
          rateCell,
          toNum(s.sales_value)    > 0 ? n(toNum(s.sales_value))    : '—',
          toNum(s.payment_amount) > 0 ? n(toNum(s.payment_amount)) : '—',
          balanceCell,
          u(s.payer_name    || ''),
          s.phone_number    || '',
          u(s.bank          || ''),
          s.date_of_payment ? format(parseISO(s.date_of_payment), 'dd/MM/yyyy') : '',
          u(s.entered_by    || ''),
        ]);

        prevCycleShown = true;
        prevQty        = thisQty;
        prevRate       = thisRate;
        prevCustName   = custName;
      });

      // Cycle subtotal row
      aoa.push([
        '',
        `SUBTOTAL — ${u(truckNum)}${cycleTag}`,
        '', '', '', '', '',
        n(cycleQty),
        '',
        n(cycleExpected),
        n(cyclePaid),
        cycleBalance === 0 ? 'FULLY PAID' : cycleBalance > 0 ? n(cycleBalance) : `+${n(Math.abs(cycleBalance))} OVERPAID`,
        '', '', '', '', '',
      ]);
      // Blank separator between cycles
      aoa.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Truck Sales Ledger');
    XLSX.writeFile(wb, `TRUCK-SALES-LEDGER-${period}.xlsx`);
  }, [filteredSales, customerMap, rowBalances, saleTripMap, cycleNumberMap, timePreset, customFrom, customTo]);

  const activeBankAccounts = useMemo(
    () => BANK_ACCOUNTS.filter(b => b.is_active),
    [],
  );

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  const isLoading = salesQuery.isLoading || customersQuery.isLoading || truckLoadingsQuery.isLoading;

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
              title="Delivery Sales Ledger"
              description="Track payments against loaded trucks. Select a truck, set the rate, and record partial or full payments."
              actions={
                <>
                  <Button variant="outline" className="gap-2" onClick={exportExcel} disabled={filteredSales.length === 0}>
                    <Download size={16} /> Download Report
                  </Button>
                  {!readOnly && (
                    <Button className="gap-2" onClick={openPaymentDialog}>
                      <Plus size={16} /> Record Payment
                    </Button>
                  )}
                </>
              }
            />

            {/* ══════════════════════════════════════════════════════
                TRIP CODE MANAGER — create / delete trip identifiers
            ══════════════════════════════════════════════════════ */}
            {/* ══════════════════════════════════════════════════════
                FILTER PANEL — always visible, one unified card
            ══════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">

              {/* Card header */}
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
                <Filter size={15} className="text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Filter &amp; Search</span>
                {/* Active filter count */}
                {[truckFilter, locationFilter, customerFilter, depotFilter, cycleFilter, tripCodeFilter].filter(v => v !== 'all').length > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-900 text-white leading-none">
                    {[truckFilter, locationFilter, customerFilter, depotFilter, cycleFilter, tripCodeFilter].filter(v => v !== 'all').length} active
                  </span>
                )}
                {/* Clear all — only when filters are active */}
                {([truckFilter, locationFilter, customerFilter, depotFilter, cycleFilter, tripCodeFilter, searchQuery].some(v => v !== 'all' && v !== '')) && (
                  <button
                    title="Clear all filters"
                    onClick={() => {
                      setTruckFilter('all');
                      setDepotFilter('all');
                      setLocationFilter('all');
                      setCustomerFilter('all');
                      setCycleFilter('all');
                      setTripCodeFilter('all');
                      setSearchQuery('');
                    }}
                    className="ml-auto text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                  >
                    <X size={12} /> Clear all filters
                  </button>
                )}
              </div>

              <div className="p-5 space-y-5">

                {/* ── Row 1: Period selector ──────────────────────── */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarIcon size={12} /> Time Period
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['today', 'yesterday', 'week', 'month', 'year', 'all', 'custom'] as TimePreset[]).map(tp => (
                      <button
                        key={tp}
                        title={`Show ${tp === 'all' ? 'all time' : tp === 'custom' ? 'custom date range' : tp}`}
                        onClick={() => handlePresetChange(tp)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                          timePreset === tp
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        {tp === 'all' ? 'All Time' : tp === 'custom' ? 'Custom Range' : tp.charAt(0).toUpperCase() + tp.slice(1)}
                      </button>
                    ))}
                  </div>
                  {timePreset === 'custom' && (
                    <div className="flex flex-wrap gap-3 mt-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">From date</Label>
                        <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 w-[160px]" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">To date</Label>
                        <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 w-[160px]" />
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Divider ─────────────────────────────────────── */}
                <div className="border-t border-slate-100" />

                {/* ── Row 2: Dropdown filters ─────────────────────── */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Filter size={12} /> Narrow Down Results
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">

                    {/* Truck */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <Truck size={12} className="text-slate-400" /> Truck
                      </label>
                      <select
                        aria-label="Filter by truck"
                        value={truckFilter}
                        onChange={e => setTruckFilter(e.target.value)}
                        className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                          truckFilter !== 'all' ? 'border-slate-700 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        <option value="all">All Trucks</option>
                        {uniqueTruckNumbers.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    {/* Depot */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <Building2 size={12} className="text-slate-400" /> Depot (Loading Point)
                      </label>
                      <select
                        aria-label="Filter by depot"
                        value={depotFilter}
                        onChange={e => setDepotFilter(e.target.value)}
                        className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                          depotFilter !== 'all' ? 'border-slate-700 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        <option value="all">All Depots</option>
                        {uniqueDepots.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    {/* Destination */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <MapPin size={12} className="text-slate-400" /> Destination
                      </label>
                      <select
                        aria-label="Filter by destination"
                        value={locationFilter}
                        onChange={e => setLocationFilter(e.target.value)}
                        className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                          locationFilter !== 'all' ? 'border-slate-700 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        <option value="all">All Destinations</option>
                        {uniqueLocations.map(l => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>

                    {/* Customer */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <Users size={12} className="text-slate-400" /> Customer
                      </label>
                      <select
                        aria-label="Filter by customer"
                        value={customerFilter}
                        onChange={e => setCustomerFilter(e.target.value)}
                        className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                          customerFilter !== 'all' ? 'border-slate-700 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        <option value="all">All Customers</option>
                        {uniqueCustomerOptions.map(c => (
                          <option key={c.id} value={String(c.id)}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Trip Code */}
                    {tripCodes.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                          <Tag size={12} className="text-purple-400" /> Trip Code
                        </label>
                        <select
                          aria-label="Filter by trip code"
                          value={tripCodeFilter}
                          onChange={e => setTripCodeFilter(e.target.value)}
                          className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                            tripCodeFilter !== 'all' ? 'border-purple-600 font-semibold text-purple-900 bg-purple-50' : 'border-slate-200 text-slate-700'
                          }`}
                        >
                          <option value="all">All Trip Codes</option>
                          {tripCodes.map(code => {
                            const count = Object.values(saleTripMap).filter(v => v === code).length;
                            return (
                              <option key={code} value={code}>{code}{count > 0 ? ` (${count} entries)` : ''}</option>
                            );
                          })}
                        </select>
                      </div>
                    )}

                    {/* Cycle — only shown when there are multi-cycle trucks */}
                    {uniqueCycleOptions.length > 0 ? (
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                          <LayoutGrid size={12} className="text-slate-400" /> Cycle
                          <span className="text-[10px] text-slate-400 font-normal">(reload #)</span>
                        </label>
                        <select
                          aria-label="Filter by cycle number"
                          value={cycleFilter}
                          onChange={e => setCycleFilter(e.target.value)}
                          className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                            cycleFilter !== 'all' ? 'border-blue-600 font-semibold text-blue-900 bg-blue-50' : 'border-slate-200 text-slate-700'
                          }`}
                        >
                          <option value="all">All Cycles</option>
                          {uniqueCycleOptions.map(n => (
                            <option key={n} value={String(n)}>
                              Cycle {n} — {n === 1 ? 'First load' : n === 2 ? 'First reload' : `Reload #${n - 1}`}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-slate-400 leading-snug">
                          "Cycle" = how many times the same truck was loaded. Cycle 1 is the first load, Cycle 2 means the truck came back for a second load, etc.
                        </p>
                      </div>
                    ) : (
                      /* placeholder so grid stays aligned */
                      <div className="hidden xl:block" />
                    )}
                  </div>
                </div>

                {/* ── Divider ─────────────────────────────────────── */}
                <div className="border-t border-slate-100" />

                {/* ── Row 3: Search ───────────────────────────────── */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Search size={12} /> Search (keyword)
                  </p>
                  <div className="relative max-w-xl">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <Input
                      placeholder="Type any word — truck number, customer name, payer, bank, remarks…"
                      className="pl-9 h-9 text-sm"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        title="Clear search"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Active filter chips ──────────────────────────── */}
                {[
                  truckFilter !== 'all' && { label: `Truck: ${truckFilter}`, clear: () => setTruckFilter('all') },
                  depotFilter !== 'all' && { label: `Depot: ${depotFilter}`, clear: () => setDepotFilter('all') },
                  locationFilter !== 'all' && { label: `Destination: ${locationFilter}`, clear: () => setLocationFilter('all') },
                  customerFilter !== 'all' && { label: `Customer: ${uniqueCustomerOptions.find(c => String(c.id) === customerFilter)?.name || customerFilter}`, clear: () => setCustomerFilter('all') },
                  cycleFilter !== 'all' && { label: `Cycle ${cycleFilter} only`, clear: () => setCycleFilter('all') },
                  tripCodeFilter !== 'all' && { label: `Trip: ${tripCodeFilter}`, clear: () => setTripCodeFilter('all') },
                  searchQuery && { label: `Search: "${searchQuery}"`, clear: () => setSearchQuery('') },
                ].filter((x): x is { label: string; clear: () => void } => !!x).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs text-slate-400 shrink-0">You're viewing:</span>
                    {[
                      truckFilter !== 'all' && { label: `Truck: ${truckFilter}`, clear: () => setTruckFilter('all') },
                      depotFilter !== 'all' && { label: `Depot: ${depotFilter}`, clear: () => setDepotFilter('all') },
                      locationFilter !== 'all' && { label: `Destination: ${locationFilter}`, clear: () => setLocationFilter('all') },
                      customerFilter !== 'all' && { label: `Customer: ${uniqueCustomerOptions.find(c => String(c.id) === customerFilter)?.name || customerFilter}`, clear: () => setCustomerFilter('all') },
                      cycleFilter !== 'all' && { label: `Cycle ${cycleFilter} only`, clear: () => setCycleFilter('all') },
                      tripCodeFilter !== 'all' && { label: `Trip: ${tripCodeFilter}`, clear: () => setTripCodeFilter('all') },
                      searchQuery && { label: `Search: "${searchQuery}"`, clear: () => setSearchQuery('') },
                    ].filter((x): x is { label: string; clear: () => void } => !!x).map(chip => (
                      <span key={chip.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        chip.label.startsWith('Trip:') ? 'bg-purple-700 text-white' : 'bg-slate-900 text-white'
                      }`}>
                        {chip.label}
                        <button title={`Remove: ${chip.label}`} onClick={chip.clear} className="hover:text-slate-300 ml-0.5">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* ── Results summary line ─────────────────────────── */}
                {/* ── Trip Codes ───────────────────────────────────── */}
                <div className="border-t border-slate-100" />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 shrink-0">
                      <Tag size={11} className="text-purple-400" /> Trip Codes
                    </span>
                    {tripCodes.map(code => {
                      const count = Object.values(saleTripMap).filter(v => v === code).length;
                      return (
                        <span key={code} className="inline-flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setTripCodeFilter(prev => prev === code ? 'all' : code)}
                            className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                              tripCodeFilter === code
                                ? 'bg-purple-700 text-white border-purple-700'
                                : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                            }`}
                          >
                            {code}{count > 0 ? ` · ${count}` : ''}
                          </button>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => deleteTripCode(code)}
                              title={`Delete ${code}`}
                              className="text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </span>
                      );
                    })}
                    {tripCodes.length === 0 && (
                      <span className="text-xs text-slate-400 italic">No codes yet</span>
                    )}
                    {!readOnly && (
                      <span className="inline-flex items-center gap-1 ml-1">
                        <input
                          placeholder="+ new code"
                          className="h-6 px-2 text-xs rounded border border-dashed border-slate-300 bg-transparent focus:outline-none focus:border-purple-400 w-24 uppercase"
                          value={newTripCodeInput}
                          onChange={e => setNewTripCodeInput(e.target.value.toUpperCase())}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTripCode(); } }}
                        />
                        <button
                          type="button"
                          onClick={addTripCode}
                          className="text-xs text-purple-500 hover:text-purple-700 font-medium transition-colors"
                        >
                          Add
                        </button>
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Results summary line ─────────────────────────── */}
                <p className="text-xs text-slate-400">
                  {filteredSales.length === allSales.length
                    ? <>Showing all <strong className="text-slate-600">{allSales.length}</strong> entries for <strong className="text-slate-600">{periodLabel}</strong>.</>
                    : <>Showing <strong className="text-slate-600">{filteredSales.length}</strong> of <strong className="text-slate-600">{allSales.length}</strong> total entries · <strong className="text-slate-600">{periodLabel}</strong>. Adjust or clear filters to see more.</>
                  }
                </p>

              </div>
            </div>

            {/* ── Summary Cards ─────────────────────────────────────── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Table ───────────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : filteredSales.length === 0 ? (
                <div className="p-10 text-center">
                  <Truck className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No payment entries found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {allSales.length > 0
                      ? 'Adjust your filters or period.'
                      : 'Click "Record Payment" to add the first entry.'}
                  </p>
                </div>
              ) : (
                <>
                  {selectedRows.size > 0 && (
                    <div className="bg-purple-50 border-b border-purple-200 px-4 py-2.5 flex flex-wrap items-center gap-3">
                      <span className="text-xs font-semibold text-purple-700">
                        {selectedRows.size} {selectedRows.size === 1 ? 'entry' : 'entries'} selected
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-purple-600">Assign trip code:</span>
                        <select
                          title="Assign trip code"
                          value={bulkTripCode}
                          onChange={e => setBulkTripCode(e.target.value)}
                          className="h-7 text-xs rounded border border-purple-300 bg-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400"
                        >
                          <option value="">Select…</option>
                          {tripCodes.map(c => <option key={c} value={c}>{c}</option>)}
                          <option value="__remove__">— Remove tag</option>
                        </select>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-purple-600 hover:bg-purple-700 px-3 py-0"
                          disabled={!bulkTripCode}
                          onClick={bulkAssignTripCode}
                        >
                          Apply
                        </Button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedRows(new Set())}
                        className="ml-auto text-xs text-purple-500 hover:text-purple-700 flex items-center gap-1 transition-colors"
                      >
                        <X size={11} /> Deselect all
                      </button>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="w-[36px] pl-3">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 cursor-pointer"
                            checked={filteredSales.length > 0 && filteredSales.every(s => selectedRows.has(s.id))}
                            onChange={e => {
                              if (e.target.checked) setSelectedRows(new Set(filteredSales.map(s => s.id)));
                              else setSelectedRows(new Set());
                            }}
                            title="Select all visible"
                          />
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[48px]">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700">Truck</TableHead>
                        <TableHead className="font-semibold text-purple-700">Trip Code</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date Loaded</TableHead>
                        <TableHead className="font-semibold text-slate-700">Depot</TableHead>
                        <TableHead className="font-semibold text-slate-700">Destination</TableHead>
                        <TableHead className="font-semibold text-slate-700">Customer</TableHead>
                        <TableHead className="font-semibold text-slate-700">Quantity</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Rate</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Expected</TableHead>
                        <TableHead className="font-semibold text-emerald-700 text-right">Payment</TableHead>
                        <TableHead className="font-semibold text-red-700 text-right">Balance</TableHead>
                        <TableHead className="font-semibold text-slate-700">Payer</TableHead>
                        <TableHead className="font-semibold text-slate-700">Bank</TableHead>
                        <TableHead className="font-semibold text-slate-700">Paid On</TableHead>
                        <TableHead className="font-semibold text-slate-700">Remarks</TableHead>
                        <TableHead className="font-semibold text-slate-700">Entered By</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        let globalIdx = 0;
                        const rows: React.ReactNode[] = [];

                        groupedByCycle.forEach((entries, cycleKey) => {
                          const isCollapsed = collapsedTrucks.has(cycleKey);
                          const firstEntry = entries[0];
                          const truckNum = firstEntry?.truck_number || cycleKey.split('||')[0];
                          const cycleInfo = cycleNumberMap.get(cycleKey);

                          // Per-cycle totals for the group header
                          const perCustMaxSv  = new Map<number, number>();
                          const perCustMaxQty = new Map<number, number>();
                          let cyclePaid = 0;
                          entries.forEach(s => {
                            const sv = toNum(s.sales_value);
                            const q  = toNum(s.quantity);
                            if (sv > 0) perCustMaxSv.set(s.customer,  Math.max(perCustMaxSv.get(s.customer)  ?? 0, sv));
                            if (q  > 0) perCustMaxQty.set(s.customer, Math.max(perCustMaxQty.get(s.customer) ?? 0, q));
                            cyclePaid += toNum(s.payment_amount);
                          });
                          let cycleExpected = 0; perCustMaxSv.forEach(v => { cycleExpected += v; });
                          let cycleQty = 0;      perCustMaxQty.forEach(v => { cycleQty += v; });
                          const cycleBalance = cycleExpected - cyclePaid;

                          // ── Cycle group header row ──────────────────────────
                          rows.push(
                            <TableRow
                              key={`group-${cycleKey}`}
                              className="bg-slate-100 hover:bg-slate-200/70 cursor-pointer select-none border-t-2 border-slate-300"
                              onClick={() => toggleTruck(cycleKey)}
                            >
                              {/* Checkbox — group select */}
                              <TableCell className="pl-3" onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="rounded border-slate-300 cursor-pointer"
                                  checked={entries.length > 0 && entries.every(s => selectedRows.has(s.id))}
                                  onChange={e => {
                                    setSelectedRows(prev => {
                                      const next = new Set(prev);
                                      if (e.target.checked) entries.forEach(s => next.add(s.id));
                                      else entries.forEach(s => next.delete(s.id));
                                      return next;
                                    });
                                  }}
                                  title="Select all in this group"
                                />
                              </TableCell>
                              {/* S/N — collapse toggle */}
                              <TableCell className="w-[48px]">
                                <span className="text-slate-500 text-xs">{isCollapsed ? '▶' : '▼'}</span>
                              </TableCell>
                              {/* Truck */}
                              <TableCell className="font-bold text-slate-900 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <Truck size={14} className="text-slate-500" />
                                  {truckNum}
                                  {cycleInfo && cycleInfo.totalCycles > 1 && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                                      Cycle {cycleInfo.cycleNum}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              {/* Trip Code */}
                              <TableCell>
                                {(() => {
                                  const cycleTripCode = entries.find(s => saleTripMap[s.id])
                                    ? (saleTripMap[entries.find(s => saleTripMap[s.id])!.id] || '')
                                    : '';
                                  return cycleTripCode
                                    ? (
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); setTripCodeFilter(prev => prev === cycleTripCode ? 'all' : cycleTripCode); }}
                                        title={`Filter by trip code ${cycleTripCode}`}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-colors ${
                                          tripCodeFilter === cycleTripCode
                                            ? 'bg-purple-700 text-white border-purple-700'
                                            : 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200'
                                        }`}
                                      >
                                        <Tag size={10} /> {cycleTripCode}
                                      </button>
                                    )
                                    : <span className="text-slate-400 text-xs">—</span>;
                                })()}
                              </TableCell>
                              {/* Date Loaded */}
                              <TableCell className="text-slate-600 text-sm font-medium whitespace-nowrap">
                                {firstEntry?.date_loaded ? format(parseISO(firstEntry.date_loaded), 'dd MMM yyyy') : '—'}
                              </TableCell>
                              {/* Depot */}
                              <TableCell className="text-slate-600 text-sm font-medium">
                                {firstEntry?.depot_loaded || '—'}
                              </TableCell>
                              {/* Destination */}
                              <TableCell className="text-slate-600 text-sm">
                                {[...new Set(entries.map(s => s.location || ''))].filter(Boolean).join(', ') || '—'}
                              </TableCell>
                              {/* Customer */}
                              <TableCell className="text-slate-700 text-sm">
                                {[...new Set(entries.map(s => s.customer_name || customerMap.get(s.customer)?.customer_name || ''))].filter(Boolean).join(', ') || '—'}
                              </TableCell>
                              {/* Quantity */}
                              <TableCell className="text-slate-700 text-sm font-medium">
                                {cycleQty > 0 ? `${fmtQty(cycleQty)} L` : '—'}
                              </TableCell>
                              {/* Rate — blank for group */}
                              <TableCell />
                              {/* Expected */}
                              <TableCell className="text-right font-bold text-slate-800">
                                {cycleExpected > 0 ? fmt(cycleExpected) : '—'}
                              </TableCell>
                              {/* Payment */}
                              <TableCell className="text-right font-bold text-emerald-700">
                                {cyclePaid > 0 ? fmt(cyclePaid) : '—'}
                              </TableCell>
                              {/* Balance */}
                              <TableCell className={`text-right font-bold ${
                                cycleBalance > 0 ? 'text-red-600' : cycleBalance < 0 ? 'text-blue-600' : cycleExpected > 0 ? 'text-emerald-600' : 'text-slate-400'
                              }`}>
                                {cycleExpected > 0
                                  ? (cycleBalance === 0 ? 'Fully Paid ✓' : cycleBalance > 0 ? fmt(cycleBalance) : `+${fmt(Math.abs(cycleBalance))} over`)
                                  : '—'}
                              </TableCell>
                              {/* Payer, Bank, Paid On, Remarks, Entered By, Actions — blank */}
                              <TableCell colSpan={6} />
                            </TableRow>
                          );

                          // ── Individual entry rows (hidden when collapsed) ───
                          if (!isCollapsed) {
                            entries.forEach(s => {
                              globalIdx += 1;
                              const custName = s.customer_name || customerMap.get(s.customer)?.customer_name || `#${s.customer}`;
                              const custObj  = customerMap.get(s.customer);
                              const isFSRow  = isFillingStation(custObj);
                              const sv       = toNum(s.sales_value);
                              const pa       = toNum(s.payment_amount);
                              const balance  = rowBalances.get(s.id) ?? (sv - pa);
                              const showBalance = !(isFSRow && sv === 0);
                              const isPaidOff   = balance <= 0 && sv > 0;

                              rows.push(
                                <TableRow
                                  key={s.id}
                                  className={`hover:bg-slate-50/60 transition-colors ${
                                    pa > 0 ? 'bg-emerald-50/30' : ''
                                  } ${isPaidOff ? 'bg-green-50/40' : ''}`}
                                >
                                  {/* Checkbox */}
                                  <TableCell className="pl-3">
                                    <input
                                      type="checkbox"
                                      title="Select row"
                                      className="rounded border-slate-300 cursor-pointer"
                                      checked={selectedRows.has(s.id)}
                                      onChange={e => {
                                        setSelectedRows(prev => {
                                          const next = new Set(prev);
                                          if (e.target.checked) next.add(s.id); else next.delete(s.id);
                                          return next;
                                        });
                                      }}
                                    />
                                  </TableCell>
                                  {/* S/N */}
                                  <TableCell className="text-center text-slate-400 pl-6">{globalIdx}</TableCell>
                                  {/* Truck — indented, already shown in header */}
                                  <TableCell className="text-slate-500 pl-6">
                                    <span className="text-xs text-slate-400">{s.truck_number}</span>
                                  </TableCell>
                                  {/* Trip Code */}
                                  <TableCell>
                                    {saleTripMap[s.id]
                                      ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">
                                          <Tag size={9} /> {saleTripMap[s.id]}
                                        </span>
                                      )
                                      : <span className="text-slate-300 text-xs">—</span>
                                    }
                                  </TableCell>
                                  {/* Date Loaded */}
                                  <TableCell className="text-slate-600 whitespace-nowrap text-sm">
                                    {s.date_loaded ? format(parseISO(s.date_loaded), 'dd MMM yyyy') : '—'}
                                  </TableCell>
                                  {/* Depot */}
                                  <TableCell className="text-slate-700">{s.depot_loaded || '—'}</TableCell>
                                  {/* Destination */}
                                  <TableCell className="text-slate-700 whitespace-nowrap text-sm">{s.location || '—'}</TableCell>
                                  {/* Customer */}
                                  <TableCell className="font-medium text-slate-900 whitespace-nowrap">{custName}</TableCell>
                                  {/* Quantity */}
                                  <TableCell className="text-slate-700">
                                    {toNum(s.quantity) > 0 ? `${fmtQty(toNum(s.quantity))} L` : '—'}
                                  </TableCell>
                                  {/* Rate */}
                                  <TableCell className="text-right text-slate-700">
                                    {toNum(s.rate) > 0 ? fmt(toNum(s.rate)) : '—'}
                                  </TableCell>
                                  {/* Expected */}
                                  <TableCell className="text-right font-medium text-slate-800">
                                    {sv > 0 ? fmt(sv) : '—'}
                                  </TableCell>
                                  {/* Payment */}
                                  <TableCell className="text-right font-bold text-emerald-700">
                                    {pa > 0 ? fmt(pa) : '—'}
                                  </TableCell>
                                  {/* Balance */}
                                  <TableCell className={`text-right font-bold ${
                                    !showBalance ? 'text-slate-400' :
                                    balance > 0 ? 'text-red-600' : balance < 0 ? 'text-blue-600' : 'text-emerald-600'
                                  }`}>
                                    {!showBalance ? '—' : balance !== 0 ? fmt(balance) : (sv > 0 ? 'Fully Paid ✓' : '—')}
                                  </TableCell>
                                  {/* Payer */}
                                  <TableCell className="text-slate-700 whitespace-nowrap">
                                    {s.payer_name ? (
                                      <div>
                                        <p className="font-medium uppercase">{s.payer_name}</p>
                                        {s.phone_number && <p className="text-xs text-slate-500">{s.phone_number}</p>}
                                      </div>
                                    ) : s.phone_number
                                      ? <span className="text-xs text-slate-500">{s.phone_number}</span>
                                      : <span className="text-slate-400">—</span>
                                    }
                                  </TableCell>
                                  {/* Bank */}
                                  <TableCell className="text-sm max-w-[160px]">
                                    {s.bank ? (() => {
                                      const parts = s.bank.split(' · ');
                                      return (
                                        <div>
                                          <p className="font-semibold text-black">{parts[0]}</p>
                                          {parts[1] && <p className="text-xs text-slate-600">{parts[1]}</p>}
                                        </div>
                                      );
                                    })() : <span className="text-slate-400">—</span>}
                                  </TableCell>
                                  {/* Paid On */}
                                  <TableCell className="text-slate-600 whitespace-nowrap text-sm">
                                    {s.date_of_payment ? format(parseISO(s.date_of_payment), 'dd MMM yyyy') : '—'}
                                  </TableCell>
                                  {/* Remarks */}
                                  <TableCell>
                                    {s.remarks
                                      ? <span className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                                          s.remarks.toLowerCase().includes('full') ? 'text-emerald-700 bg-emerald-50' :
                                          s.remarks.toLowerCase().includes('partial') ? 'text-amber-700 bg-amber-50' :
                                          'text-slate-600 bg-slate-50'
                                        }`}>{s.remarks}</span>
                                      : <span className="text-slate-400">—</span>
                                    }
                                  </TableCell>
                                  {/* Entered By */}
                                  <TableCell className="text-slate-600 whitespace-nowrap text-sm">
                                    {s.entered_by || '—'}
                                  </TableCell>
                                  {/* Actions */}
                                  <TableCell>
                                    <div className="flex gap-1">
                                      {!readOnly && (
                                        <Button size="sm" variant="ghost"
                                          className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                          title="Edit entry" onClick={() => openEditDialog(s)}>
                                          <Pencil size={14} />
                                        </Button>
                                      )}
                                      {!readOnly && (
                                        <Button size="sm" variant="ghost"
                                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                          title="Delete entry"
                                          onClick={() => setDeleteTarget({ id: s.id, label: `${s.truck_number} — ${pa > 0 ? fmt(pa) : 'entry'}` })}>
                                          <Trash2 size={14} />
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            });
                          }
                        });

                        return rows;
                      })()}
                    </TableBody>
                  </Table>
                </div>
                </>
              )}
            </div>

            {/* {!isLoading && filteredSales.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {filteredSales.length} of {allSales.length} entries · Period: {periodLabel}
              </p>
            )} */}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Record Payment Dialog                                          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Banknote className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Record Payment</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  Select a loaded truck, then add one row per customer with their rate and payment details.
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Record payments against a loaded truck</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* ── Truck Selector ─────────────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Truck size={15} className="text-slate-500" /> Select Loaded Truck <span className="text-red-500">*</span>
              </Label>
              <select
                aria-label="Select loaded truck"
                value={dialogTruckLoadingId}
                onChange={e => handleTruckSelect(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a truck…</option>
                {loadedTrucks.map(t => {
                  const plate = t.truck_number || `Truck #${t.truck}`;
                  const custName = t.customer_name || (t.customer ? customerMap.get(t.customer)?.customer_name : '') || '';
                  const qty = toNum(t.quantity_allocated);
                  const statusLabel = t.loading_status === 'offloaded' ? ' [Offloaded]' : '';
                  return (
                    <option key={t.id} value={String(t.id)}>
                      {plate} — {fmtQty(qty)} L{custName ? ` → ${custName}` : ''}{statusLabel}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* ── Auto-filled truck header ───────────────────────────── */}
            {dialogTruckNumber && (
              <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3">
                {/* <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">
                  Truck Details
                </p> */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <span className="text-slate-500 text-xs">Truck:</span>{' '}
                    <span className="font-bold text-slate-800">{dialogTruckNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Depot Loaded:</span>{' '}
                    <span className="font-medium text-slate-800">{dialogDepot || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Date Loaded:</span>{' '}
                    <span className="font-medium text-slate-800">
                      {dialogDateLoaded ? format(parseISO(dialogDateLoaded), 'dd MMM yyyy') : '—'}
                    </span>
                  </div>
                  {(() => {
                    // Show cycle-specific outstanding, plus truck-total if there are multiple cycles
                    const cycleKey = getCycleKey(dialogTruckNumber, dialogDateLoaded);
                    const cycle = cyclePaymentSummary.get(cycleKey);
                    const truckTotals = truckPaymentSummary.get(dialogTruckNumber);
                    const cycleInfo = cycleNumberMap.get(cycleKey);
                    if (!cycle && !truckTotals) return null;
                    const cycleBal = cycle ? cycle.totalExpected - cycle.totalPaid : null;
                    const truckBal = truckTotals ? truckTotals.totalExpected - truckTotals.totalPaid : null;
                    return (
                      <>
                        {cycleBal !== null && (
                          <div>
                            <span className="text-slate-500 text-xs">
                              {cycleInfo && cycleInfo.totalCycles > 1 ? `Cycle ${cycleInfo.cycleNum} Outstanding:` : 'Outstanding:'}
                            </span>{' '}
                            <span className={`font-bold ${cycleBal > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {cycleBal > 0 ? fmt(cycleBal) : '✓ Paid'}
                            </span>
                          </div>
                        )}
                        {cycleInfo && cycleInfo.totalCycles > 1 && truckBal !== null && (
                          <div>
                            <span className="text-slate-500 text-xs">All {cycleInfo.totalCycles} Cycles Total:</span>{' '}
                            <span className={`font-bold ${truckBal > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                              {truckBal > 0 ? fmt(truckBal) : '✓ Fully settled'}
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── Cycle / Date Loaded selector ──────────────────────── */}
            {/* ── Trip Code selector ─────────────────────────────── */}
            {dialogTruckNumber && tripCodes.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Tag size={14} className="text-purple-500" /> Trip Code
                  <span className="text-xs text-slate-400 font-normal">(optional — tag these entries with a trip ID)</span>
                </Label>
                <select
                  aria-label="Select trip code"
                  value={dialogTripCode}
                  onChange={e => setDialogTripCode(e.target.value)}
                  className={`h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ${
                    dialogTripCode ? 'border-purple-500 bg-purple-50 text-purple-900 font-semibold' : 'border-input'
                  }`}
                >
                  <option value="">No trip code (skip)</option>
                  {tripCodes.map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
                {dialogTripCode && (
                  <p className="text-xs text-purple-600 flex items-center gap-1">
                    <Tag size={10} /> All entries in this batch will be tagged as <strong>{dialogTripCode}</strong>.
                  </p>
                )}
              </div>
            )}

            {/* ── Per-customer rows ─────────────────────────────────── */}
            {dialogTruckNumber && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Customer ({saleRows.length})
                  </p>
                  <Button
                    type="button" variant="outline" size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={addSaleRow}
                  >
                    <UserPlus size={13} /> Add Customer
                  </Button>
                </div>

                {saleRows.map((row, idx) => {
                  const custObj = row.customer ? customerMap.get(Number(row.customer)) : null;
                  const isFS = isFillingStation(custObj);
                  const hasError = rowErrors[row.uid] && Object.keys(rowErrors[row.uid]).length;

                  return (
                  <div
                    key={row.uid}
                    className={`border rounded-lg p-3 space-y-3 relative ${hasError ? 'border-red-300 bg-red-50/30' : isFS ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200 bg-slate-50/50'}`}
                  >
                    {/* Row header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        {isFS ? <Fuel size={12} className="text-amber-500" /> : null}
                        Customer #{idx + 1}
                        {isFS && (
                          <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 normal-case tracking-normal">
                            Filling Station
                          </span>
                        )}
                      </span>
                      {saleRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSaleRow(row.uid)}
                          className="text-slate-400 hover:text-red-500 transition-colors p-0.5 rounded"
                          title="Remove row"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>

                    {/* Customer + Destination + Qty — always shown */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Customer <span className="text-red-500">*</span></Label>
                        <select
                          aria-label={`Customer for row ${idx + 1}`}
                          value={row.customer}
                          onChange={e => {
                            const custId = e.target.value;
                            const cust = custId ? customerMap.get(Number(custId)) : null;
                            updateSaleRow(row.uid, 'customer', custId);
                            if (cust) updateSaleRow(row.uid, 'customer_name', cust.customer_name);
                          }}
                          className={`h-9 w-full rounded-md border bg-background px-3 py-2 text-sm ${rowErrors[row.uid]?.customer ? 'border-red-400 bg-red-50' : 'border-input'}`}
                        >
                          <option value="">Select customer…</option>
                          {customers.map(c => (
                            <option key={c.id} value={String(c.id)}>{c.customer_name}</option>
                          ))}
                        </select>
                        {rowErrors[row.uid]?.customer && <p className="text-[11px] text-red-500">{rowErrors[row.uid].customer}</p>}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Destination <span className="text-red-500">*</span></Label>
                        <Input
                          placeholder="e.g. Kano, Abuja…"
                          className={`h-9 text-sm ${rowErrors[row.uid]?.location ? 'border-red-400 bg-red-50' : ''}`}
                          value={row.location}
                          onChange={e => updateSaleRow(row.uid, 'location', e.target.value)}
                        />
                        {rowErrors[row.uid]?.location && <p className="text-[11px] text-red-500">{rowErrors[row.uid].location}</p>}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Quantity (L)</Label>
                        <Input
                          type="text" inputMode="decimal" placeholder="e.g. 33,000"
                          className="h-9 text-sm"
                          value={row.quantity}
                          onChange={e => updateSaleRow(row.uid, 'quantity', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Filling station hint — no rate/payment fields shown */}
                    {isFS && (
                      <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                        <Fuel size={14} className="text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-700">
                          <span className="font-semibold">Filling Station</span> — only quantity is recorded now. You can edit this entry later to add the rate, total revenue and payment details once the station has sold.
                        </p>
                      </div>
                    )}

                    {/* Rate + Expected + Payment — regular customers only */}
                    {!isFS && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600 flex items-center gap-1">
                            Rate (₦/L) <span className="text-red-500">*</span>
                            {row.rateLocked && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                <FileText size={9} /> Locked
                              </span>
                            )}
                          </Label>
                          <Input
                            type="text" inputMode="decimal" placeholder="e.g. 1,210"
                            className={`h-9 text-sm ${row.rateLocked ? 'bg-amber-50 text-amber-800 font-semibold cursor-not-allowed' : rowErrors[row.uid]?.rate ? 'border-red-400 bg-red-50' : ''}`}
                            value={row.rate}
                            readOnly={row.rateLocked}
                            onChange={e => updateSaleRow(row.uid, 'rate', e.target.value)}
                            title={row.rateLocked ? `Rate locked at ₦${row.rate}/L from first entry for this customer` : undefined}
                          />
                          {rowErrors[row.uid]?.rate && <p className="text-[11px] text-red-500">{rowErrors[row.uid].rate}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Expected (₦)</Label>
                          <Input
                            readOnly
                            className="h-9 text-sm bg-white font-semibold text-slate-700"
                            value={row.sales_value ? `₦${row.sales_value}` : '—'}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Amount Paid (₦)</Label>
                          <Input
                            type="text" inputMode="decimal"
                            className="h-9 text-sm"
                            value={row.payment_amount}
                            onChange={e => updateSaleRow(row.uid, 'payment_amount', e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {/* Payment date + Payer + Bank — regular customers only */}
                    {!isFS && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">
                            <CalendarIcon size={11} className="inline mr-1" />Date of Payment <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            type="date"
                            className={`h-9 text-sm ${rowErrors[row.uid]?.date_of_payment ? 'border-red-400 bg-red-50' : ''}`}
                            value={row.date_of_payment}
                            onChange={e => updateSaleRow(row.uid, 'date_of_payment', e.target.value)}
                          />
                          {rowErrors[row.uid]?.date_of_payment && <p className="text-[11px] text-red-500">{rowErrors[row.uid].date_of_payment}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Payer's Name</Label>
                          <Input
                            className={`h-9 text-sm ${rowErrors[row.uid]?.payer_name ? 'border-red-400 bg-red-50' : ''}`}
                            value={row.payer_name}
                            onChange={e => {
                              const cleaned = e.target.value.replace(/[0-9]/g, '');
                              updateSaleRow(row.uid, 'payer_name', cleaned);
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">
                            <Building2 size={11} className="inline mr-1" />Bank Account <span className="text-red-500">*</span>
                          </Label>
                          <select
                            aria-label={`Bank account for row ${idx + 1}`}
                            value={row.bank_account_id}
                            onChange={e => updateSaleRow(row.uid, 'bank_account_id', e.target.value)}
                            className={`h-9 w-full rounded-md border bg-background px-3 py-2 text-sm ${rowErrors[row.uid]?.bank_account_id ? 'border-red-400 bg-red-50' : 'border-input'}`}
                          >
                            <option value="">Select account…</option>
                            {activeBankAccounts.map(b => (
                              <option key={b.id} value={String(b.id)}>
                                {b.account_number} · {b.bank_name}
                              </option>
                            ))}
                          </select>
                          {rowErrors[row.uid]?.bank_account_id && <p className="text-[11px] text-red-500">{rowErrors[row.uid].bank_account_id}</p>}
                        </div>
                      </div>
                    )}

                    {/* Phone + Remarks — always shown */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Phone Number</Label>
                        <Input
                          placeholder="e.g. 08012345678"
                          className="h-9 text-sm"
                          value={row.phone_number}
                          onChange={e => updateSaleRow(row.uid, 'phone_number', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Remarks</Label>
                        <Input
                          placeholder={isFS ? 'e.g. Awaiting sale…' : 'e.g. Partial Payment, Full Payment…'}
                          className="h-9 text-sm"
                          value={row.remarks}
                          onChange={e => updateSaleRow(row.uid, 'remarks', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  );
                })}

                {/* ── Grand Total Summary ──────────────────────────── */}
                {(() => {
                  const grandExpected = saleRows.reduce((s, r) => s + (Number(stripCommas(r.sales_value)) || 0), 0);
                  const grandPayment = saleRows.reduce((s, r) => s + (Number(stripCommas(r.payment_amount)) || 0), 0);
                  // Use cycle-scoped previously-paid (not whole-truck)
                  const cycleKey = getCycleKey(dialogTruckNumber, dialogDateLoaded);
                  const cycle = cyclePaymentSummary.get(cycleKey);
                  const previouslyPaid = cycle?.totalPaid || 0;
                  if (!grandExpected && !grandPayment) return null;
                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mt-1">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Grand Total (all rows)</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        {grandExpected > 0 && (
                          <div>
                            <p className="text-xs text-slate-400">Total Expected</p>
                            <p className="font-bold text-slate-800">{fmt(grandExpected)}</p>
                          </div>
                        )}
                        {grandPayment > 0 && (
                          <div>
                            <p className="text-xs text-slate-400">This Payment</p>
                            <p className="font-bold text-emerald-700">{fmt(grandPayment)}</p>
                          </div>
                        )}
                        {previouslyPaid > 0 && (
                          <div>
                            <p className="text-xs text-slate-400">Previously Paid</p>
                            <p className="font-medium text-slate-600">{fmt(previouslyPaid)}</p>
                          </div>
                        )}
                        {grandExpected > 0 && (
                          <div>
                            <p className="text-xs text-slate-400">Balance After</p>
                            {(() => {
                              const bal = grandExpected - previouslyPaid - grandPayment;
                              return (
                                <p className={`font-bold ${bal > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {bal > 0 ? fmt(bal) + ' remaining' : '✓ Fully paid'}
                                </p>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Saving…' : `Record ${saleRows.filter(r => r.customer).length || ''} Payment${saleRows.filter(r => r.customer).length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Edit Entry Dialog                                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!editTarget} onOpenChange={open => { if (!open) { setEditTarget(null); setEditForm(null); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Pencil className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Edit Entry</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  {editTarget?.truck_number} — {editTarget ? (editTarget.customer_name || `Customer #${editTarget.customer}`) : ''}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Edit a sales ledger entry</DialogDescription>
          </DialogHeader>

          {editForm && editTarget && (() => {
            const rateIsLocked = toNum(editTarget.rate) > 0;
            const dopIsLocked  = !!editTarget.date_of_payment;

            // All known loading dates for this truck — from inventory records
            const truckCycleDates = truckLoadingDates.get(editTarget.truck_number) || [];
            // Also include the entry's current date_loaded if not already in the list
            const allEditDates = editTarget.date_loaded && !truckCycleDates.includes(editTarget.date_loaded)
              ? [...truckCycleDates, editTarget.date_loaded].sort()
              : truckCycleDates;
            const editIsCustomDate = editForm.date_loaded !== '' &&
              !allEditDates.includes(editForm.date_loaded) &&
              editForm.date_loaded !== editTarget.date_loaded;

            return (
            <div className="space-y-4 py-2">
              {/* Info banner for filling-station rows with no rate yet */}
              {(!toNum(editTarget.rate) || !toNum(editTarget.sales_value)) && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <Fuel size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">
                    This entry has no rate or revenue yet — fill them in below now that the station has sold.
                  </p>
                </div>
              )}
              {/* Lock notice */}
              {/* {(rateIsLocked || dopIsLocked) && (
                <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-400 mt-0.5 shrink-0">🔒</span>
                  <p className="text-xs text-slate-500">
                    {[
                      rateIsLocked && 'Rate is locked once set.',
                      dopIsLocked  && 'Date of payment is locked once recorded.',
                    ].filter(Boolean).join(' ')}
                  </p>
                </div>
              )} */}

              {/* Cycle / Date Loaded — always visible */}
              {/* Row 1: Destination + Qty */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Destination</Label>
                  <Input
                    value={editForm.location}
                    onChange={e => setEditForm(f => f ? { ...f, location: e.target.value } : f)}
                    className="h-9 text-sm"
                    placeholder="e.g. Kano"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Quantity (L)</Label>
                  <Input
                    type="text" inputMode="decimal"
                    value={editForm.quantity}
                    onChange={e => {
                      const qty = formatWithCommas(e.target.value);
                      const r = Number(stripCommas(editForm.rate)) || 0;
                      const q = Number(stripCommas(qty)) || 0;
                      const sv = q && r ? formatWithCommas(String(q * r)) : editForm.sales_value;
                      setEditForm(f => f ? { ...f, quantity: qty, sales_value: sv } : f);
                    }}
                    className="h-9 text-sm"
                    placeholder="e.g. 33,000"
                  />
                </div>
              </div>

              {/* Trip Code */}
              {tripCodes.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 flex items-center gap-1.5">
                    <Tag size={11} className="text-purple-500" /> Trip Code
                  </Label>
                  <select
                    aria-label="Trip code"
                    value={editTripCode}
                    onChange={e => setEditTripCode(e.target.value)}
                    className={`h-9 w-full rounded-md border bg-background px-3 py-1 text-sm ${
                      editTripCode ? 'border-purple-500 bg-purple-50 text-purple-900 font-semibold' : 'border-input'
                    }`}
                  >
                    <option value="">No trip code</option>
                    {tripCodes.map(code => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Row 2: Rate + Expected */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 flex items-center gap-1">
                    Rate (₦/L){rateIsLocked && <span className="text-slate-400"></span>}
                  </Label>
                  <Input
                    type="text" inputMode="decimal"
                    value={editForm.rate}
                    disabled={rateIsLocked}
                    onChange={e => {
                      if (rateIsLocked) return;
                      const rate = formatWithCommas(e.target.value);
                      const r = Number(stripCommas(rate)) || 0;
                      const q = Number(stripCommas(editForm.quantity)) || 0;
                      const sv = q && r ? formatWithCommas(String(q * r)) : editForm.sales_value;
                      setEditForm(f => f ? { ...f, rate, sales_value: sv } : f);
                    }}
                    className={`h-9 text-sm ${rateIsLocked ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
                    placeholder="e.g. 1,210"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Total Expected (₦)</Label>
                  <Input
                    type="text" inputMode="decimal"
                    value={editForm.sales_value}
                    onChange={e => setEditForm(f => f ? { ...f, sales_value: formatWithCommas(e.target.value) } : f)}
                    className="h-9 text-sm font-semibold"
                    placeholder="Auto-computed or manual"
                  />
                </div>
              </div>

              {/* Row 3: Payment + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Amount Paid (₦)</Label>
                  <Input
                    type="text" inputMode="decimal"
                    value={editForm.payment_amount}
                    onChange={e => setEditForm(f => f ? { ...f, payment_amount: formatWithCommas(e.target.value) } : f)}
                    className="h-9 text-sm"
                    placeholder="e.g. 5,000,000"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 flex items-center gap-1">
                    Date of Payment{dopIsLocked && <FileText size={10} className="text-slate-400" />}
                  </Label>
                  <Input
                    type="date"
                    value={editForm.date_of_payment}
                    disabled={dopIsLocked}
                    onChange={e => {
                      if (dopIsLocked) return;
                      setEditForm(f => f ? { ...f, date_of_payment: e.target.value } : f);
                    }}
                    className={`h-9 text-sm ${dopIsLocked ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>

              {/* Row 4: Payer + Bank */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Payer's Name</Label>
                  <Input
                    value={editForm.payer_name}
                    onChange={e => setEditForm(f => f ? { ...f, payer_name: e.target.value.replace(/[0-9]/g, '') } : f)}
                    className="h-9 text-sm"
                    placeholder="Name only"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Bank Account</Label>
                  <select
                    aria-label="Bank account"
                    value={editForm.bank_account_id}
                    onChange={e => setEditForm(f => f ? { ...f, bank_account_id: e.target.value } : f)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">Select account…</option>
                    {BANK_ACCOUNTS.filter(b => b.is_active).map(b => (
                      <option key={b.id} value={String(b.id)}>
                        {b.account_number} · {b.bank_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 5: Phone + Remarks */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Phone Number</Label>
                  <Input
                    value={editForm.phone_number}
                    onChange={e => setEditForm(f => f ? { ...f, phone_number: e.target.value } : f)}
                    className="h-9 text-sm"
                    placeholder="e.g. 08012345678"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Remarks</Label>
                  <Input
                    value={editForm.remarks}
                    onChange={e => setEditForm(f => f ? { ...f, remarks: e.target.value } : f)}
                    className="h-9 text-sm"
                    placeholder="e.g. Full Payment"
                  />
                </div>
              </div>

              {/* Live balance preview */}
              {editForm.sales_value && (
                (() => {
                  const sv = Number(stripCommas(editForm.sales_value)) || 0;
                  const pa = Number(stripCommas(editForm.payment_amount)) || 0;
                  // Sum all other payments for this truck+customer (excluding this entry)
                  const otherPaid = allSales
                    .filter(s => s.id !== editTarget.id && s.truck_number === editTarget.truck_number && s.customer === editTarget.customer)
                    .reduce((sum, s) => sum + toNum(s.payment_amount), 0);
                  const bal = sv - pa - otherPaid;
                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-400">Expected</p>
                        <p className="font-bold text-slate-800">{sv > 0 ? fmt(sv) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Total Paid</p>
                        <p className="font-bold text-emerald-700">{fmt(pa + otherPaid)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Balance</p>
                        <p className={`font-bold ${bal > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {bal > 0 ? fmt(bal) : '✓ Fully paid'}
                        </p>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
            );
          })()}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditForm(null); }} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving} className="gap-2">
              {editSaving ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
              {editSaving ? 'Saving…' : 'Save Changes'}
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
              <span>Confirm Delete</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Are you sure you want to delete <strong>{deleteTarget?.label}</strong>? This action cannot be undone.
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
