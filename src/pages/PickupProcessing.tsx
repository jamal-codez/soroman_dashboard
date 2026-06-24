import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CommaInput } from "@/components/ui/comma-input";
import { useToast } from '@/hooks/use-toast';
import { isCurrentUserReadOnly } from '@/roles';
import {
  Download,
  Filter,
  Search,
  CheckCircle,
  Clock,
  Truck,
  AlertCircle,
  Loader2,
  FileText,
  Printer,
  Pencil,
  DollarSign,
  Timer,
  CheckCircle2,
  XCircle,
  Hourglass,
  Fuel,
  FuelIcon,
  TruckIcon,
  File,
  Calendar1Icon,
  CalendarDays,
  ShoppingCart,
  Droplets,
  Banknote,
  ClockAlert,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { SidebarNav } from "@/components/SidebarNav";
import { TopBar } from "@/components/TopBar";
import { MobileNav } from "@/components/MobileNav";
import { format, isThisMonth, isThisWeek, isThisYear, isToday, isYesterday, addDays, isAfter, isBefore, isSameDay } from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient, fetchAllPages } from '@/api/client';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards } from '@/components/SummaryCards';
import { Skeleton } from '@/components/ui/skeleton';
import { getOrderReference } from '@/lib/orderReference';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TruckTickets } from '@/components/TruckTickets';

interface Order {
  id: number;
  user: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number?: string;
    phone?: string;
    companyName?: string; 
    company_name?: string; 
    company?: string;      
  };
 
  companyName?: string;
  company_name?: string;
  customer?: {
    companyName?: string;
    company_name?: string;
    company?: string;
  };

  pickup: {
    pickup_date: string;
    pickup_time: string;
    state: string;
  };
  trucks: string[];
  total_price: string;
  status: 'pending' | 'paid' | 'canceled' | 'released' | 'loaded';
  created_at: string;
  products: Array<{ name: string; unit_price?: number | string; unitPrice?: number | string; price?: number | string; unit?: string; unit_label?: string }>;
  quantity: number;
  release_type: 'pickup' | 'delivery';
  reference: string; 
  assigned_agent?: unknown;
  agent?: unknown;
  assignedAgent?: unknown;
  truck_number?: string;
  truckNumber?: string;
  driver_name?: string;
  driverName?: string;
  driver_phone?: string;
  driverPhone?: string;
  loading_datetime?: string;
  loadingDateTime?: string;

  // Backend PFI fields
  pfi_id?: number | null;
  pfi_number?: string | null;

  // Partial payment / partial release fields
  total_paid?: string | null;
  releasable_quantity?: number;
  payment_status?: 'Unpaid' | 'Partially Paid' | 'Fully Paid' | 'Overpaid' | string;

  // Actual truck-ticket loading data (from TruckTicket rows) — the real,
  // physically-loaded figures, distinct from `quantity` (what was sold/ordered).
  truck_tickets_count?: number;
  truck_tickets_qty?: string | number;
}

interface OrderResponse {
  count: number;
  results: Order[];
}

const UNIT_LABELS: Record<string, string> = { litres: 'Litres', kg: 'kg', ton: 'ton' };
const getOrderUnitLabel = (order?: Order | null): string => {
  const p = order?.products?.[0];
  return p?.unit_label || UNIT_LABELS[(p?.unit || 'litres').toLowerCase()] || 'Litres';
};

/** How much of this order may actually be released/ticketed, based on what's been paid so far. */
const getReleasableQty = (order?: Order | null): number => {
  if (!order) return 0;
  if (typeof order.releasable_quantity === 'number') return order.releasable_quantity;
  return Number(order.quantity) || 0;
};

const isPartiallyPaid = (order?: Order | null): boolean =>
  !!order && getReleasableQty(order) < (Number(order.quantity) || 0);

/** True when the order is fully paid but its tickets still reflect an earlier, smaller
 * partial-payment quantity — e.g. a ticket was generated while payment was incomplete,
 * and nothing has gone back to top it up since the rest of the payment came in. */
const hasTicketQtyShortfall = (
  order: Order | null | undefined,
  ticketAllocated: number,
  ticketCount: number
): boolean => {
  if (!order || ticketCount === 0) return false;
  if (isPartiallyPaid(order)) return false; // still genuinely partial — not a sync issue
  return ticketAllocated < getReleasableQty(order);
};

interface ReleaseDetails {
  truckNumber: string;
  driverName: string;
  driverPhone: string;
  deliveryAddress: string;
  nmdrpaNumber: string;
  comp1Qty: string;
  comp1Ullage: string;
  comp2Qty: string;
  comp2Ullage: string;
  comp3Qty: string;
  comp3Ullage: string;
  comp4Qty: string;
  comp4Ullage: string;
  comp5Qty: string;
  comp5Ullage: string;
  loaderName: string;
  loaderPhone: string;
  loadingDateTime: string; 
  pfi: string;
  pfiId?: number;
}

/** One truck row in the multi-truck release form */
interface TruckRow {
  key: number;
  quantity_litres: string;
  plate_number: string;
  driver_name: string;
  driver_phone: string;
}

let _truckKey = 1;
const freshTruckRow = (): TruckRow => ({
  key: _truckKey++,
  quantity_litres: '',
  plate_number: '',
  driver_name: '',
  driver_phone: '',
});

const getCompanyInitials = (name: string, max: number = 2): string => {
  const cleaned = String(name ?? "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= max) {
    return words.slice(0, max).map(w => w[0].toUpperCase()).join("");
  }
  if (words.length === 1) {
    return words[0].slice(0, max).toUpperCase();
  }
  return "SO".slice(0, max).toUpperCase();
};

// Try to find company name across likely fields
const extractCompanyName = (order: Order): string => {
  return (
    order.user?.companyName ||
    order.user?.company_name ||
    order.user?.company ||
    order.customer?.companyName ||
    order.customer?.company_name ||
    order.customer?.company ||
    order.companyName ||
    order.company_name ||
    ""
  );
};

// Location can live in different places depending on endpoint/model shape.
const extractLocation = (order: Order): string => {
  const rec = order as unknown as Record<string, unknown>;

  const pickup = (rec.pickup as Record<string, unknown> | undefined) || undefined;
  const delivery = (rec.delivery as Record<string, unknown> | undefined) || undefined;

  const v =
    (typeof pickup?.state === 'string' ? pickup.state : undefined) ||
    (typeof pickup?.location === 'string' ? pickup.location : undefined) ||
    (typeof delivery?.state === 'string' ? delivery.state : undefined) ||
    (typeof rec.state === 'string' ? (rec.state as string) : undefined) ||
    (typeof rec.location === 'string' ? (rec.location as string) : undefined) ||
    '';

  return String(v || '').trim();
};

// IMPORTANT: do not generate references client-side; use backend `order.reference` only.

const getStatusClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid':     return 'bg-green-50 text-green-700 border-green-200 ring-1 ring-green-100';
    case 'pending':  return 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-100';
    case 'canceled': return 'bg-red-50 text-red-700 border-red-200 ring-1 ring-red-100';
    case 'released': return 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-100';
    case 'loaded':   return 'bg-violet-50 text-violet-700 border-violet-200 ring-1 ring-violet-100';
    case 'sold':     return 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-100';
    default:         return 'bg-slate-50 text-slate-600 border-slate-200 ring-1 ring-slate-100';
  }
};

const statusDisplayMap = {
  pending: 'Pending',
  paid: 'Paid',
  canceled: 'Canceled',
  released: 'Released',
  loaded: 'Loaded',
};

const getStatusIcon = (status: Order['status']) => {
  switch (status) {
    case 'paid': return <FuelIcon className="text-green-500" size={14} />;
    case 'pending': return <Hourglass className="text-orange-500" size={14} />;
    case 'canceled': return <AlertCircle className="text-red-500" size={14} />;
    case 'released': return <CheckCircle className="text-blue-500" size={14} />;
    case 'loaded': return <TruckIcon className="text-purple-500" size={14} />;
    default: return <FuelIcon className="text-orange-500" size={14} />;
  }
};

