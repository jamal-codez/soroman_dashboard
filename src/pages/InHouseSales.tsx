// Page for SALES REPS to view dispatched orders and record sales.
// Visible to: Admins (0,1) and Sales/Marketing (3).

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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Search, Download, Truck, Fuel, MapPin, Package,
  DollarSign, AlertCircle, CheckCircle, Clock,
  User, Phone, Banknote, FileBox, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { getOrderReference } from '@/lib/orderReference';
import {
  type InHouseOrder, type InHouseOrderResponse,
  getStatusText, getStatusClass,
  formatCurrency, formatQuantity, formatWithCommas, stripCommas,
} from '@/lib/inHouseHelpers';

export default function InHouseSales() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Record Sale dialog state ────────────────────────────────────
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

  // ── Orders list ────────────────────────────────────────────────────
  const {
    data: apiResponse, isLoading, isError, error, refetch,
  } = useQuery<InHouseOrderResponse>({
    queryKey: ['in-house-orders'],
    queryFn: async () => {
      const res = await apiClient.admin.getInHouseOrders({ page: 1, page_size: 500 });
      return res as InHouseOrderResponse;
    },
    retry: 2, staleTime: 30_000, refetchOnWindowFocus: true,
  });

  const orders = useMemo(() => apiResponse?.results || [], [apiResponse]);

  // ── Filtering ──────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (statusFilter) {
      result = result.filter((o) => o.status.toLowerCase() === statusFilter.toLowerCase());
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((o) => {
        const ref = getOrderReference(o).toLowerCase();
        const product = (o.products?.[0]?.name || '').toLowerCase();
        const destination = (`${o.destination_state || ''} ${o.destination_town || ''}`).toLowerCase();
        const buyer = (o.sold_to_name || '').toLowerCase();
        const address = (o.delivery_address || '').toLowerCase();
        const driver = (o.driver_name || '').toLowerCase();
        const truckNo = (o.truck_number || '').toLowerCase();
        const supervisor = (o.supervised_by || '').toLowerCase();
        return (
          ref.includes(q) || product.includes(q) || destination.includes(q) ||
          buyer.includes(q) || address.includes(q) || driver.includes(q) ||
          truckNo.includes(q) || supervisor.includes(q) || String(o.id).includes(q)
        );
      });
    }
    return result;
  }, [orders, statusFilter, searchQuery]);

  // ── Summary stats ──────────────────────────────────────────────────
  const summaryCards = useMemo((): SummaryCard[] => {
    const total = orders.length;
    const loaded = orders.filter((o) => o.status === 'released').length;
    const sold = orders.filter((o) => o.status === 'sold').length;
    const pendingSale = orders.filter((o) => o.status === 'released').length;
    const revenue = orders
      .filter((o) => o.status === 'sold')
      .reduce((sum, o) => sum + Number(o.total_price || 0), 0);

    return [
      { title: 'Total Orders', value: String(total), icon: <Package size={20} />, tone: 'neutral' as const },
      { title: 'Pending Sale', value: String(pendingSale), icon: <Clock size={20} />, tone: 'amber' as const },
      { title: 'Sold', value: String(sold), icon: <CheckCircle size={20} />, tone: 'green' as const },
      {
        title: 'Revenue',
        value: revenue > 0 ? `₦${revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '₦0',
        icon: <Banknote size={20} />,
        tone: revenue > 0 ? 'green' as const : 'neutral' as const,
      },
    ];
  }, [orders]);

  // ── Open record sale dialog ────────────────────────────────────
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

  // ── Record sale handler ────────────────────────────────────────
  const handleRecordSale = useCallback(async () => {
    if (!saleOrder) return;

    if (!saleForm.sold_to_name.trim()) {
      toast({ title: 'Buyer name is required', description: 'Enter the name of the person who bought the product.', variant: 'destructive' });
      return;
    }
    if (!saleForm.sold_to_phone.trim()) {
      toast({ title: 'Buyer phone is required', description: "Enter the buyer's phone number for accountability.", variant: 'destructive' });
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
      Destination: `${o.destination_state || ''} ${o.destination_town || ''}`.trim(),
      'Truck Number': o.truck_number || '',
      'Sales Rep': o.supervised_by || '',
      Status: getStatusText(o.status),
      'Buyer Name': o.sold_to_name || '',
      'Buyer Phone': o.sold_to_phone || '',
      'Delivery Address': o.delivery_address || '',
      'Total Price': o.total_price || '',
      'Sold Date': o.sold_at ? format(new Date(o.sold_at), 'yyyy-MM-dd HH:mm') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales');
    XLSX.writeFile(wb, 'DELIVERY-SALES-REPORT.xlsx');
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
              title="Record Delivery Sales"
              description="Record sale details for dispatched products — buyer info, delivery address, and pricing."
              actions={
                <Button variant="outline" className="gap-2" onClick={exportToExcel}>
                  <Download size={16} />
                  Download Report
                </Button>
              }
            />

            <SummaryCards cards={summaryCards} />

            {/* Toolbar */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search by product, truck, buyer, destination…"
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  value={statusFilter || 'all'}
                  onChange={(e) => setStatusFilter(e.target.value === 'all' ? null : e.target.value)}
                  className="h-10 w-full sm:w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  aria-label="Status filter"
                >
                  <option value="all">All Statuses</option>
                  <option value="released">Loaded (Pending Sale)</option>
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
                  <p className="text-sm text-slate-500 mt-1">{error instanceof Error ? error.message : 'Unknown error'}</p>
                  <Button variant="outline" className="mt-4" onClick={() => refetch()}>Retry</Button>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-10 text-center">
                  <Package className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No orders found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {orders.length > 0 ? 'Try adjusting your filters.' : 'No delivery orders have been dispatched yet.'}
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
                        <TableHead className="font-semibold text-slate-700">Destination</TableHead>
                        <TableHead className="font-semibold text-slate-700">Truck No.</TableHead>
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
                        const totalPrice = formatCurrency(order.total_price);
                        const dateStr = order.created_at ? format(new Date(order.created_at), 'dd MMM yyyy') : '—';
                        const isSold = order.status === 'sold';
                        const hasSaleInfo = !!order.sold_to_name;

                        return (
                          <TableRow key={order.id} className="hover:bg-slate-50/60 transition-colors">
                            <TableCell className="text-sm font-semibold text-slate-800">{ref}</TableCell>
                            <TableCell className="text-sm">{productName}</TableCell>
                            <TableCell className="text-sm text-right font-semibold">{qty}</TableCell>
                            <TableCell className="text-sm">
                              {order.destination_state
                                ? `${order.destination_state}${order.destination_town ? `, ${order.destination_town}` : ''}`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-sm"><span className="font-semibold text-green-800">{order.truck_number}</span></TableCell>
                            <TableCell className="text-sm text-black">{order.supervised_by || '—'}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${getStatusClass(order.status)}`}>
                                {getStatusText(order.status)}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px]">
                              {hasSaleInfo ? (
                                <div className="space-y-0.5">
                                  <span className="font-semibold">{order.sold_to_name}</span>
                                  <br /><span className="text-xs text-black">{order.sold_to_phone}</span>
                                  {order.delivery_address && (
                                    <div className="flex items-center gap-1 text-slate-500 text-xs">
                                      <MapPin size={11} className="text-slate-400 shrink-0" />
                                      <span>{order.delivery_address}</span>
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
                              ) : order.status !== 'canceled' && order.status !== 'paid' ? (
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="gap-1.5 text-xs"
                                  onClick={() => openRecordSale(order)}
                                >
                                  <DollarSign size={14} />
                                  Record Sale
                                </Button>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  {order.status === 'paid' ? 'Awaiting ticket' : '—'}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {!isLoading && filteredOrders.length > 0 && (
              <div className="text-sm text-slate-500 text-right">
                Showing {filteredOrders.length} of {orders.length} order{orders.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      </div>

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
              Record sale details for this delivery order
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
                  <span className="text-slate-500">Destination</span>
                  <span className="font-medium">
                    {saleOrder.destination_state
                      ? `${saleOrder.destination_state}${saleOrder.destination_town ? `, ${saleOrder.destination_town}` : ''}`
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Sales Rep</span>
                  <span className="font-medium">{saleOrder.supervised_by || '—'}</span>
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
                  Buyer (Company/Individual) <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. Chinedu Okafor"
                  value={saleForm.sold_to_name}
                  onChange={(e) => setSaleForm((f) => ({ ...f, sold_to_name: e.target.value }))}
                  disabled={saleOrder.status === 'sold'}
                />
              </div>

              {/* Buyer Phone */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Phone size={15} className="text-slate-500" />
                  Buyer's Phone Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. 08098765432"
                  value={saleForm.sold_to_phone}
                  onChange={(e) => setSaleForm((f) => ({ ...f, sold_to_phone: e.target.value }))}
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
                  onChange={(e) => setSaleForm((f) => ({ ...f, delivery_address: e.target.value }))}
                  disabled={saleOrder.status === 'sold'}
                />
              </div>

              {/* Unit Price */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <DollarSign size={15} className="text-slate-500" />
                  Price per Litre (₦) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 650"
                  value={saleForm.unit_price}
                  onChange={(e) => setSaleForm((f) => ({ ...f, unit_price: formatWithCommas(e.target.value) }))}
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
                        Number(stripCommas(saleForm.unit_price)) * Number(saleOrder.quantity || 0)
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
                      This records who purchased the product, their contact details, and the exact delivery location.
                      This information is <strong>permanent</strong> and cannot be edited after submission.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSaleOpen(false)} disabled={saleSubmitting}>
              {saleOrder?.status === 'sold' ? 'Close' : 'Cancel'}
            </Button>
            {saleOrder?.status !== 'sold' && (
              <Button
                onClick={handleRecordSale}
                disabled={saleSubmitting}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {saleSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                {saleSubmitting ? 'Recording…' : 'Record Sale'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
