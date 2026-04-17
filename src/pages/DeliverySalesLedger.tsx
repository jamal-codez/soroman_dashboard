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
  Plus, Search, Download, Loader2, Trash2,
  Truck, Wallet, FileText,
  TrendingUp, Banknote, Building2,
  Calendar as CalendarIcon,
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
  status: string;
}

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
  { id: 1, account_name: 'Soroman Energy Ltd', account_number: '0123456789', bank_name: 'First Bank', is_active: true },
  { id: 2, account_name: 'Soroman Energy Ltd', account_number: '9876543210', bank_name: 'GTBank', is_active: true },
  { id: 3, account_name: 'Soroman Energy Ltd', account_number: '5432109876', bank_name: 'Zenith Bank', is_active: true },
  { id: 4, account_name: 'Soroman Energy Ltd', account_number: '1122334455', bank_name: 'Access Bank', is_active: true },
  { id: 5, account_name: 'Soroman Energy Ltd', account_number: '6677889900', bank_name: 'UBA', is_active: true },
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
  const [form, setForm] = useState({
    truck_loading_id: '',
    truck_number: '',
    date_loaded: '',
    depot_loaded: '',
    customer: '',
    customer_name: '',
    location: '',
    quantity: '',
    rate: '',
    sales_value: '',
    payment_amount: '',
    payer_name: '',
    bank_account_id: '',
    date_of_payment: format(new Date(), 'yyyy-MM-dd'),
    phone_number: '',
    remarks: '',
  });
  const [saving, setSaving] = useState(false);

  // ── Delete ─────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    const entries = truckLoadingsQuery.data?.results || [];
    return entries.filter(e => e.truck || e.truck_number || e.loading_status);
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
    allSales.forEach(s => {
      const key = s.truck_number;
      const existing = map.get(key) || { totalExpected: 0, totalPaid: 0, entries: [] };
      const sv = toNum(s.sales_value);
      const pa = toNum(s.payment_amount);
      if (sv > 0) existing.totalExpected = Math.max(existing.totalExpected, sv);
      existing.totalPaid += pa;
      existing.entries.push(s);
      map.set(key, existing);
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

      let expected = 0;
      sorted.forEach(s => {
        const sv = toNum(s.sales_value);
        if (sv > 0) expected = Math.max(expected, sv);
      });

      let cumulativePaid = 0;
      sorted.forEach(s => {
        cumulativePaid += toNum(s.payment_amount);
        balanceMap.set(s.id, expected - cumulativePaid);
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

  // Loaded trucks for the dialog
  const loadedTrucks = useMemo(() => {
    return allLoadings.filter(t => {
      const status = t.loading_status || (t.date_offloaded ? 'offloaded' : 'loaded');
      return status === 'loaded' || status === 'offloaded';
    });
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

  const openPaymentDialog = () => {
    setForm({
      truck_loading_id: '', truck_number: '', date_loaded: '', depot_loaded: '',
      customer: '', customer_name: '', location: '', quantity: '', rate: '', sales_value: '',
      payment_amount: '', payer_name: '', bank_account_id: '',
      date_of_payment: format(new Date(), 'yyyy-MM-dd'), phone_number: '', remarks: '',
    });
    setDialogOpen(true);
  };

  const handleTruckSelect = (loadingId: string) => {
    const loading = loadedTrucks.find(t => String(t.id) === loadingId);
    if (!loading) {
      setForm(f => ({ ...f, truck_loading_id: loadingId }));
      return;
    }

    const custName = loading.customer_name || (loading.customer ? customerMap.get(loading.customer)?.customer_name : '') || '';
    const qty = toNum(loading.quantity_allocated);
    const depot = loading.depot || loading.pfi_location || loading.location || '';
    const destination = loading.location || '';

    // Check if this truck already has a rate from previous entries
    const existing = truckPaymentSummary.get(loading.truck_number || '');
    let existingRate = '';
    let existingSalesValue = '';
    if (existing && existing.entries.length > 0) {
      const firstWithRate = existing.entries.find(e => toNum(e.rate) > 0);
      if (firstWithRate) {
        existingRate = formatWithCommas(String(toNum(firstWithRate.rate)));
        existingSalesValue = formatWithCommas(String(toNum(firstWithRate.sales_value)));
      }
    }

    setForm(f => ({
      ...f,
      truck_loading_id: loadingId,
      truck_number: loading.truck_number || '',
      date_loaded: loading.date_allocated || '',
      depot_loaded: depot,
      customer: loading.customer ? String(loading.customer) : '',
      customer_name: custName,
      location: destination,
      quantity: qty > 0 ? formatWithCommas(String(qty)) : '',
      rate: existingRate,
      sales_value: existingSalesValue,
    }));
  };

  const handleSave = useCallback(async () => {
    if (!form.truck_number.trim()) {
      toast({ title: 'Please select a truck', variant: 'destructive' });
      return;
    }

    const paymentAmt = Number(stripCommas(form.payment_amount));
    const rateNum = Number(stripCommas(form.rate));

    if (!paymentAmt && !rateNum) {
      toast({ title: 'Enter a rate or payment amount', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const bankAcct = form.bank_account_id ? bankMap.get(Number(form.bank_account_id)) : null;
      const bankStr = bankAcct
        ? `${bankAcct.bank_name} — ${bankAcct.account_number} (${bankAcct.account_name})`
        : '';

      const currentUser = localStorage.getItem('fullname') || 'Unknown';
      const payload = {
        truck_number: form.truck_number.trim(),
        date_loaded: form.date_loaded || format(new Date(), 'yyyy-MM-dd'),
        depot_loaded: form.depot_loaded.trim() || undefined,
        customer: form.customer ? Number(form.customer) : 0,
        location: form.location.trim() || undefined,
        quantity: Number(stripCommas(form.quantity)) || undefined,
        rate: rateNum || undefined,
        sales_value: Number(stripCommas(form.sales_value)) || undefined,
        payment_amount: paymentAmt || undefined,
        payer_name: form.payer_name.trim() || undefined,
        bank: bankStr || undefined,
        date_of_payment: form.date_of_payment || undefined,
        phone_number: form.phone_number.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
        entered_by: currentUser,
      };

      await apiClient.admin.createDeliverySale(payload);

      // Write customer & destination back to the inventory entry so the inventory table shows them
      const loadingId = Number(form.truck_loading_id);
      if (loadingId && (form.customer || form.location.trim())) {
        try {
          const custName = form.customer
            ? (customerMap.get(Number(form.customer))?.customer_name || form.customer_name)
            : '';
          await apiClient.admin.updateDeliveryInventory(loadingId, {
            ...(form.customer ? { customer: Number(form.customer), customer_name: custName } : {}),
            ...(form.location.trim() ? { location: form.location.trim() } : {}),
          });
        } catch {
          // Non-critical — sale was already saved, inventory update is best-effort
        }
      }

      toast({ title: 'Payment entry recorded' });
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
  }, [form, toast, bankMap, customerMap]);

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
                        {/* <TableHead className="font-semibold text-slate-700 w-[60px]">Del</TableHead> */}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.map((s, idx) => {
                        const custName = s.customer_name || customerMap.get(s.customer)?.customer_name || `#${s.customer}`;
                        const sv = toNum(s.sales_value);
                        const pa = toNum(s.payment_amount);
                        const balance = rowBalances.get(s.id) ?? (sv - pa);
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
                            <TableCell className="text-slate-700 whitespace-nowrap">{s.location || '—'}</TableCell>
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
                              balance > 0 ? 'text-red-600' : balance < 0 ? 'text-blue-600' : 'text-emerald-600'
                            }`}>
                              {balance !== 0 ? fmt(balance) : (sv > 0 ? 'Fully Paid ✓' : '—')}
                            </TableCell>
                            <TableCell className="text-slate-700 whitespace-nowrap">{s.payer_name || '—'}</TableCell>
                            <TableCell className="text-slate-600 text-sm max-w-[180px]" title={s.bank || ''}>
                              {s.bank || '—'}
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
                            {/* <TableCell>
                              <Button
                                size="sm" variant="ghost"
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                title="Delete entry"
                                onClick={() => setDeleteTarget({ id: s.id, label: `${s.truck_number} — ${pa > 0 ? fmt(pa) : 'rate entry'}` })}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </TableCell> */}
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
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Banknote className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Record Payment</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  Select a loaded truck, set rate if first entry, then record payment.
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Record a payment against a loaded truck</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Truck Selector */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Truck size={15} className="text-slate-500" /> Select Loaded Truck <span className="text-red-500">*</span>
              </Label>
              <select
                aria-label="Select loaded truck"
                value={form.truck_loading_id}
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

            {/* Auto-filled truck info */}
            {form.truck_number && (
              <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">
                  Truck Details (auto-filled)
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <span className="text-slate-500 text-xs">Truck:</span>{' '}
                    <span className="font-bold text-slate-800">{form.truck_number}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Depot:</span>{' '}
                    <span className="font-medium text-slate-800">{form.depot_loaded || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Qty:</span>{' '}
                    <span className="font-medium text-slate-800">
                      {form.quantity ? `${formatWithCommas(stripCommas(form.quantity))} L` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Date Loaded:</span>{' '}
                    <span className="font-medium text-slate-800">
                      {form.date_loaded ? format(parseISO(form.date_loaded), 'dd MMM yyyy') : '—'}
                    </span>
                  </div>
                  {(() => {
                    const summary = truckPaymentSummary.get(form.truck_number);
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

            {/* Customer & Destination — editable, assigned at sale time */}
            {form.truck_number && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">Customer</Label>
                  <select
                    aria-label="Select customer"
                    value={form.customer}
                    onChange={e => {
                      const custId = e.target.value;
                      const cust = custId ? customerMap.get(Number(custId)) : null;
                      setForm(f => ({
                        ...f,
                        customer: custId,
                        customer_name: cust?.customer_name || '',
                      }));
                    }}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select customer…</option>
                    {customers.map(c => (
                      <option key={c.id} value={String(c.id)}>{c.customer_name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">Destination</Label>
                  <Input
                    placeholder="e.g. Kano, Abuja…"
                    value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Rate + Sales Value */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">Rate (₦ per litre)</Label>
                <Input
                  type="text" inputMode="decimal" placeholder="e.g. 1,210"
                  value={form.rate}
                  onChange={e => {
                    const r = formatWithCommas(e.target.value);
                    setForm(f => ({ ...f, rate: r, sales_value: autoCalcSalesValue(f.quantity, r) }));
                  }}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-sm font-medium text-slate-700">Expected Amount (₦)</Label>
                <Input
                  type="text" readOnly
                  value={form.sales_value ? `₦${form.sales_value}` : '—'}
                  className="bg-slate-50 font-bold text-slate-800"
                />
                {form.sales_value && form.quantity && (
                  <p className="text-[11px] text-slate-500">
                    {formatWithCommas(stripCommas(form.quantity))} L × ₦{form.rate} = ₦{form.sales_value}
                  </p>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-200 pt-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">
                💰 Payment Details
              </p>
            </div>

            {/* Payment Amount + Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Banknote size={15} className="text-slate-500" /> Payment Amount (₦) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="text" inputMode="decimal" placeholder="e.g. 24,450,000"
                  value={form.payment_amount}
                  onChange={e => setForm(f => ({ ...f, payment_amount: formatWithCommas(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <CalendarIcon size={15} className="text-slate-500" /> Date of Payment
                </Label>
                <Input
                  type="date"
                  value={form.date_of_payment}
                  onChange={e => setForm(f => ({ ...f, date_of_payment: e.target.value }))}
                />
              </div>
            </div>

            {/* Payer + Bank Account */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">Payer's Name</Label>
                <Input
                  placeholder="Who made the payment?"
                  value={form.payer_name}
                  onChange={e => setForm(f => ({ ...f, payer_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Building2 size={15} className="text-slate-500" /> Bank Account
                </Label>
                <select
                  aria-label="Select bank account"
                  value={form.bank_account_id}
                  onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select account…</option>
                  {activeBankAccounts.map(b => (
                    <option key={b.id} value={String(b.id)}>
                      {b.bank_name} — {b.account_number} ({b.account_name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Phone + Remarks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">Phone Number</Label>
                <Input
                  placeholder="e.g. 08012345678"
                  value={form.phone_number}
                  onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">Remarks</Label>
                <Input
                  placeholder="e.g. Partial Payment, Full Payment…"
                  value={form.remarks}
                  onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                />
              </div>
            </div>

            {/* Balance Preview */}
            {(form.sales_value || form.payment_amount) && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">After this payment</p>
                    {(() => {
                      const expected = Number(stripCommas(form.sales_value)) || 0;
                      const thisPayment = Number(stripCommas(form.payment_amount)) || 0;
                      const summary = truckPaymentSummary.get(form.truck_number);
                      const previouslyPaid = summary?.totalPaid || 0;
                      const newBalance = expected - previouslyPaid - thisPayment;
                      return (
                        <>
                          <p className={`text-lg font-bold ${newBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {newBalance > 0 ? fmt(newBalance) + ' remaining' : '✓ Fully paid'}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Expected: {fmt(expected)} · Previously paid: {fmt(previouslyPaid)} · This payment: {fmt(thisPayment)}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Saving…' : 'Record Payment'}
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
