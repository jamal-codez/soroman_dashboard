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
  Clock, Link2, ArrowRightLeft,
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
  allocation_code?: string | null;
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
  allocation_code?: string | null;
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

interface LedgerGroup {
  key: string;
  loadingId?: number;
  truckNumber: string;
  dateLoaded: string;
  depot: string;
  location: string;
  customerId: number | null;
  customerName: string;
  quantity: number;
  totalQtySold: number;
  rate: number;
  expected: number;
  totalPaid: number;
  balance: number;
  pfiNumber: string;
  code: string;
  payments: DeliverySale[];
  isFillingStation: boolean;
}

interface QuickPaymentForm {
  payment_amount: string;
  rate: string;
  quantity: string;
  date_of_payment: string;
  payer_name: string;
  phone_number: string;
  bank_account_id: string;
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

const CODE_PALETTE = [
  { row: 'bg-sky-50/60 border-l-sky-300', badge: 'bg-sky-100 text-sky-800 border-sky-200' },
  { row: 'bg-emerald-50/60 border-l-emerald-300', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { row: 'bg-orange-50/60 border-l-orange-300', badge: 'bg-orange-100 text-orange-800 border-orange-200' },
  { row: 'bg-violet-50/60 border-l-violet-300', badge: 'bg-violet-100 text-violet-800 border-violet-200' },
  { row: 'bg-pink-50/60 border-l-pink-300', badge: 'bg-pink-100 text-pink-800 border-pink-200' },
  { row: 'bg-amber-50/60 border-l-amber-300', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  { row: 'bg-teal-50/60 border-l-teal-300', badge: 'bg-teal-100 text-teal-800 border-teal-200' },
  { row: 'bg-indigo-50/60 border-l-indigo-300', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
];

const getCodeTheme = (code: string) => {
  if (!code) return null;
  let hash = 0;
  for (let index = 0; index < code.length; index += 1) {
    hash = (hash * 31 + code.charCodeAt(index)) >>> 0;
  }
  return CODE_PALETTE[hash % CODE_PALETTE.length];
};

const normalizeText = (value: string | undefined | null) =>
  (value || '').trim().toLowerCase();

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function FillingStations() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const readOnly = isCurrentUserReadOnly();

  // ── Filters ────────────────────────────────────────────────────────
  const [timePreset, setTimePreset] = useState<TimePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [truckFilter, setTruckFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [depotFilter, setDepotFilter] = useState<string>('all');
  const [rateFilter, setRateFilter] = useState<string>('all');
  const [cycleFilter, setCycleFilter] = useState<string>('all'); // 'all' | '1' | '2' | ...

  // ── Allocation Codes (Backend-managed) ────────────────────────────
  const [allocationCodeFilter, setAllocationCodeFilter] = useState<string>('all');
  const [editAllocationCode, setEditAllocationCode] = useState<string>('');

  // ── Cycle aliases — merge two cycle groups (frontend-only, no API call) ─────────────
  const [cycleAliasMap, setCycleAliasMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('dsl_cycle_aliases') || '{}'); } catch { return {}; }
  });
  const [mergeMode, setMergeMode] = useState(false);
  const [mergePrimary, setMergePrimary] = useState<string | null>(null);

  const [quickPaymentTarget, setQuickPaymentTarget] = useState<LedgerGroup | null>(null);
  const [quickPaymentForm, setQuickPaymentForm] = useState<QuickPaymentForm>({
    payment_amount: '',
    rate: '',
    quantity: '',
    date_of_payment: '',
    payer_name: '',
    phone_number: '',
    bank_account_id: '',
  });
  const [quickPaymentSaving, setQuickPaymentSaving] = useState(false);

  // ── Card expand/collapse ───────────────────────────────────────────
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const toggleCard = (key: string) =>
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const [setupTarget, setSetupTarget] = useState<LedgerGroup | null>(null);
  const [setupCustomer, setSetupCustomer] = useState('');
  const [setupDestination, setSetupDestination] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupTransferTargetKey, setSetupTransferTargetKey] = useState('');
  const [setupTransferAmount, setSetupTransferAmount] = useState('');
  const [setupTransferSaving, setSetupTransferSaving] = useState(false);

