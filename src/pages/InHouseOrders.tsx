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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Plus,
  Search,
  Download,
  Loader2,
  Truck,
  Fuel,
  MapPin,
  Package,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  FuelIcon,
  Hourglass,
  TruckIcon,
  User,
  Phone,
  FileText,
  Banknote,
  Hash,
  ShieldCheck,
  Calendar as CalendarIcon,
  FileBox,
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { getOrderReference } from '@/lib/orderReference';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InHouseOrder {
  id: number;
  reference?: string;
  user?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    company_name?: string;
    companyName?: string;
  };
  products?: Array<{ name?: string; unit_price?: number | string }>;
  quantity?: number | string;
  total_price?: string | number;
  status: string;
  created_at: string;
  state?: string;
  order_type?: string;
  notes?: string;
  pfi_id?: number | null;
  pfi_number?: string | null;
  customer_name?: string;
  customer_phone?: string;
  // Driver / truck dispatch fields
  driver_name?: string;
  driver_phone?: string;
  truck_number?: string;
  supervised_by?: string;
  loading_date?: string;
  destination_state?: string;
  destination_town?: string;
  // Sale accountability fields
  sold_to_name?: string;
  sold_to_phone?: string;
  delivery_address?: string;
  sold_at?: string;
}

interface InHouseOrderResponse {
  count: number;
  results: InHouseOrder[];
}

interface State {
  id: number;
  name: string;
  classifier?: string;
}

interface Product {
  id: number;
  name: string;
  abbreviation?: string;
  unit_price?: number;
}

// 36 Nigerian states + FCT — fixed list, separate from depot/pricing states
const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'FCT Abuja', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
  'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusDisplayMap: Record<string, string> = {
  pending: 'Pending',
  paid: 'Awaiting Ticket',
  released: 'Loaded',
  sold: 'Sold',
  canceled: 'Canceled',
};

const getStatusText = (status: string) =>
  statusDisplayMap[status.toLowerCase()] || status;

const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid':
      return <FuelIcon className="text-blue-500" size={14} />;
    case 'pending':
      return <Hourglass className="text-orange-500" size={14} />;
    case 'canceled':
      return <AlertCircle className="text-red-600" size={14} />;
    case 'released':
      return <TruckIcon className="text-blue-600" size={14} />;
    case 'sold':
      return <CheckCircle className="text-green-600" size={14} />;
    default:
      return <FuelIcon className="text-blue-500" size={14} />;
  }
};

const getStatusClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid':
      return 'text-green-700';
    case 'pending':
      return 'text-orange-700';
    case 'canceled':
      return 'text-red-700';
    case 'released':
      return 'text-blue-700';
    case 'sold':
      return 'text-purple-700';
    default:
      return 'text-slate-700';
  }
};