// --- AGENT/MARKETER LOGIC REMOVED ---
/*
// All code related to assigned_agent, extractAssignedAgentName, formatAssignedAgent, and any UI for marketers/agents is commented out.
*/
/*
const extractAssignedAgentName = (order: Order): string => {
  const rec = order as unknown as Record<string, unknown>;
  const a = (rec.assigned_agent ?? rec.assignedAgent ?? rec.agent) as unknown;
  if (!a) return '';
  if (typeof a === 'string') return a;
  const aRec = a as Record<string, unknown>;
  const fullName = [aRec.first_name, aRec.last_name]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ')
    .trim();
  return (
    fullName ||
    (typeof aRec.name === 'string' ? aRec.name : '') ||
    (typeof aRec.full_name === 'string' ? aRec.full_name : '') ||
    (typeof aRec.username === 'string' ? aRec.username : '') ||
    ''
  );
};

const extractAssignedAgentPhone = (order: Order): string => {
  const rec = order as unknown as Record<string, unknown>;
  const a = (rec.assigned_agent ?? rec.assignedAgent ?? rec.agent) as unknown;
  if (!a || typeof a !== 'object') return '';
  const aRec = a as Record<string, unknown>;
  return (
    (typeof aRec.phone === 'string' ? aRec.phone : '') ||
    (typeof aRec.phone_number === 'string' ? aRec.phone_number : '') ||
    ''
  );
};

const formatAssignedAgent = (order: Order): string => {
  const name = extractAssignedAgentName(order);
  // const phone = extractAssignedAgentPhone(order);

  const parts = [name].filter(Boolean);
  return parts.length ? parts.join(' ') : '';

  // const parts = [name, phone ? `(${phone})` : ''].filter(Boolean);
  // return parts.length ? parts.join(' ') : '';
};
*/
// --- Ticket helpers (backend contract: flat fields on order) ---
const getOrderTicketDetails = (
  order: Order,
  local?: ReleaseDetails
): ReleaseDetails | null => {
  const rec = order as unknown as Record<string, unknown>;

  // legacy nested object support (older contract)
  const rt = (rec.release_ticket || rec.releaseTicket) as Record<string, unknown> | undefined;

  const readStr = (obj: Record<string, unknown> | undefined, ...keys: string[]): string => {
    if (!obj) return '';
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return String(v);
    }
    return '';
  };

  const truckNumber =
    local?.truckNumber ||
    readStr(rec, 'truck_number', 'truckNumber') ||
    readStr(rt, 'truck_number', 'truckNumber');

  const driverName =
    local?.driverName ||
    readStr(rec, 'driver_name', 'driverName') ||
    readStr(rt, 'driver_name', 'driverName');

  const driverPhone =
    local?.driverPhone ||
    readStr(rec, 'driver_phone', 'driverPhone') ||
    readStr(rt, 'driver_phone', 'driverPhone');

  const deliveryAddress =
    local?.deliveryAddress ||
    readStr(rec, 'delivery_address', 'deliveryAddress') ||
    readStr(rt, 'delivery_address', 'deliveryAddress');

  const nmdrpaNumber =
    local?.nmdrpaNumber ||
    readStr(rec, 'nmdrpa_number', 'nmdrpaNumber') ||
    readStr(rt, 'nmdrpa_number', 'nmdrpaNumber');

  const comp1Qty =
    local?.comp1Qty ||
    readStr(rec, 'comp1_qty', 'comp1Qty', 'compartment_1_qty') ||
    readStr(rt, 'comp1_qty', 'comp1Qty', 'compartment_1_qty');
  const comp1Ullage =
    local?.comp1Ullage ||
    readStr(rec, 'comp1_ullage', 'comp1Ullage', 'compartment_1_ullage') ||
    readStr(rt, 'comp1_ullage', 'comp1Ullage', 'compartment_1_ullage');

  const comp2Qty =
    local?.comp2Qty ||
    readStr(rec, 'comp2_qty', 'comp2Qty', 'compartment_2_qty') ||
    readStr(rt, 'comp2_qty', 'comp2Qty', 'compartment_2_qty');
  const comp2Ullage =
    local?.comp2Ullage ||
    readStr(rec, 'comp2_ullage', 'comp2Ullage', 'compartment_2_ullage') ||
    readStr(rt, 'comp2_ullage', 'comp2Ullage', 'compartment_2_ullage');

  const comp3Qty =
    local?.comp3Qty ||
    readStr(rec, 'comp3_qty', 'comp3Qty', 'compartment_3_qty') ||
    readStr(rt, 'comp3_qty', 'comp3Qty', 'compartment_3_qty');
  const comp3Ullage =
    local?.comp3Ullage ||
    readStr(rec, 'comp3_ullage', 'comp3Ullage', 'compartment_3_ullage') ||
    readStr(rt, 'comp3_ullage', 'comp3Ullage', 'compartment_3_ullage');

  const comp4Qty =
    local?.comp4Qty ||
    readStr(rec, 'comp4_qty', 'comp4Qty', 'compartment_4_qty') ||
    readStr(rt, 'comp4_qty', 'comp4Qty', 'compartment_4_qty');
  const comp4Ullage =
    local?.comp4Ullage ||
    readStr(rec, 'comp4_ullage', 'comp4Ullage', 'compartment_4_ullage') ||
    readStr(rt, 'comp4_ullage', 'comp4Ullage', 'compartment_4_ullage');

  const comp5Qty =
    local?.comp5Qty ||
    readStr(rec, 'comp5_qty', 'comp5Qty', 'compartment_5_qty') ||
    readStr(rt, 'comp5_qty', 'comp5Qty', 'compartment_5_qty');
  const comp5Ullage =
    local?.comp5Ullage ||
    readStr(rec, 'comp5_ullage', 'comp5Ullage', 'compartment_5_ullage') ||
    readStr(rt, 'comp5_ullage', 'comp5Ullage', 'compartment_5_ullage');

  const loaderName =
    local?.loaderName ||
    readStr(rec, 'loader_name', 'loaderName') ||
    readStr(rt, 'loader_name', 'loaderName');

  const loaderPhone =
    local?.loaderPhone ||
    readStr(rec, 'loader_phone', 'loaderPhone') ||
    readStr(rt, 'loader_phone', 'loaderPhone');

  const loadingDateTime =
    local?.loadingDateTime ||
    readStr(rec, 'loading_datetime', 'loadingDateTime') ||
    readStr(rt, 'loading_datetime', 'loadingDateTime');

  const details: ReleaseDetails = {
    truckNumber: truckNumber.trim(),
    driverName: driverName.trim(),
    driverPhone: driverPhone.trim(),
    deliveryAddress: deliveryAddress.trim(),
    nmdrpaNumber: nmdrpaNumber.trim(),
    comp1Qty: comp1Qty.trim(),
    comp1Ullage: comp1Ullage.trim(),
    comp2Qty: comp2Qty.trim(),
    comp2Ullage: comp2Ullage.trim(),
    comp3Qty: comp3Qty.trim(),
    comp3Ullage: comp3Ullage.trim(),
    comp4Qty: comp4Qty.trim(),
    comp4Ullage: comp4Ullage.trim(),
    comp5Qty: comp5Qty.trim(),
    comp5Ullage: comp5Ullage.trim(),
    loaderName: loaderName.trim(),
    loaderPhone: loaderPhone.trim(),
    loadingDateTime: loadingDateTime.trim(),
    pfi: '',
  };

  const hasAny = Object.values(details).some((v) => v.trim().length > 0);
  return hasAny ? details : null;
};

const buildCompartmentDetailsText = (d: ReleaseDetails): string => {
  const pairs: Array<[string, string]> = [
    [String(d.comp1Qty || '').trim(), String(d.comp1Ullage || '').trim()],
    [String(d.comp2Qty || '').trim(), String(d.comp2Ullage || '').trim()],
    [String(d.comp3Qty || '').trim(), String(d.comp3Ullage || '').trim()],
    [String(d.comp4Qty || '').trim(), String(d.comp4Ullage || '').trim()],
    [String(d.comp5Qty || '').trim(), String(d.comp5Ullage || '').trim()],
  ];

  const lines = pairs
    .map(([qty, ullage], idx) => {
      if (!qty && !ullage) return null;
      const label = `Compartment ${idx + 1}`;
      // leave blanks as blanks (no dashes)
      return `${label}: Qty ${qty} L, Ullage ${ullage}`;
    })
    .filter(Boolean) as string[];

  return lines.join('\n');
};

