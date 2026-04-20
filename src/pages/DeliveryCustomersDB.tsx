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
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Plus, Search, Download, Loader2, Pencil, Trash2,
  Users, Phone, Wallet, UserCheck, UserX, UserMinus,
  Truck, AlertTriangle, ShieldAlert, Eye, Camera, MapPin,
  Building2, Mail, CreditCard, Clock,
  FileText, User,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { isCurrentUserReadOnly } from '@/roles';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface DeliveryCustomer {
  id: number;
  customer_name: string;
  phone_number: string;
  alt_phone_number?: string;
  email?: string;
  home_address?: string;
  office_address?: string;
  passport_photo?: string;
  contact_person?: string;
  contact_person_phone?: string;
  bank_name?: string;
  account_number?: string;
  account_name?: string;
  status: 'active' | 'dormant' | 'suspended';
  outstanding_limit: string | number | null;
  total_value_given: string | number;
  total_payments_received: string | number;
  current_balance: string | number;
  assigned_trucks?: number[];
  assigned_truck_plates?: string[];
  last_transaction_date: string | null;
  last_order_date?: string | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

interface DeliverySale {
  id: number;
  truck_number: string;
  customer: number;
  quantity: string | number;
  sales_value: string | number;
  payment_amount: string | number;
  date_loaded: string;
}

type PagedResponse<T> = { count: number; results: T[] };
type StatusFilter = 'all' | 'active' | 'dormant' | 'suspended' | 'auto-dormant';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Number of days of inactivity before a customer is flagged as auto-dormant */
const AUTO_DORMANT_DAYS = 60;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const toNum = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};



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

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const safePaged = <T,>(raw: unknown): PagedResponse<T> => {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.results)) return { count: Number(r.count ?? r.results.length), results: r.results as T[] };
    if (Array.isArray(raw)) return { count: (raw as T[]).length, results: raw as T[] };
  }
  return { count: 0, results: [] };
};

/** Check if a customer is auto-dormant (no transaction in 60+ days) */
const isAutoDormant = (lastTxnDate: string | null | undefined): boolean => {
  if (!lastTxnDate) return false;
  try {
    const days = differenceInDays(new Date(), parseISO(lastTxnDate));
    return days >= AUTO_DORMANT_DAYS;
  } catch { return false; }
};

/** Days since last transaction */
const daysSinceLastTxn = (lastTxnDate: string | null | undefined): number | null => {
  if (!lastTxnDate) return null;
  try { return differenceInDays(new Date(), parseISO(lastTxnDate)); } catch { return null; }
};

/** Clickable phone link component */
const PhoneLink = ({ phone }: { phone?: string }) => {
  if (!phone) return <span className="text-slate-400">—</span>;
  return (
    <a href={`tel:${phone}`} className="text-blue-600 hover:text-blue-800 hover:underline">
      {phone}
    </a>
  );
};