const formatCurrency = (v: string | number | undefined | null): string => {
  if (v === undefined || v === null || v === '' || v === '0' || v === '0.00')
    return '—';
  const n = Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n) || n === 0) return '—';
  return `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatQuantity = (v: string | number | undefined | null): string => {
  if (v === undefined || v === null || v === '') return '0';
  const n = Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString();
};

const MAX_TRUCK_CAPACITY = 60_000;

/** Format a raw string with thousand separators for display in input */
const formatWithCommas = (v: string): string => {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const intPart = (parts[0] || '').replace(/^0+(?=\d)/, '');
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (parts.length > 1) return `${formatted}.${parts[1]}`;
  return formatted;
};

/** Strip commas to get a raw number string */
const stripCommas = (v: string): string => v.replace(/,/g, '');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InHouseOrders() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Create dialog state ────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    product_id: '',
    quantity: '',
    state_id: '',
    destination_state: '',
    destination_town: '',
    driver_name: '',
    driver_phone: '',
    truck_number: '',
    supervised_by: '',
    loading_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  });

  // ── Record Sale dialog ──────────────────────────────────────────
  const [saleOpen, setSaleOpen] = useState(false);
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [saleOrder, setSaleOrder] = useState<InHouseOrder | null>(null);
  const [saleForm, setSaleForm] = useState({
    sold_to_name: '',
    sold_to_phone: '',
    delivery_address: '',
    unit_price: '',
  });

  // ── Filters ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // ── Reference data ─────────────────────────────────────────────────
  const { data: statesRaw } = useQuery<State[]>({
    queryKey: ['states'],
    queryFn: async () => {
      const res = await apiClient.admin.getStates();
      return (res?.results ?? res) as State[];
    },
    staleTime: 5 * 60_000,
  });
  const states = useMemo(() => (statesRaw || []) as State[], [statesRaw]);
  const depots = useMemo(() => states.filter((s) => s.classifier?.toLowerCase() === 'depot'), [states]);

  const { data: productsRaw } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await apiClient.admin.getProducts({ page_size: 100 });
      return (res?.results ?? res) as Product[];
    },
    staleTime: 5 * 60_000,
  });
  const products = useMemo(() => (productsRaw || []) as Product[], [productsRaw]);

  // ── In-House Orders list ───────────────────────────────────────────
  const {
    data: apiResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<InHouseOrderResponse>({
    queryKey: ['in-house-orders'],
    queryFn: async () => {
      const res = await apiClient.admin.getInHouseOrders({ page: 1, page_size: 500 });
      return res as InHouseOrderResponse;
    },
    retry: 2,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const orders = useMemo(() => apiResponse?.results || [], [apiResponse]);

  // ── Filtering ──────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    let result = orders;

    if (statusFilter) {
      result = result.filter(
        (o) => o.status.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((o) => {
        const ref = getOrderReference(o).toLowerCase();
        const product = (o.products?.[0]?.name || '').toLowerCase();
        const customer = (
          o.customer_name ||
          `${o.user?.first_name || ''} ${o.user?.last_name || ''}`
        ).toLowerCase();
        const state = (o.state || '').toLowerCase();
        const destination = (`${o.destination_state || ''} ${o.destination_town || ''}`).toLowerCase();
        const buyer = (o.sold_to_name || '').toLowerCase();
        const address = (o.delivery_address || '').toLowerCase();
        const driver = (o.driver_name || '').toLowerCase();
        const truckNo = (o.truck_number || '').toLowerCase();
        const supervisor = (o.supervised_by || '').toLowerCase();
        return (
          ref.includes(q) ||
          product.includes(q) ||
          customer.includes(q) ||
          state.includes(q) ||
          destination.includes(q) ||
          buyer.includes(q) ||
          address.includes(q) ||
          driver.includes(q) ||
          truckNo.includes(q) ||
          supervisor.includes(q) ||
          String(o.id).includes(q)
        );
      });
    }

    return result;
  }, [orders, statusFilter, searchQuery]);

  // ── Summary stats ──────────────────────────────────────────────────
  const summaryCards = useMemo((): SummaryCard[] => {
    const total = orders.length;
    const awaiting = orders.filter((o) => o.status === 'paid').length;
    const loaded = orders.filter((o) => o.status === 'released').length;
    const sold = orders.filter((o) => o.status === 'sold').length;
    const totalQty = orders.reduce(
      (sum, o) => sum + Number(o.quantity || 0),
      0
    );
    const revenue = orders
      .filter((o) => o.status === 'sold')
      .reduce((sum, o) => sum + Number(o.total_price || 0), 0);

    return [
      {
        title: 'Total Orders',
        value: String(total),
        icon: <Package size={20} />,
        tone: 'neutral' as const,
      },
      {
        title: 'Total Volume',
        value: `${totalQty.toLocaleString()} L`,
        icon: <Fuel size={20} />,
        tone: 'neutral' as const,
      },
      {
        title: 'Awaiting Ticket',
        value: String(awaiting),
        icon: <Clock size={20} />,
        tone: 'amber' as const,
      },
      {
        title: 'Loaded & Dispatched',
        value: String(loaded),
        icon: <Truck size={20} />,
        tone: 'neutral' as const,
      },
      {
        title: 'Sold',
        value: String(sold),
        icon: <CheckCircle size={20} />,
        tone: 'green' as const,
      },
      {
        title: 'Revenue',
        value: revenue > 0 ? `₦${revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '₦0',
        icon: <Banknote size={20} />,
        tone: revenue > 0 ? 'green' as const : 'neutral' as const,
      },
    ];
  }, [orders]);

  // ── Create order handler ───────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    // Validate
    if (!form.product_id) {
      toast({ title: 'Product is required', description: 'Select a product to dispatch.', variant: 'destructive' });
      return;
    }
    if (!form.state_id) {
      toast({ title: 'Loading depot is required', description: 'Select the loading depot.', variant: 'destructive' });
      return;
    }
    if (!form.destination_state) {
      toast({ title: 'Destination is required', description: 'Select the destination state.', variant: 'destructive' });
      return;
    }
    const rawQty = Number(stripCommas(form.quantity));
    if (!rawQty || rawQty <= 0) {
      toast({ title: 'Quantity is required', description: 'Enter the volume in litres.', variant: 'destructive' });
      return;
    }
    if (rawQty > MAX_TRUCK_CAPACITY) {
      toast({
        title: 'Quantity too large',
        description: `Maximum single order is ${MAX_TRUCK_CAPACITY.toLocaleString()} litres. For larger volumes, create multiple orders.`,
        variant: 'destructive',
      });
      return;
    }
    if (!form.driver_name.trim()) {
      toast({ title: "Driver's name is required", description: 'Enter the name of the driver.', variant: 'destructive' });
      return;
    }
    if (!form.truck_number.trim()) {
      toast({ title: 'Truck number is required', description: 'Enter the truck plate number.', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      await apiClient.admin.createInHouseOrder({
        product_id: Number(form.product_id),
        quantity: rawQty,
        state_id: Number(form.state_id),
        destination_state: form.destination_state,
        destination_town: form.destination_town.trim() || undefined,
        driver_name: form.driver_name.trim(),
        driver_phone: form.driver_phone.trim() || undefined,
        truck_number: form.truck_number.trim().toUpperCase(),
        supervised_by: form.supervised_by.trim() || undefined,
        loading_date: form.loading_date || undefined,
        notes: form.notes.trim() || undefined,
      });

      toast({ title: 'Order Created', description: 'In-house order created successfully. It is now ready for ticket generation.' });

      // Reset form & close
      setForm({
        product_id: '', quantity: '', state_id: '', destination_state: '', destination_town: '',
        driver_name: '', driver_phone: '', truck_number: '',
        supervised_by: '', loading_date: format(new Date(), 'yyyy-MM-dd'), notes: '',
      });
      setCreateOpen(false);

      // Refresh list & sidebar counts
      queryClient.invalidateQueries({ queryKey: ['in-house-orders'] });
      queryClient.invalidateQueries({ queryKey: ['all-orders'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create order';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }, [form, toast, queryClient]);

  // ── Record Sale handler ─────────────────────────────────────────
  const openRecordSale = useCallback((order: InHouseOrder) => {
    setSaleOrder(order);
    setSaleForm({
      sold_to_name: order.sold_to_name || '',
      sold_to_phone: order.sold_to_phone || '',
      delivery_address: order.delivery_address || '',
      unit_price: order.products?.[0]?.unit_price ? String(order.products[0].unit_price) : '',
    });
    setSaleOpen(true);
  }, []);

  const handleRecordSale = useCallback(async () => {
    if (!saleOrder) return;

    // Validate all required fields
    if (!saleForm.sold_to_name.trim()) {
      toast({ title: 'Buyer name is required', description: 'Enter the name of the person who bought the product.', variant: 'destructive' });
      return;
    }
    if (!saleForm.sold_to_phone.trim()) {
      toast({ title: 'Buyer phone is required', description: 'Enter the buyer\'s phone number for accountability.', variant: 'destructive' });
      return;
    }
    if (!saleForm.delivery_address.trim()) {
      toast({ title: 'Delivery address is required', description: 'Enter the exact location the product was delivered to.', variant: 'destructive' });
      return;
    }
    const price = Number(stripCommas(saleForm.unit_price));
    if (!price || price <= 0) {
      toast({ title: 'Invalid price', description: 'Enter a valid unit price per litre.', variant: 'destructive' });
      return;
    }

    setSaleSubmitting(true);
    try {
      const qty = Number(saleOrder.quantity || 0);
      await apiClient.admin.recordInHouseOrderSale(saleOrder.id, {
        sold_to_name: saleForm.sold_to_name.trim(),
        sold_to_phone: saleForm.sold_to_phone.trim(),
        delivery_address: saleForm.delivery_address.trim(),
        unit_price: price,
        total_price: price * qty,
      });
      toast({
        title: 'Sale Recorded',
        description: `Sale recorded for order ${getOrderReference(saleOrder) || saleOrder.id}. Buyer: ${saleForm.sold_to_name.trim()}.`,
      });
      setSaleOpen(false);
      setSaleOrder(null);
      queryClient.invalidateQueries({ queryKey: ['in-house-orders'] });
      queryClient.invalidateQueries({ queryKey: ['all-orders'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record sale';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSaleSubmitting(false);
    }
  }, [saleOrder, saleForm, toast, queryClient]);

  // ── Export ─────────────────────────────────────────────────────────
  const exportToExcel = useCallback(() => {
    const rows = filteredOrders.map((o) => ({
      Reference: getOrderReference(o) || String(o.id),
      Product: o.products?.[0]?.name || '',
      'Quantity (L)': Number(o.quantity || 0),
      'Loading Depot': o.state || '',
      'Destination State': o.destination_state || '',
      'Destination Town': o.destination_town || '',
      'Driver Name': o.driver_name || '',
      'Driver Phone': o.driver_phone || '',
      'Truck Number': o.truck_number || '',
      'Supervised By': o.supervised_by || '',
      'Loading Date': o.loading_date || '',
      Status: getStatusText(o.status),
      'Buyer Name': o.sold_to_name || '',
      'Buyer Phone': o.sold_to_phone || '',
      'Delivery Address': o.delivery_address || '',
      'Unit Price': o.products?.[0]?.unit_price || '',
      'Total Price': o.total_price || '',
      'Sold Date': o.sold_at ? format(new Date(o.sold_at), 'yyyy-MM-dd HH:mm') : '',
      PFI: o.pfi_number || '',
      'Created At': o.created_at ? format(new Date(o.created_at), 'yyyy-MM-dd HH:mm') : '',
      Notes: o.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'In-House Orders');
    XLSX.writeFile(wb, 'IN-HOUSE-ORDERS-REPORT.xlsx');
  }, [filteredOrders]);

  // ── Render ─────────────────────────────────────────────────────────
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
              title="Create Delivery Order"
              description="Generate and assign order to sales representative for customer delivery and accountability."
              actions={
                <>
                  <Button
                    className="gap-2"
                    onClick={() => {
                      setForm({
                        product_id: '', quantity: '', state_id: '', destination_state: '', destination_town: '',
                        driver_name: '', driver_phone: '', truck_number: '',
                        supervised_by: '', loading_date: format(new Date(), 'yyyy-MM-dd'), notes: '',
                      });
                      setCreateOpen(true);
                    }}
                  >
                    <Plus size={18} />
                    Create Order
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={exportToExcel}>
                    <Download size={16} />
                    Download Report
                  </Button>
                </>
              }
            />

            {/* Summary Cards */}
            <SummaryCards cards={summaryCards} />

            {/* Toolbar */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search order by product, driver, truck, state…"
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Status filter */}
                <select
                  value={statusFilter || 'all'}
                  onChange={(e) => setStatusFilter(e.target.value === 'all' ? null : e.target.value)}
                  className="h-10 w-full sm:w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  aria-label="Status filter"
                >
                  <option value="all">All Statuses</option>
                  <option value="paid">Awaiting Ticket</option>
                  <option value="released">Loaded</option>
                  <option value="sold">Sold</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : isError ? (
                <div className="p-10 text-center">
                  <AlertCircle className="mx-auto text-red-400 mb-3" size={36} />
                  <p className="text-red-600 font-medium">Failed to load orders</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {error instanceof Error ? error.message : 'Unknown error'}
                  </p>
                  <Button variant="outline" className="mt-4" onClick={() => refetch()}>
                    Retry
                  </Button>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-10 text-center">
                  <Package className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No orders found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {orders.length > 0
                      ? 'Try adjusting your filters.'
                      : 'Click "New In-House Order" to create one.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700">Reference</TableHead>
                        <TableHead className="font-semibold text-slate-700">Product</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Qty (L)</TableHead>
                        <TableHead className="font-semibold text-slate-700">Depot</TableHead>
                        <TableHead className="font-semibold text-slate-700">Destination</TableHead>
                        <TableHead className="font-semibold text-slate-700">Truck No.</TableHead>
                        <TableHead className="font-semibold text-slate-700">Driver</TableHead>
                        <TableHead className="font-semibold text-slate-700">Sales Rep</TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700">Buyer</TableHead>
                        <TableHead className="font-semibold text-slate-700">Total</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date</TableHead>
                        <TableHead className="font-semibold text-slate-700">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => {
                        const ref = getOrderReference(order) || `#${order.id}`;
                        const productName = order.products?.[0]?.name || '—';
                        const qty = formatQuantity(order.quantity);
                        const state = order.state || '—';
                        const totalPrice = formatCurrency(order.total_price);
                        const dateStr = order.created_at
                          ? format(new Date(order.created_at), 'dd MMM yyyy')
                          : '—';
                        const isSold = order.status === 'sold';
                        const hasSaleInfo = !!order.sold_to_name;

                        return (
                          <TableRow key={order.id} className="hover:bg-slate-50/60 transition-colors">
                            <TableCell className="text-sm font-semibold text-slate-800">
                              {ref}
                            </TableCell>
                            <TableCell className="text-sm">{productName}</TableCell>
                            <TableCell className="text-sm text-right font-semibold">{qty}</TableCell>
                            <TableCell className="text-sm">{state}</TableCell>
                            <TableCell className="text-sm">
                              {order.destination_state
                                ? `${order.destination_state}${order.destination_town ? `, ${order.destination_town}` : ''}`
                                : '—'}
                            </TableCell>
                            {/* Driver / Truck */}
                            <TableCell className="text-sm">
                                <span className="font-semibold text-green-800">{order.truck_number}</span>
                            </TableCell>
                            <TableCell className="text-sm">
                                <span className="font-semibold">{order.driver_name}</span>
                                <br /><span className="text-xs text-slate-600">{order.driver_phone}</span>
                            </TableCell>
                            {/* Supervisor */}
                            <TableCell className="text-sm text-black">
                              {order.supervised_by || '—'}
                            </TableCell>
                            <TableCell>
                                <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${getStatusClass(order.status)}`}>
                                  {getStatusText(order.status)}
                                </span>
                            </TableCell>
                            {/* Buyer / Delivery column */}
                            <TableCell className="text-sm max-w-[200px]">
                              {hasSaleInfo ? (
                                <div className="space-y-0.5">
                                    <span className="font-semibold">{order.sold_to_name}</span>
                                <br /><span className="text-xs text-black">{order.sold_to_phone}</span>
                                  {order.delivery_address && (
                                    <div className="flex items-center gap-1 text-slate-500 text-xs">
                                      <MapPin size={11} className="text-slate-400 shrink-0" />
                                      <span className>{order.delivery_address}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-black text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-left font-semibold">{totalPrice}</TableCell>
                            <TableCell className="text-sm text-slate-500">{dateStr}</TableCell>
                            <TableCell className="text-left">
                              {/* Show "Record Sale" for orders not yet sold; show "View Sale" for sold orders */}
                              {isSold ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 text-xs text-emerald-700"
                                  onClick={() => openRecordSale(order)}
                                >
                                  <FileBox size={14} />
                                  View Sale
                                </Button>
                              ) : order.status !== 'canceled' ? (
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="gap-1.5 text-xs"
                                  onClick={() => openRecordSale(order)}
                                >
                                  <DollarSign size={14} />
                                  Record Sale
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Count footer */}
            {!isLoading && filteredOrders.length > 0 && (
              <div className="text-sm text-slate-500 text-right">
                Showing {filteredOrders.length} of {orders.length} in-house order{orders.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Create In-House Order Dialog ──────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <Truck className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">New In-House Order</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  Allocate product to an agent for consignment / dispatch
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Create a new in-house consignment order
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Product */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Fuel size={15} className="text-slate-500" />
                Product <span className="text-red-500">*</span>
              </Label>
              <select
                value={form.product_id}
                onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Product"
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}{p.abbreviation ? ` (${p.abbreviation})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Package size={15} className="text-slate-500" />
                Quantity (Litres) <span className="text-red-500">*</span>
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 45,000"
                value={form.quantity}
                onChange={(e) => {
                  const formatted = formatWithCommas(e.target.value);
                  const raw = Number(stripCommas(formatted));
                  if (raw > MAX_TRUCK_CAPACITY) {
                    setForm((f) => ({ ...f, quantity: formatWithCommas(String(MAX_TRUCK_CAPACITY)) }));
                  } else {
                    setForm((f) => ({ ...f, quantity: formatted }));
                  }
                }}
              />
              <p className="text-xs text-slate-400">
                Max {MAX_TRUCK_CAPACITY.toLocaleString()} litres per order (one truck capacity)
              </p>
            </div>

            {/* Loading Depot */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <MapPin size={15} className="text-slate-500" />
                Loading Depot <span className="text-red-500">*</span>
              </Label>
              <select
                value={form.state_id}
                onChange={(e) => setForm((f) => ({ ...f, state_id: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Loading Depot"
              >
                <option value="">Select depot</option>
                {depots.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Destination (State + Town) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Truck size={15} className="text-slate-500" />
                  Destination State <span className="text-red-500">*</span>
                </Label>
                <select
                  value={form.destination_state}
                  onChange={(e) => setForm((f) => ({ ...f, destination_state: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  aria-label="Destination State"
                >
                  <option value="">Select state</option>
                  {NIGERIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <MapPin size={15} className="text-slate-500" />
                  Destination Town
                </Label>
                <Input
                  placeholder="e.g. Ikeja, Lekki, Aba"
                  value={form.destination_town}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, destination_town: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Driver's Name + Driver's Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <User size={15} className="text-slate-500" />
                  Driver's Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. Musa Abdullahi"
                  value={form.driver_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, driver_name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Phone size={15} className="text-slate-500" />
                  Driver's Phone
                </Label>
                <Input
                  placeholder="e.g. 08012345678"
                  value={form.driver_phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, driver_phone: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Truck Number */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Hash size={15} className="text-slate-500" />
                Truck Number <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="e.g. ABC-123-XY"
                value={form.truck_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, truck_number: e.target.value.toUpperCase() }))
                }
              />
            </div>

            {/* Supervised By + Loading Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-slate-500" />
                  Sales Representative
                </Label>
                <Input
                  placeholder="e.g. Ahmed Bello"
                  value={form.supervised_by}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, supervised_by: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <CalendarIcon size={15} className="text-slate-500" />
                  Loading Date
                </Label>
                <Input
                  type="date"
                  value={form.loading_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, loading_date: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <FileText size={15} className="text-slate-500" />
                Notes
              </Label>
              <Textarea
                placeholder="Any additional notes about this dispatch…"
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>

            {/* Info banner */}
            {/* <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex gap-3">
              <CheckCircle size={18} className="text-purple-600 mt-0.5 shrink-0" />
              <div className="text-sm text-purple-800">
                <p className="font-medium">No payment required</p>
                <p className="text-purple-600 mt-0.5">
                  This order will be created with status <strong>"Paid"</strong> and will appear immediately in Loading Tickets for truck allocation. The sale price can be set later once the product is sold.
                </p>
              </div>
            </div> */}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="gap-2"
            >
              {creating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              {creating ? 'Creating…' : 'Create Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Record Sale Dialog ─────────────────────────────────────── */}
      <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-emerald-100 p-2 rounded-lg">
                <Banknote className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  {saleOrder?.status === 'sold' ? 'Sale Details' : 'Record Sale'}
                </h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  Order {saleOrder ? (getOrderReference(saleOrder) || `#${saleOrder.id}`) : ''}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Record sale details for this in-house order
            </DialogDescription>
          </DialogHeader>

          {saleOrder && (
            <div className="space-y-5 py-2">
              {/* Order summary */}
              <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Product</span>
                  <span className="font-medium">{saleOrder.products?.[0]?.name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Quantity</span>
                  <span className="font-medium">{formatQuantity(saleOrder.quantity)} L</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Agent</span>
                  <span className="font-medium">
                    {saleOrder.customer_name ||
                      `${saleOrder.user?.first_name || ''} ${saleOrder.user?.last_name || ''}`.trim() ||
                      '—'}
                  </span>
                </div>
                {saleOrder.sold_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sold Date</span>
                    <span className="font-medium">
                      {format(new Date(saleOrder.sold_at), 'dd MMM yyyy, HH:mm')}
                    </span>
                  </div>
                )}
              </div>

              {/* Buyer Name */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <User size={15} className="text-slate-500" />
                  Buyer Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. Chinedu Okafor"
                  value={saleForm.sold_to_name}
                  onChange={(e) =>
                    setSaleForm((f) => ({ ...f, sold_to_name: e.target.value }))
                  }
                  disabled={saleOrder.status === 'sold'}
                />
              </div>

              {/* Buyer Phone */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Phone size={15} className="text-slate-500" />
                  Buyer Phone <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. 08098765432"
                  value={saleForm.sold_to_phone}
                  onChange={(e) =>
                    setSaleForm((f) => ({ ...f, sold_to_phone: e.target.value }))
                  }
                  disabled={saleOrder.status === 'sold'}
                />
              </div>

              {/* Delivery Address */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <MapPin size={15} className="text-slate-500" />
                  Delivery Address <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  placeholder="e.g. KM 5, Enugu-Onitsha Expressway, Awka"
                  rows={2}
                  value={saleForm.delivery_address}
                  onChange={(e) =>
                    setSaleForm((f) => ({ ...f, delivery_address: e.target.value }))
                  }
                  disabled={saleOrder.status === 'sold'}
                />
              </div>

              {/* Unit Price */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <DollarSign size={15} className="text-slate-500" />
                  Unit Price per Litre (₦) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 650"
                  value={saleForm.unit_price}
                  onChange={(e) =>
                    setSaleForm((f) => ({ ...f, unit_price: formatWithCommas(e.target.value) }))
                  }
                  disabled={saleOrder.status === 'sold'}
                />
              </div>

              {/* Calculated total */}
              {saleForm.unit_price && Number(stripCommas(saleForm.unit_price)) > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-emerald-700">Calculated Total</span>
                    <span className="font-bold text-emerald-800">
                      {formatCurrency(
                        Number(stripCommas(saleForm.unit_price)) *
                          Number(saleOrder.quantity || 0)
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Accountability notice */}
              {saleOrder.status !== 'sold' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-3">
                  <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Accountability Record</p>
                    <p className="text-amber-600 mt-0.5">
                      This records who purchased the product, their contact details, and the exact delivery location. This information is <strong>permanent</strong> and cannot be edited after submission.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSaleOpen(false)}
              disabled={saleSubmitting}
            >
              {saleOrder?.status === 'sold' ? 'Close' : 'Cancel'}
            </Button>
            {saleOrder?.status !== 'sold' && (
              <Button
                onClick={handleRecordSale}
                disabled={saleSubmitting}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {saleSubmitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle size={16} />
                )}
                {saleSubmitting ? 'Recording…' : 'Record Sale'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}