const formatTicketLoadingDateTime = (raw: string): string => {
  const v = String(raw || '').trim();
  if (!v) return '';
  try {
    return format(new Date(v), 'PPpp');
  } catch {
    return v;
  }
};

const extractUnitPrice = (order: Order): string => {
  const p = order.products?.[0] as Record<string, unknown> | undefined;
  const o = order as unknown as Record<string, unknown>;
  const raw =
    (p && (p.unit_price ?? p.unitPrice ?? p.price)) ||
    // sometimes the order itself may have a unit price field
    (o.unit_price as unknown) ||
    (o.unit_price_per_litre as unknown) ||
    (o.unit_price_per_liter as unknown) ||
    (o.price_per_litre as unknown) ||
    (o.price_per_liter as unknown);

  if (raw === undefined || raw === null || raw === '') return '';
  const n = Number(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export const PickupProcessing = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const readOnly = isCurrentUserReadOnly();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today'|'yesterday'|'week'|'month'|'year'|null>('today');
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [pfiFilter, setPfiFilter] = useState<string | null>(null);

  const hasAnyFilter = !!(searchQuery || filterType !== 'today' || dateRange.from || productFilter || locationFilter || statusFilter || pfiFilter);
  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterType('today');
    setDateRange({ from: null, to: null });
    setProductFilter(null);
    setLocationFilter(null);
    setStatusFilter(null);
    setPfiFilter(null);
  };

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(100);

  const [releaseOpen, setReleaseOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [releaseDetailsByOrder, setReleaseDetailsByOrder] = useState<Record<number, ReleaseDetails>>({});

  const [releaseForm, setReleaseForm] = useState<ReleaseDetails>({
    truckNumber: '',
    driverName: '',
    driverPhone: '',
    deliveryAddress: '',
    nmdrpaNumber: '',
    comp1Qty: '',
    comp1Ullage: '',
    comp2Qty: '',
    comp2Ullage: '',
    comp3Qty: '',
    comp4Qty: '',
    comp4Ullage: '',
    comp5Qty: '',
    comp5Ullage: '',
    loaderName: '',
    loaderPhone: '',
    loadingDateTime: '',
    pfi: '',
    pfiId: undefined,
  });

  // ── Multi-truck release state ──────────────────────────────────────────
  const [truckRows, setTruckRows] = useState<TruckRow[]>([freshTruckRow()]);
  const [releaseBusy, setReleaseBusy] = useState(false);

  const addTruckRow = useCallback(() => {
    setTruckRows((prev) => [...prev, freshTruckRow()]);
  }, []);

  const removeTruckRow = useCallback((key: number) => {
    setTruckRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }, []);

  const updateTruckRow = useCallback(
    (key: number, field: keyof Omit<TruckRow, 'key'>, value: string) => {
      setTruckRows((prev) =>
        prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
      );
    },
    []
  );

  // ── Ticket counts per order (for showing truck badge in table) ─────────
  const [ticketCounts, setTicketCounts] = useState<Record<number, number>>({});
  /** Already-generated litres per order (sum of existing ticket quantities) */
  const [ticketAllocated, setTicketAllocated] = useState<Record<number, number>>({});
  /** Store actual ticket data per order so the table can display truck/driver/date */
  const [ticketDataByOrder, setTicketDataByOrder] = useState<Record<number, Array<{
    id: number;
    truck_number?: number;
    plate_number?: string | null;
    driver_name?: string | null;
    driver_phone?: string | null;
    quantity_litres?: string;
    ticket_status?: string;
    created_at?: string;
    loading_datetime?: string | null;
    pfi_number?: string | null;
  }>>>({});

  // Fetch ticket details for all visible orders
  const fetchTicketCount = useCallback(async (orderId: number) => {
    try {
      const tickets = await apiClient.admin.getOrderTickets(orderId);
      setTicketCounts((prev) => ({ ...prev, [orderId]: tickets.length }));
      const allocated = tickets.reduce((s: number, t: { quantity_litres: string }) => s + (Number(t.quantity_litres) || 0), 0);
      setTicketAllocated((prev) => ({ ...prev, [orderId]: allocated }));
      // Store full ticket data for table display
      setTicketDataByOrder((prev) => ({ ...prev, [orderId]: tickets as typeof prev[number] }));
    } catch {
      // Silently fail — no count shown
    }
  }, []);

  /** Order ids currently mid-sync, so the button can show a spinner and avoid double-clicks. */
  const [syncingOrderIds, setSyncingOrderIds] = useState<Set<number>>(new Set());

  /** Top up the last ticket for an order so its quantity matches what's now fully paid for.
   * Triggered only by a human clicking "Sync" — never automatic — so a ticket that's
   * already been printed/handed to a driver is only changed when someone confirms it. */
  const syncTicketQuantityToPaid = useCallback(async (order: Order) => {
    const tickets = ticketDataByOrder[order.id] || [];
    if (tickets.length === 0) return;

    const allocated = ticketAllocated[order.id] || 0;
    const target = getReleasableQty(order);
    const shortfall = target - allocated;
    if (shortfall <= 0) return;

    const lastTicket = [...tickets].sort((a, b) => (a.truck_number ?? 0) - (b.truck_number ?? 0)).slice(-1)[0];
    if (!lastTicket) return;

    setSyncingOrderIds((prev) => new Set(prev).add(order.id));
    try {
      const newQty = (Number(lastTicket.quantity_litres) || 0) + shortfall;
      await apiClient.admin.updateTicket(lastTicket.id, { quantity_litres: newQty });
      await fetchTicketCount(order.id);
      toast({
        title: 'Ticket quantity synced',
        description: `Truck ${lastTicket.plate_number || lastTicket.truck_number} updated to ${newQty.toLocaleString()} ${getOrderUnitLabel(order)} to match the now fully-paid order.`,
      });
    } catch (err) {
      toast({
        title: 'Sync failed',
        description: err instanceof Error ? err.message : 'Could not update the ticket quantity.',
        variant: 'destructive',
      });
    } finally {
      setSyncingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  }, [ticketDataByOrder, ticketAllocated, fetchTicketCount]);

  // --- export/reporting helpers (need component state access) ---
  const formatDateOnly = (raw: string): string => {
    const v = String(raw || '').trim();
    if (!v) return '';
    try {
      return format(new Date(v), 'dd/MM/yyyy');
    } catch {
      return v;
    }
  };

  const extractCustomerPhone = (order: Order): string => {
    const userRec = order.user as unknown as Record<string, unknown>;
    const phone =
      (typeof userRec.phone_number === 'string' ? userRec.phone_number : undefined) ||
      (typeof userRec.phone === 'string' ? userRec.phone : undefined) ||
      '';
    return String(phone || '').trim();
  };

  const extractFinanceConfirmationTime = (order: Order): string => {
    const rec = order as unknown as Record<string, unknown>;
    const candidates: Array<unknown> = [
      rec.payment_confirmed_at,
      rec.paymentConfirmedAt,
      rec.finance_confirmed_at,
      rec.financeConfirmedAt,
      rec.confirmed_at,
      rec.confirmedAt,
      rec.paid_at,
      rec.paidAt,
      rec.updated_at,
      rec.updatedAt,
    ];

    const nested = [rec.meta, rec.data, rec.payload, rec.customer_details]
      .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
      .flatMap((obj) => [
        obj.payment_confirmed_at,
        obj.paymentConfirmedAt,
        obj.finance_confirmed_at,
        obj.financeConfirmedAt,
        obj.confirmed_at,
        obj.confirmedAt,
        obj.paid_at,
        obj.paidAt,
        obj.updated_at,
        obj.updatedAt,
      ]);

    const all = [...candidates, ...nested];
    const raw = all.find((v) => typeof v === 'string' && v.trim().length > 0) as string | undefined;
    return raw ? String(raw) : '';
  };

  const extractFinanceConfirmationDateFromEvents = (
    events: Array<{ action?: string; timestamp?: string }> | undefined
  ): string => {
    if (!events?.length) return '';
    const hit = events.find((e) => String(e.action || '').toUpperCase() === 'PAYMENT_CONFIRMED');
    if (!hit?.timestamp) return '';
    return formatDateOnly(hit.timestamp);
  };

  const exportToExcel = async (orders: Order[]) => {
    const headers = [
      'S/N',
      'REFERENCE',
      'COMPANY',
      'QUANTITY (L)',
      'UNIT PRICE',
      'AMOUNT',
      'LOADING DATE',
      'DATE OF PAYMENT',
      'TRUCK NUMBER',
      'DRIVER (NAME & PHONE)',
      'PFI',
    ];

    const MAX_AUDIT_LOOKUPS = 250;
    const idList = orders.slice(0, MAX_AUDIT_LOOKUPS).map((o) => o.id);

    const auditByOrderId: Record<number, Array<{ action?: string; timestamp?: string }>> = {};
    await Promise.all(
      idList.map(async (orderId) => {
        try {
          const res = (await apiClient.admin.getOrderAuditEvents(orderId, { page: 1, page_size: 200 })) as {
            results?: Array<{ action?: string; timestamp?: string }>;
          };
          auditByOrderId[orderId] = res?.results || [];
        } catch {
          auditByOrderId[orderId] = [];
        }
      })
    );

    const rows = orders.map((order, idx) => {
      const ticket = getOrderTicketDetails(order, releaseDetailsByOrder[order.id]);
      const truckNumber = ticket?.truckNumber || '';
      const driverName = ticket?.driverName || '';
      const driverPhone = ticket?.driverPhone || '';
      const loadingDate = ticket?.loadingDateTime ? formatDateOnly(ticket.loadingDateTime) : '';

      const company = extractCompanyName(order) || '';
      const phone = extractCustomerPhone(order);
      const companyAndPhone = [company, phone].filter(Boolean).join('/');

      const qty = Number(order.quantity || 0) || 0;
      const unitPrice = extractUnitPrice(order);
      const amount = String(order.total_price ?? '').trim();

      const fromAudit = extractFinanceConfirmationDateFromEvents(auditByOrderId[order.id]);
      const fallback = formatDateOnly(extractFinanceConfirmationTime(order));
      const financeConfirmedDate = fromAudit || fallback;

      return [
        idx + 1,
        getOrderReference(order),
        companyAndPhone,
        qty ? qty.toLocaleString() : '',
        unitPrice,
        amount,
        loadingDate,
        financeConfirmedDate,
        truckNumber,
        [driverName, driverPhone].filter(Boolean).join(' / '),
        order.pfi_number ? String(order.pfi_number) : '-',
      ];
    });

    const sheetData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Loading Tickets');

    // Build filename — include PFI if filtered
    let fileName = 'LOADING_TICKETS_REPORT';
    if (pfiFilter) {
      const sanitized = String(pfiFilter).replace(/[^A-Za-z0-9_-]/g, '_').toUpperCase();
      fileName = `LOADING_TICKETS_REPORT_${sanitized}`;
    }

    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  // Fetch released orders — fast first 100 for instant display, then ALL in background
  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery<OrderResponse>({
    queryKey: ['all-orders', 'released'],
    queryFn: async () => {
      // Fetch both released AND loaded orders so tickets/loaded status remain visible
      const [relData, loadedData] = await Promise.all([
        fetchAllPages<Order>(
          (p) => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size, status: 'released' }),
        ),
        fetchAllPages<Order>(
          (p) => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size, status: 'loaded' }),
        ),
      ]);
      const allResults = [...(relData.results || []), ...(loadedData.results || [])];
      return { count: allResults.length, results: allResults };
    },
    retry: 2,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false
  });


  const openRelease = (order: Order) => {
    setSelectedOrder(order);

    const existing = releaseDetailsByOrder[order.id];
    const fromBackend = getOrderTicketDetails(order);

    setReleaseForm(
      existing ||
        (fromBackend
          ? fromBackend
          : {
              truckNumber: order.trucks?.[0] || '',
              driverName: '',
              driverPhone: '',
              deliveryAddress: '',
              nmdrpaNumber: '',
              comp1Qty: '',
              comp1Ullage: '',
              comp2Qty: '',
              comp2Ullage: '',
              comp3Qty: '',
              comp4Qty: '',
              comp4Ullage: '',
              comp5Qty: '',
              comp5Ullage: '',
              loaderName: '',
              loaderPhone: '',
              loadingDateTime: '',
              pfi: order.pfi_number ? String(order.pfi_number) : '',
              pfiId: order.pfi_id ?? undefined,
            })
    );

    // Initialise truck rows — default to 1 truck with the remaining (unallocated) qty
    const orderQty = getReleasableQty(order);
    const alreadyAllocated = ticketAllocated[order.id] || 0;
    const remaining = Math.max(0, orderQty - alreadyAllocated);
    setTruckRows([{ ...freshTruckRow(), quantity_litres: remaining > 0 ? String(remaining) : '' }]);

    setReleaseOpen(true);
  };

  const saveReleaseDetails = () => {
    if (!selectedOrder) return;
    setReleaseDetailsByOrder((prev) => ({
      ...prev,
      [selectedOrder.id]: releaseForm
    }));
  };

  const handleReleaseWithDetails = async () => {
    if (!selectedOrder) return;

    const orderQty = getReleasableQty(selectedOrder);

    // ── Validate required loading details ────────────────────────────────
    if (!releaseForm.loadingDateTime?.trim()) {
      toast({
        title: 'Missing Loading Date/Time',
        description: 'Please set the loading date and time before generating tickets.',
        variant: 'destructive',
      });
      return;
    }

    // ── Validate truck rows ──────────────────────────────────────────────
    for (let i = 0; i < truckRows.length; i++) {
      const r = truckRows[i];
      const label = truckRows.length > 1 ? `Truck ${i + 1}` : 'Truck';
      const qty = Number(r.quantity_litres) || 0;

      if (qty <= 0) {
        toast({ title: `${label}: Missing Quantity`, description: `Please enter the quantity for ${label}.`, variant: 'destructive' });
        return;
      }
      const isLitres = getOrderUnitLabel(selectedOrder) === 'Litres';
      if (isLitres && qty > 60000) {
        toast({ title: `${label}: Quantity too high`, description: `Each truck can carry a maximum of 60,000 litres.`, variant: 'destructive' });
        return;
      }
      if (!r.plate_number.trim()) {
        toast({ title: `${label}: Missing Truck Number`, description: `Please enter the truck number (plate) for ${label}.`, variant: 'destructive' });
        return;
      }
      if (!r.driver_name.trim()) {
        toast({ title: `${label}: Missing Driver Name`, description: `Please enter the driver's name for ${label}.`, variant: 'destructive' });
        return;
      }
      if (!r.driver_phone.trim()) {
        toast({ title: `${label}: Missing Driver Phone`, description: `Please enter the driver's phone number for ${label}.`, variant: 'destructive' });
        return;
      }
    }

    const trucks = truckRows.map((r) => ({
      quantity_litres: Number(r.quantity_litres) || 0,
      plate_number: r.plate_number.trim(),
      driver_name: r.driver_name.trim(),
      driver_phone: r.driver_phone.trim(),
    }));

    const totalAllocated = trucks.reduce((s, t) => s + t.quantity_litres, 0);
    const alreadyAllocated = ticketAllocated[selectedOrder.id] || 0;
    const grandTotal = totalAllocated + alreadyAllocated;
    if (orderQty > 0 && grandTotal > orderQty) {
      const u = getOrderUnitLabel(selectedOrder);
      const partial = isPartiallyPaid(selectedOrder);
      toast({
        title: 'Quantity exceeded',
        description: partial
          ? `Total (${grandTotal.toLocaleString()} ${u}) exceeds what's been paid for so far (${orderQty.toLocaleString()} ${u} releasable out of ${Number(selectedOrder.quantity).toLocaleString()} ${u} ordered). Previously allocated: ${alreadyAllocated.toLocaleString()} ${u}.`
          : `Total (${grandTotal.toLocaleString()} ${u}) exceeds the order quantity (${orderQty.toLocaleString()} ${u}). Previously allocated: ${alreadyAllocated.toLocaleString()} ${u}.`,
        variant: 'destructive',
      });
      return;
    }

    // Use the first truck for the legacy release endpoint
    const firstTruck = trucks[0];

    // These fields should be left blank (no manual input)
    const sanitized: ReleaseDetails = {
      ...releaseForm,
      truckNumber: firstTruck.plate_number || '',
      driverName: firstTruck.driver_name || '',
      driverPhone: firstTruck.driver_phone || '',
      comp1Qty: '',
      comp1Ullage: '',
      comp2Qty: '',
      comp2Ullage: '',
      comp3Qty: '',
      comp3Ullage: '',
      comp4Qty: '',
      comp4Ullage: '',
      comp5Qty: '',
      comp5Ullage: '',
      loaderName: '',
      loaderPhone: '',
    };

    setReleaseBusy(true);
    try {
      setReleaseForm(sanitized);
      setReleaseDetailsByOrder((prev) => ({
        ...prev,
        [selectedOrder.id]: sanitized,
      }));

      // 1. Release the order (transitions status) — only needed for first-time release.
      // Once an order is 'released' or 'loaded' it's already past this step, even if
      // more tickets are still being added to cover the remaining quantity.
      if (selectedOrder.status !== 'released' && selectedOrder.status !== 'loaded') {
        await apiClient.admin.releaseOrder(selectedOrder.id, {
          truck_number: firstTruck.plate_number || '-',
          driver_name: firstTruck.driver_name || '-',
          driver_phone: firstTruck.driver_phone || '-',
          loading_datetime: sanitized.loadingDateTime?.trim() || undefined,
          pfi_id: sanitized.pfiId,
        });
      }

      // 2. Generate individual truck tickets for ALL trucks (pass pfi_id so backend tracks PFI movement)
      await apiClient.admin.generateOrderTickets(selectedOrder.id, trucks, sanitized.pfiId);

      // Update local ticket count and allocated qty
      setTicketCounts((prev) => ({ ...prev, [selectedOrder.id]: (prev[selectedOrder.id] || 0) + trucks.length }));
      setTicketAllocated((prev) => ({ ...prev, [selectedOrder.id]: (prev[selectedOrder.id] || 0) + totalAllocated }));

      setReleaseOpen(false);

      // Refresh the list used by this page
      await queryClient.invalidateQueries({ queryKey: ['all-orders', 'released'] });
      await queryClient.invalidateQueries({ queryKey: ['order-tickets', selectedOrder.id] });
      // Refresh PFI caches so sold_qty_litres / remaining updates across the app
      queryClient.invalidateQueries({ queryKey: ['pfis'] });

      toast({
        title: 'Success ✅',
        description: `${trucks.length} loading ticket${trucks.length > 1 ? 's' : ''} generated and available for printing.`,
      });

      // Open ticket modal immediately after release
      setTicketOpen(true);
    } catch (error) {
      // Keep the modal open so the user can retry without re-entering everything.
      setReleaseOpen(true);

      const message = (error as Error)?.message || 'Failed to generate loading ticket.';
      toast({
        title: 'Try again',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setReleaseBusy(false);
    }
  };

  const openTicket = (order: Order) => {
    setSelectedOrder(order);
    setTicketOpen(true);
  };

  const uniqueLocations = useMemo(() => {
    const list = apiResponse?.results || [];
    const locs = list
      .map((o) => extractLocation(o))
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return Array.from(new Set(locs)).sort();
  }, [apiResponse?.results]);

  const uniqueProducts = useMemo(() => {
    const list = apiResponse?.results || [];
    const names = list
      .flatMap((o) => (o.products || []).map((p) => p?.name))
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return Array.from(new Set(names)).sort();
  }, [apiResponse?.results]);

  const pfiLabel = (order: Order): string => {
    if (order.pfi_number === undefined || order.pfi_number === null) return '';
    return String(order.pfi_number).trim();
  };

  const uniquePfis = useMemo(() => {
    const list = apiResponse?.results || [];
    const pfis = list.map((o) => pfiLabel(o)).filter((v): v is string => Boolean(v));
    return Array.from(new Set(pfis)).sort((a, b) => a.localeCompare(b));
  }, [apiResponse?.results]);

  const filteredOrders = useMemo(() => {
    const base = apiResponse?.results || [];
    return base
      // Show both released and loaded orders (Loading Tickets page)
      .filter(order => {
        const s = (order.status || '').toLowerCase();
        return s === 'released' || s === 'loaded';
      })
      .filter(order => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;

        const inId = String(order.id).toLowerCase().includes(q);
        const inName = `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(q);
        const inRef = getOrderReference(order).toLowerCase().includes(q);

        const ticket = getOrderTicketDetails(order, releaseDetailsByOrder[order.id]);
        const inTruck = (ticket?.truckNumber || '').toLowerCase().includes(q);
        const inDriverName = (ticket?.driverName || '').toLowerCase().includes(q);
        const inDriverPhone = (ticket?.driverPhone || '').toLowerCase().includes(q);

        return inId || inName || inRef || inTruck || inDriverName || inDriverPhone;
      })
      .filter((order) => {
        // Date range filter (if selected) takes precedence over quick filters.
        if (dateRange.from && dateRange.to) {
          const orderDate = new Date(order.created_at);
          return (
            (isSameDay(orderDate, dateRange.from) || isAfter(orderDate, dateRange.from)) &&
            (isSameDay(orderDate, dateRange.to) || isBefore(orderDate, addDays(dateRange.to, 1)))
          );
        }
        return true;
      })
      .filter(order => {
        // Existing quick timeframe filter
        if (!filterType) return true;
        const d = new Date(order.created_at);
        if (filterType === 'today') return isToday(d);
        if (filterType === 'yesterday') return isYesterday(d);
        if (filterType === 'week') return isThisWeek(d);
        if (filterType === 'month') return isThisMonth(d);
        if (filterType === 'year') return isThisYear(d);
        return true;
      })
      .filter((order) => {
        if (!productFilter) return true;
        return (order.products || []).some((p) => p?.name === productFilter);
      })
      .filter(order => {
        if (!locationFilter) return true;
        return extractLocation(order) === locationFilter;
      })
      .filter(order => {
        if (!statusFilter) return true;
        return (order.status || '').toLowerCase() === statusFilter.toLowerCase();
      })
      .filter((order) => {
        if (!pfiFilter) return true;
        return pfiLabel(order) === pfiFilter;
      })
      // Stable sort by id so orders don't jump around after ticket generation
      .sort((a, b) => b.id - a.id);
  }, [apiResponse?.results, searchQuery, filterType, dateRange, productFilter, locationFilter, statusFilter, pfiFilter, releaseDetailsByOrder]);

  // Summary computed from filteredOrders so stat cards update when filters change
  const summary = useMemo(() => {
    const list = filteredOrders;
    const total = list.length;

    const norm = (s: unknown) => String(s || '').toLowerCase();
    const released = list.filter((o) => norm(o.status) === 'released').length;
    const loaded = list.filter((o) => norm(o.status) === 'loaded').length;

    // "Sold" — what was ordered (Order.quantity). This is NOT the same as
    // what physically left the depot; see totalLoadedQty below.
    const totalQty = list.reduce((sum, o) => sum + (Number(o.quantity) || 0), 0);
    // "Loaded" — sum of real TruckTicket quantities for these orders. An
    // order with status 'loaded' can still be short: e.g. 100,000L sold,
    // only 40,000L actually ticketed/loaded so far — this is the number
    // that tells you that, where `totalQty` alone would not.
    const totalLoadedQty = list.reduce((sum, o) => sum + (Number(o.truck_tickets_qty) || 0), 0);
    const totalTrucksLoaded = list.reduce((sum, o) => sum + (Number(o.truck_tickets_count) || 0), 0);
    const totalAmount = list.reduce((sum, o) => {
      const v = String(o.total_price ?? '0').replace(/,/g, '');
      return sum + (Number(v) || 0);
    }, 0);
    const uniqueUnits = new Set(list.map((o) => getOrderUnitLabel(o)));
    const qtyUnitLabel = uniqueUnits.size === 1 ? [...uniqueUnits][0] : 'units';

    return { total, released, loaded, totalQty, totalLoadedQty, totalTrucksLoaded, totalAmount, qtyUnitLabel };
  }, [filteredOrders]);

  // Auto-fetch ticket counts only for currently visible orders to prevent 429 throttling
  useEffect(() => {
    const visibleOrders = filteredOrders.slice(0, visibleCount);
    const relevant = visibleOrders.filter((o) => {
      const s = (o.status || '').toLowerCase();
      return s === 'released' || s === 'loaded';
    });
    relevant.forEach((o) => {
      if (ticketCounts[o.id] === undefined) {
        fetchTicketCount(o.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOrders, visibleCount, fetchTicketCount]);

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Loading Tickets"
              description="Generate loading tickets for paid orders, capture truck details, and export reports."
              actions={
                <>
                  <Button
                    variant="outline"
                    className="flex items-center"
                    onClick={() => exportToExcel(filteredOrders)}
                  >
                    <Download className="mr-1" size={16} />
                    Download Report
                  </Button>
                </>
              }
            />

            <SummaryCards
              cards={[
                // {
                //   title: 'Total Orders',
                //   value: isLoading ? '…' : summary.total.toLocaleString(),
                //   icon: <ShoppingCart className="h-4 w-4" />,
                //   tone: 'neutral',
                // },
                {
                  title: 'Quantity Sold',
                  value: isLoading ? '…' : `${summary.totalQty.toLocaleString()} ${summary.qtyUnitLabel}`,
                  icon: <Droplets className="h-4 w-4" />,
                  tone: 'neutral',
                  description: 'Total ordered, regardless of loading status',
                },
                {
                  title: 'Quantity Loaded',
                  value: isLoading ? '…' : `${summary.totalLoadedQty.toLocaleString()} ${summary.qtyUnitLabel}`,
                  icon: <TruckIcon className="h-4 w-4" />,
                  tone: summary.totalLoadedQty < summary.totalQty ? 'amber' : 'green',
                  description: isLoading
                    ? undefined
                    : summary.totalLoadedQty < summary.totalQty
                      ? `${(summary.totalQty - summary.totalLoadedQty).toLocaleString()} ${summary.qtyUnitLabel} not yet loaded`
                      : 'Fully loaded',
                },
                // {
                //   title: 'Total Amount',
                //   value: isLoading ? '…' : `₦${summary.totalAmount.toLocaleString()}`,
                //   icon: <Banknote className="h-4 w-4" />,
                //   tone: 'neutral',
                // },
                {
                  title: 'Trucks Loaded',
                  value: isLoading ? '…' : summary.totalTrucksLoaded.toLocaleString(),
                  icon: <TruckIcon className="h-4 w-4" />,
                  tone: 'green',
                },
                {
                  title: 'Trucks Awaiting Tickets',
                  value: isLoading ? '…' : summary.released.toLocaleString(),
                  icon: <CheckCircle className="h-4 w-4" />,
                  tone: 'amber',
                },
              ]}
            />

            {isError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900 flex items-center justify-between">
                <p>Error: {(error as Error)?.message || 'Failed to load orders'}</p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            )}

            

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-4">
              {/* Row 1: Search (Full Row) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search by name, reference, truck, driver, PFI…"
                    className="pl-10 h-10 text-sm w-full"
                    value={searchQuery}
                    onChange={handleSearch}
                  />
                </div>
              </div>

              {/* Row 2: Timeframe + Custom Date + Location + PFI + Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-slate-100 items-end">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Timeframe</label>
                  <select
                    aria-label="Timeframe filter"
                    className="h-10 px-3 rounded-md border border-input bg-background text-sm w-full focus:outline-none focus:ring-2 focus:ring-slate-300"
                    value={filterType ?? ''}
                    onChange={(e) => {
                      const v = e.target.value as ''|'today'|'yesterday'|'week'|'month'|'year';
                      setFilterType(v === '' ? null : v);
                      if (v !== '') setDateRange({ from: null, to: null });
                    }}
                  >
                    <option value="">All Time</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Custom Date Range</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-10 justify-start text-left font-normal text-sm gap-2 w-full">
                        <CalendarDays size={15} className="text-slate-400 shrink-0" />
                        <span className="truncate">
                          {dateRange.from && dateRange.to
                            ? `${format(dateRange.from, 'dd MMM yyyy')} – ${format(dateRange.to, 'dd MMM yyyy')}`
                            : 'Pick date range'}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined}
                        onSelect={(range) => {
                          setDateRange({ from: range?.from ?? null, to: range?.to ?? null });
                          if (range?.from) setFilterType(null);
                        }}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Location</label>
                  <select
                    aria-label="Location filter"
                    className="h-10 px-3 rounded-md border border-input bg-background text-sm w-full focus:outline-none focus:ring-2 focus:ring-slate-300"
                    value={locationFilter ?? ''}
                    onChange={(e) => setLocationFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Locations</option>
                    {uniqueLocations.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">PFI</label>
                  <select
                    aria-label="PFI filter"
                    className="h-10 px-3 rounded-md border border-input bg-background text-sm w-full focus:outline-none focus:ring-2 focus:ring-slate-300"
                    value={pfiFilter ?? ''}
                    onChange={(e) => setPfiFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All PFIs</option>
                    {uniquePfis.length === 0 ? (
                      <option value="" disabled>No PFI data yet</option>
                    ) : (
                      uniquePfis.map((pfi) => (
                        <option key={pfi} value={pfi}>{pfi}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Row 3: Action Buttons (Clear filters + record counts) */}
              {(hasAnyFilter || apiResponse?.results) && (
                <div className="flex items-center gap-3 pt-2 border-t border-slate-100 h-10">
                  {hasAnyFilter && (
                    <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-slate-500 hover:text-red-600 font-semibold border border-transparent hover:border-slate-200 shadow-2xs hover:bg-slate-50" onClick={clearAllFilters}>
                      <X size={14} /> Clear filters
                    </Button>
                  )}

                  <span className="ml-auto text-xs text-slate-400 font-medium">
                    {isLoading
                      ? 'Loading…'
                      : `${filteredOrders.length.toLocaleString()} record${filteredOrders.length !== 1 ? 's' : ''}`}
                  </span>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">S/N</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date Loaded</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    {/* <TableHead>Truck No.</TableHead> */}
                    {/* <TableHead>Driver</TableHead> */}
                    {/* <TableHead className="w-[70px]">Tickets</TableHead> */}
                    <TableHead>PFI</TableHead>
                    {/* <TableHead>Status</TableHead> */}
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(8)].map((_, i) => (
                      <TableRow key={`skel-${i}`}>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center text-slate-500 py-10">
                        No orders found for the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                  filteredOrders.slice(0, visibleCount).map((order, index) => {
                    const sn = filteredOrders.length - index;

                    // Try ticket data fetched from /truck-tickets/ endpoint first
                    const tickets = ticketDataByOrder[order.id] || [];
                    const firstTicket = tickets[0];

                    // Fall back to flat fields on order object (legacy) or local release form
                    const fallback = getOrderTicketDetails(order, releaseDetailsByOrder[order.id]);

                    const truckNumber = firstTicket?.plate_number || firstTicket?.truck_number?.toString() || fallback?.truckNumber || '';
                    const driverName = firstTicket?.driver_name || fallback?.driverName || '';
                    const driverPhone = firstTicket?.driver_phone || fallback?.driverPhone || '';
                    const loadingDateTime = firstTicket?.loading_datetime
                      ? formatTicketLoadingDateTime(firstTicket.loading_datetime)
                      : firstTicket?.created_at
                        ? formatTicketLoadingDateTime(firstTicket.created_at)
                        : fallback?.loadingDateTime
                          ? formatTicketLoadingDateTime(fallback.loadingDateTime)
                          : '';
                    const companyName = extractCompanyName(order);
                    const ticketCount = ticketCounts[order.id] || 0;

                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium text-slate-600">{sn}</TableCell>
                        {/* <TableCell className="font-medium">{order.id}</TableCell> */}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span>{getOrderReference(order) || '-'}</span>
                            {isPartiallyPaid(order) && (
                              <span
                                title={`Only ${getReleasableQty(order).toLocaleString()} of ${Number(order.quantity).toLocaleString()} ${getOrderUnitLabel(order)} paid for`}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200"
                              >
                                Partial
                              </span>
                            )}
                            {hasTicketQtyShortfall(order, ticketAllocated[order.id] || 0, ticketCount) && (
                              <button
                                type="button"
                                disabled={syncingOrderIds.has(order.id)}
                                onClick={(e) => { e.stopPropagation(); syncTicketQuantityToPaid(order); }}
                                title={`Ticket totals ${ (ticketAllocated[order.id] || 0).toLocaleString() } but order is paid for ${getReleasableQty(order).toLocaleString()} ${getOrderUnitLabel(order)}. Click to sync.`}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
                              >
                                {syncingOrderIds.has(order.id) ? 'Syncing…' : 'Sync Qty'}
                              </button>
                            )}
                          </div>
                        </TableCell>
                        {/* <TableCell className="capitalize">{order.release_type || '-'}</TableCell> */}
                        <TableCell>
                          <div className="text-slate-600">{loadingDateTime || '-'}</div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-bold text-sm">
                              <span className="font-medium text-sm block max-w-[150px] truncate" title={companyName || undefined}>
                              {companyName || '-'}
                              </span>
                              {order.user.first_name} {order.user.last_name}
                            </div>
                          </div>
                        </TableCell>
                        {/* <TableCell>{formatAssignedAgent(order) || '-'}</TableCell> */}
                        <TableCell>
                          <div className="text-black">{extractLocation(order) || '-'}</div>
                        </TableCell>
                        <TableCell>{order.products.map(p => p.name).join(', ')}</TableCell>
                        <TableCell>{order.quantity.toLocaleString()} {getOrderUnitLabel(order)}</TableCell>
                        {/* <TableCell className="max-w-[120px] truncate" title={truckNumber}>
                          {truckNumber || '-'}
                        </TableCell> */}
                        {/* <TableCell>
                          {driverName || driverPhone ? (
                            <div>
                              <div className="font-medium text-sm max-w-[120px] truncate">{driverName || '-'}</div>
                              {driverPhone && <div className="text-xs text-slate-500">{driverPhone}</div>}
                            </div>
                          ) : '-'}
                        </TableCell> */}
                        {/* <TableCell className="text-center">
                          {ticketCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              <TruckIcon className="h-3 w-3" />
                              {ticketCount}
                            </span>
                          ) : <span className="text-slate-400">—</span>}
                        </TableCell> */}
                        <TableCell className="text-black">{order.pfi_number ? String(order.pfi_number) : '-'}</TableCell>
                        {/* <TableCell>
                          <div className={`inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded-full ${getStatusClass(order.status)}`}>
                            {getStatusIcon(order.status)}
                            <span className="ml-1.5">{statusDisplayMap[order.status]}</span>
                          </div>
                        </TableCell> */}
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {/* Determine if this order is fully allocated — based on actual
                                ticketed quantity, not just status. An order flips to 'loaded'
                                as soon as the first ticket is generated, which does NOT mean
                                every truck has been ticketed yet (e.g. 90,000L sold, only
                                45,000L/1 truck loaded so far) — that case must still be able
                                to add more tickets for the remainder. */}
                            {(() => {
                              const orderQty = getReleasableQty(order);
                              const allocated = ticketAllocated[order.id] || 0;
                              const isLoaded = (order.status || '').toLowerCase() === 'loaded';
                              const canGenerateMore = order.status === 'released' || isLoaded;
                              const fullyAllocated = canGenerateMore && orderQty > 0 && allocated >= orderQty;

                              // Fully allocated → just view/edit the existing tickets
                              if (fullyAllocated) {
                                return (
                                  <Button
                                    size="sm"
                                    className="h-8 gap-1"
                                    variant="outline"
                                    onClick={() => openTicket(order)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                    <span>{isLoaded ? 'View Ticket' : 'Edit Ticket'}</span>
                                  </Button>
                                );
                              }

                              // Not fully allocated (released, or loaded but short) → allow
                              // generating/adding more tickets for the remaining quantity.
                              return (
                            <Dialog
                              open={releaseOpen && selectedOrder?.id === order.id}
                              onOpenChange={(isOpen) => {
                                if (!isOpen) {
                                  setReleaseOpen(false);
                                  setSelectedOrder(null);
                                }
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button
                                  size="sm"
                                  className="h-8 gap-1"
                                  onClick={() => openRelease(order)}
                                  disabled={readOnly || !canGenerateMore}
                                >
                                  <File className="h-4 w-4" />
                                  <span>{allocated > 0 ? 'Add Ticket' : 'Generate Ticket'}</span>
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-2xl sm:w-auto flex flex-col max-h-[90vh] gap-0 p-0">
                                {/* ─── 1. Header ─────────────────────────────────────── */}
                                <div className="px-6 pt-6 pb-4">
                                  <DialogHeader className="space-y-1">
                                    <DialogTitle className="text-lg font-semibold tracking-tight">
                                      {allocated > 0 ? 'Add' : 'Generate'} Loading Ticket{truckRows.length > 1 ? 's' : ''}
                                    </DialogTitle>
                                    <DialogDescription className="text-sm text-slate-500">
                                      Split the order across one or more trucks. Each truck gets its own ticket.
                                    </DialogDescription>
                                  </DialogHeader>

                                  {/* ─── Order summary card ──────────── */}
                                  {selectedOrder && (() => {
                                    const orderQty = getReleasableQty(selectedOrder);
                                    const fullQty = Number(selectedOrder.quantity) || 0;
                                    const partial = isPartiallyPaid(selectedOrder);
                                    const prevAllocated = ticketAllocated[selectedOrder.id] || 0;
                                    const newAlloc = truckRows.reduce((s, r) => s + (Number(r.quantity_litres) || 0), 0);
                                    const totalAlloc = prevAllocated + newAlloc;
                                    const rem = orderQty - totalAlloc;
                                    const pct = orderQty > 0 ? Math.min(100, Math.round((totalAlloc / orderQty) * 100)) : 0;
                                    const isComplete = rem === 0;
                                    const isOver = rem < 0;
                                    const u = getOrderUnitLabel(selectedOrder);

                                    return (
                                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Order Summary</span>
                                          <span className="text-xs text-green-600 font-semibold">{getOrderReference(selectedOrder)}</span>
                                        </div>
                                        {partial && (
                                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                            <span className="font-bold">Partially Paid</span> — only {orderQty.toLocaleString()} of {fullQty.toLocaleString()} {u} ordered can be released until the rest is paid for.
                                          </div>
                                        )}
                                        <div className={`grid gap-3 ${prevAllocated > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                                          <div>
                                            <div className="text-[11px] text-slate-400 uppercase tracking-wide">{partial ? 'Releasable Volume' : 'Total Volume'}</div>
                                            <div className="text-base font-bold text-slate-900">{orderQty.toLocaleString()} {u}</div>
                                          </div>
                                          {prevAllocated > 0 && (
                                            <div>
                                              <div className="text-[11px] text-slate-400 uppercase tracking-wide">Previous</div>
                                              <div className="text-base font-bold text-blue-600">{prevAllocated.toLocaleString()} {u}</div>
                                            </div>
                                          )}
                                          <div>
                                            <div className="text-[11px] text-slate-400 uppercase tracking-wide">{prevAllocated > 0 ? 'New' : 'Allocated'}</div>
                                            <div className={`text-base font-bold ${isOver ? 'text-red-600' : isComplete ? 'text-green-600' : 'text-slate-900'}`}>
                                              {newAlloc.toLocaleString()} {u}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-[11px] text-slate-400 uppercase tracking-wide">Remaining</div>
                                            <div className={`text-base font-bold ${isOver ? 'text-red-600' : isComplete ? 'text-green-600' : 'text-amber-600'}`}>
                                              {rem.toLocaleString()} {u}
                                            </div>
                                          </div>
                                        </div>
                                        {/* Progress bar */}
                                        {orderQty > 0 && (
                                          <div className="space-y-1">
                                            <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                                              <div
                                                className={`h-full rounded-full transition-all duration-300 ${isOver ? 'bg-red-500' : isComplete ? 'bg-green-500' : 'bg-amber-500'}`}
                                                style={{ width: `${Math.min(pct, 100)}%` }}
                                              />
                                            </div>
                                            <div className="flex items-center justify-between">
                                              <span className={`text-[11px] font-medium ${isOver ? 'text-red-600' : isComplete ? 'text-green-600' : 'text-amber-600'}`}>
                                                {isOver ? `Over-allocated by ${Math.abs(rem).toLocaleString()} ${u}` : isComplete ? 'Fully allocated' : `${rem.toLocaleString()} ${u} remaining`}
                                              </span>
                                              {/* {rem > 0 && (
                                                // <button
                                                //   type="button"
                                                //   className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
                                                //   onClick={() => {
                                                //     setTruckRows((prev) => {
                                                //       const copy = [...prev];
                                                //       let idx = copy.findIndex((r) => !r.quantity_litres || Number(r.quantity_litres) === 0);
                                                //       if (idx === -1) { copy.push(freshTruckRow()); idx = copy.length - 1; }
                                                //       copy[idx] = { ...copy[idx], quantity_litres: String(rem) };
                                                //       return copy;
                                                //     });
                                                //   }}
                                                // >
                                                //   Fill remaining →
                                                // </button>
                                              )} */}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>

                                {/* ─── 2. Scrollable body ────────────────────────────── */}
                                <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">

                                  {/* ─── Loading Details section ─────── */}
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                      <div className="h-px flex-1 bg-slate-200" />
                                      <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Loading Details</span>
                                      <div className="h-px flex-1 bg-slate-200" />
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                      <div className="space-y-1.5">
                                        <Label htmlFor="loadingDateTime" className="text-xs font-medium text-slate-600">Loading Date &amp; Time <span className="text-red-500">*</span></Label>
                                        <div className="flex gap-2">
                                          <Input
                                            id="loadingDateTime"
                                            type="datetime-local"
                                            required
                                            className="flex-1 h-10"
                                            value={releaseForm.loadingDateTime}
                                            onChange={(e) => setReleaseForm({ ...releaseForm, loadingDateTime: e.target.value })}
                                          />
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="shrink-0 h-10 px-3 text-xs font-medium gap-1.5"
                                            onClick={() => {
                                              const now = new Date();
                                              const pad = (n: number) => String(n).padStart(2, '0');
                                              const val = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
                                              setReleaseForm({ ...releaseForm, loadingDateTime: val });
                                            }}
                                          >
                                            <Clock className="h-3.5 w-3.5" />
                                            Now
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* ─── Truck Allocation section ────── */}
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                      <div className="h-px flex-1 bg-slate-200" />
                                      <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Truck Allocation</span>
                                      <div className="h-px flex-1 bg-slate-200" />
                                    </div>

                                    {/* Truck cards */}
                                    <div className="space-y-3">
                                      {truckRows.map((row, idx) => (
                                        <div
                                          key={row.key}
                                          className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                                        >
                                          {/* Card header */}
                                          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 border-b border-slate-100">
                                            <div className="flex items-center gap-2">
                                              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-slate-900 text-white text-[11px] font-bold">
                                                {idx + 1}
                                              </div>
                                              <span className="text-sm font-semibold text-slate-700">Truck {idx + 1}</span>
                                            </div>
                                            {truckRows.length > 1 && (
                                              <button
                                                type="button"
                                                className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                                                onClick={() => removeTruckRow(row.key)}
                                              >
                                                <Trash2 className="h-3 w-3" />
                                                Remove
                                              </button>
                                            )}
                                          </div>
                                          {/* Card body */}
                                          <div className="p-4 space-y-3">
                                            {/* Quantity — full width, prominent */}
                                            <div className="space-y-1.5">
                                              <Label className="text-xs font-medium text-slate-600">Quantity ({getOrderUnitLabel(selectedOrder)}) <span className="text-red-500">*</span></Label>
                                              <CommaInput
                                                placeholder="e.g. 33,000"
                                                className="h-11 text-base font-semibold"
                                                value={row.quantity_litres}
                                                onValueChange={(val) => {
                                                  const isLitres = getOrderUnitLabel(selectedOrder) === 'Litres';
                                                  if (val === '' || !isLitres || Number(val) <= 60000) {
                                                    updateTruckRow(row.key, 'quantity_litres', val);
                                                  }
                                                }}
                                              />
                                            </div>
                                            {/* Other fields — 3 columns */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                              <div className="space-y-1.5">
                                                <Label className="text-xs font-medium text-slate-600">Truck Number <span className="text-red-500">*</span></Label>
                                                <Input
                                                  // placeholder="ABC-123-XY"
                                                  className="h-10"
                                                  value={row.plate_number}
                                                  onChange={(e) => updateTruckRow(row.key, 'plate_number', e.target.value)}
                                                />
                                              </div>
                                              <div className="space-y-1.5">
                                                <Label className="text-xs font-medium text-slate-600">Driver's Name <span className="text-red-500">*</span></Label>
                                                <Input
                                                  // placeholder="Enter driver name"
                                                  className="h-10"
                                                  value={row.driver_name}
                                                  onChange={(e) => updateTruckRow(row.key, 'driver_name', e.target.value)}
                                                />
                                              </div>
                                              <div className="space-y-1.5">
                                                <Label className="text-xs font-medium text-slate-600">Driver's Phone Number <span className="text-red-500">*</span></Label>
                                                <Input
                                                  // placeholder="08012345678"
                                                  className="h-10"
                                                  value={row.driver_phone}
                                                  onChange={(e) => updateTruckRow(row.key, 'driver_phone', e.target.value)}
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    {/* Add truck button */}
                                    <button
                                      type="button"
                                      className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-100/80 hover:border-slate-300 py-3 text-sm font-medium text-slate-500 hover:text-slate-700 transition-all"
                                      onClick={addTruckRow}
                                    >
                                      <Plus className="h-4 w-4" />
                                      Add Another Truck
                                    </button>
                                  </div>
                                </div>

                                {/* ─── 3. Sticky action bar ──────────────────────────── */}
                                <div className="border-t border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
                                  <Button variant="ghost" className="text-slate-500" onClick={() => setReleaseOpen(false)}>
                                    Cancel
                                  </Button>
                                  <Button
                                    className="min-w-[180px] h-10 font-semibold gap-2"
                                    onClick={handleReleaseWithDetails}
                                    disabled={releaseBusy}
                                  >
                                    {releaseBusy ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <File className="h-4 w-4" />
                                    )}
                                    {allocated > 0 ? 'Add' : 'Generate'} {truckRows.length} Ticket{truckRows.length > 1 ? 's' : ''}
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                              );
                            })()}

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 relative"
                              onClick={() => openTicket(order)}
                            >
                              <Printer className="h-4 w-4" />
                              <span>Ticket</span>
                              {(ticketCounts[order.id] ?? 0) > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                                  {ticketCounts[order.id]}
                                </span>
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* pagination removed */}

            {/* Load More */}
            {filteredOrders.length > visibleCount && (
              <div className="flex items-center justify-center py-4">
                <Button
                  variant="default"
                  className="gap-2"
                  onClick={() => setVisibleCount(prev => prev + 100)}
                >
                  Load More
                </Button>
                {/* <Button
                  variant="ghost"
                  className="ml-2 gap-2 text-slate-500"
                  onClick={() => setVisibleCount(filteredOrders.length)}
                >
                  Show All
                </Button> */}
              </div>
            )}
            
            {/* Ticket modal + print area */}
            <Dialog
              open={ticketOpen}
              onOpenChange={(open) => {
                if (!open) setTicketOpen(false);
              }}
            >
              <DialogContent className="sm:max-w-[860px] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:w-auto flex flex-col max-h-[90vh] gap-0 p-0 overflow-hidden">
                <DialogTitle className="sr-only">Loading Tickets</DialogTitle>
                <DialogDescription className="sr-only">View and print loading tickets for this order</DialogDescription>
                {/* TruckTickets owns the full dialog body — header, table, actions */}
                {selectedOrder ? (
                  <TruckTickets
                    orderId={selectedOrder.id}
                    orderQuantity={Number(selectedOrder.quantity) || undefined}
                    onClose={() => setTicketOpen(false)}
                  />
                ) : (
                  <div className="p-6 text-sm text-slate-500">Select an order to view tickets.</div>
                )}
              </DialogContent>
            </Dialog>

          </div>
        </div>
      </div>
    </div>
  );
};
