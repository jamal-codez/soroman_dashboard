import { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
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
  XCircle
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
import { format, isThisMonth, isThisWeek, isThisYear, isToday } from 'date-fns';
import { apiClient } from '@/api/client';
import { useReactToPrint } from 'react-to-print';
import { TicketPrint, type ReleaseTicketData } from '@/components/TicketPrint';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards } from '@/components/SummaryCards';
import { getOrderReference } from '@/lib/orderReference';

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
  status: 'pending' | 'paid' | 'canceled' | 'released';
  created_at: string;
  products: Array<{ name: string; unit_price?: number | string; unitPrice?: number | string; price?: number | string }>;
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
}

interface OrderResponse {
  count: number;
  results: Order[];
}

interface ReleaseDetails {
  truckNumber: string;
  driverName: string;
  driverPhone: string;
  deliveryAddress: string;
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
}

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
  switch (status) {
    case 'paid': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'canceled': return 'bg-red-50 text-red-700 border-red-200';
    case 'released': return 'bg-blue-50 text-blue-700 border-blue-200';
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const statusDisplayMap = {
  pending: 'Pending',
  paid: 'Paid',
  canceled: 'Canceled',
  released: 'Released',
};

const getStatusIcon = (status: Order['status']) => {
  switch (status) {
    case 'paid': return <CheckCircle className="text-green-500" size={16} />;
    case 'pending': return <Clock className="text-orange-500" size={16} />;
    case 'canceled': return <AlertCircle className="text-red-500" size={16} />;
    case 'released': return <Truck className="text-blue-500" size={16} />;
    default: return <Clock className="text-orange-500" size={16} />;
  }
};

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
  const phone = extractAssignedAgentPhone(order);

  const parts = [name, phone ? `(${phone})` : ''].filter(Boolean);
  return parts.length ? parts.join(' ') : '';
};

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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today'|'week'|'month'|'year'|null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const { toast } = useToast();

  const [releaseOpen, setReleaseOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [releaseDetailsByOrder, setReleaseDetailsByOrder] = useState<Record<number, ReleaseDetails>>({});

  const [releaseForm, setReleaseForm] = useState<ReleaseDetails>({
    truckNumber: '',
    driverName: '',
    driverPhone: '',
    deliveryAddress: '',
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
    loadingDateTime: ''
  });

  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery<OrderResponse>({
    queryKey: ['all-orders', 'release-processing'],
    queryFn: async () => {
      const response = await apiClient.admin.getAllAdminOrders({
        page: 1,
        page_size: 10000,
      });
      if (!response.results) throw new Error('Invalid response format');
      return {
        count: response.count || 0,
        results: response.results || []
      };
    },
    retry: 2,
    refetchOnWindowFocus: true
  });

  const summary = useMemo(() => {
    const list = apiResponse?.results || [];
    const total = apiResponse?.count ?? list.length;

    const norm = (s: unknown) => String(s || '').toLowerCase();
    const paid = list.filter((o) => norm(o.status) === 'paid').length;
    const pending = list.filter((o) => norm(o.status) === 'pending').length;
    const released = list.filter((o) => norm(o.status) === 'released').length;
    const canceled = list.filter((o) => norm(o.status) === 'canceled').length;

    return { total, paid, pending, released, canceled };
  }, [apiResponse?.results, apiResponse?.count]);

  const ticketRef = useRef<HTMLDivElement>(null);
  const printTicket = useReactToPrint({
    contentRef: ticketRef,
    documentTitle: selectedOrder ? `ticket-${getOrderReference(selectedOrder) || selectedOrder.id}` : 'release-ticket'
  });

  const buildTicketData = useMemo(() => {
    if (!selectedOrder) return null;

    const local = releaseDetailsByOrder[selectedOrder.id];
    const resolved = getOrderTicketDetails(selectedOrder, local);
    const compartmentDetailsText = resolved ? buildCompartmentDetailsText(resolved) : '';
    const unitPrice = extractUnitPrice(selectedOrder);

    const companyName = extractCompanyName(selectedOrder) || '';
    const userRec = selectedOrder.user as unknown as Record<string, unknown>;
    const phone =
      (typeof userRec.phone_number === 'string' ? userRec.phone_number : undefined) ||
      (typeof userRec.phone === 'string' ? userRec.phone : undefined) ||
      '';

    return {
      orderReference: getOrderReference(selectedOrder),
      customerName: `${selectedOrder.user.first_name} ${selectedOrder.user.last_name}`,
      companyName,
      customerPhone: String(phone),
      product: selectedOrder.products.map((p) => p.name).join(', '),
      qty: `${selectedOrder.quantity.toLocaleString()} Litres`,
      unitPrice,
      truckNumber: resolved?.truckNumber || '',
      driverName: resolved?.driverName || '',
      driverPhone: resolved?.driverPhone || '',
      deliveryAddress: resolved?.deliveryAddress || '',
      compartmentDetails: compartmentDetailsText || '',
      loaderName: resolved?.loaderName || '',
      loaderPhone: resolved?.loaderPhone || '',
      loadingDateTime: resolved?.loadingDateTime ? formatTicketLoadingDateTime(resolved.loadingDateTime) : '',
    } satisfies ReleaseTicketData;
  }, [selectedOrder, releaseDetailsByOrder]);

  const canPrintTicket = useMemo(() => {
    if (!selectedOrder) return false;

    const local = releaseDetailsByOrder[selectedOrder.id];
    const resolved = getOrderTicketDetails(selectedOrder, local);
    if (!resolved) return false;

    return Boolean(
      resolved.truckNumber?.trim() &&
        resolved.driverName?.trim() &&
        resolved.driverPhone?.trim() &&
        resolved.loadingDateTime?.trim()
    );
  }, [selectedOrder, releaseDetailsByOrder]);

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
              loadingDateTime: ''
            })
    );

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

    // These fields should be left blank (no manual input)
    const sanitized: ReleaseDetails = {
      ...releaseForm,
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

    // Basic validation
    if (
      !sanitized.truckNumber.trim() ||
      !sanitized.driverName.trim() ||
      !sanitized.driverPhone.trim() ||
      !sanitized.loadingDateTime.trim()
    ) {
      toast({
        title: 'Missing information',
        description: "Truck Number, Driver's Name, Driver's Phone, and Loading Date & Time are required.",
        variant: 'destructive'
      });
      return;
    }

    try {
      setReleaseForm(sanitized);
      if (selectedOrder) {
        setReleaseDetailsByOrder((prev) => ({
          ...prev,
          [selectedOrder.id]: sanitized,
        }));
      }

      // Persist release details in backend
      await apiClient.admin.releaseOrder(selectedOrder.id, {
        truck_number: sanitized.truckNumber,
        driver_name: sanitized.driverName,
        driver_phone: sanitized.driverPhone,
        // Optional fields (may be blank)
        delivery_address: sanitized.deliveryAddress?.trim() ? sanitized.deliveryAddress : undefined,
        // compartments + loader must remain blank
        compartment_details: undefined,
        comp1_qty: undefined,
        comp1_ullage: undefined,
        comp2_qty: undefined,
        comp2_ullage: undefined,
        comp3_qty: undefined,
        comp3_ullage: undefined,
        comp4_qty: undefined,
        comp4_ullage: undefined,
        comp5_qty: undefined,
        comp5_ullage: undefined,
        loader_name: undefined,
        loader_phone: undefined,
        loading_datetime: sanitized.loadingDateTime,
      });

      setReleaseOpen(false);

      // Refresh the list used by this page
      await queryClient.invalidateQueries({ queryKey: ['all-orders', 'release-processing'] });

      toast({ title: 'Success!', description: 'ORDER RELEASED' });

      // Open ticket modal immediately after release
      setTicketOpen(true);
    } catch (error) {
      // Keep the modal open so the user can retry without re-entering everything.
      setReleaseOpen(true);

      const message = (error as Error)?.message || 'Failed to release order.';
      toast({
        title: 'Failed to release',
        description: message,
        variant: 'destructive'
      });
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

  const filteredOrders = useMemo(() => {
    const base = apiResponse?.results || [];
    return base
      // Show ALL orders here (pickup + delivery)
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
      .filter(order => {
        if (!filterType) return true;
        const d = new Date(order.created_at);
        if (filterType === 'today') return isToday(d);
        if (filterType === 'week') return isThisWeek(d);
        if (filterType === 'month') return isThisMonth(d);
        if (filterType === 'year') return isThisYear(d);
        return true;
      })
      .filter(order => {
        if (!locationFilter) return true;
        return extractLocation(order) === locationFilter;
      })
      .filter(order => {
        if (!statusFilter) return true;
        return (order.status || '').toLowerCase() === statusFilter.toLowerCase();
      });
  }, [apiResponse?.results, searchQuery, filterType, locationFilter, statusFilter, releaseDetailsByOrder]);

  const exportToCSV = (orders: Order[]) => {
    const headers = [
      "Order ID",
      "Reference",
      "Release Type",
      "Location",
      "Assigned Agent",
      "Customer Name",
      "Email",
      "Truck Number",
      "Driver (Name & Phone)",
      "Loading Date & Time",
      "Pickup Date",
      "Pickup Time",
      "State",
      "Trucks",
      "Total Price",
      "Status",
      "Created At",
      "Products",
      "Quantity"
    ];

    const rows = orders.map(order => {
      const ticket = getOrderTicketDetails(order, releaseDetailsByOrder[order.id]);
      const truckNumber = ticket?.truckNumber || '';
      const driverName = ticket?.driverName || '';
      const driverPhone = ticket?.driverPhone || '';
      const loadingDateTime = ticket?.loadingDateTime ? formatTicketLoadingDateTime(ticket.loadingDateTime) : '';

      const rec = order as unknown as Record<string, unknown>;
      const pickupRec = (rec.pickup as Record<string, unknown> | undefined) || undefined;
      const pickupDate = typeof pickupRec?.pickup_date === 'string' ? pickupRec.pickup_date : '';
      const pickupTime = typeof pickupRec?.pickup_time === 'string' ? pickupRec.pickup_time : '';
      const pickupState = typeof pickupRec?.state === 'string' ? pickupRec.state : '';

      return [
        order.id,
        getOrderReference(order),
        order.release_type,
        extractLocation(order),
        formatAssignedAgent(order),
        `${order.user.first_name} ${order.user.last_name}`,
        order.user.email,
        truckNumber,
        [driverName, driverPhone].filter(Boolean).join(' / '),
        loadingDateTime,
        pickupDate,
        pickupTime,
        pickupState,
        Array.isArray(order.trucks) ? order.trucks.join(", ") : '',
        order.total_price,
        order.status,
        order.created_at,
        order.products.map(p => p.name).join(", "),
        order.quantity
      ];
    });

    const csvContent =
      [headers, ...rows]
        .map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'release_orders.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className='animate-spin' color='green' size={54} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            <div className="text-center text-red-500">
              <p>Error: {(error as Error)?.message || 'Failed to load pickups'}</p>
              <Button onClick={() => refetch()} className="mt-4">
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Release Orders"
              // description="Capture release details, release paid orders, and generate a printable ticket." 
              actions={
                <>
                  <Button
                    variant="outline"
                    className="flex items-center"
                    onClick={() => exportToCSV(filteredOrders)}
                  >
                    <Download className="mr-1" size={16} />
                    Download Report
                  </Button>
                </>
              }
            />

            <SummaryCards
              cards={[
                { title: 'Total Orders', value: String(summary.total), description: 'All orders', icon: <FileText />, tone: 'neutral' },
                { title: 'Paid', value: String(summary.paid), description: 'Ready to release', icon: <CheckCircle2 />, tone: 'green' },
                { title: 'Released', value: String(summary.released), description: 'Tickets available', icon: <Truck />, tone: 'neutral' },
              ]}
            />

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col lg:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      type="text"
                      placeholder="Search pickups by name, reference or ID..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={handleSearch}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-3 gap-3">
                    <select
                    aria-label="Timeframe filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={filterType ?? ''}
                    onChange={(e) => {
                      const v = e.target.value as ''|'today'|'week'|'month'|'year';
                      setFilterType(v === '' ? null : v);
                    }}
                  >
                    <option value="">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="year">This Year</option>
                  </select>
                  <select
                    aria-label="Location filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={locationFilter ?? ''}
                    onChange={(e) => setLocationFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Locations</option>
                    {uniqueLocations.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>

                  <select
                    aria-label="Status filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={statusFilter ?? ''}
                    onChange={(e) => setStatusFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="canceled">Canceled</option>
                    <option value="released">Released</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    {/* <TableHead>Reference</TableHead> */}
                    {/* <TableHead>Type</TableHead> */}
                    <TableHead>Location</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Truck No.</TableHead>
                    <TableHead>Driver Details</TableHead>
                    <TableHead>Loading Date/Time</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty (L)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const ticket = getOrderTicketDetails(order, releaseDetailsByOrder[order.id]);

                    const truckNumber = ticket?.truckNumber || '';
                    const driverName = ticket?.driverName || '';
                    const driverPhone = ticket?.driverPhone || '';
                    const loadingDateTime = ticket?.loadingDateTime ? formatTicketLoadingDateTime(ticket.loadingDateTime) : '';

                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.id}</TableCell>
                        {/* <TableCell>{getOrderReference(order) || '-'}</TableCell> */}
                        {/* <TableCell className="capitalize">{order.release_type || '-'}</TableCell> */}
                        <TableCell>{extractLocation(order) || '-'}</TableCell>
                        <TableCell>{formatAssignedAgent(order) || '-'}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {order.user.first_name} {order.user.last_name}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{truckNumber || '-'}</TableCell>
                        <TableCell>
                          {driverName || driverPhone ? (
                            <div>
                              <div className="font-medium">{driverName || '-'}</div>
                              <div className="text-xs text-slate-500">{driverPhone || '-'}</div>
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{loadingDateTime || '-'}</TableCell>
                        <TableCell>{order.products.map(p => p.name).join(', ')}</TableCell>
                        <TableCell>{order.quantity.toLocaleString()}</TableCell>
                        <TableCell>
                          <div className={`inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded-full ${getStatusClass(order.status)}`}>
                            {getStatusIcon(order.status)}
                            <span className="ml-1.5">{statusDisplayMap[order.status]}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
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
                                  disabled={order.status !== 'paid'}
                                >
                                  <Truck className="h-4 w-4" />
                                  <span>Release</span>
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-lg sm:w-full flex flex-col max-h-[90vh]">
                                <DialogHeader>
                                  <DialogTitle>Release Order</DialogTitle>
                                  <DialogDescription>
                                    Enter truck/driver and ticket details to release this order and generate the release ticket.
                                  </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-4 overflow-y-auto pr-1 flex-1">
                                  <div>
                                    <Label htmlFor="truckNumber">Truck Number</Label>
                                    <Input
                                      id="truckNumber"
                                      value={releaseForm.truckNumber}
                                      onChange={(e) => setReleaseForm({ ...releaseForm, truckNumber: e.target.value })}
                                    />
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                      <Label htmlFor="driverName">Driver's Name</Label>
                                      <Input
                                        id="driverName"
                                        value={releaseForm.driverName}
                                        onChange={(e) => setReleaseForm({ ...releaseForm, driverName: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor="driverPhone">Driver's Phone</Label>
                                      <Input
                                        id="driverPhone"
                                        value={releaseForm.driverPhone}
                                        onChange={(e) => setReleaseForm({ ...releaseForm, driverPhone: e.target.value })}
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <Label htmlFor="deliveryAddress">Delivery Address</Label>
                                    <Textarea
                                      id="deliveryAddress"
                                      value={releaseForm.deliveryAddress}
                                      onChange={(e) => setReleaseForm({ ...releaseForm, deliveryAddress: e.target.value })}
                                      placeholder="Enter delivery address"
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <Label>Compartment Details</Label>
                                    <div className="rounded-md border border-slate-200 p-3">
                                      <div className="grid grid-cols-[minmax(120px,1fr)_minmax(110px,1fr)_minmax(110px,1fr)] gap-2 text-xs font-semibold text-slate-600">
                                        <div>S/N</div>
                                        <div>Qty (Litres)</div>
                                        <div>Ullage</div>
                                      </div>

                                      {([
                                        { n: 1, qtyKey: 'comp1Qty', ullKey: 'comp1Ullage', required: false },
                                        { n: 2, qtyKey: 'comp2Qty', ullKey: 'comp2Ullage', required: false },
                                        { n: 3, qtyKey: 'comp3Qty', ullKey: 'comp3Ullage', required: false },
                                        { n: 4, qtyKey: 'comp4Qty', ullKey: 'comp4Ullage', required: false },
                                        { n: 5, qtyKey: 'comp5Qty', ullKey: 'comp5Ullage', required: false },
                                      ] as const).map((row) => (
                                        <div key={row.n} className="grid grid-cols-[minmax(120px,1fr)_minmax(110px,1fr)_minmax(110px,1fr)] gap-2 mt-2 items-center">
                                          <div className="text-sm text-slate-700">
                                            {row.n}
                                            {row.required ? <span className="text-red-500"> *</span> : null}
                                          </div>
                                          <Input
                                            inputMode="numeric"
                                            placeholder=""
                                            value={releaseForm[row.qtyKey]}
                                            onChange={(e) => setReleaseForm({ ...releaseForm, [row.qtyKey]: e.target.value } as ReleaseDetails)}
                                            disabled
                                          />
                                          <Input
                                            inputMode="numeric"
                                            placeholder=""
                                            value={releaseForm[row.ullKey]}
                                            onChange={(e) => setReleaseForm({ ...releaseForm, [row.ullKey]: e.target.value } as ReleaseDetails)}
                                            disabled
                                          />
                                        </div>
                                      ))}

                                      {/* <div className="mt-3 text-xs text-slate-500">
                                        These fields are intentionally disabled and will remain blank on the ticket.
                                      </div> */}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                      <Label htmlFor="loaderName">Loader's Name</Label>
                                      <Input
                                        id="loaderName"
                                        value={releaseForm.loaderName}
                                        onChange={(e) => setReleaseForm({ ...releaseForm, loaderName: e.target.value })}
                                        disabled
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor="loaderPhone">Loader's Phone</Label>
                                      <Input
                                        id="loaderPhone"
                                        value={releaseForm.loaderPhone}
                                        onChange={(e) => setReleaseForm({ ...releaseForm, loaderPhone: e.target.value })}
                                        disabled
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <Label htmlFor="loadingDateTime">Loading Date & Time</Label>
                                    <Input
                                      id="loadingDateTime"
                                      type="datetime-local"
                                      value={releaseForm.loadingDateTime}
                                      onChange={(e) => setReleaseForm({ ...releaseForm, loadingDateTime: e.target.value })}
                                    />
                                  </div>
                                </div>

                                <DialogFooter className="pt-3 border-t border-slate-200 bg-white">
                                  <Button variant="outline" onClick={() => setReleaseOpen(false)}>
                                    Cancel
                                  </Button>
                                  <Button onClick={handleReleaseWithDetails}>
                                    Confirm Release
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1"
                              onClick={() => openTicket(order)}
                            >
                              <Printer className="h-4 w-4" />
                              <span>Ticket</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredOrders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center text-slate-500 py-10">
                        No orders found for the selected filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* pagination removed */}
            
            {/* Ticket modal + print area */}
            <Dialog
              open={ticketOpen}
              onOpenChange={(open) => {
                if (!open) setTicketOpen(false);
              }}
            >
              <DialogContent className="sm:max-w-[860px] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:w-auto flex flex-col max-h-[90vh]">
                <DialogHeader>
                  <DialogTitle>Release Ticket</DialogTitle>
                </DialogHeader>

                {/* Scrollable content; footer stays at the bottom */}
                <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                  {!selectedOrder ? (
                    <div className="text-sm text-slate-600">Select an order to view the ticket.</div>
                  ) : (
                    <>
                      {!canPrintTicket && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          Ticket cannot be printed yet. Please release the order and fill the required details.
                        </div>
                      )}

                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <TicketPrint
                          ref={ticketRef}
                          data={
                            buildTicketData || {
                              orderReference: getOrderReference(selectedOrder),
                              customerName: `${selectedOrder.user.first_name} ${selectedOrder.user.last_name}`,
                              companyName: extractCompanyName(selectedOrder) || '',
                              customerPhone: (() => {
                                const userRec = selectedOrder.user as unknown as Record<string, unknown>;
                                const phone =
                                  (typeof userRec.phone_number === 'string' ? userRec.phone_number : undefined) ||
                                  (typeof userRec.phone === 'string' ? userRec.phone : undefined) ||
                                  '';
                                return String(phone);
                              })(),
                              product: selectedOrder.products.map((p) => p.name).join(', '),
                              qty: `${selectedOrder.quantity.toLocaleString()} Litres`,
                              unitPrice: extractUnitPrice(selectedOrder),
                              truckNumber: '',
                              driverName: '',
                              driverPhone: '',
                              deliveryAddress: '',
                              compartmentDetails: '',
                              loaderName: '',
                              loaderPhone: '',
                              loadingDateTime: '',
                            }
                          }
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Footer stays at the bottom; not sticky in the middle of content */}
                <DialogFooter className="pt-3 border-t border-slate-200 bg-white">
                  <Button variant="outline" onClick={() => setTicketOpen(false)}>
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      if (!canPrintTicket) {
                        toast({
                          title: 'Missing release details',
                          description: "Fill missing details before printing the ticket.",
                          variant: 'destructive',
                        });
                        return;
                      }
                      printTicket();
                    }}
                    disabled={!selectedOrder || !canPrintTicket}
                  >
                    <Printer className="mr-1 h-4 w-4" />
                    Print Ticket
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

          </div>
        </div>
      </div>
    </div>
  );
};