const statusConfig = {
  active: { label: 'Active', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: UserCheck },
  dormant: { label: 'Dormant', cls: 'text-amber-700 bg-amber-50 border-amber-200', icon: UserMinus },
  suspended: { label: 'Suspended', cls: 'text-red-700 bg-red-50 border-red-200', icon: UserX },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function DeliveryCustomersDB() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const readOnly = isCurrentUserReadOnly();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // ── Drill-down ─────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<DeliveryCustomer | null>(null);

  // ── Dialog state ───────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryCustomer | null>(null);
  const [form, setForm] = useState({
    customer_name: '',
    phone_number: '',
    alt_phone_number: '',
    email: '',
    home_address: '',
    office_address: '',
    passport_photo: null as File | null,
    passport_photo_preview: '',
    contact_person: '',
    contact_person_phone: '',
    bank_name: '',
    account_number: '',
    account_name: '',
    status: 'active' as 'active' | 'dormant' | 'suspended',
    outstanding_limit: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  // ── Delete confirm ─────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ═══════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════

  const customersQuery = useQuery({
    queryKey: ['delivery-customers'],
    queryFn: async () =>
      safePaged<DeliveryCustomer>(
        await apiClient.admin.getDeliveryCustomers({ page_size: 5000 })
      ),
    staleTime: 30_000,
  });
  const allCustomers = useMemo(
    () => customersQuery.data?.results || [],
    [customersQuery.data]
  );

  // Sales for deriving per-customer stats
  const salesQuery = useQuery({
    queryKey: ['delivery-sales'],
    queryFn: async () =>
      safePaged<DeliverySale>(
        await apiClient.admin.getDeliverySales({ page_size: 5000 })
      ),
    staleTime: 60_000,
  });
  const allSales = useMemo(() => salesQuery.data?.results || [], [salesQuery.data]);

  // ═══════════════════════════════════════════════════════════════════
  // Per-customer stats from ledger
  // ═══════════════════════════════════════════════════════════════════

  const customerStats = useMemo(() => {
    const map = new Map<number, { trucksUsed: Set<string>; totalQty: number; totalSalesValue: number; totalPayments: number; lastSaleDate: string | null }>();
    const custTruckSeen = new Map<string, { qty: number; salesValue: number }>();

    allSales.forEach(s => {
      const existing = map.get(s.customer) || {
        trucksUsed: new Set<string>(),
        totalQty: 0,
        totalSalesValue: 0,
        totalPayments: 0,
        lastSaleDate: null,
      };
      if (s.truck_number) existing.trucksUsed.add(s.truck_number);

      existing.totalPayments += toNum(s.payment_amount);

      // Track most recent sale date
      if (s.date_loaded && (!existing.lastSaleDate || s.date_loaded > existing.lastSaleDate)) {
        existing.lastSaleDate = s.date_loaded;
      }

      // Quantity and sales_value: only count once per customer+truck combination
      // (multiple payment rows for the same truck carry the same qty/sales_value)
      const key = `${s.customer}::${s.truck_number}`;
      if (!custTruckSeen.has(key)) {
        const qty = toNum(s.quantity);
        const sv = toNum(s.sales_value);
        custTruckSeen.set(key, { qty, salesValue: sv });
        existing.totalQty += qty;
        existing.totalSalesValue += sv;
      } else {
        // Update to the max values in case a later row has corrected data
        const prev = custTruckSeen.get(key)!;
        const qty = toNum(s.quantity);
        const sv = toNum(s.sales_value);
        if (sv > prev.salesValue) {
          existing.totalSalesValue += sv - prev.salesValue;
          prev.salesValue = sv;
        }
        if (qty > prev.qty) {
          existing.totalQty += qty - prev.qty;
          prev.qty = qty;
        }
      }

      map.set(s.customer, existing);
    });

    return map;
  }, [allSales]);

  // ═══════════════════════════════════════════════════════════════════
  // Derived data — with auto-dormancy detection
  // ═══════════════════════════════════════════════════════════════════

  const customersWithDormancy = useMemo(() => {
    return allCustomers.map(c => {
      const stats = customerStats.get(c.id);
      const effectiveLastTxn = c.last_transaction_date || stats?.lastSaleDate || null;
      const autoDormant = c.status === 'active' && isAutoDormant(effectiveLastTxn);
      return { ...c, _autoDormant: autoDormant, _effectiveLastTxn: effectiveLastTxn };
    });
  }, [allCustomers, customerStats]);

  const filtered = useMemo(() => {
    let list = customersWithDormancy;

    if (statusFilter === 'auto-dormant') {
      list = list.filter(c => c._autoDormant);
    } else if (statusFilter !== 'all') {
      list = list.filter(c => c.status === statusFilter);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(c =>
        c.customer_name.toLowerCase().includes(q) ||
        (c.phone_number || '').toLowerCase().includes(q) ||
        (c.alt_phone_number || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.home_address || '').toLowerCase().includes(q) ||
        (c.office_address || '').toLowerCase().includes(q) ||
        (c.contact_person || '').toLowerCase().includes(q) ||
        (c.bank_name || '').toLowerCase().includes(q) ||
        (c.account_name || '').toLowerCase().includes(q) ||
        (c.account_number || '').includes(q)
      );
    }

    return list;
  }, [customersWithDormancy, statusFilter, searchQuery]);

  const totals = useMemo(() => {
    const active = allCustomers.filter(c => c.status === 'active').length;
    const dormant = allCustomers.filter(c => c.status === 'dormant').length;
    const suspended = allCustomers.filter(c => c.status === 'suspended').length;
    const autoDormant = customersWithDormancy.filter(c => c._autoDormant).length;

    let totalTrucksUsed = new Set<string>();
    let totalQtyFromLedger = 0;
    allCustomers.forEach(c => {
      const stats = customerStats.get(c.id);
      if (stats) {
        stats.trucksUsed.forEach(t => totalTrucksUsed.add(t));
        totalQtyFromLedger += stats.totalQty;
      }
    });

    return {
      total: allCustomers.length,
      active,
      dormant,
      suspended,
      autoDormant,
      totalTrucksUsed: totalTrucksUsed.size,
      totalQtyFromLedger,
    };
  }, [allCustomers, customerStats, customersWithDormancy]);

  const summaryCards = useMemo((): SummaryCard[] => [
    { title: 'Total Customers', value: String(totals.total), icon: <Users size={20} />, tone: 'neutral' },
    { title: 'Active', value: String(totals.active), icon: <UserCheck size={20} />, tone: 'green' },
    // { title: 'Auto-Dormant (60d)', value: String(totals.autoDormant), icon: <Clock size={20} />, tone: totals.autoDormant > 0 ? 'amber' : 'neutral' },
    { title: 'Total Qty Sold', value: `${fmtQty(totals.totalQtyFromLedger)} L`, icon: <Wallet size={20} />, tone: 'green' },
  ], [totals]);

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['delivery-customers'] });
    qc.invalidateQueries({ queryKey: ['delivery-customers-list'] });
  };

  const openAdd = () => {
    setEditing(null);
    setForm({
      customer_name: '', phone_number: '', alt_phone_number: '',
      email: '', home_address: '', office_address: '',
      passport_photo: null, passport_photo_preview: '',
      contact_person: '', contact_person_phone: '',
      bank_name: '', account_number: '', account_name: '',
      status: 'active', outstanding_limit: '', notes: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (c: DeliveryCustomer) => {
    setEditing(c);
    setForm({
      customer_name: c.customer_name,
      phone_number: c.phone_number || '',
      alt_phone_number: c.alt_phone_number || '',
      email: c.email || '',
      home_address: c.home_address || '',
      office_address: c.office_address || '',
      passport_photo: null,
      passport_photo_preview: c.passport_photo || '',
      contact_person: c.contact_person || '',
      contact_person_phone: c.contact_person_phone || '',
      bank_name: c.bank_name || '',
      account_number: c.account_number || '',
      account_name: c.account_name || '',
      status: c.status,
      outstanding_limit: toNum(c.outstanding_limit) > 0
        ? formatWithCommas(String(toNum(c.outstanding_limit)))
        : '',
      notes: c.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.customer_name.trim()) {
      toast({ title: 'Customer name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const limitVal = Number(stripCommas(form.outstanding_limit));
      const payload: Record<string, unknown> = {
        customer_name: form.customer_name.trim(),
        phone_number: form.phone_number.trim() || '',
        alt_phone_number: form.alt_phone_number.trim() || '',
        email: form.email.trim() || '',
        home_address: form.home_address.trim() || '',
        office_address: form.office_address.trim() || '',
        contact_person: form.contact_person.trim() || '',
        contact_person_phone: form.contact_person_phone.trim() || '',
        bank_name: form.bank_name.trim() || '',
        account_number: form.account_number.trim() || '',
        account_name: form.account_name.trim() || '',
        status: form.status,
        outstanding_limit: limitVal > 0 ? limitVal : 0,
        notes: form.notes.trim() || '',
      };

      // If a new file was selected, use FormData for multipart upload
      if (form.passport_photo) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => fd.append(k, String(v ?? '')));
        fd.append('passport_photo', form.passport_photo);

        if (editing) {
          await apiClient.admin.updateDeliveryCustomerFormData(editing.id, fd);
          toast({ title: 'Customer updated' });
          if (selectedCustomer && selectedCustomer.id === editing.id) {
            setSelectedCustomer(prev => prev ? { ...prev, ...payload } as DeliveryCustomer : prev);
          }
        } else {
          await apiClient.admin.createDeliveryCustomerFormData(fd);
          toast({ title: 'Customer added' });
        }
      } else {
        if (editing) {
          await apiClient.admin.updateDeliveryCustomer(editing.id, payload as Parameters<typeof apiClient.admin.updateDeliveryCustomer>[1]);
          toast({ title: 'Customer updated' });
          if (selectedCustomer && selectedCustomer.id === editing.id) {
            setSelectedCustomer(prev => prev ? { ...prev, ...payload } as DeliveryCustomer : prev);
          }
        } else {
          await apiClient.admin.createDeliveryCustomer(payload as Parameters<typeof apiClient.admin.createDeliveryCustomer>[0]);
          toast({ title: 'Customer added' });
        }
      }
      setDialogOpen(false);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save customer',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [form, editing, toast, selectedCustomer]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.admin.deleteDeliveryCustomer(deleteTarget.id);
      toast({ title: 'Customer deleted' });
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
    if (!filtered.length) return;
    const rows = filtered.map((c, idx) => {
      const stats = customerStats.get(c.id);
      const trucksUsed = stats ? Array.from(stats.trucksUsed).join(', ') : '';
      const outstanding = (stats?.totalSalesValue || 0) - (stats?.totalPayments || 0);
      const limit = toNum(c.outstanding_limit);
      const days = daysSinceLastTxn(c._effectiveLastTxn);
      return {
        'S/N': idx + 1,
        'Customer Name': c.customer_name,
        'Phone Number': c.phone_number || '—',
        'Alt Phone 1': c.alt_phone_number || '—',
        'Email': c.email || '—',
        'Home Address': c.home_address || '—',
        'Office Address': c.office_address || '—',
        'Contact Person': c.contact_person || '—',
        'Contact Person Phone': c.contact_person_phone || '—',
        'Bank Name': c.bank_name || '—',
        'Account Number': c.account_number || '—',
        'Account Name': c.account_name || '—',
        'Status': c.status.charAt(0).toUpperCase() + c.status.slice(1),
        'Auto-Dormant': c._autoDormant ? 'Yes' : 'No',
        'Days Inactive': days !== null ? days : '—',
        'Credit Limit': limit > 0 ? limit : '—',
        'Outstanding': outstanding > 0 ? outstanding : 0,
        'Trucks Used': trucksUsed || '—',
        'Qty Sold (L)': stats?.totalQty || 0,
        'Last Transaction': c._effectiveLastTxn
          ? format(parseISO(c._effectiveLastTxn), 'dd/MM/yyyy')
          : '—',
        'Notes': c.notes || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Delivery Customers');
    XLSX.writeFile(wb, `DELIVERY-CUSTOMERS-${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
  }, [filtered, customerStats]);

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  const isLoading = customersQuery.isLoading;

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />

      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-5">

            {/* Header */}
            <PageHeader
              title="Delivery Customers Database"
              description="Comprehensive customer profiles, credit tracking, and auto-dormancy monitoring."
              actions={
                <>
                  <Button variant="outline" className="gap-2" onClick={exportExcel} disabled={filtered.length === 0}>
                    <Download size={16} /> Export
                  </Button>
                  {!readOnly && (
                    <Button className="gap-2" onClick={openAdd}>
                      <Plus size={16} /> Add Customer
                    </Button>
                  )}
                </>
              }
            />

            {/* ── Summary Cards ─────────────────────────────────────── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Search + Filters ─────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search by name, phone, email, address, bank…"
                    className="pl-10"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                  className="h-10 w-full sm:w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="dormant">Dormant</option>
                  <option value="suspended">Suspended</option>
                  <option value="auto-dormant">⏰ Auto-Dormant (60d+)</option>
                </select>
                {/* <div className="text-sm text-slate-500 self-center whitespace-nowrap">
                  {isLoading ? '…' : `${filtered.length} customer${filtered.length !== 1 ? 's' : ''}`}
                </div> */}
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
              ) : filtered.length === 0 ? (
                <div className="p-10 text-center">
                  <Users className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No customers found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {allCustomers.length > 0
                      ? 'Adjust your filters or search.'
                      : 'Click "Add Customer" to get started.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700 w-[48px]">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700">Customer</TableHead>
                        <TableHead className="font-semibold text-slate-700">Phone Numbers</TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700">Credit Limit</TableHead>
                        <TableHead className="font-semibold text-slate-700">Outstanding</TableHead>
                        <TableHead className="font-semibold text-slate-700">Qty Sold</TableHead>
                        <TableHead className="font-semibold text-slate-700">Last Activity</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c, idx) => {
                        const sc = statusConfig[c.status] || statusConfig.active;
                        const StatusIcon = sc.icon;
                        const stats = customerStats.get(c.id);
                        const creditLimit = toNum(c.outstanding_limit);
                        const outstanding = (stats?.totalSalesValue || 0) - (stats?.totalPayments || 0);
                        const hasLimit = creditLimit > 0;
                        const isOverLimit = hasLimit && outstanding > creditLimit;
                        const isNearLimit = hasLimit && !isOverLimit && outstanding >= creditLimit * 0.8;
                        const days = daysSinceLastTxn(c._effectiveLastTxn);

                        return (
                          <TableRow
                            key={c.id}
                            className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                            onClick={() => setSelectedCustomer(c)}
                          >
                            <TableCell className="text-slate-500 text-sm">{idx + 1}</TableCell>

                            {/* Customer — photo + name */}
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                {/* {c.passport_photo ? (
                                  <img
                                    src={c.passport_photo}
                                    alt={c.customer_name}
                                    className="w-8 h-8 rounded-full object-cover border border-slate-200"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                    <User size={14} />
                                  </div>
                                )} */}
                                <span className="font-medium text-slate-900 capitalize truncate max-w-[180px]">
                                  {c.customer_name}
                                </span>
                              </div>
                            </TableCell>

                            {/* Phone Numbers — clickable tel: links */}
                            <TableCell className="text-sm font-semibold underline">
                              <div className="space-y-0.5">
                                <PhoneLink phone={c.phone_number} />
                                {c.alt_phone_number && (
                                  <div className="text-sm font-semibold underline"><PhoneLink phone={c.alt_phone_number} /></div>
                                )}
                              </div>
                            </TableCell>

                            {/* Status + auto-dormant badge */}
                            <TableCell>
                              <div className="space-y-1">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${sc.cls}`}>
                                  <StatusIcon size={12} />
                                  {sc.label}
                                </span>
                                {c._autoDormant && (
                                  <span className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 w-fit">
                                    <Clock size={10} />
                                    Auto-Dormant
                                  </span>
                                )}
                              </div>
                            </TableCell>

                            {/* Credit Limit */}
                            <TableCell className="text-sm whitespace-nowrap">
                              {hasLimit ? (
                                <span className="font-medium text-slate-700">₦{fmtMoney(creditLimit)}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </TableCell>

                            {/* Outstanding */}
                            <TableCell className="text-sm whitespace-nowrap">
                              {outstanding > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  {isOverLimit && <ShieldAlert size={14} className="text-red-500 shrink-0" />}
                                  {isNearLimit && <AlertTriangle size={13} className="text-amber-500 shrink-0" />}
                                  <span className={`font-semibold ${isOverLimit ? 'text-red-600' : isNearLimit ? 'text-amber-600' : 'text-slate-700'}`}>
                                    ₦{fmtMoney(outstanding)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-emerald-600 font-medium">₦0.00</span>
                              )}
                            </TableCell>

                            {/* Qty Sold */}
                            <TableCell className="text-sm font-medium text-slate-700">
                              {stats?.totalQty ? fmtQty(stats.totalQty) : '0'} Litres
                            </TableCell>

                            {/* Last Activity */}
                            <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                              {c._effectiveLastTxn ? (
                                <div>
                                  <span>{format(parseISO(c._effectiveLastTxn), 'dd MMM yyyy')}</span>
                                  {/* {days !== null && (
                                    <span className={`block text-[11px] ${days >= AUTO_DORMANT_DAYS ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                                      {days}d ago
                                    </span>
                                  )} */}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </TableCell>

                            {/* Actions */}
                            <TableCell>
                              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                  title="View customer"
                                  onClick={() => setSelectedCustomer(c)}
                                >
                                  <Eye size={15} />
                                </Button>
                                {!readOnly && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-green-600 hover:text-green-800 hover:bg-green-50"
                                      title="Edit customer"
                                      onClick={() => openEdit(c)}
                                    >
                                      <Pencil size={14} />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                      title="Delete customer"
                                      onClick={() => setDeleteTarget({ id: c.id, label: c.customer_name })}
                                    >
                                      <Trash2 size={14} />
                                    </Button>
                                  </>
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

          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Customer Drill-Down Dialog                                     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!selectedCustomer} onOpenChange={open => { if (!open) setSelectedCustomer(null); }}>
        <DialogContent className="sm:max-w-[800px] max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            {/* <DialogTitle className="flex items-center gap-3">
              <div className="bg-emerald-100 p-2 rounded-lg">
                {selectedCustomer?.passport_photo ? (
                  <img src={selectedCustomer.passport_photo} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-emerald-700" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg text-emerald-700 font-bold capitalize">{selectedCustomer?.customer_name}</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5 flex items-center gap-2">
                  {selectedCustomer?.contact_person && <span>Contact: {selectedCustomer.contact_person}</span>}
                </p>
              </div>
            </DialogTitle> */}
            {/* <DialogDescription className="sr-only">Customer profile detail</DialogDescription> */}
          </DialogHeader>

          {selectedCustomer && (() => {
            const stats = customerStats.get(selectedCustomer.id);
            const creditLimit = toNum(selectedCustomer.outstanding_limit);
            const outstanding = (stats?.totalSalesValue || 0) - (stats?.totalPayments || 0);
            const hasLimit = creditLimit > 0;
            const isOverLimit = hasLimit && outstanding > creditLimit;
            const truckPlates = stats ? Array.from(stats.trucksUsed) : [];
            const sc = statusConfig[selectedCustomer.status] || statusConfig.active;
            const StatusIcon = sc.icon;
            const dormantCustomer = customersWithDormancy.find(c => c.id === selectedCustomer.id);
            const autoDormant = dormantCustomer?._autoDormant || false;
            const effectiveLastTxn = dormantCustomer?._effectiveLastTxn || selectedCustomer.last_transaction_date;
            const days = daysSinceLastTxn(effectiveLastTxn);

            return (
              <div className="flex-1 overflow-auto py-3 px-1">
                <div className="space-y-4">

                  {/* ── Auto-dormancy alert banner ── */}
                  {autoDormant && (
                    <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <Clock size={18} className="text-amber-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800">Auto-Dormant Alert</p>
                        <p className="text-xs text-amber-600">
                          No transactions for {days !== null ? `${days} days` : '60+ days'}. Consider reaching out to re-engage this customer.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Customer Profile (photo, phones, addresses all here) ── */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <User size={13} className="text-slate-500" /> Customer Profile
                      <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${sc.cls}`}>
                        <StatusIcon size={11} /> {sc.label}
                      </span>
                    </h4>

                    <div className="flex gap-4 mb-4">
                      {/* Passport Photo */}
                      {selectedCustomer.passport_photo ? (
                        <img
                          src={selectedCustomer.passport_photo}
                          alt={selectedCustomer.customer_name}
                          className="w-20 h-20 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 shrink-0">
                          <Camera size={26} />
                        </div>
                      )}

                      {/* Name, Phones, Email */}
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <p className="text-lg font-bold text-slate-900 capitalize">{selectedCustomer.customer_name}</p>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                          <div>
                            <span className="text-[11px] font-medium text-slate-400">Phone Number</span>
                            <p className="text-sm font-bold underline"><PhoneLink phone={selectedCustomer.phone_number} /></p>
                          </div>
                          {selectedCustomer.alt_phone_number && (
                            <div>
                              <span className="text-[11px] font-medium text-slate-400">Alt Phone</span>
                              <p className="text-sm font-bold underline"><PhoneLink phone={selectedCustomer.alt_phone_number} /></p>
                            </div>
                          )}
                          {/* {selectedCustomer.email && (
                            <div>
                              <span className="text-[11px] font-medium text-slate-400">Email</span>
                              <p className="text-sm font-bold underline text-blue-700">
                                <a href={`mailto:${selectedCustomer.email}`} className="hover:underline">{selectedCustomer.email}</a>
                              </p>
                            </div>
                          )} */}
                        </div>
                        {/* {(selectedCustomer.contact_person || selectedCustomer.contact_person_phone) && (
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-1">
                            {selectedCustomer.contact_person && (
                              <div>
                                <span className="text-[11px] font-medium text-slate-400">Contact Person</span>
                                <p className="text-sm font-medium text-slate-800">{selectedCustomer.contact_person}</p>
                              </div>
                            )}
                            {selectedCustomer.contact_person_phone && (
                              <div>
                                <span className="text-[11px] font-medium text-slate-400">Contact Phone</span>
                                <p className="text-sm font-bold underline"><PhoneLink phone={selectedCustomer.contact_person_phone} /></p>
                              </div>
                            )}
                          </div>
                        )} */}
                      </div>
                    </div>

                    {/* Phone Numbers */}
                    {/* <div className="border-t border-slate-100 pt-3 mb-3">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Phone Numbers</span>
                      <div className="flex gap-6 mt-1.5">
                        <div>
                          <span className="text-[11px] font-medium text-slate-400">Primary</span>
                          <p className="text-sm"><PhoneLink phone={selectedCustomer.phone_number} /></p>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium text-slate-400">Alt Phone</span>
                          <p className="text-sm"><PhoneLink phone={selectedCustomer.alt_phone_number} /></p>
                        </div>
                      </div>
                    </div> */}

                    {/* Addresses */}
                    <div className="border-t border-slate-100 pt-3">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Addresses</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1.5">
                        <div>
                          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1"><MapPin size={10} /> Home</span>
                          <p className="text-sm text-slate-700 whitespace-pre-line">{selectedCustomer.home_address || '—'}</p>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1"><Building2 size={10} /> Office</span>
                          <p className="text-sm text-slate-700 whitespace-pre-line">{selectedCustomer.office_address || '—'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Financial Summary ── */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <Wallet size={13} className="text-slate-500" /> Financial Summary
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Credit Limit</span>
                        <p className="text-sm font-bold text-slate-800">{hasLimit ? `₦${fmtMoney(creditLimit)}` : '—'}</p>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Outstanding</span>
                        <p className={`text-sm font-bold ${isOverLimit ? 'text-red-600' : outstanding > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          ₦{fmtMoney(outstanding)}
                          {isOverLimit && <ShieldAlert size={12} className="inline ml-1 text-red-500" />}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Total Sales Value</span>
                        <p className="text-sm font-bold text-slate-800">₦{fmtMoney(stats?.totalSalesValue || 0)}</p>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Total Payments</span>
                        <p className="text-sm font-bold text-emerald-700">₦{fmtMoney(stats?.totalPayments || 0)}</p>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Qty Sold</span>
                        <p className="text-sm font-bold text-slate-800">{fmtQty(stats?.totalQty || 0)} Litres</p>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Last Activity</span>
                        <p className="text-sm font-bold text-slate-800">
                          {effectiveLastTxn ? format(parseISO(effectiveLastTxn), 'dd MMM yyyy') : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Bank Details sub-section */}
                    {/* <div className="border-t border-slate-100 pt-3 mt-3">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                        <CreditCard size={10} /> Bank Account Details
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1.5">
                        <div>
                          <span className="text-[11px] font-medium text-slate-400">Bank Name</span>
                          <p className="text-sm font-medium text-slate-800">{selectedCustomer.bank_name || '—'}</p>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium text-slate-400">Account Number</span>
                          <p className="text-sm font-mono font-medium text-slate-800">{selectedCustomer.account_number || '—'}</p>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium text-slate-400">Account Name</span>
                          <p className="text-sm font-medium text-slate-800">{selectedCustomer.account_name || '—'}</p>
                        </div>
                      </div>
                    </div> */}
                  </div>

                  {/* ── Trucks Used ── */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <Truck size={13} className="text-slate-500" /> Trucks Used
                    </h4>
                    {truckPlates.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {truckPlates.map((plate, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200">
                            <Truck size={10} /> {plate}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">No trucks on record.</p>
                    )}
                  </div>

                  {/* ── Notes ── */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                      <FileText size={13} className="text-slate-500" /> Notes
                    </h4>
                    <p className="text-sm text-slate-700 whitespace-pre-line">{selectedCustomer.notes || '—'}</p>
                  </div>

                  {/* ── Edit Button ── */}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" className="gap-2" onClick={() => { openEdit(selectedCustomer); setSelectedCustomer(null); }}>
                      <Pencil size={14} /> Edit Customer
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Add / Edit Customer Dialog                                     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Users className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  {editing ? 'Edit Customer' : 'New Customer'}
                </h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  {editing ? 'Update customer details' : 'Add a delivery customer'}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editing ? 'Edit customer details' : 'Add new customer'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">

            {/* ── Section: Basic Info ── */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-1">
                <User size={13} /> Basic Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-sm font-medium text-slate-700">
                    Customer Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="e.g. John Doe"
                    value={form.customer_name}
                    onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                  />
                </div>
                {/* <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Contact Person</Label>
                  <Input
                    placeholder="Main contact name"
                    value={form.contact_person}
                    onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Contact Person Phone</Label>
                  <Input
                    placeholder="08012345678"
                    value={form.contact_person_phone}
                    onChange={e => setForm(f => ({ ...f, contact_person_phone: e.target.value }))}
                  />
                </div> */}
              </div>
            </div>

            {/* ── Section: Phone Numbers ── */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-1">
                <Phone size={13} /> Phone Numbers
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Primary</Label>
                  <Input
                    placeholder="08012345678"
                    value={form.phone_number}
                    onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Alt Phone</Label>
                  <Input
                    placeholder="Optional"
                    value={form.alt_phone_number}
                    onChange={e => setForm(f => ({ ...f, alt_phone_number: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* ── Section: Addresses ── */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-1">
                <MapPin size={13} /> Addresses
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Home Address</Label>
                  <Textarea
                    placeholder="Home address…"
                    rows={2}
                    value={form.home_address}
                    onChange={e => setForm(f => ({ ...f, home_address: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Office Address</Label>
                  <Textarea
                    placeholder="Office address…"
                    rows={2}
                    value={form.office_address}
                    onChange={e => setForm(f => ({ ...f, office_address: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* ── Section: Passport Photo ── */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-1">
                <Camera size={13} /> Passport Photo
              </h4>
              <div className="flex items-center gap-4">
                {(form.passport_photo || form.passport_photo_preview) ? (
                  <div className="relative group">
                    <img
                      src={form.passport_photo ? URL.createObjectURL(form.passport_photo) : form.passport_photo_preview}
                      alt="Preview"
                      className="w-20 h-20 rounded-lg object-cover border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, passport_photo: null, passport_photo_preview: '' }))}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                    <Camera size={24} />
                  </div>
                )}
                <div className="flex-1 space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Upload Photo</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0] || null;
                      setForm(f => ({
                        ...f,
                        passport_photo: file,
                        passport_photo_preview: file ? URL.createObjectURL(file) : f.passport_photo_preview,
                      }));
                    }}
                  />
                  <p className="text-xs text-slate-400">Select a passport photo to upload.</p>
                </div>
              </div>
            </div>

            {/* ── Section: Bank Details ── */}
            {/* <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-1">
                <CreditCard size={13} /> Bank Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Bank Name</Label>
                  <Input
                    placeholder="e.g. GTBank"
                    value={form.bank_name}
                    onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Account Number</Label>
                  <Input
                    placeholder="0123456789"
                    value={form.account_number}
                    onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Account Name</Label>
                  <Input
                    placeholder="Account holder name"
                    value={form.account_name}
                    onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
                  />
                </div>
              </div>
            </div> */}

            {/* ── Section: Credit & Status ── */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-1">
                <Wallet size={13} /> Credit & Status
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">
                    Credit Limit (₦)
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 100,000,000"
                    value={form.outstanding_limit}
                    onChange={e =>
                      setForm(f => ({ ...f, outstanding_limit: formatWithCommas(e.target.value) }))
                    }
                  />
                  <p className="text-xs text-slate-400">Max outstanding before flagging.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">
                    Status <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex gap-2">
                    {(['active', 'dormant', 'suspended'] as const).map(s => {
                      const cfg = statusConfig[s];
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, status: s }))}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                            form.status === s
                              ? `${cfg.cls} ring-2 ring-offset-1`
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section: Notes ── */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-1">
                <FileText size={13} /> Notes
              </h4>
              <Textarea
                placeholder="Additional notes about this customer…"
                rows={3}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : editing ? (
                <Pencil size={16} />
              ) : (
                <Plus size={16} />
              )}
              {saving ? 'Saving…' : editing ? 'Update Customer' : 'Add Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Delete Confirmation                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={open => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-red-100 p-2 rounded-lg">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <span>Confirm Delete</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Are you sure you want to delete <strong>{deleteTarget?.label}</strong>? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-2"
            >
              {deleting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
