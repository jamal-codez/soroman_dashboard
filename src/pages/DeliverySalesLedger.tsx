// filepath: /Users/sableboxx/soroman_dashboard-2/src/pages/DeliverySalesLedger.tsx
import { useState, useMemo, useCallback } from 'react';
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
  // { id: 2, account_name: 'Soroman Energy Ltd', account_number: '9876543210', bank_name: 'GTBank', is_active: true },
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

  // ── Payment Dialog ─────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  // Shared truck-level fields
  const [dialogTruckLoadingId, setDialogTruckLoadingId] = useState('');
  const [dialogTruckNumber, setDialogTruckNumber] = useState('');
  const [dialogDateLoaded, setDialogDateLoaded] = useState('');
  const [dialogDepot, setDialogDepot] = useState('');
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
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

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
  // Per-truck aggregation: expected amount & total paid so far
  // ═══════════════════════════════════════════════════════════════════

  const truckPaymentSummary = useMemo(() => {
    const map = new Map<string, { totalExpected: number; totalPaid: number; entries: DeliverySale[] }>();
    // First pass: collect entries and total paid
    allSales.forEach(s => {
      const key = s.truck_number;
      const existing = map.get(key) || { totalExpected: 0, totalPaid: 0, entries: [] };
      existing.totalPaid += toNum(s.payment_amount);
      existing.entries.push(s);
      map.set(key, existing);
    });
    // Second pass: totalExpected = sum of MAX sales_value per customer per truck
    // (each customer's sales_value is repeated on every payment row — take max to avoid double-counting)
    map.forEach((summary) => {
      const perCustMax = new Map<number, number>();
      summary.entries.forEach(s => {
        const sv = toNum(s.sales_value);
        if (sv > 0) {
          perCustMax.set(s.customer, Math.max(perCustMax.get(s.customer) || 0, sv));
        }
      });
      summary.totalExpected = Array.from(perCustMax.values()).reduce((a, b) => a + b, 0);
    });
    return map;
  }, [allSales]);

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
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(s =>
        s.truck_number.toLowerCase().includes(q) ||
        (s.depot_loaded || '').toLowerCase().includes(q) ||
        (s.location || '').toLowerCase().includes(q) ||
        (s.payer_name || '').toLowerCase().includes(q) ||
        (s.bank || '').toLowerCase().includes(q) ||
        (s.customer_name || customerMap.get(s.customer)?.customer_name || '').toLowerCase().includes(q) ||
        (s.remarks || '').toLowerCase().includes(q),
      );
    }
    return result.sort((a, b) => {
      const dateA = a.date_of_payment || a.date_loaded || '';
      const dateB = b.date_of_payment || b.date_loaded || '';
      return dateB.localeCompare(dateA);
    });
  }, [timeFilteredSales, truckFilter, searchQuery, customerMap]);

  // ═══════════════════════════════════════════════════════════════════
  // Running balance per row
  // ═══════════════════════════════════════════════════════════════════

  const rowBalances = useMemo(() => {
    // Group entries per truck, sorted chronologically
    const truckEntries = new Map<string, DeliverySale[]>();
    allSales.forEach(s => {
      const arr = truckEntries.get(s.truck_number) || [];
      arr.push(s);
      truckEntries.set(s.truck_number, arr);
    });

    const balanceMap = new Map<number, number>();
    truckEntries.forEach((entries) => {
      const sorted = [...entries].sort((a, b) => {
        const dateA = a.date_of_payment || a.date_loaded || a.created_at || '';
        const dateB = b.date_of_payment || b.date_loaded || b.created_at || '';
        return dateA.localeCompare(dateB) || a.id - b.id;
      });

      // Total expected = sum of MAX sales_value per customer (not sum of all rows —
      // each payment row repeats the same customer total, so sum would double-count).
      const perCustMax = new Map<number, number>();
      sorted.forEach(s => {
        const sv = toNum(s.sales_value);
        if (sv > 0) {
          perCustMax.set(s.customer, Math.max(perCustMax.get(s.customer) || 0, sv));
        }
      });
      const totalExpected = Array.from(perCustMax.values()).reduce((a, b) => a + b, 0);

      let cumulativePaid = 0;
      sorted.forEach(s => {
        cumulativePaid += toNum(s.payment_amount);
        balanceMap.set(s.id, totalExpected - cumulativePaid);
      });
    });

    return balanceMap;
  }, [allSales]);

  // ═══════════════════════════════════════════════════════════════════
  // Summaries
  // ═══════════════════════════════════════════════════════════════════

  const totals = useMemo(() => {
    let totalExpected = 0;
    let totalPaid = 0;
    const uniqueTrucks = new Set<string>();
    const uniqueCustomers = new Set<number>();

    truckPaymentSummary.forEach((summary, truckNum) => {
      const hasEntryInRange = summary.entries.some(s => {
        const dateField = s.date_of_payment || s.date_loaded;
        return matchesDateRange(dateField, dateRange.from, dateRange.to);
      });
      if (!hasEntryInRange) return;

      totalExpected += summary.totalExpected;
      totalPaid += summary.totalPaid;
      uniqueTrucks.add(truckNum);
      summary.entries.forEach(s => uniqueCustomers.add(s.customer));
    });

    return {
      entries: timeFilteredSales.length,
      totalExpected,
      totalPaid,
      outstanding: totalExpected - totalPaid,
      truckCount: uniqueTrucks.size,
      customerCount: uniqueCustomers.size,
    };
  }, [truckPaymentSummary, timeFilteredSales, dateRange]);

  const summaryCards = useMemo((): SummaryCard[] => [
    // { title: 'Total Entries', value: String(totals.entries), icon: <FileText size={20} />, tone: 'neutral' },
    // { title: 'Trucks Sold', value: String(totals.truckCount), icon: <Truck size={20} />, tone: 'neutral' },
    { title: 'Expected Revenue', value: fmt(totals.totalExpected), icon: <TrendingUp size={20} />, tone: 'neutral' },
    { title: 'Total Payments', value: fmt(totals.totalPaid), icon: <Banknote size={20} />, tone: 'green' },
    { title: 'Outstanding', value: fmt(totals.outstanding), icon: <Wallet size={20} />, tone: totals.outstanding > 0 ? 'red' : 'green' },
  ], [totals]);

  const periodLabel =
    timePreset === 'custom'
      ? `${customFrom ? format(parseISO(customFrom), 'dd MMM') : '?'} – ${customTo ? format(parseISO(customTo), 'dd MMM yyyy') : '?'}`
      : timePreset === 'all' ? 'All Time' : timePreset.charAt(0).toUpperCase() + timePreset.slice(1);

  // Unique truck numbers for filter dropdown
  const uniqueTruckNumbers = useMemo(() => {
    const set = new Set<string>();
    allSales.forEach(s => set.add(s.truck_number));
    return Array.from(set).sort();
  }, [allSales]);

  // Loaded trucks for the dialog — show trucks that:
  // 1. Have a truck_number or truck ID, AND
  // 2. Are NOT (offloaded AND fully paid with no outstanding balance)
  const loadedTrucks = useMemo(() => {
    return allLoadings.filter(t => {
      if (!(t.truck_number || t.truck)) return false;
      // If offloaded, check if fully paid — hide only when fully settled
      if (t.loading_status === 'offloaded') {
        const truckNum = t.truck_number || '';
        const summary = truckPaymentSummary.get(truckNum);
        if (summary) {
          const outstanding = summary.totalExpected - summary.totalPaid;
          // Hide if fully paid (outstanding ≤ 0) and no unrecorded customers
          if (outstanding <= 0 && summary.totalExpected > 0) return false;
        }
      }
      return true;
    });
  }, [allLoadings, truckPaymentSummary]);

  // Per-truck-per-customer locked rate: truckNumber → customerId → rate string
  const truckCustomerRateMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    allSales.forEach(s => {
      const r = toNum(s.rate);
      if (!r || !s.truck_number || !s.customer) return;
      if (!map.has(s.truck_number)) map.set(s.truck_number, new Map());
      const inner = map.get(s.truck_number)!;
      if (!inner.has(String(s.customer))) {
        inner.set(String(s.customer), formatWithCommas(String(r)));
      }
    });
    return map;
  }, [allSales]);

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

  const openPaymentDialog = () => {
    setDialogTruckLoadingId('');
    setDialogTruckNumber('');
    setDialogDateLoaded('');
    setDialogDepot('');
    setSaleRows([makeSaleRow()]);
    setRowErrors({});
    setDialogOpen(true);
  };

  const handleTruckSelect = (loadingId: string) => {
    setDialogTruckLoadingId(loadingId);
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

    // Check for existing rate for this truck+customer combo
    const truckRates = truckCustomerRateMap.get(loading.truck_number || '');
    const existingRate = (custId && truckRates?.get(custId)) || '';
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

      // When customer is selected, check if they already have a rate for this truck
      // Also auto-fill phone for filling stations
      if (field === 'customer') {
        const truckRates = truckCustomerRateMap.get(dialogTruckNumber);
        const priorRate = value ? truckRates?.get(value) : undefined;
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
          date_loaded: dialogDateLoaded || format(new Date(), 'yyyy-MM-dd'),
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

      await Promise.all(promises);

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
  }, [dialogTruckNumber, dialogDateLoaded, dialogDepot, dialogTruckLoadingId, saleRows, toast, bankMap, customerMap]);

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
    });
  };

  const handleEditSave = useCallback(async () => {
    if (!editTarget || !editForm) return;
    setEditSaving(true);
    try {
      const bankAcct = editForm.bank_account_id
        ? BANK_ACCOUNTS.find(b => String(b.id) === editForm.bank_account_id)
        : null;
      const bankStr = bankAcct
        ? `${bankAcct.account_number} · ${bankAcct.bank_name}`
        : editTarget.bank || undefined;

      const qty   = Number(stripCommas(editForm.quantity))       || undefined;
      const rate  = Number(stripCommas(editForm.rate))           || undefined;
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
      });
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
  }, [editTarget, editForm, toast]);

  const exportExcel = useCallback(() => {
    if (!filteredSales.length) return;
    const period = timePreset === 'custom'
      ? `${customFrom || '?'}_TO_${customTo || '?'}`
      : timePreset.toUpperCase();

    const rows = filteredSales.map((s, idx) => {
      const custName = s.customer_name || customerMap.get(s.customer)?.customer_name || '';
      const balance = rowBalances.get(s.id) ?? 0;
      return {
        'S/N': idx + 1,
        'Truck': s.truck_number,
        'Date Loaded': s.date_loaded ? format(parseISO(s.date_loaded), 'dd/MM/yyyy') : '',
        'Depot': s.depot_loaded || '',
        'Destination': s.location || '',
        'Customer': custName,
        'Qty (L)': toNum(s.quantity),
        'Rate (₦)': toNum(s.rate),
        'Expected (₦)': toNum(s.sales_value),
        'Payment (₦)': toNum(s.payment_amount),
        'Balance (₦)': balance,
        'Payer': s.payer_name || '',
        'Payer Phone': s.phone_number || '',
        'Bank / Account': s.bank || '',
        'Payment Date': s.date_of_payment ? format(parseISO(s.date_of_payment), 'dd/MM/yyyy') : '',
        'Remarks': s.remarks || '',
        'Entered By': s.entered_by || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payment Ledger');
    XLSX.writeFile(wb, `PAYMENT-LEDGER-${period}.xlsx`);
  }, [filteredSales, customerMap, rowBalances, timePreset, customFrom, customTo]);

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

            {/* ── Time Filter ──────────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-slate-600 mr-1">
                  <CalendarIcon size={14} className="inline mr-1" />
                  Period:
                </span>
                {(['today', 'yesterday', 'week', 'month', 'year', 'all', 'custom'] as TimePreset[]).map(tp => (
                  <button
                    key={tp}
                    onClick={() => handlePresetChange(tp)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      timePreset === tp
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {tp === 'all' ? 'All Time' : tp === 'custom' ? 'Date Range' : tp.charAt(0).toUpperCase() + tp.slice(1)}
                  </button>
                ))}
              </div>
              {timePreset === 'custom' && (
                <div className="flex flex-wrap gap-3 mt-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">From</Label>
                    <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 w-[160px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">To</Label>
                    <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 w-[160px]" />
                  </div>
                </div>
              )}
            </div>

            {/* ── Summary Cards ─────────────────────────────────────── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Search + Filters ─────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search by truck, depot, destination, customer, payer, bank…"
                    className="pl-10"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter by truck"
                  value={truckFilter}
                  onChange={e => setTruckFilter(e.target.value)}
                  className="h-10 w-full sm:w-[220px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All Trucks</option>
                  {uniqueTruckNumbers.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
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
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700 w-[48px]">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700">Truck</TableHead>
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
                      {filteredSales.map((s, idx) => {
                        const custName = s.customer_name || customerMap.get(s.customer)?.customer_name || `#${s.customer}`;
                        const custObj = customerMap.get(s.customer);
                        const isFSRow = isFillingStation(custObj);
                        const sv = toNum(s.sales_value);
                        const pa = toNum(s.payment_amount);
                        const balance = rowBalances.get(s.id) ?? (sv - pa);
                        // For filling stations with no rate yet, don't show a balance
                        const showBalance = !(isFSRow && sv === 0);
                        const isPaymentRow = pa > 0;
                        const isPaidOff = balance <= 0 && sv > 0;

                        return (
                          <TableRow
                            key={s.id}
                            className={`hover:bg-slate-50/60 transition-colors ${
                              isPaymentRow ? 'bg-emerald-50/30' : ''
                            } ${isPaidOff ? 'bg-green-50/40' : ''}`}
                          >
                            <TableCell className="text-center text-slate-500">{idx + 1}</TableCell>
                            <TableCell className="font-semibold text-slate-800 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {/* <Truck size={13} className="text-slate-400" /> */}
                                {s.truck_number}
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-600 whitespace-nowrap">
                              {s.date_loaded ? format(parseISO(s.date_loaded), 'dd MMM yyyy') : '—'}
                            </TableCell>
                            <TableCell className="text-slate-700">{s.depot_loaded || '—'}</TableCell>
                            <TableCell className="text-slate-700 uppercase whitespace-nowrap">{s.location || '—'}</TableCell>
                            <TableCell className="font-medium text-slate-900 capitalize whitespace-nowrap">{custName}</TableCell>
                            <TableCell className="text-slate-700">
                              {toNum(s.quantity) > 0 ? fmtQty(toNum(s.quantity)) : '—'} Litres
                            </TableCell>
                            <TableCell className="text-right text-slate-700">
                              {toNum(s.rate) > 0 ? fmt(toNum(s.rate)) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-medium text-slate-800">
                              {sv > 0 ? fmt(sv) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-bold text-emerald-700">
                              {pa > 0 ? fmt(pa) : '—'}
                            </TableCell>
                            <TableCell className={`text-right font-bold ${
                              !showBalance ? 'text-slate-400' :
                              balance > 0 ? 'text-red-600' : balance < 0 ? 'text-blue-600' : 'text-emerald-600'
                            }`}>
                              {!showBalance
                                ? '—'
                                : balance !== 0 ? fmt(balance) : (sv > 0 ? 'Fully Paid ✓' : '—')}
                            </TableCell>
                            <TableCell className="text-slate-700 whitespace-nowrap">
                              {s.payer_name ? (
                                <div>
                                  <p className="font-medium uppercase">{s.payer_name}</p>
                                  {s.phone_number && (
                                    <p className="text-xs text-slate-500">{s.phone_number}</p>
                                  )}
                                </div>
                              ) : (
                                s.phone_number
                                  ? <span className="text-xs text-slate-500">{s.phone_number}</span>
                                  : <span className="text-slate-400">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm max-w-[160px]">
                              {s.bank ? (() => {
                                const parts = s.bank.split(' · ');
                                const acct = parts[0] || s.bank;
                                const bankName = parts[1] || '';
                                return (
                                  <div>
                                    <p className="font-semibold text-black">{acct}</p>
                                    {bankName && <p className="text-xs text-slate-600">{bankName}</p>}
                                  </div>
                                );
                              })() : <span className="text-slate-400">—</span>}
                            </TableCell>
                            <TableCell className="text-slate-600 whitespace-nowrap text-sm">
                              {s.date_of_payment ? format(parseISO(s.date_of_payment), 'dd MMM yyyy') : '—'}
                            </TableCell>
                            <TableCell>
                              {s.remarks ? (
                                <span className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                                  s.remarks.toLowerCase().includes('full') ? 'text-emerald-700 bg-emerald-50' :
                                  s.remarks.toLowerCase().includes('partial') ? 'text-amber-700 bg-amber-50' :
                                  'text-slate-600 bg-slate-50'
                                }`}>
                                  {s.remarks}
                                </span>
                              ) : <span className="text-slate-400">—</span>}
                            </TableCell>
                            <TableCell className="text-slate-600 whitespace-nowrap text-sm">
                              {s.entered_by || '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {!readOnly && (
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                    title="Edit entry"
                                    onClick={() => openEditDialog(s)}
                                  >
                                    <Pencil size={14} />
                                  </Button>
                                )}
                                {!readOnly && (
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                    title="Delete entry"
                                    onClick={() => setDeleteTarget({ id: s.id, label: `${s.truck_number} — ${pa > 0 ? fmt(pa) : 'entry'}` })}
                                  >
                                    <Trash2 size={14} />
                                  </Button>
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
                    const summary = truckPaymentSummary.get(dialogTruckNumber);
                    if (!summary) return null;
                    const bal = summary.totalExpected - summary.totalPaid;
                    return (
                      <div>
                        <span className="text-slate-500 text-xs">Outstanding:</span>{' '}
                        <span className={`font-bold ${bal > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {bal > 0 ? fmt(bal) : '✓ Paid'}
                        </span>
                      </div>
                    );
                  })()}
                </div>
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
                  const summary = truckPaymentSummary.get(dialogTruckNumber);
                  const previouslyPaid = summary?.totalPaid || 0;
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

          {editForm && editTarget && (
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

              {/* Row 2: Rate + Expected */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Rate (₦/L)</Label>
                  <Input
                    type="text" inputMode="decimal"
                    value={editForm.rate}
                    onChange={e => {
                      const rate = formatWithCommas(e.target.value);
                      const r = Number(stripCommas(rate)) || 0;
                      const q = Number(stripCommas(editForm.quantity)) || 0;
                      const sv = q && r ? formatWithCommas(String(q * r)) : editForm.sales_value;
                      setEditForm(f => f ? { ...f, rate, sales_value: sv } : f);
                    }}
                    className="h-9 text-sm"
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
                  <Label className="text-xs text-slate-600">Date of Payment</Label>
                  <Input
                    type="date"
                    value={editForm.date_of_payment}
                    onChange={e => setEditForm(f => f ? { ...f, date_of_payment: e.target.value } : f)}
                    className="h-9 text-sm"
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
          )}

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