  // ── Delete ─────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{
    ids: number[];
    loadingId?: number;
    mode: 'entry' | 'truck';
    label: string;
  } | null>(null);
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
  // Persist cycle aliases to localStorage
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    localStorage.setItem('dsl_cycle_aliases', JSON.stringify(cycleAliasMap));
  }, [cycleAliasMap]);

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
    () => (customersQuery.data?.results || []).filter(isFillingStation),
    [customersQuery.data],
  );

  const fillingStationCustomerIds = useMemo(() => {
    return new Set(customers.map(c => c.id));
  }, [customers]);

  const salesQuery = useQuery({
    queryKey: ['delivery-sales'],
    queryFn: async () =>
      safePaged<DeliverySale>(
        await apiClient.admin.getDeliverySales({ page_size: 5000 }),
      ),
    staleTime: 30_000,
  });
  const allSales = useMemo(
    () => (salesQuery.data?.results || []).filter(s => fillingStationCustomerIds.has(s.customer)),
    [salesQuery.data, fillingStationCustomerIds],
  );

  const uniqueAllocationCodes = useMemo(() => {
    const set = new Set<string>();
    allLoadings.forEach(l => { if (l.allocation_code) set.add(l.allocation_code.trim().toUpperCase()); });
    allSales.forEach(s => { if (s.allocation_code) set.add(s.allocation_code.trim().toUpperCase()); });
    return Array.from(set).sort();
  }, [allLoadings, allSales]);

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

  const normalizeCycleDate = (dateValue: string | undefined | null): string => {
    if (!dateValue) return '';
    const raw = String(dateValue).trim();
    if (!raw) return '';
    // Normalized yyyy-MM-dd prevents splitting one physical load into fake cycles.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    try {
      return format(parseISO(raw), 'yyyy-MM-dd');
    } catch {
      return raw.split('T')[0] || raw;
    }
  };

  const getCycleKey = (truckNum: string, dateLoaded: string | undefined | null): string =>
    `${(truckNum || '').trim().toUpperCase()}||${normalizeCycleDate(dateLoaded)}`;

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

    // Second pass: totalExpected = sum of sales_value of all entries within this cycle
    map.forEach((cycle) => {
      cycle.totalExpected = cycle.entries.reduce((sum, s) => sum + toNum(s.sales_value), 0);
    });

    return map;
  }, [allSales]);



  // Cycle number per truck: Cycle 1, Cycle 2... based on real loading dates.
  const cycleNumberMap = useMemo(() => {
    const truckDatesMap = new Map<string, Set<string>>();

    allLoadings.forEach(loading => {
      const truck = (loading.truck_number || '').trim().toUpperCase();
      const date = normalizeCycleDate(loading.date_allocated || '');
      if (!truck || !date) return;
      if (!truckDatesMap.has(truck)) truckDatesMap.set(truck, new Set());
      truckDatesMap.get(truck)!.add(date);
    });

    allSales.forEach(sale => {
      const truck = (sale.truck_number || '').trim().toUpperCase();
      const date = normalizeCycleDate(sale.date_loaded || '');
      if (!truck || !date) return;
      if (!truckDatesMap.has(truck)) truckDatesMap.set(truck, new Set());
      truckDatesMap.get(truck)!.add(date);
    });

    const truckDateList = new Map<string, string[]>();
    truckDatesMap.forEach((dates, truck) => {
      truckDateList.set(truck, Array.from(dates).sort((a, b) => a.localeCompare(b)));
    });

    const map = new Map<string, { cycleNum: number; totalCycles: number }>();
    cyclePaymentSummary.forEach((cycle) => {
      const truck = (cycle.truckNumber || '').trim().toUpperCase();
      const date = normalizeCycleDate(cycle.dateLoaded || '');
      const dates = truckDateList.get(truck) || (date ? [date] : []);
      const idx = date ? dates.indexOf(date) : -1;
      map.set(getCycleKey(cycle.truckNumber, cycle.dateLoaded), {
        cycleNum: idx >= 0 ? idx + 1 : 1,
        totalCycles: Math.max(dates.length, 1),
      });
    });

    return map;
  }, [cyclePaymentSummary, allLoadings, allSales]);

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
    if (allocationCodeFilter !== 'all') {
      result = result.filter(s => s.allocation_code === allocationCodeFilter);
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
        (s.allocation_code || '').toLowerCase().includes(q),
      );
    }
    return result.sort((a, b) => {
      const dateA = a.date_of_payment || a.date_loaded || '';
      const dateB = b.date_of_payment || b.date_loaded || '';
      return dateB.localeCompare(dateA);
    });
  }, [timeFilteredSales, truckFilter, locationFilter, customerFilter, depotFilter, cycleFilter, allocationCodeFilter, searchQuery, customerMap]);

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

      // totalExpected within this cycle is the sum of daily sales values
      const totalExpected = sorted.reduce((sum, s) => sum + toNum(s.sales_value), 0);

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

  const periodLabel =
    timePreset === 'custom'
      ? `${customFrom ? format(parseISO(customFrom), 'dd MMM') : '?'} – ${customTo ? format(parseISO(customTo), 'dd MMM yyyy') : '?'}`
      : timePreset === 'all' ? 'All Time' : timePreset.charAt(0).toUpperCase() + timePreset.slice(1);

  // Group filteredSales by cycle (truck + date_loaded), preserving sort order within each group
  const groupedByCycle = useMemo(() => {
    const map = new Map<string, DeliverySale[]>();
    filteredSales.forEach(s => {
      const rawKey = getCycleKey(s.truck_number, s.date_loaded);
      // If this cycle has been aliased (merged into another), use the canonical key
      const key = cycleAliasMap[rawKey] || rawKey;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    });
    return map;
  }, [filteredSales, cycleAliasMap]);

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

  // Unique rates (₦/L) present across all filling-station sales
  const uniqueRates = useMemo(() => {
    const set = new Set<number>();
    allSales.forEach(s => { const r = toNum(s.rate); if (r > 0) set.add(r); });
    return Array.from(set).sort((a, b) => a - b);
  }, [allSales]);

  // Unique cycle numbers across all trucks — e.g. "Cycle 1", "Cycle 2"
  // Cycle 1 = a truck's first load, Cycle 2 = same truck reloaded, etc.
  const uniqueCycleOptions = useMemo(() => {
    const maxCycle = Array.from(cycleNumberMap.values()).reduce((m, v) => Math.max(m, v.cycleNum), 0);
    if (maxCycle <= 1) return []; // no multi-cycle trucks — hide the filter
    return Array.from({ length: maxCycle }, (_, i) => i + 1);
  }, [cycleNumberMap]);

  const ledgerGroups = useMemo(() => {
    const groups: LedgerGroup[] = [];
    const matchedSaleIds = new Set<number>();
    const salesByCycle = new Map<string, DeliverySale[]>();
    const salesByTruck = new Map<string, DeliverySale[]>();

    allSales.forEach(sale => {
      const cycleKey = getCycleKey(sale.truck_number, sale.date_loaded);
      const existing = salesByCycle.get(cycleKey) ?? [];
      existing.push(sale);
      salesByCycle.set(cycleKey, existing);

      const truckKey = (sale.truck_number || '').trim().toUpperCase();
      const byTruck = salesByTruck.get(truckKey) ?? [];
      byTruck.push(sale);
      salesByTruck.set(truckKey, byTruck);
    });

    const sortPayments = (payments: DeliverySale[]) => [...payments].sort((a, b) => {
      const dateA = a.date_of_payment || a.created_at || a.date_loaded || '';
      const dateB = b.date_of_payment || b.created_at || b.date_loaded || '';
      return dateA.localeCompare(dateB) || a.id - b.id;
    });

    const filteredLoadings = allLoadings
      .filter(loading => !!(loading.truck || loading.truck_number || loading.loading_status));
    const sortedLoadings = [
      ...filteredLoadings.filter(l => !!(l.date_allocated)),
      ...filteredLoadings.filter(l => !(l.date_allocated)),
    ];

    sortedLoadings.forEach(loading => {
        const cycleKey = getCycleKey(loading.truck_number || '', loading.date_allocated || '');
        const cycleSales = salesByCycle.get(cycleKey) || [];
        let payments = cycleSales.filter(sale => {
          if (matchedSaleIds.has(sale.id)) return false;
          const customerMatches = loading.customer ? sale.customer === loading.customer : true;
          const locationMatches = loading.location
            ? normalizeText(sale.location) === normalizeText(loading.location)
            : true;
          return customerMatches && locationMatches;
        });

        if (payments.length === 0 && loading.customer) {
          payments = cycleSales.filter(sale => !matchedSaleIds.has(sale.id) && sale.customer === loading.customer);
        }

        if (payments.length === 0 && !loading.date_allocated) {
          const truckKey = (loading.truck_number || '').trim().toUpperCase();
          const truckSales = salesByTruck.get(truckKey) || [];
          payments = truckSales.filter(sale => {
            if (matchedSaleIds.has(sale.id)) return false;
            const customerMatches = loading.customer ? sale.customer === loading.customer : true;
            return customerMatches;
          });
        }

        payments = sortPayments(payments);
        payments.forEach(payment => matchedSaleIds.add(payment.id));

        const firstPayment = payments[0];
        const customerId = loading.customer ?? firstPayment?.customer ?? null;
        const customerObj = customerId ? customerMap.get(customerId) : null;
        const expected = payments.reduce((sum, sale) => sum + toNum(sale.sales_value), 0);
        const rate = payments.reduce((maxValue, sale) => Math.max(maxValue, toNum(sale.rate)), 0);
        const totalPaid = payments.reduce((sum, sale) => sum + toNum(sale.payment_amount), 0);
        const quantity = toNum(loading.quantity_allocated) || payments.reduce((sum, sale) => sum + toNum(sale.quantity), 0);
        const totalQtySold = payments.reduce((sum, sale) => sum + toNum(sale.quantity), 0);
        const pfiNumber = loading.pfi_number || '';
        const derivedCode = loading.allocation_code
          || payments.map(sale => sale.allocation_code).find(Boolean)
          || '';

        groups.push({
          key: `loading:${loading.id}`,
          loadingId: loading.id,
          truckNumber: loading.truck_number || '',
          dateLoaded: loading.date_allocated || firstPayment?.date_loaded || '',
          depot: loading.depot || loading.pfi_location || firstPayment?.depot_loaded || '',
          location: loading.location || firstPayment?.location || '',
          customerId,
          customerName: loading.customer_name || customerObj?.customer_name || firstPayment?.customer_name || '',
          quantity,
          totalQtySold,
          rate,
          expected,
          totalPaid,
          balance: expected - totalPaid,
          pfiNumber,
          code: derivedCode,
          payments,
          isFillingStation: isFillingStation(customerObj),
        });
      });

    const unmatchedGroups = new Map<string, DeliverySale[]>();
    allSales.forEach(sale => {
      if (matchedSaleIds.has(sale.id)) return;
      const key = [
        getCycleKey(sale.truck_number, sale.date_loaded),
        String(sale.customer || ''),
        normalizeText(sale.location),
      ].join('::');
      const existing = unmatchedGroups.get(key) ?? [];
      existing.push(sale);
      unmatchedGroups.set(key, existing);
    });

    unmatchedGroups.forEach((payments, key) => {
      const sorted = sortPayments(payments);
      const firstPayment = sorted[0];
      const customerObj = firstPayment.customer ? customerMap.get(firstPayment.customer) : null;
      const expected = sorted.reduce((sum, sale) => sum + toNum(sale.sales_value), 0);
      const totalPaid = sorted.reduce((sum, sale) => sum + toNum(sale.payment_amount), 0);
      const totalQtySold = sorted.reduce((sum, sale) => sum + toNum(sale.quantity), 0);
      groups.push({
        key: `sale:${key}`,
        truckNumber: firstPayment.truck_number,
        dateLoaded: firstPayment.date_loaded || '',
        depot: firstPayment.depot_loaded || '',
        location: firstPayment.location || '',
        customerId: firstPayment.customer || null,
        customerName: firstPayment.customer_name || customerObj?.customer_name || '',
        quantity: totalQtySold,
        totalQtySold,
        rate: sorted.reduce((maxValue, sale) => Math.max(maxValue, toNum(sale.rate)), 0),
        expected,
        totalPaid,
        balance: expected - totalPaid,
        pfiNumber: '',
        code: firstPayment.allocation_code || sorted.map(sale => sale.allocation_code).find(Boolean) || '',
        payments: sorted,
        isFillingStation: isFillingStation(customerObj),
      });
    });

    return groups;
  }, [allLoadings, allSales, customerMap]);

  const filteredLedgerGroups = useMemo(() => {
    let result = [...ledgerGroups];

    // Filling Stations page should only show rows tied to filling-station customers.
    result = result.filter(group => group.isFillingStation);

    result = result.filter(group => {
      // Always surface inventory-linked rows regardless of date,
      // so every loaded/planned truck remains visible in the ledger.
      const isInventoryLinked = !!group.loadingId;
      if (isInventoryLinked) return true;

      return (
        matchesDateRange(group.dateLoaded, dateRange.from, dateRange.to)
        || group.payments.some(payment => matchesDateRange(payment.date_of_payment || payment.created_at || payment.date_loaded, dateRange.from, dateRange.to))
      );
    });

    if (truckFilter !== 'all') {
      result = result.filter(group => group.truckNumber === truckFilter);
    }
    if (locationFilter !== 'all') {
      result = result.filter(group => group.location === locationFilter);
    }
    if (customerFilter !== 'all') {
      result = result.filter(group => String(group.customerId || '') === customerFilter);
    }
    if (depotFilter !== 'all') {
      result = result.filter(group => group.depot === depotFilter);
    }
    if (allocationCodeFilter !== 'all') {
      result = result.filter(group => group.code === allocationCodeFilter);
    }

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(group =>
        group.truckNumber.toLowerCase().includes(query)
        || group.depot.toLowerCase().includes(query)
        || group.location.toLowerCase().includes(query)
        || group.customerName.toLowerCase().includes(query)
        || group.code.toLowerCase().includes(query)
        || group.pfiNumber.toLowerCase().includes(query)
        || group.payments.some(payment =>
          (payment.payer_name || '').toLowerCase().includes(query)
          || (payment.bank || '').toLowerCase().includes(query),
        )
      );
    }

    if (rateFilter !== 'all') {
      const rateNum = Number(rateFilter);
      result = result.filter(group =>
        group.payments.some(p => Math.abs(toNum(p.rate) - rateNum) < 1),
      );
    }

    return result.sort((left, right) => {
      const leftCode = left.code || 'ZZZZZZZZ';
      const rightCode = right.code || 'ZZZZZZZZ';
      const codeDiff = leftCode.localeCompare(rightCode);
      if (codeDiff !== 0) return codeDiff;
      const dateDiff = (right.dateLoaded || '').localeCompare(left.dateLoaded || '');
      if (dateDiff !== 0) return dateDiff;
      return (left.truckNumber || '').localeCompare(right.truckNumber || '');
    });
  }, [ledgerGroups, dateRange, truckFilter, locationFilter, customerFilter, depotFilter, allocationCodeFilter, searchQuery, rateFilter]);

  const totals = useMemo(() => {
    let totalExpected = 0;
    let totalPaid = 0;
    let totalQtyAllocated = 0;
    let totalQtySold = 0;
    let totalOutstanding = 0;
    let totalOverpaid = 0;
    let entries = 0;

    const uniqueTrucks = new Set<string>();
    const uniqueCustomers = new Set<number>();

    filteredLedgerGroups.forEach(group => {
      if (group.truckNumber) uniqueTrucks.add(group.truckNumber);
      if (group.customerId) uniqueCustomers.add(group.customerId);

      totalQtyAllocated += Math.max(0, toNum(group.quantity));
      totalQtySold += Math.max(0, toNum(group.totalQtySold));
      totalExpected += Math.max(0, toNum(group.expected));
      totalPaid += toNum(group.totalPaid);
      entries += group.payments.length;

      const bal = toNum(group.balance);
      if (bal > 0) totalOutstanding += bal;
      else if (bal < 0) totalOverpaid += Math.abs(bal);
    });

    return {
      entries,
      totalExpected,
      totalPaid,
      totalQtyAllocated,
      totalQtySold,
      outstanding: totalExpected - totalPaid,
      totalOutstanding,
      totalOverpaid,
      truckCount: uniqueTrucks.size,
      customerCount: uniqueCustomers.size,
    };
  }, [filteredLedgerGroups]);

  const summaryCards = useMemo((): SummaryCard[] => {
    const netBalance = totals.totalOutstanding - totals.totalOverpaid;

    const cards: SummaryCard[] = [
      { title: 'Qty Allocated (Ltrs)', value: totals.totalQtyAllocated > 0 ? totals.totalQtyAllocated.toLocaleString() : '0', icon: <Truck size={20} />, tone: 'neutral' },
      { title: 'Qty Sold (Ltrs)',  value: totals.totalQtySold > 0 ? totals.totalQtySold.toLocaleString() : '0', icon: <Fuel size={20} />,      tone: 'neutral' },
      { title: 'Expected Revenue', value: fmt(totals.totalExpected),                                     icon: <TrendingUp size={20} />, tone: 'neutral' },
      { title: 'Total Paid',       value: fmt(totals.totalPaid),                                         icon: <Banknote size={20} />,   tone: 'green'   },
      {
        title: 'Outstanding',
        value: totals.totalOutstanding > 0 ? fmt(totals.totalOutstanding) : '₦0',
        icon:  <Wallet size={20} />,
        tone:  totals.totalOutstanding > 0 ? ('red' as const) : ('green' as const),
      },
      {
        title: 'Net Balance',
        value: netBalance <= 0 ? (netBalance < 0 ? `+${fmt(Math.abs(netBalance))}` : '₦0') : fmt(netBalance),
        icon:  <TrendingUp size={20} />,
        tone:  netBalance <= 0 ? ('blue' as const) : ('red' as const),
      },
    ];

    return cards;
  }, [totals]);

  // ── Rate breakdown for the "Sales by Rate" summary panel ───────────────
  // Computed from filteredSales (all filters applied EXCEPT rateFilter)
  // so the panel always shows ALL rates and highlights the selected one.
  const rateGroups = useMemo(() => {
    const map = new Map<number, { rate: number; qty: number; expected: number; paid: number; entryCount: number }>();
    filteredSales.forEach(s => {
      const r = toNum(s.rate);
      if (!r) return;
      const prev = map.get(r) ?? { rate: r, qty: 0, expected: 0, paid: 0, entryCount: 0 };
      prev.qty      += toNum(s.quantity);
      prev.expected += toNum(s.sales_value);
      prev.paid     += toNum(s.payment_amount);
      prev.entryCount += 1;
      map.set(r, prev);
    });
    return Array.from(map.values())
      .sort((a, b) => a.rate - b.rate)
      .map(g => ({ ...g, balance: g.expected - g.paid }));
  }, [filteredSales]);

  const saleToLoadingMap = useMemo(() => {
    const map = new Map<number, number>();
    ledgerGroups.forEach(group => {
      if (!group.loadingId) return;
      group.payments.forEach(payment => map.set(payment.id, group.loadingId as number));
    });
    return map;
  }, [ledgerGroups]);

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
    }).sort((a, b) => {
      const truckA = (a.truck_number || '').toUpperCase();
      const truckB = (b.truck_number || '').toUpperCase();
      if (truckA !== truckB) return truckA.localeCompare(truckB);
      const dateA = normalizeCycleDate(a.date_allocated || '');
      const dateB = normalizeCycleDate(b.date_allocated || '');
      return dateB.localeCompare(dateA);
    });
  }, [allLoadings, cyclePaymentSummary]);

  const loadingCycleMeta = useMemo(() => {
    const map = new Map<string, { pfi: string; depot: string; dateAllocated: string }>();
    allLoadings.forEach(loading => {
      const key = getCycleKey(loading.truck_number || '', loading.date_allocated || '');
      if (!key) return;
      if (map.has(key)) return;
      map.set(key, {
        pfi: (loading.pfi_number || '').trim(),
        depot: (loading.depot || loading.pfi_location || loading.location || '').trim(),
        dateAllocated: normalizeCycleDate(loading.date_allocated || ''),
      });
    });
    return map;
  }, [allLoadings]);

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



  const handlePresetChange = (preset: TimePreset) => {
    setTimePreset(preset);
    if (preset !== 'custom') { setCustomFrom(''); setCustomTo(''); }
  };

  const autoCalcSalesValue = (quantity: string, rate: string) => {
    const q = Number(stripCommas(quantity)) || 0;
    const r = Number(stripCommas(rate)) || 0;
    return q * r > 0 ? formatWithCommas(String(q * r)) : '';
  };


  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.ids.length > 0) {
        await Promise.all(deleteTarget.ids.map(id => apiClient.admin.deleteDeliverySale(id)));
      }
      if (deleteTarget.mode === 'truck' && deleteTarget.loadingId) {
        await apiClient.admin.deleteDeliveryInventory(deleteTarget.loadingId);
      }

      toast({
        title: deleteTarget.mode === 'truck' ? 'Truck record deleted' : 'Entry deleted',
        description: deleteTarget.mode === 'truck'
          ? 'Truck row and linked records removed from ledger'
          : undefined,
      });
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

  const openQuickPaymentDialog = (group: LedgerGroup) => {
    if (!group.customerId) {
      toast({ title: 'Set up this row first', description: 'Click "Set Up" to assign the customer, destination and quantity.', variant: 'destructive' });
      return;
    }

    const customer = group.customerId ? customerMap.get(group.customerId) : null;
    const today = format(new Date(), 'yyyy-MM-dd');
    setQuickPaymentTarget(group);
    setQuickPaymentForm({
      payment_amount: '',
      rate: group.rate > 0 ? String(group.rate) : '',
      quantity: '',
      date_of_payment: today,
      payer_name: '',
      phone_number: customer?.contact_person_phone || customer?.phone_number || '',
      bank_account_id: '',
    });
  };

  const openSetupDialog = (group: LedgerGroup) => {
    setSetupTarget(group);
    setSetupCustomer(group.customerId ? String(group.customerId) : '');
    setSetupDestination(group.location || '');
    setSetupCode(group.code || '');
    setSetupTransferTargetKey('');
    setSetupTransferAmount(group.balance < 0 ? formatWithCommas(String(Math.abs(group.balance))) : '');
  };

  const handleSaveSetup = async () => {
    if (!setupTarget) {
      toast({ title: 'Select a row first', variant: 'destructive' });
      return;
    }
    if (!setupCustomer) {
      toast({ title: 'Select customer', variant: 'destructive' });
      return;
    }
    if (!setupDestination.trim()) {
      toast({ title: 'Enter destination', variant: 'destructive' });
      return;
    }

    const normalized = setupCode.trim().toUpperCase();

    setSetupSaving(true);
    try {
      const customerId = Number(setupCustomer);
      const customerName = customerMap.get(customerId)?.customer_name || '';

      if (setupTarget.loadingId) {
        await apiClient.admin.updateDeliveryInventory(setupTarget.loadingId, {
          customer: customerId,
          customer_name: customerName,
          location: setupDestination.trim(),
          allocation_code: normalized || null,
        });

        // Sync linked sales to match
        if (setupTarget.payments.length > 0) {
          await Promise.all(
            setupTarget.payments.map(payment =>
              apiClient.admin.updateDeliverySale(payment.id, {
                customer: customerId,
                location: setupDestination.trim(),
                allocation_code: normalized || null,
              }),
            ),
          );
        }
      } else if (setupTarget.payments.length > 0) {
        await Promise.all(
          setupTarget.payments.map(payment =>
            apiClient.admin.updateDeliverySale(payment.id, {
              customer: customerId,
              location: setupDestination.trim(),
              allocation_code: normalized || null,
            }),
          ),
        );
      }

      toast({ title: 'Row setup saved' });
      setSetupTarget(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save setup',
        variant: 'destructive',
      });
    } finally {
      setSetupSaving(false);
    }
  };

  const handleQuickPaymentSave = useCallback(async () => {
    if (!quickPaymentTarget) return;

    const paymentAmount = Number(stripCommas(quickPaymentForm.payment_amount));
    const payerName = quickPaymentForm.payer_name.trim();
    const payerValid = !payerName || /^[A-Za-z\s'\-.]+$/.test(payerName);

    if (!paymentAmount || paymentAmount <= 0) {
      toast({ title: 'Enter a valid payment amount', variant: 'destructive' });
      return;
    }
    if (!quickPaymentForm.bank_account_id) {
      toast({ title: 'Select a bank account', variant: 'destructive' });
      return;
    }
    if (!payerValid) {
      toast({ title: 'Payer name should contain letters only', variant: 'destructive' });
      return;
    }

    setQuickPaymentSaving(true);
    try {
      const bankAcct = bankMap.get(Number(quickPaymentForm.bank_account_id));
      const bankStr = bankAcct ? `${bankAcct.account_number} · ${bankAcct.bank_name}` : undefined;
      const currentUser = localStorage.getItem('fullname') || 'Unknown';
      // Use form-entered rate/qty when provided, otherwise fall back to group-level values
      const enteredRate = Number(stripCommas(quickPaymentForm.rate)) || quickPaymentTarget.rate || 0;
      const enteredQty  = Number(stripCommas(quickPaymentForm.quantity)) || quickPaymentTarget.quantity || 0;
      const enteredExpected = enteredQty && enteredRate ? enteredQty * enteredRate : quickPaymentTarget.expected || 0;
      const record = await apiClient.admin.createDeliverySale({
        truck_number: quickPaymentTarget.truckNumber,
        date_loaded: quickPaymentTarget.dateLoaded || format(new Date(), 'yyyy-MM-dd'),
        depot_loaded: quickPaymentTarget.depot || undefined,
        customer: quickPaymentTarget.customerId || 0,
        location: quickPaymentTarget.location || undefined,
        quantity: enteredQty || undefined,
        rate: enteredRate || undefined,
        sales_value: enteredExpected || undefined,
        payment_amount: paymentAmount,
        payer_name: payerName || undefined,
        bank: bankStr,
        date_of_payment: quickPaymentForm.date_of_payment || format(new Date(), 'yyyy-MM-dd'),
        phone_number: quickPaymentForm.phone_number.trim() || undefined,
        entered_by: currentUser,
        allocation_code: quickPaymentTarget.code || undefined,
      }) as { id?: number };

      toast({
        title: 'Payment recorded',
        description: `${quickPaymentTarget.truckNumber} · ${fmt(paymentAmount)}`,
      });
      setQuickPaymentTarget(null);
      setQuickPaymentForm({ payment_amount: '', rate: '', quantity: '', date_of_payment: '', payer_name: '', phone_number: '', bank_account_id: '' });
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to record payment',
        variant: 'destructive',
      });
    } finally {
      setQuickPaymentSaving(false);
    }
  }, [quickPaymentTarget, quickPaymentForm, toast, bankMap]);

  const runTransfer = useCallback(async (
    source: LedgerGroup,
    targetKey: string,
    amountInput: string,
    onDone?: () => void,
  ) => {
    const target = ledgerGroups.find(group => group.key === targetKey);
    const amount = Number(stripCommas(amountInput));

    if (!target) {
      toast({ title: 'Select a target truck row', variant: 'destructive' });
      return;
    }
    if (!amount || amount <= 0) {
      toast({ title: 'Enter a valid transfer amount', variant: 'destructive' });
      return;
    }
    const maxTransfer = Math.abs(source.balance);
    if (amount > maxTransfer) {
      toast({ title: `Transfer exceeds available overpayment (${fmt(maxTransfer)})`, variant: 'destructive' });
      return;
    }
    if (!source.customerId || !source.location || !target.customerId || !target.location) {
      toast({ title: 'Both source and target rows must have customer and destination set', variant: 'destructive' });
      return;
    }

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const currentUser = localStorage.getItem('fullname') || 'Unknown';

      const [sourceRecord, targetRecord] = await Promise.all([
        apiClient.admin.createDeliverySale({
          truck_number: source.truckNumber,
          date_loaded: source.dateLoaded || today,
          depot_loaded: source.depot || undefined,
          customer: source.customerId,
          location: source.location || undefined,
          quantity: source.quantity || undefined,
          rate: source.rate || undefined,
          sales_value: source.expected || undefined,
          payment_amount: -amount,
          payer_name: `TRANSFER TO ${target.truckNumber}`,
          bank: 'INTERNAL TRANSFER',
          date_of_payment: today,
          remarks: `Overpayment moved to ${target.truckNumber}`,
          entered_by: currentUser,
          allocation_code: source.code || undefined,
        }),
        apiClient.admin.createDeliverySale({
          truck_number: target.truckNumber,
          date_loaded: target.dateLoaded || today,
          depot_loaded: target.depot || undefined,
          customer: target.customerId,
          location: target.location || undefined,
          quantity: target.quantity || undefined,
          rate: target.rate || undefined,
          sales_value: target.expected || undefined,
          payment_amount: amount,
          payer_name: `TRANSFER FROM ${source.truckNumber}`,
          bank: 'INTERNAL TRANSFER',
          date_of_payment: today,
          remarks: `Overpayment received from ${source.truckNumber}`,
          entered_by: currentUser,
          allocation_code: target.code || undefined,
        }),
      ]) as Array<{ id?: number }>;

      toast({
        title: 'Overpayment transferred',
        description: `${fmt(amount)} moved from ${source.truckNumber} to ${target.truckNumber}`,
      });
      onDone?.();
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to transfer overpayment',
        variant: 'destructive',
      });
    }
  }, [ledgerGroups, toast]);

  const handleSetupTransfer = async () => {
    if (!setupTarget || setupTarget.balance >= 0) return;
    setSetupTransferSaving(true);
    try {
      await runTransfer(setupTarget, setupTransferTargetKey, setupTransferAmount, () => {
        setSetupTransferTargetKey('');
        setSetupTransferAmount('');
        setSetupTarget(null);
      });
    } finally {
      setSetupTransferSaving(false);
    }
  };

  const openEditDialog = (sale: DeliverySale) => {
    setEditTarget(sale);
    setEditAllocationCode(sale.allocation_code || '');
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

      await apiClient.admin.updateDeliverySale(editTarget.id, {
        quantity:         qty,
        rate:             rate,
        sales_value:      computedSv,
        payment_amount:   pa,
        payer_name:       editForm.payer_name.trim() || undefined,
        bank:             bankStr,
        date_of_payment:  editForm.date_of_payment || undefined,
        remarks:          editForm.remarks.trim() || undefined,
        phone_number:     editForm.phone_number.trim() || undefined,
        location:         editForm.location.trim() || undefined,
        allocation_code:  editAllocationCode || null,
        // Only send date_loaded if the user changed it (cycle reassignment)
        ...(editForm.date_loaded && editForm.date_loaded !== editTarget.date_loaded
          ? { date_loaded: editForm.date_loaded }
          : {}),
      });

      // Synchronize linked loading allocation code back to DB
      const linkedLoadingId = saleToLoadingMap.get(editTarget.id);
      if (linkedLoadingId) {
        try {
          await apiClient.admin.updateDeliveryInventory(linkedLoadingId, {
            allocation_code: editAllocationCode || null,
          });
        } catch {
          // Non-critical
        }
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
  }, [editTarget, editForm, editAllocationCode, toast, saleToLoadingMap]);

  const exportExcel = useCallback(() => {
    if (!filteredSales.length) return;
    const period = timePreset === 'custom'
      ? `${customFrom || '?'}_TO_${customTo || '?'}`
      : timePreset.toUpperCase();

    const n = (v: number) => v > 0 ? v.toLocaleString('en-NG') : '0';
    const fmtNaira = (v: number) => v !== 0 ? `₦${v.toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : '₦0.00';
    const u = (s: string) => (s || '').toUpperCase();

    // ── Build hierarchical groupings: Station -> Rate -> Payments ──
    const stationMap = new Map<string, Map<number, DeliverySale[]>>();

    filteredSales.forEach(s => {
      const stationName = u(s.customer_name || customerMap.get(s.customer)?.customer_name || 'UNKNOWN STATION');
      const rateVal = toNum(s.rate);

      if (!stationMap.has(stationName)) {
        stationMap.set(stationName, new Map());
      }
      const rateMap = stationMap.get(stationName)!;
      if (!rateMap.has(rateVal)) {
        rateMap.set(rateVal, []);
      }
      rateMap.get(rateVal)!.push(s);
    });

    const aoa: (string | number)[][] = [];

    aoa.push(['FILLING STATIONS SALES REPORT — ' + period]);
    aoa.push([]);

    // Compute grand totals
    let grandQtyAllocated = totals.totalQtyAllocated;
    let grandQtySold = totals.totalQtySold;
    let grandExpected = totals.totalExpected;
    let grandPaid = totals.totalPaid;
    let grandBalance = totals.totalOutstanding;

    aoa.push(['TOTAL ALLOCATED (LTRS)', n(grandQtyAllocated)]);
    aoa.push(['TOTAL SOLD (LTRS)',      n(grandQtySold)]);
    aoa.push(['EXPECTED REVENUE',       fmtNaira(grandExpected)]);
    aoa.push(['TOTAL PAID (DEPOSITED)', fmtNaira(grandPaid)]);
    aoa.push(['TOTAL OUTSTANDING',      fmtNaira(grandBalance)]);
    aoa.push([]);

    const COLS = [
      'S/N', 'STATION', 'TRUCK NO.', 'PFI/CODE', 'QTY (LTRS)', 'RATE (₦/L)', 'EXPECTED (₦)', 'DEPOSITED (₦)', 'BALANCE (₦)',
      'PAYER', 'PHONE', 'BANK', 'PAID DATE', 'REMARKS'
    ] as const;

    let globalSn = 0;

    stationMap.forEach((rateMap, stationName) => {
      // Station Header
      aoa.push([`STATION: ${stationName}`]);
      aoa.push([...COLS]);

      let stationQty = 0;
      let stationExpected = 0;
      let stationPaid = 0;

      rateMap.forEach((sales, rateVal) => {
        // Rate Header
        aoa.push(['', `Rate: ₦${n(rateVal)} per Litre`]);

        let rateQty = 0;
        let rateExpected = 0;
        let ratePaid = 0;

        // Sort chronologically
        sales.sort((a, b) => (a.date_of_payment || '').localeCompare(b.date_of_payment || '') || a.id - b.id);

        sales.forEach(s => {
          globalSn += 1;
          const q = toNum(s.quantity);
          const expected = toNum(s.sales_value);
          const paid = toNum(s.payment_amount);
          const bal = expected - paid;

          rateQty += q;
          rateExpected += expected;
          ratePaid += paid;

          aoa.push([
            globalSn,
            stationName,
            u(s.truck_number),
            u(s.allocation_code || ''),
            q > 0 ? n(q) : '—',
            rateVal > 0 ? n(rateVal) : '—',
            expected > 0 ? fmtNaira(expected) : '—',
            paid > 0 ? fmtNaira(paid) : '—',
            bal > 0 ? fmtNaira(bal) : bal < 0 ? `+${fmtNaira(Math.abs(bal))}` : '₦0.00 ✓',
            u(s.payer_name || ''),
            s.phone_number || '',
            u(s.bank || ''),
            s.date_of_payment ? format(parseISO(s.date_of_payment), 'dd/MM/yyyy') : '—',
            u(s.remarks || '')
          ]);
        });

        // Rate Subtotal Row
        const rateBal = rateExpected - ratePaid;
        aoa.push([
          '',
          `Subtotal for Rate ₦${n(rateVal)}`,
          '', '',
          n(rateQty),
          '',
          fmtNaira(rateExpected),
          fmtNaira(ratePaid),
          rateBal > 0 ? fmtNaira(rateBal) : rateBal < 0 ? `+${fmtNaira(Math.abs(rateBal))}` : '₦0.00 ✓',
          '', '', '', '', ''
        ]);

        stationQty += rateQty;
        stationExpected += rateExpected;
        stationPaid += ratePaid;
      });

      // Station Grand Total Row
      const stationBal = stationExpected - stationPaid;
      aoa.push([
        '',
        `GRAND TOTAL FOR ${stationName}`,
        '', '',
        n(stationQty),
        '',
        fmtNaira(stationExpected),
        fmtNaira(stationPaid),
        stationBal > 0 ? fmtNaira(stationBal) : stationBal < 0 ? `+${fmtNaira(Math.abs(stationBal))}` : '₦0.00 ✓',
        '', '', '', '', ''
      ]);

      // Blank rows separator
      aoa.push([]);
      aoa.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Filling Station Ledger');
    XLSX.writeFile(wb, `FILLING-STATION-LEDGER-${period}.xlsx`);
  }, [filteredSales, customerMap, totals, timePreset, customFrom, customTo]);

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

            {/* ── Page Header ── */}
            <PageHeader
              title="Filling Stations"
              description="Fuel allocated to filling stations. Each card is one delivery allocation — record daily sales as the station sells."
              actions={
                <>
                  <Button variant="default" className="gap-2" onClick={exportExcel} disabled={filteredSales.length === 0}>
                    <Download size={16} /> Download Report
                  </Button>
                </>
              }
            />

            {/* ── Summary Cards ── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Filter Panel ── */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-5 space-y-4">

                {/* Search */}
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <Input
                    placeholder="Search by station, truck, payer, code…"
                    className="pl-9 h-9 text-sm"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button title="Clear search" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Time Presets */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarIcon size={12} /> Time Period
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['today', 'yesterday', 'week', 'month', 'year', 'all', 'custom'] as TimePreset[]).map(tp => (
                      <button
                        key={tp}
                        type="button"
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

                <div className="border-t border-slate-100" />

                {/* Dropdown Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {/* Truck */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600"><Truck size={12} className="text-slate-400" /> Truck</label>
                    <select aria-label="Filter by truck" value={truckFilter} onChange={e => setTruckFilter(e.target.value)}
                      className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm ${truckFilter !== 'all' ? 'border-slate-700 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'}`}>
                      <option value="all">All Trucks</option>
                      {uniqueTruckNumbers.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {/* Destination */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600"><MapPin size={12} className="text-slate-400" /> Destination</label>
                    <select aria-label="Filter by destination" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
                      className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm ${locationFilter !== 'all' ? 'border-slate-700 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'}`}>
                      <option value="all">All Destinations</option>
                      {uniqueLocations.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  {/* Station */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600"><Users size={12} className="text-slate-400" /> Station</label>
                    <select aria-label="Filter by station" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
                      className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm ${customerFilter !== 'all' ? 'border-slate-700 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'}`}>
                      <option value="all">All Stations</option>
                      {uniqueCustomerOptions.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                    </select>
                  </div>
                  {/* Allocation Code */}
                  {uniqueAllocationCodes.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600"><Tag size={12} className="text-purple-400" /> Code</label>
                      <select aria-label="Filter by allocation code" value={allocationCodeFilter} onChange={e => setAllocationCodeFilter(e.target.value)}
                        className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm ${allocationCodeFilter !== 'all' ? 'border-purple-600 font-semibold text-purple-900 bg-purple-50' : 'border-slate-200 text-slate-700'}`}>
                        <option value="all">All Codes</option>
                        {uniqueAllocationCodes.map(code => <option key={code} value={code}>{code}</option>)}
                      </select>
                    </div>
                  )}
                  {/* Rate */}
                  {uniqueRates.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600"><TrendingUp size={12} className="text-indigo-400" /> Rate (₦/L)</label>
                      <select aria-label="Filter by rate" value={rateFilter} onChange={e => setRateFilter(e.target.value)}
                        className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm ${rateFilter !== 'all' ? 'border-indigo-600 font-semibold text-indigo-900 bg-indigo-50' : 'border-slate-200 text-slate-700'}`}>
                        <option value="all">All Rates</option>
                        {uniqueRates.map(r => <option key={r} value={String(r)}>₦{r.toLocaleString()}/L</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Active filter chips */}
                {(truckFilter !== 'all' || locationFilter !== 'all' || customerFilter !== 'all' || allocationCodeFilter !== 'all' || rateFilter !== 'all') && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Filter size={11} /> Filtering:</span>
                    {truckFilter !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"><Truck size={10} />{truckFilter}<button onClick={() => setTruckFilter('all')}><X size={10} /></button></span>}
                    {locationFilter !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"><MapPin size={10} />{locationFilter}<button onClick={() => setLocationFilter('all')}><X size={10} /></button></span>}
                    {customerFilter !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"><Users size={10} />{uniqueCustomerOptions.find(c => String(c.id) === customerFilter)?.name || customerFilter}<button onClick={() => setCustomerFilter('all')}><X size={10} /></button></span>}
                    {allocationCodeFilter !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs font-medium"><Tag size={10} />{allocationCodeFilter}<button onClick={() => setAllocationCodeFilter('all')}><X size={10} /></button></span>}
                    {rateFilter !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-medium"><TrendingUp size={10} />₦{Number(rateFilter).toLocaleString()}/L<button onClick={() => setRateFilter('all')}><X size={10} /></button></span>}
                  </div>
                )}
              </div>
            </div>

            {/* ── Station Cards ── */}
            {isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
                        <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
                      </div>
                    </div>
                    <div className="h-16 bg-slate-50 rounded-lg animate-pulse" />
                    <div className="h-2 bg-slate-100 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : filteredLedgerGroups.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
                  <Fuel className="text-amber-400" size={32} />
                </div>
                <h3 className="text-slate-700 font-semibold text-lg mb-1">No filling station entries found</h3>
                <p className="text-sm text-slate-400 max-w-xs mx-auto">
                  {ledgerGroups.filter(g => g.isFillingStation).length > 0
                    ? 'Adjust your filters or time period.'
                    : 'Assign filling-station customers to truck allocations in the Sales Ledger to see entries here.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredLedgerGroups.map(group => {
                  const isExpanded = expandedCards.has(group.key);
                  const pctSold = group.quantity > 0 ? Math.min(100, Math.round((group.totalQtySold / group.quantity) * 100)) : 0;
                  const hasEntries = group.payments.length > 0;
                  const isSetUp = !!(group.customerId && group.location);
                  const theme = getCodeTheme(group.code);

                  // Per-entry rate filter
                  const visiblePayments = rateFilter === 'all'
                    ? group.payments
                    : group.payments.filter(p => String(toNum(p.rate)) === rateFilter);

                  return (
                    <div
                      key={group.key}
                      className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md ${
                        group.balance > 0 ? 'border-slate-200' : group.balance < 0 ? 'border-blue-200' : 'border-emerald-200'
                      }`}
                    >
                      {/* Card Header */}
                      <div className={`px-4 py-3 border-b border-slate-100 ${theme ? theme.row.replace('border-l-[3px]', '').replace('border-l-', '') : ''}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            !isSetUp ? 'bg-slate-100' : group.balance > 0 ? 'bg-amber-50' : group.balance < 0 ? 'bg-blue-50' : 'bg-emerald-50'
                          }`}>
                            <Fuel size={20} className={
                              !isSetUp ? 'text-slate-400' : group.balance > 0 ? 'text-amber-500' : group.balance < 0 ? 'text-blue-500' : 'text-emerald-500'
                            } />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-900 text-sm uppercase leading-tight truncate">
                              {group.customerName || <span className="text-slate-400 italic font-normal">Customer not set</span>}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <Truck size={11} className="text-amber-600" />{group.truckNumber || '—'}
                              </span>
                              {group.location && (
                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                  <MapPin size={11} className="text-slate-400" />{group.location}
                                </span>
                              )}
                              {group.dateLoaded && (
                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                  <CalendarIcon size={11} className="text-slate-400" />
                                  {(() => { try { return format(parseISO(group.dateLoaded), 'dd MMM yyyy'); } catch { return group.dateLoaded; } })()}
                                </span>
                              )}
                            </div>
                          </div>
                          {group.code && (
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border flex-shrink-0 ${theme ? theme.badge : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                              {group.code}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="px-4 py-3">
                        {!isSetUp ? (
                          <div className="flex items-center gap-2 py-3 px-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
                            <p className="text-xs text-slate-500">This truck has no filling station assigned yet.</p>
                          </div>
                        ) : (
                          <>
                            {/* 4 key numbers */}
                            <div className="grid grid-cols-2 gap-2 mb-3">
                              <div className="bg-slate-50 rounded-lg p-2.5">
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Allocated</p>
                                <p className="text-sm font-bold text-slate-800 mt-0.5">{group.quantity > 0 ? `${fmtQty(group.quantity)} L` : '—'}</p>
                              </div>
                              <div className="bg-slate-50 rounded-lg p-2.5">
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Sold So Far</p>
                                <p className="text-sm font-bold text-slate-700 mt-0.5">{group.totalQtySold > 0 ? `${fmtQty(group.totalQtySold)} L` : <span className="text-slate-400 font-normal">Awaiting sales</span>}</p>
                              </div>
                              <div className="bg-emerald-50 rounded-lg p-2.5">
                                <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Deposited</p>
                                <p className="text-sm font-bold text-emerald-700 mt-0.5">{fmt(group.totalPaid)}</p>
                              </div>
                              <div className={`rounded-lg p-2.5 ${group.balance > 0 ? 'bg-red-50' : group.balance < 0 ? 'bg-blue-50' : 'bg-emerald-50'}`}>
                                <p className={`text-[10px] font-medium uppercase tracking-wider ${group.balance > 0 ? 'text-red-500' : group.balance < 0 ? 'text-blue-500' : 'text-emerald-500'}`}>
                                  {group.balance > 0 ? 'Outstanding' : group.balance < 0 ? 'Overpaid' : 'Balance'}
                                </p>
                                <p className={`text-sm font-bold mt-0.5 ${group.balance > 0 ? 'text-red-700' : group.balance < 0 ? 'text-blue-700' : 'text-emerald-700'}`}>
                                  {group.expected > 0
                                    ? (group.balance === 0 ? '₦0 ✓' : group.balance > 0 ? fmt(group.balance) : `+${fmt(Math.abs(group.balance))}`)
                                    : 'Open'}
                                </p>
                              </div>
                            </div>

                            {/* Expected revenue row */}
                            <div className="flex items-center justify-between mb-3 px-1">
                              <span className="text-xs text-slate-400">Expected Revenue</span>
                              <span className="text-xs font-semibold text-slate-700">{group.expected > 0 ? fmt(group.expected) : '—'}</span>
                            </div>

                            {/* Progress bar */}
                            {group.quantity > 0 && (
                              <div className="mb-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] text-slate-400">Volume progress</span>
                                  <span className="text-[10px] font-semibold text-slate-600">{pctSold}% sold</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${pctSold >= 100 ? 'bg-emerald-500' : pctSold >= 60 ? 'bg-amber-400' : 'bg-sky-400'}`}
                                    style={{ width: `${pctSold}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Rate badge if consistent */}
                            {group.rate > 0 && (
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-xs text-slate-400">Rate:</span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-100">
                                  <TrendingUp size={10} /> ₦{group.rate.toLocaleString()}/L
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/40">
                        <div className="flex items-center gap-2 flex-wrap">
                          {!readOnly && (
                            <>
                              {isSetUp ? (
                                <Button
                                  size="sm"
                                  className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => openQuickPaymentDialog(group)}
                                >
                                  <Plus size={13} /> Record Daily Sale
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs gap-1.5"
                                onClick={() => openSetupDialog(group)}
                              >
                                <UserPlus size={13} /> {isSetUp ? 'Edit Setup' : 'Set Up'}
                              </Button>
                            </>
                          )}
                          {hasEntries && (
                            <button
                              type="button"
                              onClick={() => toggleCard(group.key)}
                              className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors font-medium"
                            >
                              <LayoutGrid size={13} />
                              {isExpanded ? 'Hide' : 'Show'} {group.payments.length} {group.payments.length === 1 ? 'Entry' : 'Entries'}
                            </button>
                          )}
                          {!hasEntries && isSetUp && (
                            <span className="ml-auto text-xs text-slate-400 italic">No sales recorded yet</span>
                          )}
                        </div>
                      </div>

                      {/* Expandable Daily Entries */}
                      {isExpanded && hasEntries && (
                        <div className="border-t border-slate-200">
                          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Daily Sales Entries</p>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {visiblePayments.map(payment => {
                              const dailyQty   = toNum(payment.quantity);
                              const dailyRate  = toNum(payment.rate);
                              const dailyExp   = toNum(payment.sales_value);
                              const dailyPaid  = toNum(payment.payment_amount);
                              const dayBal     = dailyExp - dailyPaid;
                              const bankParts  = payment.bank ? payment.bank.split(' · ') : null;

                              return (
                                <div key={payment.id} className="px-4 py-3 hover:bg-slate-50/60 transition-colors">
                                  {/* Date + Actions row */}
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold text-slate-700">
                                        {payment.date_of_payment
                                          ? (() => { try { return format(parseISO(payment.date_of_payment), 'dd MMM yyyy'); } catch { return payment.date_of_payment; } })()
                                          : <span className="text-slate-400">No date</span>}
                                      </span>
                                      {dayBal === 0 && dailyExp > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold">Settled ✓</span>
                                      )}
                                      {dayBal > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-semibold">Bal: {fmt(dayBal)}</span>
                                      )}
                                      {dayBal < 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-semibold">Over: +{fmt(Math.abs(dayBal))}</span>
                                      )}
                                    </div>
                                    {!readOnly && (
                                      <div className="flex items-center gap-1">
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700" onClick={() => openEditDialog(payment)} title="Edit entry">
                                          <Pencil size={12} />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-600" title="Delete entry"
                                          onClick={() => setDeleteTarget({ ids: [payment.id], mode: 'entry', label: `${group.truckNumber} · ${payment.date_of_payment || ''} · ${fmt(dailyPaid)}` })}>
                                          <Trash2 size={12} />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  {/* Entry details grid */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                    <div>
                                      <span className="text-slate-400">Volume</span>
                                      <p className="font-semibold text-slate-700">{dailyQty > 0 ? `${fmtQty(dailyQty)} L` : '—'}</p>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">Rate</span>
                                      <p className="font-semibold text-slate-700">{dailyRate > 0 ? `₦${dailyRate.toLocaleString()}/L` : '—'}</p>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">Expected</span>
                                      <p className="font-semibold text-slate-700">{dailyExp > 0 ? fmt(dailyExp) : '—'}</p>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">Deposited</span>
                                      <p className="font-bold text-emerald-700">{fmt(dailyPaid)}</p>
                                    </div>
                                  </div>
                                  {/* Payer + Bank */}
                                  {(payment.payer_name || bankParts) && (
                                    <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-slate-100">
                                      {payment.payer_name && (
                                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                          <Users size={10} /> {payment.payer_name}
                                          {payment.phone_number && ` · ${payment.phone_number}`}
                                        </span>
                                      )}
                                      {bankParts && (
                                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                          <Banknote size={10} /> {bankParts[0]}{bankParts[1] ? ` · ${bankParts[1]}` : ''}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {/* Delete whole allocation row */}
                          {!readOnly && (
                            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 flex justify-end">
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:text-red-600 gap-1" title="Delete this allocation row and all its entries"
                                onClick={() => setDeleteTarget({
                                  ids: group.payments.map(p => p.id),
                                  loadingId: group.loadingId,
                                  mode: 'truck',
                                  label: `${group.customerName || 'row'} on ${group.truckNumber}`,
                                })}>
                                <Trash2 size={11} /> Delete entire row
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Count footer */}
            {!isLoading && filteredLedgerGroups.length > 0 && (
              <p className="text-center text-xs text-slate-400">
                Showing {filteredLedgerGroups.length} station allocation{filteredLedgerGroups.length !== 1 ? 's' : ''} · {totals.entries} daily {totals.entries === 1 ? 'entry' : 'entries'}
              </p>
            )}

          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Record Daily Sale Dialog                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!quickPaymentTarget} onOpenChange={open => { if (!open) setQuickPaymentTarget(null); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Fuel className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Record Daily Sale</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  {quickPaymentTarget
                    ? `${quickPaymentTarget.customerName} · ${quickPaymentTarget.truckNumber}${quickPaymentTarget.code ? ` · ${quickPaymentTarget.code}` : ''}`
                    : ''}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Record a daily sale and payment for this filling station allocation</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Station context banner */}
            {quickPaymentTarget && (
              <div className="bg-amber-50/70 border border-amber-200/60 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Fuel size={12} /> Allocation Summary
                </p>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-slate-400">Total Allocated</p>
                    <p className="font-bold text-slate-800">{quickPaymentTarget.quantity > 0 ? `${fmtQty(quickPaymentTarget.quantity)} L` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Already Sold</p>
                    <p className="font-bold text-slate-700">{quickPaymentTarget.totalQtySold > 0 ? `${fmtQty(quickPaymentTarget.totalQtySold)} L` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Balance O/S</p>
                    <p className={`font-bold ${quickPaymentTarget.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {quickPaymentTarget.expected > 0
                        ? (quickPaymentTarget.balance > 0 ? fmt(quickPaymentTarget.balance) : 'Fully Paid ✓')
                        : 'Open'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Rate + Volume + Expected */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Rate (₦/L) <span className="text-red-500">*</span></Label>
                <Input
                  type="text" inputMode="decimal" placeholder="e.g. 1,200" className="h-9 text-sm"
                  value={quickPaymentForm.rate}
                  onChange={e => {
                    const rate = formatWithCommas(e.target.value);
                    const r = Number(stripCommas(rate)) || 0;
                    const q = Number(stripCommas(quickPaymentForm.quantity)) || 0;
                    const expected = r && q ? formatWithCommas(String(r * q)) : '';
                    setQuickPaymentForm(prev => ({ ...prev, rate, payment_amount: expected || prev.payment_amount }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Volume Sold (Ltrs) <span className="text-red-500">*</span></Label>
                <Input
                  type="text" inputMode="decimal" placeholder="e.g. 5,000" className="h-9 text-sm"
                  value={quickPaymentForm.quantity}
                  onChange={e => {
                    const quantity = formatWithCommas(e.target.value);
                    const q = Number(stripCommas(quantity)) || 0;
                    const r = Number(stripCommas(quickPaymentForm.rate)) || 0;
                    const expected = r && q ? formatWithCommas(String(r * q)) : '';
                    setQuickPaymentForm(prev => ({ ...prev, quantity, payment_amount: expected || prev.payment_amount }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Expected (₦)</Label>
                <Input
                  readOnly className="h-9 text-sm bg-white font-semibold text-slate-700"
                  value={(() => {
                    const r = Number(stripCommas(quickPaymentForm.rate)) || 0;
                    const q = Number(stripCommas(quickPaymentForm.quantity)) || 0;
                    return r && q ? `₦${formatWithCommas(String(r * q))}` : '—';
                  })()}
                />
              </div>
            </div>

            {/* Amount Deposited + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Amount Deposited (₦) <span className="text-red-500">*</span></Label>
                <Input
                  type="text" inputMode="decimal" placeholder="e.g. 5,000,000" className="h-9 text-sm"
                  value={quickPaymentForm.payment_amount}
                  onChange={e => setQuickPaymentForm(prev => ({ ...prev, payment_amount: formatWithCommas(e.target.value) }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-600 flex items-center gap-1"><CalendarIcon size={11} className="inline" /> Date of Sale</Label>
                <Input
                  type="date" className="h-9 text-sm"
                  value={quickPaymentForm.date_of_payment}
                  onChange={e => setQuickPaymentForm(prev => ({ ...prev, date_of_payment: e.target.value }))}
                />
              </div>
            </div>

            {/* Live balance preview */}
            {(() => {
              const r = Number(stripCommas(quickPaymentForm.rate)) || 0;
              const q = Number(stripCommas(quickPaymentForm.quantity)) || 0;
              const expected = r && q ? r * q : 0;
              const paid = Number(stripCommas(quickPaymentForm.payment_amount)) || 0;
              if (!expected && !paid) return null;
              const bal = expected - paid;
              return (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-3 gap-3 text-sm">
                  <div><p className="text-xs text-slate-400">Expected</p><p className="font-bold text-slate-800">{expected > 0 ? fmt(expected) : '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Deposited</p><p className="font-bold text-emerald-700">{paid > 0 ? fmt(paid) : '—'}</p></div>
                  <div>
                    <p className="text-xs text-slate-400">Balance</p>
                    <p className={`font-bold ${bal > 0 ? 'text-red-600' : bal < 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                      {bal === 0 ? '₦0 ✓' : bal > 0 ? fmt(bal) : `+${fmt(Math.abs(bal))}`}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Payer + Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Payer's Name</Label>
                <Input placeholder="Name only" className="h-9 text-sm"
                  value={quickPaymentForm.payer_name}
                  onChange={e => setQuickPaymentForm(prev => ({ ...prev, payer_name: e.target.value.replace(/[0-9]/g, '') }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Phone Number</Label>
                <Input className="h-9 text-sm"
                  value={quickPaymentForm.phone_number}
                  onChange={e => setQuickPaymentForm(prev => ({ ...prev, phone_number: e.target.value }))}
                />
              </div>
            </div>

            {/* Bank Account */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Bank Account <span className="text-red-500">*</span></Label>
              <select aria-label="Select bank account" value={quickPaymentForm.bank_account_id}
                onChange={e => setQuickPaymentForm(prev => ({ ...prev, bank_account_id: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select account…</option>
                {activeBankAccounts.map(b => (
                  <option key={b.id} value={String(b.id)}>{b.account_number} · {b.bank_name}</option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickPaymentTarget(null)} disabled={quickPaymentSaving}>Cancel</Button>
            <Button onClick={handleQuickPaymentSave} disabled={quickPaymentSaving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {quickPaymentSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {quickPaymentSaving ? 'Saving…' : 'Save Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Set Up Dialog                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!setupTarget} onOpenChange={open => { if (!open) setSetupTarget(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100"><UserPlus className="w-5 h-5 text-blue-600" /></div>
              <div>
                <h2 className="text-lg font-semibold">{setupTarget?.customerName ? 'Edit Setup' : 'Set Up Allocation'}</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">{setupTarget?.truckNumber} · {setupTarget?.dateLoaded}</p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Assign a filling station customer and destination to this truck allocation</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Filling Station <span className="text-red-500">*</span></Label>
              <select aria-label="Setup customer" value={setupCustomer} onChange={e => setSetupCustomer(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select filling station…</option>
                {customers.map(c => <option key={c.id} value={String(c.id)}>{c.customer_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Destination / Location <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. Oguta Road, Owerri" value={setupDestination} onChange={e => setSetupDestination(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Allocation Code <span className="text-xs text-slate-400">(optional)</span></Label>
              <Input placeholder="e.g. SOR-001" value={setupCode} onChange={e => setSetupCode(e.target.value.toUpperCase())} />
            </div>

            {/* Overpayment transfer */}
            {setupTarget && setupTarget.balance < 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5"><ArrowRightLeft size={12} /> Transfer Overpayment</p>
                <p className="text-xs text-blue-700">Available: {fmt(Math.abs(setupTarget.balance))}</p>
                <div className="space-y-1">
                  <Label>Transfer To</Label>
                  <select aria-label="Setup transfer target" value={setupTransferTargetKey} onChange={e => setSetupTransferTargetKey(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Select target row…</option>
                    {ledgerGroups.filter(g => g.key !== setupTarget.key).map(g => (
                      <option key={g.key} value={g.key}>{g.truckNumber} · {g.customerName || 'Customer pending'} · Bal {g.expected > 0 ? fmt(g.balance) : '—'}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Transfer Amount</Label>
                  <Input type="text" inputMode="decimal" value={setupTransferAmount} onChange={e => setSetupTransferAmount(formatWithCommas(e.target.value))} placeholder="e.g. 1,000,000" />
                </div>
                <div className="flex justify-end">
                  <Button type="button" onClick={handleSetupTransfer} disabled={setupTransferSaving} className="gap-2 bg-blue-600 hover:bg-blue-700">
                    {setupTransferSaving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
                    {setupTransferSaving ? 'Transferring…' : 'Transfer Now'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupTarget(null)} disabled={setupSaving}>Cancel</Button>
            <Button onClick={handleSaveSetup} disabled={setupSaving} className="gap-2">
              {setupSaving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {setupSaving ? 'Saving…' : 'Save Setup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Edit Entry Dialog                                                  */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!editTarget} onOpenChange={open => { if (!open) { setEditTarget(null); setEditForm(null); } }}>
        <DialogContent className="sm:max-w-[580px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-100"><Pencil className="w-5 h-5 text-slate-600" /></div>
              <div>
                <h2 className="text-lg font-semibold">Edit Entry</h2>
                <p className="text-sm font-normal text-slate-500">{editTarget?.truck_number} · {editTarget?.date_of_payment}</p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Edit a daily sale entry</DialogDescription>
          </DialogHeader>

          {editForm && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Volume (Ltrs)</Label>
                  <Input className="h-9 text-sm" value={editForm.quantity}
                    onChange={e => {
                      const qty = formatWithCommas(e.target.value);
                      const q = Number(stripCommas(qty)) || 0;
                      const r = toNum(editTarget?.rate ?? 0) || Number(stripCommas(editForm.rate)) || 0;
                      const sv = q && r ? formatWithCommas(String(q * r)) : editForm.sales_value;
                      setEditForm(prev => prev ? { ...prev, quantity: qty, sales_value: sv } : null);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rate (₦/L){toNum(editTarget?.rate ?? 0) > 0 && <span className="text-slate-400 ml-1 text-[10px]">(locked)</span>}</Label>
                  <Input className="h-9 text-sm" readOnly={toNum(editTarget?.rate ?? 0) > 0}
                    value={toNum(editTarget?.rate ?? 0) > 0 ? formatWithCommas(String(toNum(editTarget!.rate))) : editForm.rate}
                    onChange={e => {
                      if (toNum(editTarget?.rate ?? 0) > 0) return;
                      const rate = formatWithCommas(e.target.value);
                      const r = Number(stripCommas(rate)) || 0;
                      const q = Number(stripCommas(editForm.quantity)) || 0;
                      const sv = q && r ? formatWithCommas(String(q * r)) : editForm.sales_value;
                      setEditForm(prev => prev ? { ...prev, rate, sales_value: sv } : null);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Expected (₦)</Label>
                  <Input className="h-9 text-sm" value={editForm.sales_value}
                    onChange={e => setEditForm(prev => prev ? { ...prev, sales_value: formatWithCommas(e.target.value) } : null)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Amount Paid (₦)</Label>
                  <Input className="h-9 text-sm" value={editForm.payment_amount}
                    onChange={e => setEditForm(prev => prev ? { ...prev, payment_amount: formatWithCommas(e.target.value) } : null)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Date of Payment</Label>
                  <Input type="date" className="h-9 text-sm" value={editForm.date_of_payment}
                    onChange={e => setEditForm(prev => prev ? { ...prev, date_of_payment: e.target.value } : null)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Payer's Name</Label>
                  <Input className="h-9 text-sm" value={editForm.payer_name}
                    onChange={e => setEditForm(prev => prev ? { ...prev, payer_name: e.target.value.replace(/[0-9]/g, '') } : null)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input className="h-9 text-sm" value={editForm.phone_number}
                    onChange={e => setEditForm(prev => prev ? { ...prev, phone_number: e.target.value } : null)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bank Account</Label>
                <select aria-label="Edit bank account" value={editForm.bank_account_id}
                  onChange={e => setEditForm(prev => prev ? { ...prev, bank_account_id: e.target.value } : null)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select account…</option>
                  {activeBankAccounts.map(b => <option key={b.id} value={String(b.id)}>{b.account_number} · {b.bank_name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Remarks</Label>
                <Input className="h-9 text-sm" value={editForm.remarks}
                  onChange={e => setEditForm(prev => prev ? { ...prev, remarks: e.target.value } : null)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditForm(null); }} disabled={editSaving}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving} className="gap-2">
              {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
              {editSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Delete Confirm Dialog                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100"><Trash2 className="w-5 h-5 text-red-600" /></div>
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
