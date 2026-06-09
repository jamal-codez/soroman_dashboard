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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus, Search, Download, Loader2, Trash2, Pencil,
  Truck, Wallet, FileText,
  TrendingUp, Banknote, Building2,
  Calendar as CalendarIcon, UserPlus, X, Fuel,
  MapPin, Users, LayoutGrid, Filter, AlertTriangle, Tag,
  Clock, Link2, ArrowRightLeft, ChevronRight, ChevronDown, Receipt,
} from 'lucide-react';
import {
  format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, isWithinInterval,
} from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { isCurrentUserReadOnly } from '@/roles';
import { cn } from '@/lib/utils';

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
const isFillingStation = (c: DeliveryCustomer | undefined | null): boolean => {
  if (!c) return false;
  const name = (c.customer_name || '').toLowerCase();
  return (
    c.customer_type === 'filling_station' ||
    (c.customer_type == null && !!c.notes?.startsWith(LEGACY_FS_PREFIX)) ||
    name.includes('station') ||
    name.includes('filling') ||
    name.includes('retail') ||
    name.includes('outlet')
  );
};

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
  expenses_amount?: string | number;
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
  totalExpenses: number;
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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
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
  const [activeEntryTab, setActiveEntryTab] = useState<'sale' | 'deposit' | 'expense'>('sale');
  const [quickPaymentForm, setQuickPaymentForm] = useState<QuickPaymentForm>({
    payment_amount: '',
    rate: '',
    quantity: '',
    date_of_payment: '',
    payer_name: '',
    phone_number: '',
    bank_account_id: '',
    remarks: '',
  });
  const [quickPaymentSaving, setQuickPaymentSaving] = useState(false);

  // ── Card expand/collapse ───────────────────────────────────────────
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const toggleCard = (key: string) =>
    setCollapsedCards(prev => {
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
      t.totalPaid += cycle.totalPaid;
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

      let cumulativeExpected = 0;
      let cumulativePaid = 0;
      sorted.forEach(s => {
        cumulativeExpected += toNum(s.sales_value);
        cumulativePaid += toNum(s.payment_amount);
        balanceMap.set(s.id, cumulativeExpected - cumulativePaid);
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

      // Allocated quantity is the maximum quantity among payments (customer's initial assignment entry),
      // or falls back to loading.quantity_allocated if payments are empty.
      const maxSaleQty = payments.reduce((max, sale) => Math.max(max, toNum(sale.quantity)), 0);
      const quantity = maxSaleQty > 0 ? maxSaleQty : toNum(loading.quantity_allocated);

      // Daily pump sales are entries where the quantity is strictly less than the allocated quantity.
      const dailySales = payments.filter(sale => {
        const q = toNum(sale.quantity);
        return q > 0 && q < quantity;
      });

      // Expected revenue is derived strictly from the daily sales at the pump.
      const expected = dailySales.reduce((sum, sale) => sum + toNum(sale.sales_value), 0);
      const rate = dailySales.reduce((maxValue, sale) => Math.max(maxValue, toNum(sale.rate)), 0) || payments.reduce((maxValue, sale) => Math.max(maxValue, toNum(sale.rate)), 0);
      // Deposits paid includes all payments/deposits recorded.
      const totalPaid = payments.reduce((sum, sale) => sum + toNum(sale.payment_amount), 0);
      const totalExpenses = payments.reduce((sum, sale) => sum + toNum(sale.expenses_amount ?? 0), 0);
      const totalQtySold = dailySales.reduce((sum, sale) => sum + toNum(sale.quantity), 0);

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
        location: loading.location || customerObj?.customer_name || firstPayment?.location || '',
        customerId,
        customerName: loading.customer_name || customerObj?.customer_name || firstPayment?.customer_name || '',
        quantity,
        totalQtySold,
        rate,
        expected,
        totalPaid,
        totalExpenses,
        balance: expected - (totalPaid - totalExpenses),
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

      const quantity = payments.reduce((max, sale) => Math.max(max, toNum(sale.quantity)), 0);

      // Daily pump sales are entries where the quantity is strictly less than the allocated quantity.
      const dailySales = payments.filter(sale => {
        const q = toNum(sale.quantity);
        return q > 0 && q < quantity;
      });

      const expected = dailySales.reduce((sum, sale) => sum + toNum(sale.sales_value), 0);
      const totalPaid = payments.reduce((sum, sale) => sum + toNum(sale.payment_amount), 0);
      const totalExpenses = payments.reduce((sum, sale) => sum + toNum(sale.expenses_amount ?? 0), 0);
      const totalQtySold = dailySales.reduce((sum, sale) => sum + toNum(sale.quantity), 0);

      groups.push({
        key: `sale:${key}`,
        truckNumber: firstPayment.truck_number,
        dateLoaded: firstPayment.date_loaded || '',
        depot: firstPayment.depot_loaded || '',
        location: firstPayment.location || customerObj?.customer_name || '',
        customerId: firstPayment.customer || null,
        customerName: firstPayment.customer_name || customerObj?.customer_name || '',
        quantity,
        totalQtySold,
        rate: dailySales.reduce((maxValue, sale) => Math.max(maxValue, toNum(sale.rate)), 0) || sorted.reduce((maxValue, sale) => Math.max(maxValue, toNum(sale.rate)), 0),
        expected,
        totalPaid,
        totalExpenses,
        balance: expected - (totalPaid - totalExpenses),
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
    let totalExpenses = 0;
    let totalNetPaid = 0;
    let totalQtyAllocated = 0;
    let totalQtySold = 0;
    let totalOutstanding = 0;
    let totalOverpaid = 0;
    let totalBalance = 0;
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
      totalExpenses += toNum(group.totalExpenses);
      totalNetPaid += toNum(group.totalPaid) - toNum(group.totalExpenses);
      totalBalance += toNum(group.balance);
      entries += group.payments.length;

      const bal = toNum(group.balance);
      if (bal > 0) totalOutstanding += bal;
      else if (bal < 0) totalOverpaid += Math.abs(bal);
    });

    return {
      entries,
      totalExpected,
      totalPaid,
      totalExpenses,
      totalNetPaid,
      totalQtyAllocated,
      totalQtySold,
      outstanding: totalOutstanding,
      totalOutstanding,
      totalOverpaid,
      balance: totalBalance,
      truckCount: uniqueTrucks.size,
      customerCount: uniqueCustomers.size,
    };
  }, [filteredLedgerGroups]);

  const summaryCards = useMemo((): SummaryCard[] => {
    const pctSold = totals.totalQtyAllocated > 0
      ? Math.round((totals.totalQtySold / totals.totalQtyAllocated) * 100)
      : 0;

    const cards: SummaryCard[] = [
      {
        title: 'Active Stations',
        value: String(totals.truckCount),
        description: `${totals.customerCount} customer${totals.customerCount === 1 ? '' : 's'} · ${totals.entries} entries logged`,
        icon: <Truck size={20} />,
        tone: 'neutral',
      },
      {
        title: 'Volume Sold / Allocated',
        value: totals.totalQtyAllocated > 0 ? `${totals.totalQtySold.toLocaleString()} / ${totals.totalQtyAllocated.toLocaleString()} L` : '0 L',
        description: `${pctSold}% of allocated volume sold`,
        icon: <Fuel size={20} />,
        tone: 'neutral',
      },
      {
        title: 'Expected Revenue',
        value: fmt(totals.totalExpected),
        description: 'Target value of all daily pump sales',
        icon: <TrendingUp size={20} />,
        tone: 'neutral',
      },
      {
        title: 'Total Deposited',
        value: fmt(totals.totalPaid),
        description: 'Bank deposits & collections received',
        icon: <Banknote size={20} />,
        tone: 'green',
      },
      {
        title: 'Total Expenses',
        value: fmt(totals.totalExpenses),
        description: 'Operating costs recorded against stations',
        icon: <Receipt size={20} />,
        tone: 'amber',
      },
      {
        title: 'Outstanding Balance',
        value: totals.balance > 0 ? fmt(totals.balance) : totals.balance < 0 ? `+${fmt(Math.abs(totals.balance))}` : '₦0.00 ✓',
        description: totals.balance > 0 ? 'Yet to be collected from stations' : totals.balance < 0 ? 'Overpaid beyond expected revenue' : 'Fully reconciled — nothing outstanding',
        icon: <Wallet size={20} />,
        tone: totals.balance > 0 ? 'red' : 'green',
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
      prev.qty += toNum(s.quantity);
      prev.expected += toNum(s.sales_value);
      prev.paid += toNum(s.payment_amount);
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

  const openQuickPaymentDialog = (group: LedgerGroup, tab: 'sale' | 'deposit' | 'expense' = 'sale') => {
    if (!group.customerId) {
      toast({ title: 'Set up this row first', description: 'Click "Set Up" to assign the customer, destination and quantity.', variant: 'destructive' });
      return;
    }

    const customer = group.customerId ? customerMap.get(group.customerId) : null;
    const today = format(new Date(), 'yyyy-MM-dd');
    setQuickPaymentTarget(group);
    setActiveEntryTab(tab);
    setQuickPaymentForm({
      payment_amount: '',
      rate: group.rate > 0 ? String(group.rate) : '',
      quantity: '',
      date_of_payment: today,
      payer_name: '',
      phone_number: customer?.contact_person_phone || customer?.phone_number || '',
      bank_account_id: '',
      remarks: '',
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

    if (activeEntryTab === 'sale') {
      const enteredQty = Number(stripCommas(quickPaymentForm.quantity));
      const enteredRate = Number(stripCommas(quickPaymentForm.rate));
      if (!enteredQty || enteredQty <= 0) {
        toast({ title: 'Enter a valid volume sold', variant: 'destructive' });
        return;
      }
      if (!enteredRate || enteredRate <= 0) {
        toast({ title: 'Enter a valid rate', variant: 'destructive' });
        return;
      }

      setQuickPaymentSaving(true);
      try {
        const currentUser = localStorage.getItem('fullname') || 'Unknown';
        const enteredExpected = enteredQty * enteredRate;
        await apiClient.admin.createDeliverySale({
          truck_number: quickPaymentTarget.truckNumber,
          date_loaded: quickPaymentTarget.dateLoaded || undefined,
          depot_loaded: quickPaymentTarget.depot || undefined,
          customer: quickPaymentTarget.customerId || 0,
          location: quickPaymentTarget.location || undefined,
          quantity: enteredQty,
          rate: enteredRate,
          sales_value: enteredExpected,
          payment_amount: 0,
          date_of_payment: quickPaymentForm.date_of_payment || format(new Date(), 'yyyy-MM-dd'),
          remarks: quickPaymentForm.remarks.trim() || `Daily sale: ${enteredQty.toLocaleString()}L @ ₦${enteredRate.toLocaleString()}/L`,
          entered_by: currentUser,
          allocation_code: quickPaymentTarget.code || undefined,
        });

        toast({
          title: 'Daily sale recorded',
          description: `${quickPaymentTarget.truckNumber} · ${enteredQty.toLocaleString()} Ltrs @ ₦${enteredRate.toLocaleString()}/L`,
        });
        setQuickPaymentTarget(null);
        setQuickPaymentForm({ payment_amount: '', rate: '', quantity: '', date_of_payment: '', payer_name: '', phone_number: '', bank_account_id: '', remarks: '' });
        invalidateAll();
      } catch (err: unknown) {
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to record sale',
          variant: 'destructive',
        });
      } finally {
        setQuickPaymentSaving(false);
      }
    } else if (activeEntryTab === 'deposit') {
      // bank deposit
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

        await apiClient.admin.createDeliverySale({
          truck_number: quickPaymentTarget.truckNumber,
          date_loaded: quickPaymentTarget.dateLoaded || undefined,
          depot_loaded: quickPaymentTarget.depot || undefined,
          customer: quickPaymentTarget.customerId || 0,
          location: quickPaymentTarget.location || undefined,
          quantity: 0,
          rate: 0,
          sales_value: 0,
          payment_amount: paymentAmount,
          payer_name: payerName || undefined,
          bank: bankStr,
          date_of_payment: quickPaymentForm.date_of_payment || format(new Date(), 'yyyy-MM-dd'),
          phone_number: quickPaymentForm.phone_number.trim() || undefined,
          remarks: quickPaymentForm.remarks.trim() || `Bank Deposit: ₦${paymentAmount.toLocaleString()}`,
          entered_by: currentUser,
          allocation_code: quickPaymentTarget.code || undefined,
        });

        toast({
          title: 'Deposit recorded',
          description: `${quickPaymentTarget.truckNumber} · ₦${paymentAmount.toLocaleString()}`,
        });
        setQuickPaymentTarget(null);
        setQuickPaymentForm({ payment_amount: '', rate: '', quantity: '', date_of_payment: '', payer_name: '', phone_number: '', bank_account_id: '', remarks: '' });
        invalidateAll();
      } catch (err: unknown) {
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to record deposit',
          variant: 'destructive',
        });
      } finally {
        setQuickPaymentSaving(false);
      }
    } else if (activeEntryTab === 'expense') {
      // daily expense
      const expenseAmount = Number(stripCommas(quickPaymentForm.payment_amount));
      const expenseDesc = quickPaymentForm.remarks.trim();

      if (!expenseAmount || expenseAmount <= 0) {
        toast({ title: 'Enter a valid expense amount', variant: 'destructive' });
        return;
      }
      if (!expenseDesc) {
        toast({ title: 'Enter an expense description', variant: 'destructive' });
        return;
      }

      setQuickPaymentSaving(true);
      try {
        const currentUser = localStorage.getItem('fullname') || 'Unknown';

        await apiClient.admin.createDeliverySale({
          truck_number: quickPaymentTarget.truckNumber,
          date_loaded: quickPaymentTarget.dateLoaded || undefined,
          depot_loaded: quickPaymentTarget.depot || undefined,
          customer: quickPaymentTarget.customerId || 0,
          location: quickPaymentTarget.location || undefined,
          quantity: 0,
          rate: 0,
          sales_value: 0,
          payment_amount: 0,
          expenses_amount: expenseAmount,
          payer_name: 'EXPENSE',
          bank: 'EXPENSE',
          date_of_payment: quickPaymentForm.date_of_payment || format(new Date(), 'yyyy-MM-dd'),
          remarks: expenseDesc,
          entered_by: currentUser,
          allocation_code: quickPaymentTarget.code || undefined,
        });

        toast({
          title: 'Expense recorded',
          description: `${quickPaymentTarget.truckNumber} · ₦${expenseAmount.toLocaleString()}`,
        });
        setCollapsedCards(prev => {
          const next = new Set(prev);
          next.delete(quickPaymentTarget.key);
          return next;
        });
        setQuickPaymentTarget(null);
        setQuickPaymentForm({ payment_amount: '', rate: '', quantity: '', date_of_payment: '', payer_name: '', phone_number: '', bank_account_id: '', remarks: '' });
        invalidateAll();
      } catch (err: unknown) {
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to record expense',
          variant: 'destructive',
        });
      } finally {
        setQuickPaymentSaving(false);
      }
    }
  }, [quickPaymentTarget, quickPaymentForm, activeEntryTab, toast, bankMap]);

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
      quantity: qty > 0 ? formatWithCommas(String(qty)) : '',
      rate: rate > 0 ? formatWithCommas(String(rate)) : '',
      sales_value: sv > 0 ? formatWithCommas(String(sv)) : '',
      payment_amount: pa > 0 ? formatWithCommas(String(pa)) : '',
      payer_name: sale.payer_name || '',
      bank_account_id: bankStringToId(sale.bank || ''),
      date_of_payment: sale.date_of_payment || '',
      remarks: sale.remarks || '',
      phone_number: sale.phone_number || '',
      location: sale.location || '',
      date_loaded: sale.date_loaded || '',
    });
  };

  const handleEditSave = useCallback(async () => {
    if (!editTarget || !editForm) return;
    setEditSaving(true);

    const isSale = toNum(editTarget.quantity) > 0 || toNum(editTarget.rate) > 0 || (toNum(editTarget.sales_value) > 0 && toNum(editTarget.payment_amount) === 0);

    try {
      if (isSale) {
        const qty = Number(stripCommas(editForm.quantity)) || 0;
        const rate = Number(stripCommas(editForm.rate)) || 0;
        const computedSv = qty * rate;

        await apiClient.admin.updateDeliverySale(editTarget.id, {
          quantity: qty,
          rate: rate,
          sales_value: computedSv,
          payment_amount: 0,
          payer_name: null as any, // Clear payer details for sale
          bank: null as any,       // Clear bank details for sale
          date_of_payment: editForm.date_of_payment || undefined,
          remarks: editForm.remarks.trim() || undefined,
          phone_number: undefined,
          location: editForm.location.trim() || undefined,
          allocation_code: editAllocationCode || null,
          ...(editForm.date_loaded && editForm.date_loaded !== editTarget.date_loaded
            ? { date_loaded: editForm.date_loaded }
            : {}),
        });
      } else {
        // deposit edit
        const bankAcct = editForm.bank_account_id
          ? BANK_ACCOUNTS.find(b => String(b.id) === editForm.bank_account_id)
          : null;
        const bankStr = bankAcct
          ? `${bankAcct.account_number} · ${bankAcct.bank_name}`
          : editTarget.bank || undefined;
        const pa = Number(stripCommas(editForm.payment_amount)) || 0;

        await apiClient.admin.updateDeliverySale(editTarget.id, {
          quantity: 0,
          rate: 0,
          sales_value: 0,
          payment_amount: pa,
          payer_name: editForm.payer_name.trim() || undefined,
          bank: bankStr,
          date_of_payment: editForm.date_of_payment || undefined,
          remarks: editForm.remarks.trim() || undefined,
          phone_number: editForm.phone_number.trim() || undefined,
          location: editForm.location.trim() || undefined,
          allocation_code: editAllocationCode || null,
          ...(editForm.date_loaded && editForm.date_loaded !== editTarget.date_loaded
            ? { date_loaded: editForm.date_loaded }
            : {}),
        });
      }

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
    if (!filteredLedgerGroups.length) return;
    const period = timePreset === 'custom'
      ? `${customFrom || '?'}_TO_${customTo || '?'}`
      : timePreset.toUpperCase();

    const fmtNaira = (v: number) => v !== 0 ? `₦${v.toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : '₦0.00';
    const u = (s: string) => (s || '').toUpperCase();

    const wb = XLSX.utils.book_new();

    // ── helpers ────────────────────────────────────────────────────────
    const entryColHeaders = [
      'S/N', 'TRUCK NO.', 'ALLOC CODE', 'ALLOC DATE', 'ALLOCATED (L)',
      'ENTRY DATE', 'ENTRY TYPE', 'VOLUME (L)', 'RATE (₦/L)',
      'EXPECTED (₦)', 'DEPOSITED (₦)', 'EXPENSES (₦)', 'NET AMOUNT (₦)',
      'PAYER NAME', 'BANK ACCOUNT', 'REMARKS',
    ];

    const buildEntryRows = (groups: typeof filteredLedgerGroups) => {
      const rows: (string | number)[][] = [];
      let sn = 0;
      groups.forEach(group => {
        const truckNo = u(group.truckNumber);
        const allocCode = u(group.code || '—');
        let allocDateStr = '—';
        try { if (group.dateLoaded) allocDateStr = format(parseISO(group.dateLoaded), 'dd/MM/yyyy'); } catch { }

        const actualEntries = group.payments.filter(p =>
          (toNum(p.quantity) > 0 && toNum(p.quantity) < group.quantity) ||
          toNum(p.payment_amount) > 0 ||
          toNum(p.expenses_amount ?? 0) > 0,
        ).sort((a, b) => {
          const dA = a.date_of_payment || a.date_loaded || '';
          const dB = b.date_of_payment || b.date_loaded || '';
          return dA.localeCompare(dB) || a.id - b.id;
        });

        if (actualEntries.length === 0) {
          sn += 1;
          rows.push([sn, truckNo, allocCode, allocDateStr, group.quantity > 0 ? group.quantity : 0,
            '—', 'INITIAL ALLOC (NO ENTRIES)', 0, 0, 0, 0, 0, 0, '—', '—',
            'No sales, deposits or expenses recorded yet.']);
        } else {
          actualEntries.forEach(entry => {
            sn += 1;
            const entryDate = entry.date_of_payment || entry.date_loaded || '';
            let entryDateStr = '—';
            try { if (entryDate) entryDateStr = format(parseISO(entryDate), 'dd/MM/yyyy'); } catch { }

            const dailyQty = toNum(entry.quantity);
            const dailyRate = toNum(entry.rate);
            const dailyDeposit = toNum(entry.payment_amount);
            const dailyExpense = toNum(entry.expenses_amount ?? 0);
            const isSale = dailyQty > 0 && dailyQty < group.quantity;
            const isExpense = dailyExpense > 0;
            const isDeposit = dailyDeposit > 0;

            let entryType = 'OTHER';
            if (isSale) entryType = 'DAILY SALE';
            else if (isExpense) entryType = 'EXPENSE';
            else if (isDeposit) entryType = 'BANK DEPOSIT';

            const netAmount = dailyDeposit - dailyExpense;

            rows.push([
              sn, truckNo, allocCode, allocDateStr, group.quantity > 0 ? group.quantity : 0,
              entryDateStr, entryType,
              isSale ? dailyQty : '—',
              isSale ? dailyRate : '—',
              isSale ? toNum(entry.sales_value) : '—',
              isDeposit || isSale ? dailyDeposit : '—',
              isExpense ? dailyExpense : '—',
              isDeposit || isExpense ? netAmount : '—',
              u(entry.payer_name || '—'),
              u(entry.bank || '—'),
              u(entry.remarks || ''),
            ]);
          });
        }

        // Subtotal row per truck cycle within station sheet
        const netPaid = group.totalPaid - group.totalExpenses;
        const outstandingBal = group.expected - netPaid;
        rows.push([
          '', `SUBTOTAL: ${truckNo} (${allocCode})`, '', '', group.quantity > 0 ? group.quantity : 0,
          '', 'SUBTOTALS',
          group.totalQtySold, '',
          group.expected, group.totalPaid, group.totalExpenses, netPaid,
          '', '',
          outstandingBal > 0
            ? `Outstanding: ₦${outstandingBal.toLocaleString()}`
            : outstandingBal < 0
              ? `Overpaid: +₦${Math.abs(outstandingBal).toLocaleString()}`
              : 'Fully Settled ✓',
        ]);
        rows.push([]);
      });
      return rows;
    };

    // ════════════════════════════════════════════════════════════════
    // SHEET 1 — Summary (one row per station)
    // ════════════════════════════════════════════════════════════════
    const summaryAoa: (string | number)[][] = [];
    summaryAoa.push([`FILLING STATIONS — SUMMARY REPORT — ${period}`]);
    summaryAoa.push([]);
    summaryAoa.push([
      'S/N', 'STATION NAME', 'NO. CYCLES',
      'QTY ALLOCATED (L)', 'QTY SOLD (L)',
      'EXPECTED (₦)', 'DEPOSITED (₦)', 'EXPENSES (₦)',
      'NET COLLECTED (₦)', 'OUTSTANDING (₦)', 'STATUS',
    ]);

    // Group filteredLedgerGroups by customer name
    const byStation = new Map<string, typeof filteredLedgerGroups>();
    filteredLedgerGroups.forEach(group => {
      const key = (group.customerName || 'UNKNOWN').trim().toUpperCase();
      const arr = byStation.get(key) ?? [];
      arr.push(group);
      byStation.set(key, arr);
    });

    let sumQtyAllocated = 0, sumQtySold = 0, sumExpected = 0;
    let sumDeposited = 0, sumExpenses = 0, sumNet = 0, sumOutstanding = 0;
    let summaryRowSn = 0;

    byStation.forEach((groups, stationName) => {
      summaryRowSn += 1;
      const stQtyAlloc = groups.reduce((s, g) => s + Math.max(0, g.quantity), 0);
      const stQtySold = groups.reduce((s, g) => s + Math.max(0, g.totalQtySold), 0);
      const stExpected = groups.reduce((s, g) => s + Math.max(0, g.expected), 0);
      const stDeposited = groups.reduce((s, g) => s + g.totalPaid, 0);
      const stExpenses = groups.reduce((s, g) => s + g.totalExpenses, 0);
      const stNet = stDeposited - stExpenses;
      const stOutstanding = Math.max(0, stExpected - stNet);
      const stStatus = stOutstanding === 0
        ? 'SETTLED ✓'
        : stDeposited === 0 ? 'NO DEPOSIT' : 'OUTSTANDING';

      summaryAoa.push([
        summaryRowSn, stationName, groups.length,
        stQtyAlloc, stQtySold,
        stExpected, stDeposited, stExpenses,
        stNet, stOutstanding, stStatus,
      ]);

      sumQtyAllocated += stQtyAlloc;
      sumQtySold += stQtySold;
      sumExpected += stExpected;
      sumDeposited += stDeposited;
      sumExpenses += stExpenses;
      sumNet += stNet;
      sumOutstanding += stOutstanding;
    });

    summaryAoa.push([]);
    summaryAoa.push([
      'GRAND TOTAL', '', byStation.size > 0 ? filteredLedgerGroups.length : 0,
      sumQtyAllocated, sumQtySold,
      sumExpected, sumDeposited, sumExpenses,
      sumNet, sumOutstanding, '',
    ]);
    summaryAoa.push([]);
    summaryAoa.push(['Generated:', new Date().toLocaleString('en-NG')]);

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // ════════════════════════════════════════════════════════════════
    // SHEETS 2+ — One sheet per station
    // ════════════════════════════════════════════════════════════════
    byStation.forEach((groups, stationName) => {
      const sheetAoa: (string | number)[][] = [];
      sheetAoa.push([`STATION: ${stationName} — ${period}`]);
      sheetAoa.push([]);

      // Station-level summary block at top
      const stQtyAlloc = groups.reduce((s, g) => s + Math.max(0, g.quantity), 0);
      const stQtySold = groups.reduce((s, g) => s + Math.max(0, g.totalQtySold), 0);
      const stExpected = groups.reduce((s, g) => s + Math.max(0, g.expected), 0);
      const stDeposited = groups.reduce((s, g) => s + g.totalPaid, 0);
      const stExpenses = groups.reduce((s, g) => s + g.totalExpenses, 0);
      const stNet = stDeposited - stExpenses;
      const stOutstanding = stExpected - stNet;

      sheetAoa.push(['STATION SUMMARY']);
      sheetAoa.push(['Qty Allocated (L)', stQtyAlloc]);
      sheetAoa.push(['Qty Sold (L)', stQtySold]);
      sheetAoa.push(['Expected Revenue', fmtNaira(stExpected)]);
      sheetAoa.push(['Total Deposited', fmtNaira(stDeposited)]);
      sheetAoa.push(['Total Expenses', fmtNaira(stExpenses)]);
      sheetAoa.push(['Net Collected', fmtNaira(stNet)]);
      sheetAoa.push([
        'Outstanding / Balance',
        stOutstanding > 0
          ? fmtNaira(stOutstanding) + ' OUTSTANDING'
          : stOutstanding < 0
            ? fmtNaira(Math.abs(stOutstanding)) + ' OVERPAID'
            : 'FULLY SETTLED ✓',
      ]);
      sheetAoa.push([]);
      sheetAoa.push(['TRANSACTION DETAIL']);
      sheetAoa.push(entryColHeaders);

      const entryRows = buildEntryRows(groups);
      entryRows.forEach(row => sheetAoa.push(row));

      // Safe sheet name: max 31 chars, no special chars
      const safeSheetName = stationName.replace(/[\\/*?[\]:]/g, '').slice(0, 31);
      const stationWs = XLSX.utils.aoa_to_sheet(sheetAoa);
      XLSX.utils.book_append_sheet(wb, stationWs, safeSheetName);
    });

    XLSX.writeFile(wb, `FILLING-STATION-LEDGER-${period}.xlsx`);
  }, [filteredLedgerGroups, totals, timePreset, customFrom, customTo]);

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
                  <Button variant="default" className="gap-2" onClick={exportExcel} disabled={filteredLedgerGroups.length === 0}>
                    <Download size={16} /> Download Report
                  </Button>
                </>
              }
            />

            {/* ── Summary Cards ── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Filter Panel ── */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <Input
                    placeholder="Search station, truck, code…"
                    className="pl-8 h-9 text-sm"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button title="Clear" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Time Presets — inline pills */}
                <div className="flex flex-wrap gap-1.5">
                  {(['today', 'yesterday', 'week', 'month', 'year', 'all'] as TimePreset[]).map(tp => (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => handlePresetChange(tp)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${timePreset === tp
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {tp === 'all' ? 'All' : tp.charAt(0).toUpperCase() + tp.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Advanced filters toggle */}
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(f => !f)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    showAdvancedFilters || [truckFilter, locationFilter, customerFilter, allocationCodeFilter, rateFilter].some(f => f !== 'all')
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <Filter size={11} />
                  Filters
                  {[truckFilter, locationFilter, customerFilter, allocationCodeFilter, rateFilter].filter(f => f !== 'all').length > 0 && (
                    <span className="ml-0.5 bg-white text-slate-900 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                      {[truckFilter, locationFilter, customerFilter, allocationCodeFilter, rateFilter].filter(f => f !== 'all').length}
                    </span>
                  )}
                  <ChevronDown size={11} className={`transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Custom date range */}
              {timePreset === 'custom' && (
                <div className="px-4 pb-3 flex flex-wrap gap-3 items-end border-t border-slate-100 pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">From</Label>
                    <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 w-[150px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">To</Label>
                    <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 w-[150px]" />
                  </div>
                </div>
              )}

              {/* Advanced dropdown filters — collapsible */}
              {showAdvancedFilters && (
                <div className="border-t border-slate-100 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider"><Truck size={10} /> Truck</label>
                    <select aria-label="Truck" value={truckFilter} onChange={e => setTruckFilter(e.target.value)}
                      className={`h-8 w-full rounded-md border bg-white px-2 text-xs ${truckFilter !== 'all' ? 'border-slate-700 font-semibold' : 'border-slate-200 text-slate-600'}`}>
                      <option value="all">All</option>
                      {uniqueTruckNumbers.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider"><MapPin size={10} /> Destination</label>
                    <select aria-label="Destination" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
                      className={`h-8 w-full rounded-md border bg-white px-2 text-xs ${locationFilter !== 'all' ? 'border-slate-700 font-semibold' : 'border-slate-200 text-slate-600'}`}>
                      <option value="all">All</option>
                      {uniqueLocations.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider"><Users size={10} /> Station</label>
                    <select aria-label="Station" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
                      className={`h-8 w-full rounded-md border bg-white px-2 text-xs ${customerFilter !== 'all' ? 'border-slate-700 font-semibold' : 'border-slate-200 text-slate-600'}`}>
                      <option value="all">All</option>
                      {uniqueCustomerOptions.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                    </select>
                  </div>
                  {uniqueAllocationCodes.length > 0 && (
                    <div className="space-y-1">
                      <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider"><Tag size={10} /> Code</label>
                      <select aria-label="Code" value={allocationCodeFilter} onChange={e => setAllocationCodeFilter(e.target.value)}
                        className={`h-8 w-full rounded-md border bg-white px-2 text-xs ${allocationCodeFilter !== 'all' ? 'border-purple-600 font-semibold text-purple-900 bg-purple-50' : 'border-slate-200 text-slate-600'}`}>
                        <option value="all">All</option>
                        {uniqueAllocationCodes.map(code => <option key={code} value={code}>{code}</option>)}
                      </select>
                    </div>
                  )}
                  {uniqueRates.length > 0 && (
                    <div className="space-y-1">
                      <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider"><TrendingUp size={10} /> Rate</label>
                      <select aria-label="Rate" value={rateFilter} onChange={e => setRateFilter(e.target.value)}
                        className={`h-8 w-full rounded-md border bg-white px-2 text-xs ${rateFilter !== 'all' ? 'border-indigo-600 font-semibold text-indigo-900 bg-indigo-50' : 'border-slate-200 text-slate-600'}`}>
                        <option value="all">All</option>
                        {uniqueRates.map(r => <option key={r} value={String(r)}>₦{r.toLocaleString()}/L</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Active filter chips */}
              {(truckFilter !== 'all' || locationFilter !== 'all' || customerFilter !== 'all' || allocationCodeFilter !== 'all' || rateFilter !== 'all') && (
                <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                  {truckFilter !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"><Truck size={9} />{truckFilter}<button type="button" title="Remove truck filter" onClick={() => setTruckFilter('all')}><X size={9} /></button></span>}
                  {locationFilter !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"><MapPin size={9} />{locationFilter}<button type="button" title="Remove destination filter" onClick={() => setLocationFilter('all')}><X size={9} /></button></span>}
                  {customerFilter !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"><Users size={9} />{uniqueCustomerOptions.find(c => String(c.id) === customerFilter)?.name || customerFilter}<button type="button" title="Remove station filter" onClick={() => setCustomerFilter('all')}><X size={9} /></button></span>}
                  {allocationCodeFilter !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs font-medium"><Tag size={9} />{allocationCodeFilter}<button type="button" title="Remove code filter" onClick={() => setAllocationCodeFilter('all')}><X size={9} /></button></span>}
                  {rateFilter !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-medium">₦{Number(rateFilter).toLocaleString()}/L<button type="button" title="Remove rate filter" onClick={() => setRateFilter('all')}><X size={9} /></button></span>}
                </div>
              )}
            </div>

            {/* ── Unified Station Ledger: sales, deposits & expenses in one place ── */}
            <div className="space-y-4">
              {isLoading ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : filteredLedgerGroups.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-16 text-center">
                  <Fuel className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No filling station allocations found</p>
                  <p className="text-sm text-slate-400 mt-1">Assign filling stations in the inventory or Sales Ledger first.</p>
                </div>
              ) : (
                <>
                  {filteredLedgerGroups.map((group, idx) => {
                    const isExpanded = !collapsedCards.has(group.key);
                    const theme = getCodeTheme(group.code);
                    const pctSold = group.quantity > 0 ? Math.min(100, Math.round((group.totalQtySold / group.quantity) * 100)) : 0;

                    const dailySalesOnly = group.payments.filter(
                      p => toNum(p.quantity) > 0 && toNum(p.quantity) < group.quantity
                    );
                    const depositsOnly = group.payments.filter(p => toNum(p.payment_amount) > 0);
                    const expensesOnly = group.payments.filter(p => toNum(p.expenses_amount ?? 0) > 0);

                    return (
                      <div
                        key={group.key}
                        className={cn(
                          'bg-white rounded-xl shadow-sm border overflow-hidden transition-all',
                          isExpanded ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-slate-200'
                        )}
                      >
                        {/* Card header */}
                        <div className="p-4 sm:p-5">
                          <div className="flex items-start justify-between gap-3">

                            {/* Left: expand toggle + identity */}
                            <div className="flex items-start gap-2.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => toggleCard(group.key)}
                                className="mt-0.5 shrink-0 p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                                title={isExpanded ? 'Collapse' : 'Expand'}
                              >
                                <ChevronRight size={16} className={`transition-transform duration-200 ${isExpanded ? 'rotate-90 text-emerald-600' : ''}`} />
                              </button>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-bold text-slate-900 text-sm uppercase tracking-tight truncate">
                                    {group.customerName || 'Unnamed Station'}
                                  </h3>
                                  {group.code && (
                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${theme ? theme.badge : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                      {group.code}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 flex-wrap">
                                  <span className="flex items-center gap-1"><Truck size={11} className="text-amber-500" />{group.truckNumber || '—'}</span>
                                  <span className="text-slate-300">·</span>
                                  <span className="flex items-center gap-1">
                                    <CalendarIcon size={11} className="text-slate-400" />
                                    {group.dateLoaded ? (() => { try { return format(parseISO(group.dateLoaded), 'dd MMM yyyy'); } catch { return group.dateLoaded; } })() : '—'}
                                  </span>
                                  {group.location && (
                                    <>
                                      <span className="text-slate-300">·</span>
                                      <span className="flex items-center gap-1"><MapPin size={11} className="text-slate-400" />{group.location}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: actions */}
                            {!readOnly && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                                      <Plus size={13} /> Record <ChevronDown size={11} />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-44">
                                    <DropdownMenuItem onClick={() => openQuickPaymentDialog(group, 'sale')} className="gap-2 text-xs cursor-pointer">
                                      <Fuel size={13} className="text-emerald-600" /> Daily Sale
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openQuickPaymentDialog(group, 'deposit')} className="gap-2 text-xs cursor-pointer">
                                      <Banknote size={13} className="text-blue-600" /> Bank Deposit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openQuickPaymentDialog(group, 'expense')} className="gap-2 text-xs cursor-pointer">
                                      <Receipt size={13} className="text-amber-600" /> Expense
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700" onClick={() => openSetupDialog(group)} title="Edit setup">
                                  <Pencil size={13} />
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Metrics strip — 4 key numbers */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
                            <div className="space-y-0.5">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Allocated</p>
                              <p className="text-sm font-bold text-slate-800">{group.quantity > 0 ? `${fmtQty(group.quantity)} L` : '—'}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${pctSold >= 100 ? 'bg-emerald-500' : pctSold >= 60 ? 'bg-amber-400' : 'bg-slate-300'}`} style={{ width: `${pctSold}%` }} />
                                </div>
                                <span className="text-[10px] text-slate-400 font-semibold shrink-0">{pctSold}% sold</span>
                              </div>
                            </div>
                            <div className="space-y-0.5">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Expected</p>
                              <p className="text-sm font-bold text-slate-800">{group.expected > 0 ? fmt(group.expected) : '—'}</p>
                            </div>
                            <div className="space-y-0.5">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Deposited</p>
                              <p className="text-sm font-bold text-emerald-700">{group.totalPaid > 0 ? fmt(group.totalPaid) : '—'}</p>
                              {group.totalExpenses > 0 && (
                                <p className="text-[10px] text-amber-600">Expenses: {fmt(group.totalExpenses)}</p>
                              )}
                            </div>
                            <div className="space-y-0.5">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Balance</p>
                              <p className={`text-sm font-bold ${group.balance === 0 ? 'text-emerald-600' : group.balance > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                                {group.balance === 0 ? '✓ Settled' : group.balance > 0 ? fmt(group.balance) : `+${fmt(Math.abs(group.balance))}`}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Expanded: unified activity table */}
                        {isExpanded && (
                          <div className="border-t border-slate-100">
                            {group.payments.length === 0 ? (
                              <p className="py-8 text-sm text-slate-400 text-center">No activity recorded for this cycle yet.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <Table className="text-xs">
                                  <TableHeader>
                                    <TableRow className="bg-slate-50 border-b border-slate-100">
                                      <TableHead className="font-semibold text-slate-500 w-[90px] px-4">Type</TableHead>
                                      <TableHead className="font-semibold text-slate-500 w-[110px]">Date</TableHead>
                                      <TableHead className="font-semibold text-slate-500 text-right w-[120px]">Amount / Vol.</TableHead>
                                      <TableHead className="font-semibold text-slate-500">Details</TableHead>
                                      {!readOnly && <TableHead className="font-semibold text-slate-500 w-[72px] text-center">Actions</TableHead>}
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {[...group.payments]
                                      .sort((a, b) => (a.date_of_payment || '').localeCompare(b.date_of_payment || '') || a.id - b.id)
                                      .map((payment) => {
                                        const isSale = toNum(payment.quantity) > 0 && toNum(payment.quantity) < group.quantity;
                                        const isExpense = toNum(payment.expenses_amount ?? 0) > 0;
                                        const isDeposit = !isSale && !isExpense && toNum(payment.payment_amount) > 0;

                                        const dateStr = payment.date_of_payment
                                          ? (() => { try { return format(parseISO(payment.date_of_payment), 'dd MMM yy'); } catch { return payment.date_of_payment; } })()
                                          : '—';

                                        let typeBadge: React.ReactNode;
                                        let amountCell: React.ReactNode;
                                        let detailCell: React.ReactNode;

                                        if (isSale) {
                                          const qty = toNum(payment.quantity);
                                          const rate = toNum(payment.rate);
                                          const val = toNum(payment.sales_value);
                                          typeBadge = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><Fuel size={9} /> Sale</span>;
                                          amountCell = <span className="font-bold text-slate-800">{fmtQty(qty)} L</span>;
                                          detailCell = (
                                            <span className="text-slate-600">
                                              ₦{rate.toLocaleString()}/L · <span className="text-slate-800 font-semibold">{fmt(val)}</span>
                                              {payment.remarks && <span className="text-slate-400 ml-1.5 italic">· {payment.remarks}</span>}
                                            </span>
                                          );
                                        } else if (isExpense) {
                                          const amt = toNum(payment.expenses_amount ?? 0);
                                          typeBadge = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"><Receipt size={9} /> Expense</span>;
                                          amountCell = <span className="font-bold text-amber-700">{fmt(amt)}</span>;
                                          detailCell = <span className="text-slate-500 italic">{payment.remarks || '—'}</span>;
                                        } else {
                                          const amt = toNum(payment.payment_amount);
                                          const bankParts = payment.bank ? payment.bank.split(' · ') : null;
                                          typeBadge = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200"><Banknote size={9} /> Deposit</span>;
                                          amountCell = <span className="font-bold text-emerald-700">{fmt(amt)}</span>;
                                          detailCell = (
                                            <span className="text-slate-600">
                                              {payment.payer_name && <><span className="font-medium">{payment.payer_name}</span> · </>}
                                              {bankParts ? `${bankParts[0]}` : 'Internal'}
                                              {payment.remarks && <span className="text-slate-400 ml-1.5 italic">· {payment.remarks}</span>}
                                            </span>
                                          );
                                        }

                                        return (
                                          <TableRow key={payment.id} className="hover:bg-slate-50/60 border-b border-slate-50">
                                            <TableCell className="px-4">{typeBadge}</TableCell>
                                            <TableCell className="text-slate-500 whitespace-nowrap">{dateStr}</TableCell>
                                            <TableCell className="text-right">{amountCell}</TableCell>
                                            <TableCell className="max-w-[280px] truncate">{detailCell}</TableCell>
                                            {!readOnly && (
                                              <TableCell className="text-center">
                                                <div className="flex gap-0.5 items-center justify-center">
                                                  <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700" onClick={() => openEditDialog(payment)} title="Edit">
                                                    <Pencil size={11} />
                                                  </Button>
                                                  <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-red-600" title="Delete"
                                                    onClick={() => setDeleteTarget({ ids: [payment.id], mode: 'entry', label: `entry on ${payment.date_of_payment || ''}` })}>
                                                    <Trash2 size={11} />
                                                  </Button>
                                                </div>
                                              </TableCell>
                                            )}
                                          </TableRow>
                                        );
                                      })}
                                  </TableBody>
                                </Table>
                              </div>
                            )}

                            {!readOnly && (
                              <div className="flex justify-end pt-1">
                                <Button size="sm" variant="ghost" className="h-7 text-[11px] text-red-500 hover:text-red-700 gap-1"
                                  onClick={() => setDeleteTarget({
                                    ids: group.payments.map(p => p.id),
                                    loadingId: group.loadingId,
                                    mode: 'truck',
                                    label: `entire cycle of ${group.customerName || 'row'} on ${group.truckNumber}`,
                                  })}>
                                  <Trash2 size={11} /> Delete allocation row & all entries
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Combined totals bar — sales, deposits & expenses at a glance */}
                  <div className="bg-slate-900 text-white rounded-xl shadow-sm px-5 sm:px-6 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                        Totals across {filteredLedgerGroups.length} station{filteredLedgerGroups.length === 1 ? '' : 's'}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <div>
                          <span className="text-slate-400 text-[11px] uppercase tracking-wide mr-1.5">Allocated</span>
                          <span className="font-bold">{totals.totalQtyAllocated > 0 ? `${fmtQty(totals.totalQtyAllocated)} L` : '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] uppercase tracking-wide mr-1.5">Sold</span>
                          <span className="font-bold">{totals.totalQtySold > 0 ? `${fmtQty(totals.totalQtySold)} L` : '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] uppercase tracking-wide mr-1.5">Expected</span>
                          <span className="font-bold">{fmt(totals.totalExpected)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] uppercase tracking-wide mr-1.5">Deposited</span>
                          <span className="font-bold text-emerald-400">{fmt(totals.totalPaid)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] uppercase tracking-wide mr-1.5">Expenses</span>
                          <span className="font-bold text-amber-400">{fmt(totals.totalExpenses)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] uppercase tracking-wide mr-1.5">Outstanding</span>
                          <span className={`font-bold ${totals.outstanding > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {totals.outstanding === 0
                              ? '₦0.00 ✓'
                              : totals.outstanding > 0
                                ? fmt(totals.outstanding)
                                : `+${fmt(Math.abs(totals.outstanding))}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>


          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Record Daily Sale Dialog                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!quickPaymentTarget} onOpenChange={open => { if (!open) setQuickPaymentTarget(null); }}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${activeEntryTab === 'sale' ? 'bg-sky-100' : activeEntryTab === 'deposit' ? 'bg-emerald-100' : 'bg-orange-100'}`}>
                {activeEntryTab === 'sale' ? (
                  <Fuel className="w-5 h-5 text-sky-600" />
                ) : activeEntryTab === 'deposit' ? (
                  <Banknote className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Receipt className="w-5 h-5 text-orange-600" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold">
                  {activeEntryTab === 'sale' ? 'Record Daily Pump Sale' : activeEntryTab === 'deposit' ? 'Record Bank Deposit' : 'Record Daily Expense'}
                </h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  {quickPaymentTarget
                    ? `${quickPaymentTarget.customerName} · ${quickPaymentTarget.truckNumber}${quickPaymentTarget.code ? ` · ${quickPaymentTarget.code}` : ''}`
                    : ''}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Record daily fuel sales volume and price or actual bank payment deposits or operating expenses for this station allocation</DialogDescription>
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

            {/* Tab Switcher */}
            <div className="flex p-1 bg-slate-100 rounded-lg mb-2 gap-1">
              <button
                type="button"
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${activeEntryTab === 'sale'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
                  }`}
                onClick={() => setActiveEntryTab('sale')}
              >
                <Fuel size={14} className={activeEntryTab === 'sale' ? 'text-sky-500' : ''} />
                Daily Sale
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${activeEntryTab === 'deposit'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
                  }`}
                onClick={() => setActiveEntryTab('deposit')}
              >
                <Banknote size={14} className={activeEntryTab === 'deposit' ? 'text-emerald-500' : ''} />
                Bank Deposit
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${activeEntryTab === 'expense'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
                  }`}
                onClick={() => setActiveEntryTab('expense')}
              >
                <Receipt size={14} className={activeEntryTab === 'expense' ? 'text-orange-500' : ''} />
                Daily Expense
              </button>
            </div>

            {/* Tab Content: Daily Sale */}
            {activeEntryTab === 'sale' && (
              <div className="space-y-4 pt-1 animate-fadeIn">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Rate (₦/L) <span className="text-red-500">*</span></Label>
                    <Input
                      type="text" inputMode="decimal" placeholder="e.g. 1,300" className="h-9 text-sm"
                      value={quickPaymentForm.rate}
                      onChange={e => {
                        const rate = formatWithCommas(e.target.value);
                        setQuickPaymentForm(prev => ({ ...prev, rate }));
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
                        setQuickPaymentForm(prev => ({ ...prev, quantity }));
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Expected Value (₦)</Label>
                    <Input
                      readOnly className="h-9 text-sm bg-slate-50 font-bold text-slate-700 border-slate-200"
                      value={(() => {
                        const r = Number(stripCommas(quickPaymentForm.rate)) || 0;
                        const q = Number(stripCommas(quickPaymentForm.quantity)) || 0;
                        return r && q ? `₦${formatWithCommas(String(r * q))}` : '—';
                      })()}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600 flex items-center gap-1"><CalendarIcon size={11} className="inline" /> Date of Sale</Label>
                    <Input
                      type="date" className="h-9 text-sm"
                      value={quickPaymentForm.date_of_payment}
                      onChange={e => setQuickPaymentForm(prev => ({ ...prev, date_of_payment: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Remarks / Notes</Label>
                    <Input placeholder="Optional remarks" className="h-9 text-sm"
                      value={quickPaymentForm.remarks}
                      onChange={e => setQuickPaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tab Content: Bank Deposit */}
            {activeEntryTab === 'deposit' && (
              <div className="space-y-4 pt-1 animate-fadeIn">
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
                    <Label className="text-xs text-slate-600 flex items-center gap-1"><CalendarIcon size={11} className="inline" /> Date of Deposit</Label>
                    <Input
                      type="date" className="h-9 text-sm"
                      value={quickPaymentForm.date_of_payment}
                      onChange={e => setQuickPaymentForm(prev => ({ ...prev, date_of_payment: e.target.value }))}
                    />
                  </div>
                </div>

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

                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Remarks / Notes</Label>
                  <Input placeholder="Optional remarks" className="h-9 text-sm"
                    value={quickPaymentForm.remarks}
                    onChange={e => setQuickPaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Tab Content: Daily Expense */}
            {activeEntryTab === 'expense' && (
              <div className="space-y-4 pt-1 animate-fadeIn">
                <div className="bg-orange-50 border border-orange-200/75 rounded-lg p-3 flex gap-2">
                  <Receipt size={16} className="text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-orange-800">Record Daily Expense</p>
                    <p className="text-[10px] text-orange-600 mt-0.5">Record expenses like supplies, paper, maintenance etc. These reduce your net balance.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Expense Amount (₦) <span className="text-red-500">*</span></Label>
                    <Input
                      type="text" inputMode="decimal" placeholder="e.g. 50,000" className="h-9 text-sm"
                      value={quickPaymentForm.payment_amount}
                      onChange={e => setQuickPaymentForm(prev => ({ ...prev, payment_amount: formatWithCommas(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600 flex items-center gap-1"><CalendarIcon size={11} className="inline" /> Date of Expense</Label>
                    <Input
                      type="date" className="h-9 text-sm"
                      value={quickPaymentForm.date_of_payment}
                      onChange={e => setQuickPaymentForm(prev => ({ ...prev, date_of_payment: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Expense Description <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. Printing paper, cleaning supplies, maintenance" className="h-9 text-sm"
                    value={quickPaymentForm.remarks}
                    onChange={e => setQuickPaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                  />
                </div>
              </div>
            )}

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickPaymentTarget(null)} disabled={quickPaymentSaving}>Cancel</Button>
            <Button onClick={handleQuickPaymentSave} disabled={quickPaymentSaving} className={`gap-2 ${activeEntryTab === 'sale' ? 'bg-sky-600 hover:bg-sky-700' : activeEntryTab === 'deposit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
              {quickPaymentSaving ? <Loader2 size={16} className="animate-spin" /> : activeEntryTab === 'sale' ? <Fuel size={16} /> : activeEntryTab === 'deposit' ? <Banknote size={16} /> : <Receipt size={16} />}
              {quickPaymentSaving ? 'Saving…' : activeEntryTab === 'sale' ? 'Save Daily Sale' : activeEntryTab === 'deposit' ? 'Save Bank Deposit' : 'Save Expense'}
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
        <DialogContent className="sm:max-w-[560px]">
          {editTarget && (
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${(toNum(editTarget.quantity) > 0 || toNum(editTarget.rate) > 0 || (toNum(editTarget.sales_value) > 0 && toNum(editTarget.payment_amount) === 0))
                  ? 'bg-sky-100'
                  : 'bg-emerald-100'
                  }`}>
                  {(toNum(editTarget.quantity) > 0 || toNum(editTarget.rate) > 0 || (toNum(editTarget.sales_value) > 0 && toNum(editTarget.payment_amount) === 0)) ? (
                    <Fuel className="w-5 h-5 text-sky-600" />
                  ) : (
                    <Banknote className="w-5 h-5 text-emerald-600" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-bold">
                    {(toNum(editTarget.quantity) > 0 || toNum(editTarget.rate) > 0 || (toNum(editTarget.sales_value) > 0 && toNum(editTarget.payment_amount) === 0))
                      ? 'Edit Daily Sale Entry'
                      : 'Edit Bank Deposit Entry'}
                  </h2>
                  <p className="text-sm font-normal text-slate-500 mt-0.5">
                    {editTarget.truck_number} · {editTarget.customer_name || 'Filling Station'}
                  </p>
                </div>
              </DialogTitle>
              <DialogDescription className="sr-only">Edit daily fuel sale records or bank payments</DialogDescription>
            </DialogHeader>
          )}

          {editForm && editTarget && (
            <div className="space-y-4 py-2">
              {/* Conditional Form Render */}
              {(toNum(editTarget.quantity) > 0 || toNum(editTarget.rate) > 0 || (toNum(editTarget.sales_value) > 0 && toNum(editTarget.payment_amount) === 0)) ? (
                /* Daily Sale Form Fields */
                <>
                  <div className="bg-sky-50 border border-sky-200/75 rounded-lg p-3 flex gap-2">
                    <Fuel size={16} className="text-sky-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-sky-800">Editing Pump Sale Record</p>
                      <p className="text-[10px] text-sky-600 mt-0.5">Update the volume sold and rate. Expected value is auto-calculated.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Volume (Ltrs)</Label>
                      <Input className="h-9 text-sm" value={editForm.quantity}
                        onChange={e => {
                          const qty = formatWithCommas(e.target.value);
                          const q = Number(stripCommas(qty)) || 0;
                          const r = Number(stripCommas(editForm.rate)) || 0;
                          const sv = q && r ? formatWithCommas(String(q * r)) : editForm.sales_value;
                          setEditForm(prev => prev ? { ...prev, quantity: qty, sales_value: sv } : null);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Rate (₦/L)</Label>
                      <Input className="h-9 text-sm" value={editForm.rate}
                        onChange={e => {
                          const rate = formatWithCommas(e.target.value);
                          const r = Number(stripCommas(rate)) || 0;
                          const q = Number(stripCommas(editForm.quantity)) || 0;
                          const sv = q && r ? formatWithCommas(String(q * r)) : editForm.sales_value;
                          setEditForm(prev => prev ? { ...prev, rate, sales_value: sv } : null);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Expected Value (₦)</Label>
                      <Input className="h-9 text-sm bg-slate-50 font-bold text-slate-700" readOnly
                        value={(() => {
                          const r = Number(stripCommas(editForm.rate)) || 0;
                          const q = Number(stripCommas(editForm.quantity)) || 0;
                          return r && q ? `₦${formatWithCommas(String(r * q))}` : editForm.sales_value;
                        })()}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Date of Sale</Label>
                      <Input type="date" className="h-9 text-sm" value={editForm.date_of_payment}
                        onChange={e => setEditForm(prev => prev ? { ...prev, date_of_payment: e.target.value } : null)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Remarks / Notes</Label>
                      <Input className="h-9 text-sm" value={editForm.remarks}
                        onChange={e => setEditForm(prev => prev ? { ...prev, remarks: e.target.value } : null)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* Bank Deposit Form Fields */
                <>
                  <div className="bg-emerald-50 border border-emerald-200/75 rounded-lg p-3 flex gap-2">
                    <Banknote size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-emerald-800">Editing Bank Deposit Record</p>
                      <p className="text-[10px] text-emerald-600 mt-0.5">Update the payment deposit amount, date, bank destination and remarks.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Amount Deposited (₦)</Label>
                      <Input className="h-9 text-sm font-semibold text-slate-800" value={editForm.payment_amount}
                        onChange={e => setEditForm(prev => prev ? { ...prev, payment_amount: formatWithCommas(e.target.value) } : null)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Date of Deposit</Label>
                      <Input type="date" className="h-9 text-sm" value={editForm.date_of_payment}
                        onChange={e => setEditForm(prev => prev ? { ...prev, date_of_payment: e.target.value } : null)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Bank Account</Label>
                    <select aria-label="Edit bank account" value={editForm.bank_account_id}
                      onChange={e => setEditForm(prev => prev ? { ...prev, bank_account_id: e.target.value } : null)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">Select account…</option>
                      {activeBankAccounts.map(b => <option key={b.id} value={String(b.id)}>{b.account_number} · {b.bank_name}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Payer's Name</Label>
                      <Input className="h-9 text-sm" value={editForm.payer_name}
                        onChange={e => setEditForm(prev => prev ? { ...prev, payer_name: e.target.value.replace(/[0-9]/g, '') } : null)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Phone</Label>
                      <Input className="h-9 text-sm" value={editForm.phone_number}
                        onChange={e => setEditForm(prev => prev ? { ...prev, phone_number: e.target.value } : null)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Remarks / Notes</Label>
                    <Input className="h-9 text-sm" value={editForm.remarks}
                      onChange={e => setEditForm(prev => prev ? { ...prev, remarks: e.target.value } : null)}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditForm(null); }} disabled={editSaving}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving} className={`gap-2 ${editTarget && (toNum(editTarget.quantity) > 0 || toNum(editTarget.rate) > 0 || (toNum(editTarget.sales_value) > 0 && toNum(editTarget.payment_amount) === 0))
              ? 'bg-sky-600 hover:bg-sky-700'
              : 'bg-emerald-600 hover:bg-emerald-700'
              }`}>
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
