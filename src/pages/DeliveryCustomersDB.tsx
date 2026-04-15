// filepath: /Users/sableboxx/soroman_dashboard-2/src/pages/DeliveryCustomersDB.tsx
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
  Plus, Search, Download, Loader2, Pencil, Trash2,
  Users, Phone, Wallet, UserCheck, UserX, UserMinus,
  Truck, AlertTriangle, ShieldAlert,
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface DeliveryCustomer {
  id: number;
  customer_name: string;
  phone_number: string;
  status: 'active' | 'dormant' | 'suspended';
  outstanding_limit: string | number | null;
  total_value_given: string | number;
  total_payments_received: string | number;
  current_balance: string | number;
  assigned_trucks?: number[];         // truck IDs from backend
  assigned_truck_plates?: string[];   // plate numbers from backend
  last_transaction_date: string | null;
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
type StatusFilter = 'all' | 'active' | 'dormant' | 'suspended';

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

  // ── Filters ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // ── Dialog state ───────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryCustomer | null>(null);
  const [form, setForm] = useState({
    customer_name: '',
    phone_number: '',
    status: 'active' as 'active' | 'dormant' | 'suspended',
    outstanding_limit: '',
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
    const map = new Map<number, { trucksUsed: Set<string>; totalQty: number; totalSalesValue: number; totalPayments: number }>();

    // First pass: group sales by customer + truck to avoid double-counting
    // quantity and sales_value across multiple payment rows for the same delivery
    const custTruckSeen = new Map<string, { qty: number; salesValue: number }>();

    allSales.forEach(s => {
      const existing = map.get(s.customer) || {
        trucksUsed: new Set<string>(),
        totalQty: 0,
        totalSalesValue: 0,
        totalPayments: 0,
      };
      if (s.truck_number) existing.trucksUsed.add(s.truck_number);

      // Payments are always summed — each row is a unique payment entry
      existing.totalPayments += toNum(s.payment_amount);

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
  // Derived data
  // ═══════════════════════════════════════════════════════════════════

  const filtered = useMemo(() => {
    let list = allCustomers;

    if (statusFilter !== 'all') {
      list = list.filter(c => c.status === statusFilter);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(c =>
        c.customer_name.toLowerCase().includes(q) ||
        (c.phone_number || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [allCustomers, statusFilter, searchQuery]);

  const totals = useMemo(() => {
    const active = allCustomers.filter(c => c.status === 'active').length;
    const dormant = allCustomers.filter(c => c.status === 'dormant').length;
    const suspended = allCustomers.filter(c => c.status === 'suspended').length;

    // Total unique trucks used and qty from ledger
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
      totalTrucksUsed: totalTrucksUsed.size,
      totalQtyFromLedger,
    };
  }, [allCustomers, customerStats]);

  const summaryCards = useMemo((): SummaryCard[] => [
    { title: 'Total Customers', value: String(totals.total), icon: <Users size={20} />, tone: 'neutral' },
    // { title: 'Active', value: String(totals.active), icon: <UserCheck size={20} />, tone: 'green' },
    { title: 'Total Trucks Sold', value: String(totals.totalTrucksUsed), icon: <Truck size={20} />, tone: 'neutral' },
    { title: 'Total Qty Sold', value: `${fmtQty(totals.totalQtyFromLedger)} L`, icon: <Wallet size={20} />, tone: 'green' },
    // { title: 'Dormant / Suspended', value: `${totals.dormant} / ${totals.suspended}`, icon: <UserMinus size={20} />, tone: totals.dormant + totals.suspended > 0 ? 'amber' : 'neutral' },
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
      customer_name: '',
      phone_number: '',
      status: 'active',
      outstanding_limit: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (c: DeliveryCustomer) => {
    setEditing(c);
    setForm({
      customer_name: c.customer_name,
      phone_number: c.phone_number || '',
      status: c.status,
      outstanding_limit: toNum(c.outstanding_limit) > 0
        ? formatWithCommas(String(toNum(c.outstanding_limit)))
        : '',
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
        phone_number: form.phone_number.trim() || undefined,
        status: form.status,
        outstanding_limit: limitVal > 0 ? limitVal : 0,
      };
      if (editing) {
        await apiClient.admin.updateDeliveryCustomer(editing.id, payload as Parameters<typeof apiClient.admin.updateDeliveryCustomer>[1]);
        toast({ title: 'Customer updated' });
      } else {
        await apiClient.admin.createDeliveryCustomer(payload as Parameters<typeof apiClient.admin.createDeliveryCustomer>[0]);
        toast({ title: 'Customer added' });
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
  }, [form, editing, toast]);

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
      return {
        'S/N': idx + 1,
        'Customer Name': c.customer_name,
        'Phone Number': c.phone_number || '—',
        'Status': c.status.charAt(0).toUpperCase() + c.status.slice(1),
        'Credit Limit': limit > 0 ? limit : '—',
        'Outstanding': outstanding > 0 ? outstanding : 0,
        'Trucks Used': trucksUsed || '—',
        'Qty Sold (L)': stats?.totalQty || 0,
        'Last Transaction': c.last_transaction_date
          ? format(new Date(c.last_transaction_date), 'dd/MM/yyyy')
          : '—',
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
              description="Manage delivery customers and performance derived from the sales ledger."
              actions={
                <>
                  <Button variant="outline" className="gap-2" onClick={exportExcel} disabled={filtered.length === 0}>
                    <Download size={16} /> Export
                  </Button>
                  <Button className="gap-2" onClick={openAdd}>
                    <Plus size={16} /> Add Customer
                  </Button>
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
                    placeholder="Search by name or phone number…"
                    className="pl-10"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                  className="h-10 w-full sm:w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="dormant">Dormant</option>
                  <option value="suspended">Suspended</option>
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
                        <TableHead className="font-semibold text-slate-700">Customer Name</TableHead>
                        <TableHead className="font-semibold text-slate-700">Phone Number</TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        {/* <TableHead className="font-semibold text-slate-700">Trucks Used</TableHead> */}
                        <TableHead className="font-semibold text-slate-700">Credit Limit</TableHead>
                        <TableHead className="font-semibold text-slate-700">Outstanding</TableHead>
                        <TableHead className="font-semibold text-slate-700">Quantity Sold</TableHead>
                        {/* <TableHead className="font-semibold text-slate-700">Last Transaction</TableHead> */}
                        {/* <TableHead className="font-semibold text-slate-700">Actions</TableHead> */}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c, idx) => {
                        const sc = statusConfig[c.status] || statusConfig.active;
                        const StatusIcon = sc.icon;
                        const stats = customerStats.get(c.id);

                        // Truck plates from ledger stats
                        const truckPlates = stats ? Array.from(stats.trucksUsed) : [];

                        // Credit limit & outstanding
                        const creditLimit = toNum(c.outstanding_limit);
                        const outstanding = (stats?.totalSalesValue || 0) - (stats?.totalPayments || 0);
                        const hasLimit = creditLimit > 0;
                        const isOverLimit = hasLimit && outstanding > creditLimit;
                        const isNearLimit = hasLimit && !isOverLimit && outstanding >= creditLimit * 0.8;

                        return (
                          <TableRow key={c.id} className="hover:bg-slate-50/60 transition-colors">
                            <TableCell className="text-slate-500 text-sm">{idx + 1}</TableCell>

                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-900 capitalize">
                                  {c.customer_name}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="text-sm">
                              {c.phone_number ? (
                                <a
                                  href={`tel:${c.phone_number}`}
                                  className="inline-flex items-center gap-1.5 text-slate-900 hover:underline"
                                >
                                  <Phone size={12} className="text-green-600 shrink-0" />
                                  {c.phone_number}
                                </a>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </TableCell>

                            <TableCell>
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${sc.cls}`}>
                                <StatusIcon size={12} />
                                {sc.label}
                              </span>
                            </TableCell>

                            {/* Trucks Used (from ledger) */}
                            {/* <TableCell>
                              {truckPlates.length > 0 ? (
                                <div className="flex flex-wrap gap-1 max-w-[220px]">
                                  {truckPlates.slice(0, 3).map((plate, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200"
                                    >
                                      <Truck size={10} />
                                      {plate}
                                    </span>
                                  ))}
                                  {truckPlates.length > 3 && (
                                    <span className="text-[11px] text-slate-400 self-center">
                                      +{truckPlates.length - 3} more
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">None</span>
                              )}
                            </TableCell> */}

                            {/* Credit Limit */}
                            <TableCell className="text-sm whitespace-nowrap">
                              {hasLimit ? (
                                <span className="font-medium text-slate-700">
                                  ₦{fmtMoney(creditLimit)}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </TableCell>

                            {/* Outstanding */}
                            <TableCell className="text-sm whitespace-nowrap">
                              {outstanding > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  {isOverLimit && (
                                    <ShieldAlert size={14} className="text-red-500 shrink-0" />
                                  )}
                                  {isNearLimit && (
                                    <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                                  )}
                                  <span className={`font-semibold ${
                                    isOverLimit
                                      ? 'text-red-600'
                                      : isNearLimit
                                        ? 'text-amber-600'
                                        : 'text-slate-700'
                                  }`}>
                                    ₦{fmtMoney(outstanding)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-emerald-600 font-medium">₦0.00</span>
                              )}
                            </TableCell>

                            <TableCell className="text-sm font-medium text-slate-700">
                              {stats?.totalQty ? fmtQty(stats.totalQty) : '—'} Litres
                            </TableCell>

                            {/* <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                              {c.last_transaction_date
                                ? format(new Date(c.last_transaction_date), 'dd MMM yyyy')
                                : '—'}
                            </TableCell> */}

                            {/* <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 text-sm text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800"
                                  onClick={() => openEdit(c)}
                                  title="Edit customer"
                                >
                                  <Pencil size={14} />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                  title="Delete customer"
                                  onClick={() =>
                                    setDeleteTarget({ id: c.id, label: c.customer_name })
                                  }
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </TableCell> */}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* {!isLoading && filtered.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {filtered.length} of {allCustomers.length} customers
              </p>
            )} */}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Customer Dialog                                                */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
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
              {editing ? 'Edit customer' : 'New customer'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Customer Name */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Customer Name <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="e.g. John Doe"
                value={form.customer_name}
                onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
              />
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Phone size={15} className="text-slate-500" /> Phone Number
              </Label>
              <Input
                placeholder="e.g. 08012345678"
                value={form.phone_number}
                onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
              />
            </div>

            {/* Credit Limit */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Wallet size={15} className="text-slate-500" /> Credit Limit (₦)
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 5,000,000"
                value={form.outstanding_limit}
                onChange={e =>
                  setForm(f => ({ ...f, outstanding_limit: formatWithCommas(e.target.value) }))
                }
              />
              <p className="text-xs text-slate-400">
                Maximum outstanding balance allowed before flagging.
              </p>
            </div>

            {/* Status */}
            <div className="space-y-2">
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
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
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
