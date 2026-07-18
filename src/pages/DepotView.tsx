//
// DEPOT MANAGER VIEW — Read-only dashboard showing all orders with full
// details. Default filter: today. Filters: date preset, date range,
// location, product, status, PFI, search. No actions — view only.
//
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Input } from '@/components/ui/input';
import { CommaInput } from '@/components/ui/comma-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Search, X, CalendarDays, Eye, Pencil,
  Truck, Package, DollarSign, Clock, CheckCircle2, XCircle,
  MapPin, User, Phone, Hash, Building2, Fuel, FileText,
  ShieldCheck, ListFilter, RefreshCw,
  FuelIcon, Save, AlertCircle,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  format, parseISO, isToday, isYesterday, isThisWeek, isThisMonth, isThisYear,
  addDays, isAfter, isBefore, isSameDay, startOfDay, endOfDay,
} from 'date-fns';
import { apiClient, fetchAllPages } from '@/api/client';
import { getOrderReference } from '@/lib/orderReference';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface Order {
  id: number;
  user: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    phone?: string;
    companyName?: string;
    company_name?: string;
  };
  companyName?: string;
  company_name?: string;
  customer?: {
    companyName?: string;
    company_name?: string;
  };
  pickup?: {
    pickup_date?: string;
    pickup_time?: string;
    state?: string;
  };
  location_name?: string;
  location?: string | number;
  state?: string;
  total_price?: string | number;
  status: string;
  created_at: string;
  products: Array<{
    name?: string;
    unit_price?: number | string;
    unitPrice?: number | string;
    price?: number | string;
  }>;
  quantity?: number | string;
  release_type?: 'pickup' | 'delivery';
  reference?: string;
  truck_number?: string;
  driver_name?: string;
  driver_phone?: string;
  customer_details?: Record<string, unknown>;
  pfi_id?: number | null;
  pfi_number?: string | null;
  narration?: string;
  agent?: unknown;
  assigned_agent?: unknown;
  meta?: Record<string, unknown>;
  total_paid?: string | number | null;
  truck_tickets_count?: number;
  truck_tickets_qty?: string | number;
}

type TimePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const toNum = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number) =>
  `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtQty = (n: number) =>
  n.toLocaleString('en-NG', { maximumFractionDigits: 0 });

const fmtDateTime = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy, HH:mm'); }
  catch { return iso; }
};

const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy'); }
  catch { return iso; }
};

const getCustomerName = (o: Order): string => {
  const fn = o.user?.first_name ?? '';
  const ln = o.user?.last_name ?? '';
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  return (
    o.companyName ||
    o.company_name ||
    o.customer?.companyName ||
    o.customer?.company_name ||
    o.user?.email ||
    '—'
  );
};

const getCompanyName = (o: Order): string => {
  return (
    o.user?.companyName ||
    o.user?.company_name ||
    o.companyName ||
    o.company_name ||
    o.customer?.companyName ||
    o.customer?.company_name ||
    '—'
  );
};

const getPhone = (o: Order): string =>
  o.user?.phone_number || o.user?.phone || '—';

const getProductName = (o: Order): string =>
  o.products?.[0]?.name || '—';

const getPfiNumber = (o: Order): string =>
  o.pfi_number || '—';

const getUnitPrice = (o: Order): number => {
  const p = o.products?.[0] as Record<string, unknown> | undefined;
  const raw = p?.unit_price ?? p?.unitPrice ?? p?.price;
  return toNum(raw);
};

const getLocation = (o: Order): string =>
  o.location_name || o.state || o.pickup?.state || '—';

const getTruckNumber = (o: Order): string =>
  o.truck_number ||
  String(o.customer_details?.truckNumber || o.customer_details?.truck_number || '') ||
  '—';

const getDriverName = (o: Order): string =>
  o.driver_name ||
  String(o.customer_details?.driverName || o.customer_details?.driver_name || '') ||
  '—';

const getDriverPhone = (o: Order): string =>
  o.driver_phone ||
  String(o.customer_details?.driverPhone || o.customer_details?.driver_phone || '') ||
  '—';

// Status display
const STATUS_MAP: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border border-amber-200', icon: <Clock size={12} /> },
  paid: { label: 'Paid', cls: 'bg-green-50 text-green-700 border border-green-200', icon: <DollarSign size={12} /> },
  released: { label: 'Released', cls: 'bg-blue-50 text-blue-700 border border-blue-200', icon: <ShieldCheck size={12} /> },
  loaded: { label: 'Loaded', cls: 'bg-violet-50 text-violet-700 border border-violet-200', icon: <Truck size={12} /> },
  canceled: { label: 'Canceled', cls: 'bg-red-50 text-red-700 border border-red-200', icon: <XCircle size={12} /> },
  sold: { label: 'Sold', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: <CheckCircle2 size={12} /> },
};

const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS_MAP[status?.toLowerCase()] ?? {
    label: status, cls: 'bg-slate-50 text-slate-600 border border-slate-200', icon: null,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
};

const matchesPreset = (iso: string, preset: TimePreset): boolean => {
  try {
    const d = parseISO(iso);
    switch (preset) {
      case 'today': return isToday(d);
      case 'yesterday': return isYesterday(d);
      case 'week': return isThisWeek(d, { weekStartsOn: 1 });
      case 'month': return isThisMonth(d);
      case 'year': return isThisYear(d);
      case 'all': return true;
      default: return true;
    }
  } catch { return false; }
};

// ═══════════════════════════════════════════════════════════════════════════
// Edit Order Dialog
// ═══════════════════════════════════════════════════════════════════════════

interface EditOrderForm {
  created_at: string;   // local datetime string for <input type="datetime-local">
  quantity: string;
  total_price: string;
  truck_number: string;
  driver_name: string;
  driver_phone: string;
  narration: string;
}

const EditOrderDialog = ({
  order,
  open,
  onClose,
  onSaved,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const toLocalDTInput = (iso: string): string => {
    try {
      // Convert stored ISO (UTC) to the local datetime-local value
      const d = parseISO(iso);
      // format as YYYY-MM-DDTHH:mm (no seconds — datetime-local value format)
      return format(d, "yyyy-MM-dd'T'HH:mm");
    } catch {
      return '';
    }
  };

  const buildInitialForm = (o: Order): EditOrderForm => ({
    created_at: o.created_at ? toLocalDTInput(o.created_at) : '',
    quantity: String(o.quantity ?? ''),
    total_price: String(o.total_price ?? ''),
    truck_number: getTruckNumber(o) === '—' ? '' : getTruckNumber(o),
    driver_name: getDriverName(o) === '—' ? '' : getDriverName(o),
    driver_phone: getDriverPhone(o) === '—' ? '' : getDriverPhone(o),
    narration: String((o as Record<string, unknown>).payment_narration ?? o.narration ?? ''),
  });

  const [form, setForm] = React.useState<EditOrderForm>(() =>
    order ? buildInitialForm(order) : {
      created_at: '', quantity: '', total_price: '',
      truck_number: '', driver_name: '', driver_phone: '', narration: '',
    }
  );
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Re-seed form whenever the selected order changes
  React.useEffect(() => {
    if (order) setForm(buildInitialForm(order));
    setSaveError(null);
  }, [order]);

  if (!order) return null;

  const field = (key: keyof EditOrderForm) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value })),
  });

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const payload: Parameters<typeof apiClient.admin.patchAdminOrder>[1] = {};

      // Only send changed fields
      const orig = buildInitialForm(order);

      if (form.created_at && form.created_at !== orig.created_at) {
        // datetime-local value is in local time — send as ISO string
        const localDt = new Date(form.created_at);
        payload.created_at = localDt.toISOString();
      }
      if (form.quantity !== orig.quantity && form.quantity.trim()) {
        const n = parseInt(form.quantity, 10);
        if (!isNaN(n) && n > 0) payload.quantity = n;
      }
      if (form.total_price !== orig.total_price && form.total_price.trim()) {
        const n = parseFloat(form.total_price.replace(/,/g, ''));
        if (!isNaN(n)) payload.total_price = n;
      }
      if (form.truck_number !== orig.truck_number)
        payload.truck_number = form.truck_number.trim();
      if (form.driver_name !== orig.driver_name)
        payload.driver_name = form.driver_name.trim();
      if (form.driver_phone !== orig.driver_phone)
        payload.driver_phone = form.driver_phone.trim();
      if (form.narration !== orig.narration)
        payload.narration = form.narration.trim();

      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }

      await apiClient.admin.patchAdminOrder(order.id, payload);
      onSaved();
      onClose();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const ref = getOrderReference(order);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <Pencil className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Edit Order</h2>
              <p className="text-sm font-normal text-slate-500 mt-0.5">
                Ref: <span className="font-mono font-semibold text-amber-700">{ref}</span>
              </p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Edit order details</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Error banner */}
          {saveError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Order Date */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarDays size={12} /> Order Date
            </Label>
            <input
              type="datetime-local"
              className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              {...field('created_at')}
            />
            <p className="text-[11px] text-slate-400">Changing this corrects the order's recorded date for reports.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Quantity */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Fuel size={12} /> Quantity (L)
              </Label>
              <CommaInput
                className="h-9 text-sm"
                placeholder="e.g. 45,000"
                value={form.quantity}
                onValueChange={(v) => setForm(prev => ({ ...prev, quantity: v }))}
              />
            </div>

            {/* Total Price */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign size={12} /> Total Amount (₦)
              </Label>
              <CommaInput
                className="h-9 text-sm"
                placeholder="e.g. 4,500,000"
                value={form.total_price}
                onValueChange={(v) => setForm(prev => ({ ...prev, total_price: v }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Truck Number */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Truck size={12} /> Truck No.
              </Label>
              <Input className="h-9 text-sm" placeholder="e.g. ABC-123-XY" {...field('truck_number')} />
            </div>

            {/* Driver Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <User size={12} /> Driver Name
              </Label>
              <Input className="h-9 text-sm" placeholder="Driver full name" {...field('driver_name')} />
            </div>
          </div>

          {/* Driver Phone */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Phone size={12} /> Driver Phone
            </Label>
            <Input className="h-9 text-sm" placeholder="e.g. 0801 234 5678" {...field('driver_phone')} />
          </div>

          {/* Narration */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={12} /> Narration / Remarks
            </Label>
            <Textarea
              className="text-sm resize-none"
              rows={3}
              placeholder="Optional notes or payment narration"
              {...field('narration')}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <><RefreshCw size={13} className="animate-spin" /> Saving…</>
            ) : (
              <><Save size={13} /> Save Changes</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Detail Dialog
// ═══════════════════════════════════════════════════════════════════════════

const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">{label}</span>
    <span className="text-sm text-slate-800 font-medium">{value || '—'}</span>
  </div>
);

const OrderDetailDialog = ({
  order,
  open,
  onClose,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
}) => {
  if (!order) return null;
  const qty = toNum(order.quantity);
  const total = toNum(order.total_price);
  const unitPrice = getUnitPrice(order);
  const ref = getOrderReference(order);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <FuelIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Order Details</h2>
              <p className="text-sm font-normal text-slate-500 mt-0.5">
                Ref: <span className="font-mono font-semibold text-amber-700">{ref}</span>
              </p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Full order details view</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Status + type */}
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={order.status} />
            {/* {order.release_type && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                order.release_type === 'pickup'
                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}>
                {order.release_type === 'pickup' ? <Building2 size={12} /> : <Truck size={12} />}
                {order.release_type === 'pickup' ? 'Pickup' : 'Delivery'}
              </span>
            )} */}
            {order.pfi_number && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200">
                <FileText size={12} />{order.pfi_number}
              </span>
            )}
          </div>

          {/* Customer */}
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <User size={12} /> Customer
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DetailRow label="Order Date" value={fmtDateTime(order.created_at)} />
              <DetailRow label="Name" value={getCustomerName(order)} />
              <DetailRow label="Phone" value={getPhone(order)} />
              <DetailRow label="Email" value={order.user?.email} />
              <DetailRow label="Company" value={order.user?.companyName || order.user?.company_name || order.companyName || order.company_name} />
              <DetailRow label="Truck No." value={getTruckNumber(order)} />
            </div>
          </div>

          {/* Order */}
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Package size={12} /> Order Info
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DetailRow label="Reference" value={<span>{ref}</span>} />
              <DetailRow label="Location" value={getLocation(order)} />
              <DetailRow label="Product" value={getProductName(order)} />
              <DetailRow label="Quantity (L)" value={qty > 0 ? fmtQty(qty) : '—'} />
              <DetailRow label="Unit Price" value={unitPrice > 0 ? fmt(unitPrice) : '—'} />
              <DetailRow label="Total Amount" value={total > 0 ? fmt(total) : '—'} />
              {/* <DetailRow label="PFI Number" value={order.pfi_number} /> */}
            </div>
          </div>

          {/* Pickup / Delivery info */}
          {/* {order.pickup && (
            <div className="bg-sky-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-sky-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <MapPin size={12} /> Pickup Details
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <DetailRow label="Pickup Date" value={order.pickup.pickup_date ? fmtDate(order.pickup.pickup_date) : undefined} />
                <DetailRow label="Pickup Time" value={order.pickup.pickup_time} />
                <DetailRow label="State" value={order.pickup.state} />
              </div>
            </div>
          )} */}

          {/* Truck info (if loaded/delivery) */}
          {/* {(getTruckNumber(order) !== '—' || getDriverName(order) !== '—') && (
            <div className="bg-violet-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Truck size={12} /> Truck / Driver
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <DetailRow label="Truck No." value={getTruckNumber(order)} />
                <DetailRow label="Driver" value={getDriverName(order)} />
                <DetailRow label="Driver Phone" value={getDriverPhone(order)} />
              </div>
            </div>
          )} */}

          {/* Narration */}
          {/* {order.narration && (
            <div className="bg-amber-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">Narration / Remarks</p>
              <p className="text-sm text-slate-700">{order.narration}</p>
            </div>
          )} */}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

export default function DepotView() {
  // ── Filters ──────────────────────────────────────────────────────
  const [timePreset, setTimePreset] = useState<TimePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [calOpen, setCalOpen] = useState(false);
  const [calRange, setCalRange] = useState<{ from?: Date; to?: Date }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [pfiFilter, setPfiFilter] = useState('all');
  const [releaseTypeFilter, setReleaseTypeFilter] = useState('all');

  // ── Detail dialog ─────────────────────────────────────────────────
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // ── Edit dialog ───────────────────────────────────────────────────
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const queryClient = useQueryClient();

  const handleEditSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['depot-view-orders'] });
  };

  // ── Data ──────────────────────────────────────────────────────────
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['depot-view-orders'],
    queryFn: () => fetchAllPages<Order>(
      p => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size }),
    ),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const allOrders: Order[] = data?.results ?? [];

  // ── Derived filter options ────────────────────────────────────────
  const uniqueLocations = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { const l = getLocation(o); if (l !== '—') s.add(l); });
    return Array.from(s).sort();
  }, [allOrders]);

  const uniqueProducts = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { const p = getProductName(o); if (p !== '—') s.add(p); });
    return Array.from(s).sort();
  }, [allOrders]);

  const uniquePfis = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { const pfi = getPfiNumber(o); if (pfi !== '—') s.add(pfi); });
    return Array.from(s).sort();
  }, [allOrders]);

  const uniqueStatuses = useMemo(() => {
    const s = new Set<string>();
    allOrders.forEach(o => { if (o.status) s.add(o.status.toLowerCase()); });
    return Array.from(s).sort();
  }, [allOrders]);

  // ── Filtered orders ───────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    return allOrders.filter(o => {
      // Date filter
      const dateStr = o.created_at;
      if (timePreset === 'custom') {
        if (customFrom || customTo) {
          try {
            const d = parseISO(dateStr);
            if (customFrom && isBefore(d, startOfDay(parseISO(customFrom)))) return false;
            if (customTo && isAfter(d, endOfDay(parseISO(customTo)))) return false;
          } catch { return false; }
        }
      } else {
        if (!matchesPreset(dateStr, timePreset)) return false;
      }

      // Status
      if (statusFilter !== 'all' && o.status?.toLowerCase() !== statusFilter) return false;

      // Location
      if (locationFilter !== 'all' && getLocation(o) !== locationFilter) return false;

      // Product
      if (productFilter !== 'all' && getProductName(o) !== productFilter) return false;

      // PFI
      if (pfiFilter !== 'all' && getPfiNumber(o) !== pfiFilter) return false;

      // Release type
      if (releaseTypeFilter !== 'all' && o.release_type !== releaseTypeFilter) return false;

      // Search
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const ref = getOrderReference(o).toLowerCase();
        const name = getCustomerName(o).toLowerCase();
        const loc = getLocation(o).toLowerCase();
        const prod = getProductName(o).toLowerCase();
        const truck = getTruckNumber(o).toLowerCase();
        const driver = getDriverName(o).toLowerCase();
        const pfi = String(o.pfi_number ?? '').toLowerCase();
        if (
          !ref.includes(q) && !name.includes(q) && !loc.includes(q) &&
          !prod.includes(q) && !truck.includes(q) && !driver.includes(q) &&
          !pfi.includes(q) && !String(o.id).includes(q)
        ) return false;
      }

      return true;
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [allOrders, timePreset, customFrom, customTo, statusFilter, locationFilter, productFilter, pfiFilter, releaseTypeFilter, searchQuery]);

  // ── Summary cards ─────────────────────────────────────────────────
  const summaryCards = useMemo((): SummaryCard[] => {
    const total = filteredOrders.length;
    const paid = filteredOrders.filter(o => ['paid', 'released', 'loaded', 'sold'].includes(o.status?.toLowerCase())).length;
    const pending = filteredOrders.filter(o => o.status?.toLowerCase() === 'pending').length;
    const totalQty = filteredOrders.reduce((s, o) => s + toNum(o.quantity), 0);
    const totalAmount = filteredOrders.reduce((s, o) => s + toNum(o.total_price), 0);
    const totalPaid = filteredOrders.reduce((s, o) => s + toNum(o.total_paid), 0);

    const releasedOrders = filteredOrders.filter(o => o.status?.toLowerCase() === 'released');
    const releasedQty = releasedOrders.reduce((s, o) => s + toNum(o.quantity), 0);
    const releasedAmount = releasedOrders.reduce((s, o) => s + toNum(o.total_price), 0);

    // Trucks loaded & volume loaded come from actual TruckTicket rows, not
    // the order's status — a "loaded" order can still be only partially
    // fulfilled (e.g. 1 of 2 trucks so far), so this is the accurate figure.
    const trucksLoaded = filteredOrders.reduce((s, o) => s + (o.truck_tickets_count || 0), 0);
    const volumeLoaded = filteredOrders.reduce((s, o) => s + toNum(o.truck_tickets_qty), 0);

    return [
      { title: 'Total Orders', value: String(total), icon: <FileText size={20} />, tone: 'neutral', description: `${paid} paid & released` },
      { title: 'Payment Not Confirmed', value: String(pending), icon: <Clock size={20} />, tone: pending > 0 ? 'amber' : 'neutral' },
      { title: 'Total Qty Ordered (L)', value: totalQty > 0 ? fmtQty(totalQty) : '0', icon: <Fuel size={20} />, tone: 'neutral' },
      { title: 'Total Amount', value: totalAmount > 0 ? fmt(totalAmount) : '₦0.00', icon: <DollarSign size={20} />, tone: 'green', description: totalPaid > 0 ? `${fmt(totalPaid)} paid` : undefined },
      { title: 'Trucks Loaded', value: String(trucksLoaded), icon: <Truck size={20} />, tone: 'neutral', description: volumeLoaded > 0 ? `${fmtQty(volumeLoaded)} L loaded` : undefined },
      { title: 'Released Qty (L)', value: releasedQty > 0 ? fmtQty(releasedQty) : '0', icon: <ShieldCheck size={20} />, tone: 'neutral', description: releasedAmount > 0 ? fmt(releasedAmount) : undefined },
    ];
  }, [filteredOrders]);

  // ── Table rows grouped by day, with a subtotal row closing out each day ──
  // (filteredOrders is newest-first, so a day's subtotal appears right
  // before the next, earlier day's orders start — the same reading order
  // as scrolling down the table). Only worth doing once more than one day
  // is actually on screen; a single day would just repeat the summary cards.
  type DepotTableRow =
    | { kind: 'order'; sn: number; order: Order }
    | { kind: 'subtotal'; label: string; count: number; qty: number; amount: number };

  const depotTableRows = useMemo((): DepotTableRow[] => {
    const dayKey = (o: Order) => {
      try { return format(parseISO(o.created_at), 'yyyy-MM-dd'); }
      catch { return 'unknown'; }
    };
    const distinctDays = new Set(filteredOrders.map(dayKey));
    if (distinctDays.size <= 1) {
      return filteredOrders.map((order, idx) => ({ kind: 'order', sn: idx + 1, order }));
    }

    const out: DepotTableRow[] = [];
    let sn = 1;
    let i = 0;
    while (i < filteredOrders.length) {
      const key = dayKey(filteredOrders[i]);
      const dayOrders: Order[] = [];
      while (i < filteredOrders.length && dayKey(filteredOrders[i]) === key) {
        dayOrders.push(filteredOrders[i]);
        out.push({ kind: 'order', sn: sn, order: filteredOrders[i] });
        sn += 1;
        i += 1;
      }
      out.push({
        kind: 'subtotal',
        label: fmtDate(dayOrders[0].created_at),
        count: dayOrders.length,
        qty: dayOrders.reduce((s, o) => s + toNum(o.quantity), 0),
        amount: dayOrders.reduce((s, o) => s + toNum(o.total_price), 0),
      });
    }
    return out;
  }, [filteredOrders]);

  // ── Shared report data builder (used by both Excel and PDF exports) ────
  const buildDepotReportData = () => {
    const generatedAt = format(new Date(), 'dd MMM yyyy, HH:mm');
    const dateRangeLabel = timePreset === 'custom' && calRange.from
      ? calRange.to
        ? `${format(calRange.from, 'dd MMM yyyy')} - ${format(calRange.to, 'dd MMM yyyy')}`
        : format(calRange.from, 'dd MMM yyyy')
      : PRESETS.find(p => p.key === timePreset)?.label || 'All Time';

    const sortedOrders = [...filteredOrders].sort((a, b) => a.created_at.localeCompare(b.created_at));

    const reportLabel = [
      pfiFilter !== 'all' ? pfiFilter : '',
      locationFilter !== 'all' ? locationFilter : '',
    ].filter(Boolean).join(' - ') || 'ALL';
    const safeLabel = reportLabel.replace(/[/\\*?:[\]]/g, '-');

    const totalOrders = filteredOrders.length;
    const totalQty = filteredOrders.reduce((s, o) => s + toNum(o.quantity), 0);
    const totalAmount = filteredOrders.reduce((s, o) => s + toNum(o.total_price), 0);
    const totalPaid = filteredOrders.reduce((s, o) => s + toNum(o.total_paid), 0);
    const releasedQty = filteredOrders.filter(o => o.status?.toLowerCase() === 'released').reduce((s, o) => s + toNum(o.quantity), 0);
    const trucksLoaded = filteredOrders.reduce((s, o) => s + (o.truck_tickets_count || 0), 0);
    const volumeLoaded = filteredOrders.reduce((s, o) => s + toNum(o.truck_tickets_qty), 0);

    const headingBlock: Array<[string, string]> = [
      ['Report Generated', generatedAt],
      ['Date Period', String(dateRangeLabel).toUpperCase()],
      ['Location', locationFilter === 'all' ? 'ALL LOCATIONS' : String(locationFilter).toUpperCase()],
      ['PFI', pfiFilter === 'all' ? 'ALL PFIS' : String(pfiFilter).toUpperCase()],
      ['Total Orders', totalOrders.toLocaleString()],
      ['Total Qty Ordered (L)', totalQty.toLocaleString()],
      ['Trucks Loaded', `${trucksLoaded.toLocaleString()} (${volumeLoaded.toLocaleString()} L)`],
      ['Released Qty (L)', releasedQty.toLocaleString()],
      ['Total Amount', `N${totalAmount.toLocaleString()}`],
      ['Total Paid', `N${totalPaid.toLocaleString()}`],
    ];

    const headers = [
      'Reference', 'Date', 'Customer', 'Company', 'Contact', 'Location', 'PFI', 'Truck No.',
      'Product', 'Qty (L)', 'Trucks Loaded', 'Vol. Loaded (L)', 'Unit Price', 'Amount', 'Paid', 'Status',
    ];

    const orderRow = (order: Order) => [
      String(getOrderReference(order) || order.id),
      fmtDateTime(order.created_at),
      getCustomerName(order),
      getCompanyName(order),
      getPhone(order),
      getLocation(order),
      getPfiNumber(order),
      getTruckNumber(order),
      getProductName(order),
      toNum(order.quantity).toLocaleString(),
      String(order.truck_tickets_count || 0),
      toNum(order.truck_tickets_qty).toLocaleString(),
      `N${toNum(getUnitPrice(order)).toLocaleString()}`,
      `N${toNum(order.total_price).toLocaleString()}`,
      `N${toNum(order.total_paid).toLocaleString()}`,
      String(order.status || ''),
    ].map(v => String(v).toUpperCase());

    // Group chronologically by calendar day so a subtotal can be inserted
    // between days — only worth it when the export actually spans more
    // than one day; a single-day export would just repeat the grand total.
    const dayKey = (order: Order) => {
      try { return format(parseISO(order.created_at), 'yyyy-MM-dd'); }
      catch { return 'unknown'; }
    };
    const distinctDays = new Set(sortedOrders.map(dayKey));
    const showDaySubtotals = distinctDays.size > 1;

    const subtotalRow = (label: string, dayOrders: Order[]) => {
      const dayQty = dayOrders.reduce((s, o) => s + toNum(o.quantity), 0);
      const dayAmount = dayOrders.reduce((s, o) => s + toNum(o.total_price), 0);
      const dayPaid = dayOrders.reduce((s, o) => s + toNum(o.total_paid), 0);
      const dayTrucks = dayOrders.reduce((s, o) => s + (o.truck_tickets_count || 0), 0);
      const dayVolLoaded = dayOrders.reduce((s, o) => s + toNum(o.truck_tickets_qty), 0);
      return [
        `SUBTOTAL — ${label} (${dayOrders.length} ORDER${dayOrders.length === 1 ? '' : 'S'})`,
        '', '', '', '', '', '', '',
        '', dayQty.toLocaleString(), String(dayTrucks), dayVolLoaded.toLocaleString(),
        '', `N${dayAmount.toLocaleString()}`, `N${dayPaid.toLocaleString()}`, '',
      ].map(v => String(v).toUpperCase());
    };

    const rows: string[][] = [];
    if (showDaySubtotals) {
      let i = 0;
      while (i < sortedOrders.length) {
        const key = dayKey(sortedOrders[i]);
        const dayOrders: Order[] = [];
        while (i < sortedOrders.length && dayKey(sortedOrders[i]) === key) {
          dayOrders.push(sortedOrders[i]);
          rows.push(orderRow(sortedOrders[i]));
          i += 1;
        }
        rows.push(subtotalRow(fmtDate(dayOrders[0].created_at), dayOrders));
      }
    } else {
      sortedOrders.forEach(order => rows.push(orderRow(order)));
    }

    const totalsRow = [
      'TOTAL', '', '', '', '', '', '', '',
      '', totalQty.toLocaleString(), String(trucksLoaded), volumeLoaded.toLocaleString(),
      '', `N${totalAmount.toLocaleString()}`, `N${totalPaid.toLocaleString()}`, '',
    ];

    const fileName = `SALES REPORT ${safeLabel} - ${format(new Date(), 'ddMMyy')}`;

    return { headingBlock, headers, rows, totalsRow, fileName, safeLabel };
  };

  const COLUMN_ALIGN: Array<'left' | 'center' | 'right'> = [
    'left', 'left', 'left', 'left', 'left', 'left', 'left', 'left',
    'left', 'right', 'right', 'right', 'right', 'right', 'right', 'left',
  ];

  const handleExportExcel = async () => {
    if (filteredOrders.length === 0) { console.warn('[Export] filteredOrders is empty — button should be disabled'); return; }
    try {
      const { headingBlock, headers, rows, totalsRow, fileName, safeLabel } = buildDepotReportData();
      const colCount = headers.length;

      const NAVY = 'FF1E293B';
      const WHITE = 'FFFFFFFF';
      const LIGHT = 'FFF5F8FC';
      const BAND = 'FFEFF3F8';
      const TOTAL_FILL = 'FFE2E8F0';
      const BORDER_COLOR = 'FFB0C4DE';
      const thinBorder = { style: 'thin' as const, color: { argb: BORDER_COLOR } };
      const allBorders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Soroman Dashboard';
      workbook.created = new Date();
      const sheetName = `${safeLabel} SALES REPORT`.slice(0, 31);
      const ws = workbook.addWorksheet(sheetName, { views: [{ showGridLines: false }] });

      const lastColLetter = ws.getColumn(colCount).letter;

      ws.mergeCells(`A1:${lastColLetter}1`);
      const titleCell = ws.getCell('A1');
      titleCell.value = 'SALES REPORT';
      titleCell.font = { name: 'Calibri', bold: true, size: 16, color: { argb: WHITE } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 26;

      // Summary grid — label/value pairs, 2 per row across 4 columns
      const pairs: Array<[string, string, string, string]> = [];
      for (let i = 0; i < headingBlock.length; i += 2) {
        pairs.push([headingBlock[i][0], headingBlock[i][1], headingBlock[i + 1]?.[0] ?? '', headingBlock[i + 1]?.[1] ?? '']);
      }
      let r = 3;
      pairs.forEach(([l1, v1, l2, v2]) => {
        const row = ws.getRow(r);
        row.height = 18;
        ([[1, l1, true], [2, v1, false], [3, l2, true], [4, v2, false]] as const).forEach(([col, val, isLabel]) => {
          const cell = row.getCell(col);
          cell.value = val;
          cell.font = { name: 'Calibri', bold: isLabel, size: 10, color: { argb: 'FF1E3A5F' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isLabel ? LIGHT : WHITE } };
          cell.border = allBorders;
          cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        });
        r += 1;
      });
      ws.getColumn(1).width = 22; ws.getColumn(2).width = 22;
      ws.getColumn(3).width = 22; ws.getColumn(4).width = 22;

      r += 1;
      const headerRowIdx = r;
      const headerRow = ws.getRow(headerRowIdx);
      headerRow.height = 22;
      headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h.toUpperCase();
        cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.border = allBorders;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
      r += 1;

      const SUBTOTAL_FILL = 'FFDCEEFF';
      rows.forEach((row, idx) => {
        const isSubtotal = row[0]?.startsWith('SUBTOTAL');
        const xlRow = ws.getRow(r);
        xlRow.height = isSubtotal ? 18 : 16;
        row.forEach((val, ci) => {
          const cell = xlRow.getCell(ci + 1);
          cell.value = val;
          cell.font = { name: 'Calibri', size: isSubtotal ? 10 : 9.5, bold: isSubtotal, color: { argb: isSubtotal ? 'FF0F172A' : 'FF000000' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isSubtotal ? SUBTOTAL_FILL : (idx % 2 === 0 ? WHITE : BAND) } };
          cell.border = allBorders;
          cell.alignment = { vertical: 'middle', horizontal: COLUMN_ALIGN[ci] || 'left' };
        });
        if (isSubtotal) {
          ws.mergeCells(`A${r}:I${r}`);
          xlRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'right' };
        }
        r += 1;
      });

      const totalsRowXl = ws.getRow(r);
      totalsRowXl.height = 18;
      totalsRow.forEach((val, ci) => {
        const cell = totalsRowXl.getCell(ci + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
        cell.border = allBorders;
        cell.alignment = { vertical: 'middle', horizontal: COLUMN_ALIGN[ci] || 'left' };
      });

      const widths = [24, 18, 22, 22, 18, 18, 16, 16, 18, 12, 12, 14, 14, 16, 16, 14];
      widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      ws.views = [{ state: 'frozen', ySplit: headerRowIdx, showGridLines: false }];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Export] Excel export failed:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExportPDF = () => {
    if (filteredOrders.length === 0) { console.warn('[Export] filteredOrders is empty — button should be disabled'); return; }
    try {
      const { headingBlock, headers, rows, totalsRow, fileName } = buildDepotReportData();
      const doc = new jsPDF({ orientation: 'landscape' });

      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, 297, 16, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.text('SALES REPORT', 14, 10.5);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');

      const pairs: Array<[string, string, string, string]> = [];
      for (let i = 0; i < headingBlock.length; i += 2) {
        pairs.push([headingBlock[i][0], headingBlock[i][1], headingBlock[i + 1]?.[0] ?? '', headingBlock[i + 1]?.[1] ?? '']);
      }
      autoTable(doc, {
        startY: 22,
        body: pairs,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2.5, valign: 'middle', lineColor: [176, 196, 222], lineWidth: 0.2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 45, fillColor: [238, 244, 251], textColor: [30, 58, 95] },
          1: { cellWidth: 60 },
          2: { fontStyle: 'bold', cellWidth: 45, fillColor: [238, 244, 251], textColor: [30, 58, 95] },
          3: { cellWidth: 60 },
        },
      });

      const colWidthsMm = [22, 14, 18, 18, 16, 16, 16, 14, 16, 12, 12, 14, 14, 14, 14, 13];
      const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {};
      colWidthsMm.forEach((w, i) => { columnStyles[i] = { cellWidth: w, halign: COLUMN_ALIGN[i] || 'left' }; });

      autoTable(doc, {
        startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
        head: [headers.map(h => h.toUpperCase())],
        body: rows,
        foot: [totalsRow],
        showFoot: 'lastPage',
        margin: { left: 7, right: 7 },
        tableWidth: 'wrap',
        theme: 'grid',
        styles: {
          fontSize: 6.5, cellPadding: 1.4, overflow: 'linebreak', valign: 'middle',
          lineColor: [176, 196, 222], lineWidth: 0.15,
        },
        columnStyles,
        alternateRowStyles: { fillColor: [245, 248, 252] },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6.5, halign: 'center', valign: 'middle', fontStyle: 'bold' },
        footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7, valign: 'middle' },
        didParseCell: (data) => {
          const raw = data.row.raw as string[] | undefined;
          if (data.section === 'body' && raw?.[0]?.startsWith('SUBTOTAL')) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [220, 238, 255];
            data.cell.styles.textColor = [15, 23, 42];
            if (data.column.index === 0) data.cell.styles.halign = 'right';
          }
        },
      });

      doc.save(`${fileName}.pdf`);
    } catch (err) {
      console.error('[Export] PDF export failed:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const hasFilters = searchQuery || statusFilter !== 'all' || locationFilter !== 'all' ||
    productFilter !== 'all' || releaseTypeFilter !== 'all' ||
    pfiFilter !== 'all' || timePreset !== 'today' || customFrom || customTo;

  const clearFilters = () => {
    setTimePreset('today');
    setCustomFrom(''); setCustomTo('');
    setCalRange({});
    setSearchQuery('');
    setStatusFilter('all');
    setLocationFilter('all');
    setProductFilter('all');
    setPfiFilter('all');
    setReleaseTypeFilter('all');
  };

  const PRESETS: { key: TimePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'year', label: 'This Year' },
    { key: 'all', label: 'All Time' },
    { key: 'custom', label: 'Date Range' },
  ];

  // ── Render ────────────────────────────────────────────────────────
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
              title="Orders Overview"
              description="Live overview of all orders — status, quantities, customers, trucks and PFIs."
              actions={
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleExportExcel}
                    disabled={filteredOrders.length === 0}
                  >
                    <FileText size={15} />
                    Export Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleExportPDF}
                    disabled={filteredOrders.length === 0}
                  >
                    <FileText size={15} />
                    Export PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => refetch()}
                    disabled={isFetching}
                  >
                    <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                    Refresh
                  </Button>
                </div>
              }
            />

            {/* ── Filter Panel ──────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">

              {/* Search bar — full width, prominent */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  placeholder="Search by customer name, reference number, truck, driver or PFI…"
                  className="pl-10 h-10 text-sm bg-slate-50 border-slate-200 focus:bg-white"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    title="Clear search"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-slate-100" />

              {/* Row: Date Period — full width */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays size={12} /> Date Period
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.filter(p => p.key !== 'custom').map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => { setTimePreset(key); setCustomFrom(''); setCustomTo(''); setCalRange({}); }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${timePreset === key
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                  {/* Custom range button */}
                  <Popover open={calOpen} onOpenChange={setCalOpen}>
                    <PopoverTrigger asChild>
                      <button
                        title="Pick a custom date range"
                        onClick={() => setTimePreset('custom')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all flex items-center gap-1.5 ${timePreset === 'custom'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                          }`}
                      >
                        <CalendarDays size={11} />
                        {timePreset === 'custom' && calRange.from
                          ? calRange.to
                            ? `${format(calRange.from, 'dd MMM')} – ${format(calRange.to, 'dd MMM yyyy')}`
                            : format(calRange.from, 'dd MMM yyyy')
                          : 'Custom Range'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{ from: calRange.from, to: calRange.to }}
                        onSelect={r => {
                          setCalRange(r ?? {});
                          setTimePreset('custom');
                          if (r?.from) setCustomFrom(format(r.from, 'yyyy-MM-dd'));
                          if (r?.to) setCustomTo(format(r.to, 'yyyy-MM-dd'));
                          if (r?.from && r?.to) setCalOpen(false);
                        }}
                        initialFocus
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-100" />

              {/* Filter rows */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">

                {/* Order Status */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> Order Status
                  </p>
                  <select
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="all">All Orders</option>
                    {uniqueStatuses.map(s => (
                      <option key={s} value={s}>
                        {STATUS_MAP[s]?.label ?? s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={12} /> Location
                  </p>
                  <select
                    aria-label="Filter by location"
                    value={locationFilter}
                    onChange={e => setLocationFilter(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="all">All Locations</option>
                    {uniqueLocations.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>

                {/* Product */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Fuel size={12} /> Product
                  </p>
                  <select
                    aria-label="Filter by product"
                    value={productFilter}
                    onChange={e => setProductFilter(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="all">All Products</option>
                    {uniqueProducts.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* PFI */}
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
                    {uniquePfis.map(pfi => (
                      <option key={pfi} value={pfi}>{pfi}</option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Bottom bar: active filter summary + clear */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Active filter chips */}
                  {timePreset !== 'today' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <CalendarDays size={11} />
                      {timePreset === 'custom' && calRange.from
                        ? calRange.to
                          ? `${format(calRange.from, 'dd MMM')} – ${format(calRange.to, 'dd MMM yyyy')}`
                          : format(calRange.from, 'dd MMM yyyy')
                        : PRESETS.find(p => p.key === timePreset)?.label}
                      <button onClick={() => { setTimePreset('today'); setCustomFrom(''); setCustomTo(''); setCalRange({}); }} title="Remove date filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {statusFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      {STATUS_MAP[statusFilter]?.label ?? statusFilter}
                      <button onClick={() => setStatusFilter('all')} title="Remove status filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {locationFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <MapPin size={10} />{locationFilter}
                      <button onClick={() => setLocationFilter('all')} title="Remove location filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {productFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <Fuel size={10} />{productFilter}
                      <button onClick={() => setProductFilter('all')} title="Remove product filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {pfiFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <FileText size={10} />{pfiFilter}
                      <button onClick={() => setPfiFilter('all')} title="Remove PFI filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {releaseTypeFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      {releaseTypeFilter === 'pickup' ? 'Pickup' : 'Delivery'}
                      <button onClick={() => setReleaseTypeFilter('all')} title="Remove type filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <Search size={10} />"{searchQuery}"
                      <button onClick={() => setSearchQuery('')} title="Clear search" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {hasFilters && (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500 h-8 text-xs" onClick={clearFilters}>
                      <X size={13} /> Clear all filters
                    </Button>
                  )}
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                    {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} shown
                  </span>
                </div>
              </div>
            </div>

            {/* ── Summary Cards ─────────────────────────────────────── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Table ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : isError ? (
                <div className="p-10 text-center">
                  <XCircle className="mx-auto text-red-300 mb-3" size={40} />
                  <p className="text-slate-600 font-medium">Failed to load orders</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                    Try Again
                  </Button>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-10 text-center">
                  <Package className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No orders found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {allOrders.length > 0 ? 'Try adjusting your filters.' : 'No orders in the system yet.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="w-[48px] font-semibold text-slate-700">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700">Reference</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date</TableHead>
                        <TableHead className="font-semibold text-slate-700">Customer</TableHead>
                        <TableHead className="font-semibold text-slate-700">Phone</TableHead>
                        <TableHead className="font-semibold text-slate-700">Truck No.</TableHead>
                        <TableHead className="font-semibold text-slate-700">Location</TableHead>
                        {/* <TableHead className="font-semibold text-slate-700">Product</TableHead> */}
                        <TableHead className="font-semibold text-slate-700">Qty (L)</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Unit Price</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Total</TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700">PFI</TableHead>
                        {/* <TableHead className="font-semibold text-slate-700">Driver</TableHead> */}
                        <TableHead className="font-semibold text-slate-700 w-[60px]">Details</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[60px]">Edit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {depotTableRows.map((row) => {
                        if (row.kind === 'subtotal') {
                          return (
                            <TableRow key={`subtotal-${row.label}`} className="bg-blue-50/70 border-y border-blue-100 hover:bg-blue-50/70">
                              <TableCell colSpan={7} className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Subtotal — {row.label} · {row.count} order{row.count !== 1 ? 's' : ''}
                              </TableCell>
                              <TableCell className="font-bold text-slate-900">
                                {row.qty > 0 ? fmtQty(row.qty) : '—'}
                              </TableCell>
                              <TableCell />
                              <TableCell className="text-right font-bold text-slate-900">
                                {row.amount > 0 ? fmt(row.amount) : '—'}
                              </TableCell>
                              <TableCell colSpan={4} />
                            </TableRow>
                          );
                        }

                        const o = row.order;
                        const qty = toNum(o.quantity);
                        const total = toNum(o.total_price);
                        const unitPrice = getUnitPrice(o);
                        const truck = getTruckNumber(o);
                        const driver = getDriverName(o);
                        const ref = getOrderReference(o);
                        const status = o.status?.toLowerCase();

                        return (
                          <TableRow
                            key={o.id}
                            className={`hover:bg-slate-50/60 transition-colors ${status === 'canceled' ? 'opacity-60' : ''
                              } ${status === 'loaded' ? 'bg-violet-50/20' : ''}`}
                          >
                            <TableCell className="text-center text-slate-400">{row.sn}</TableCell>

                            <TableCell className="text-sm text-amber-700 font-mono font-semibold whitespace-nowrap">
                              {ref}
                            </TableCell>

                            <TableCell className="text-slate-600 whitespace-nowrap text-sm">
                              {fmtDateTime(o.created_at)}
                            </TableCell>

                            <TableCell className="font-medium text-slate-900 whitespace-nowrap">
                              {(() => {
                                const company = o.user?.companyName || o.user?.company_name || o.companyName || o.company_name || o.customer?.companyName || o.customer?.company_name;
                                const name = getCustomerName(o);
                                if (company) return (
                                  <div>
                                    <p className="font-semibold uppercase text-black">{company}</p>
                                    <p className="text-xs uppercase text-slate-700 font-normal">{name}</p>
                                  </div>
                                );
                                return name;
                              })()}
                            </TableCell>

                            <TableCell className="text-black whitespace-nowrap text-sm">
                              {getPhone(o)}
                            </TableCell>

                            <TableCell className="text-blue-700 whitespace-nowrap text-sm font-medium">
                              {truck !== '—' ? (
                                <span className="flex items-center gap-1">
                                  <Truck size={11} className="text-slate-600" />{truck}
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </TableCell>

                            <TableCell className="text-slate-700 whitespace-nowrap">
                              <span className="flex items-center gap-1">
                                <MapPin size={11} className="text-slate-400 shrink-0" />
                                {getLocation(o)}
                              </span>
                            </TableCell>

                            {/* <TableCell className="text-slate-700 whitespace-nowrap">
                              <span className="flex items-center gap-1">
                                <Fuel size={11} className="text-slate-400 shrink-0" />
                                {getProductName(o)}
                              </span>
                            </TableCell> */}

                            <TableCell className="font-semibold text-black">
                              {qty > 0 ? fmtQty(qty) : '—'}
                              <span className="flex items-center text-xs font-normal gap-1">
                                <Fuel size={11} className="text-slate-400 shrink-0" />
                                {getProductName(o)}
                              </span>
                            </TableCell>

                            <TableCell className="text-right text-slate-900">
                              {unitPrice > 0 ? fmt(unitPrice) : '—'}
                            </TableCell>

                            <TableCell className="text-right font-bold text-slate-800">
                              {total > 0 ? fmt(total) : '—'}
                            </TableCell>

                            <TableCell>
                              <StatusBadge status={o.status} />
                            </TableCell>

                            <TableCell className="text-slate-600 text-xs whitespace-nowrap">
                              {o.pfi_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">
                                  <FileText size={11} />{o.pfi_number}
                                </span>
                              ) : <span className="text-slate-400">—</span>}
                            </TableCell>

                            {/* <TableCell className="text-slate-700 whitespace-nowrap text-xs">
                              {driver !== '—' ? (
                                <div>
                                  <p className="font-medium">{driver}</p>
                                  {getDriverPhone(o) !== '—' && (
                                    <p className="text-slate-400 flex items-center gap-0.5">
                                      <Phone size={10} />{getDriverPhone(o)}
                                    </p>
                                  )}
                                </div>
                              ) : <span className="text-slate-400">—</span>}
                            </TableCell> */}

                            <TableCell>
                              <Button
                                size="sm" variant="ghost"
                                className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                title="View full details"
                                onClick={() => setSelectedOrder(o)}
                              >
                                <Eye size={14} />
                              </Button>
                            </TableCell>

                            <TableCell>
                              <Button
                                size="sm" variant="ghost"
                                className="h-8 w-8 p-0 text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                                title="Edit order details"
                                onClick={() => setEditOrder(o)}
                              >
                                <Pencil size={14} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Footer count */}
            {!isLoading && filteredOrders.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {filteredOrders.length} of {allOrders.length} total orders
              </p>
            )}

          </div>
        </div>
      </div>

      {/* Detail dialog */}
      <OrderDetailDialog
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />

      {/* Edit dialog */}
      <EditOrderDialog
        order={editOrder}
        open={!!editOrder}
        onClose={() => setEditOrder(null)}
        onSaved={handleEditSaved}
      />
    </div>
  );
}
