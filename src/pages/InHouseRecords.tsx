// Read-only admin overview of all in-house / delivery orders.
// Visible to: Admins (0,1) — see everything happening, export reports.

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Search, Download, Truck, Fuel, MapPin, Package,
  AlertCircle, CheckCircle, Clock, Banknote, Eye,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { getOrderReference } from '@/lib/orderReference';
import {
  type InHouseOrder, type InHouseOrderResponse,
  getStatusText, getStatusClass,
  formatCurrency, formatQuantity,
} from '@/lib/inHouseHelpers';

export default function InHouseRecords() {
  // ── Filters ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // ── Detail dialog ──────────────────────────────────────────────────
  const [detailOrder, setDetailOrder] = useState<InHouseOrder | null>(null);

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
        const customer = (o.customer_name || `${o.user?.first_name || ''} ${o.user?.last_name || ''}`).toLowerCase();
        const state = (o.state || '').toLowerCase();
        const destination = (`${o.destination_state || ''} ${o.destination_town || ''}`).toLowerCase();
        const buyer = (o.sold_to_name || '').toLowerCase();
        const address = (o.delivery_address || '').toLowerCase();
        const driver = (o.driver_name || '').toLowerCase();
        const truckNo = (o.truck_number || '').toLowerCase();
        const supervisor = (o.supervised_by || '').toLowerCase();
        return (
          ref.includes(q) || product.includes(q) || customer.includes(q) ||
          state.includes(q) || destination.includes(q) || buyer.includes(q) ||
          address.includes(q) || driver.includes(q) || truckNo.includes(q) ||
          supervisor.includes(q) || String(o.id).includes(q)
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
    const totalQty = orders.reduce((sum, o) => sum + Number(o.quantity || 0), 0);
    const revenue = orders
      .filter((o) => o.status === 'sold')
      .reduce((sum, o) => sum + Number(o.total_price || 0), 0);

    return [
      { title: 'Total Orders', value: String(total), icon: <Package size={20} />, tone: 'neutral' as const },
      { title: 'Total Volume', value: `${totalQty.toLocaleString()} L`, icon: <Fuel size={20} />, tone: 'neutral' as const },
      { title: 'Awaiting Ticket', value: String(awaiting), icon: <Clock size={20} />, tone: 'amber' as const },
      { title: 'Loaded & Dispatched', value: String(loaded), icon: <Truck size={20} />, tone: 'neutral' as const },
      { title: 'Sold', value: String(sold), icon: <CheckCircle size={20} />, tone: 'green' as const },
      {
        title: 'Revenue',
        value: revenue > 0 ? `₦${revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '₦0',
        icon: <Banknote size={20} />,
        tone: revenue > 0 ? 'green' as const : 'neutral' as const,
      },
    ];
  }, [orders]);

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
      'Sales Rep': o.supervised_by || '',
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
    XLSX.utils.book_append_sheet(wb, ws, 'Delivery Records');
    XLSX.writeFile(wb, 'DELIVERY-RECORDS-REPORT.xlsx');
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
              title="Delivery Records"
              description="Overview of all truck-out and delivery orders — track dispatches, sales, and revenue."
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
                    placeholder="Search by product, driver, truck, buyer, state…"
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
                  <p className="text-sm text-slate-500 mt-1">{error instanceof Error ? error.message : 'Unknown error'}</p>
                  <Button variant="outline" className="mt-4" onClick={() => refetch()}>Retry</Button>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-10 text-center">
                  <Package className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No orders found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {orders.length > 0 ? 'Try adjusting your filters.' : 'No delivery orders have been created yet.'}
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
                        <TableHead className="font-semibold text-slate-700">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => {
                        const ref = getOrderReference(order) || `#${order.id}`;
                        const productName = order.products?.[0]?.name || '—';
                        const qty = formatQuantity(order.quantity);
                        const state = order.state || '—';
                        const totalPrice = formatCurrency(order.total_price);
                        const dateStr = order.created_at ? format(new Date(order.created_at), 'dd MMM yyyy') : '—';
                        const hasSaleInfo = !!order.sold_to_name;

                        return (
                          <TableRow key={order.id} className="hover:bg-slate-50/60 transition-colors">
                            <TableCell className="text-sm font-semibold text-slate-800">{ref}</TableCell>
                            <TableCell className="text-sm">{productName}</TableCell>
                            <TableCell className="text-sm text-right font-semibold">{qty}</TableCell>
                            <TableCell className="text-sm">{state}</TableCell>
                            <TableCell className="text-sm">
                              {order.destination_state
                                ? `${order.destination_state}${order.destination_town ? `, ${order.destination_town}` : ''}`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-sm"><span className="font-semibold text-green-800">{order.truck_number}</span></TableCell>
                            <TableCell className="text-sm">
                              <span className="font-semibold">{order.driver_name}</span>
                              <br /><span className="text-xs text-slate-600">{order.driver_phone}</span>
                            </TableCell>
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
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-xs"
                                onClick={() => setDetailOrder(order)}
                              >
                                <Eye size={14} />
                                View
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

            {!isLoading && filteredOrders.length > 0 && (
              <div className="text-sm text-slate-500 text-right">
                Showing {filteredOrders.length} of {orders.length} order{orders.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Detail View Dialog ──────────────────────────────────────── */}
      <Dialog open={!!detailOrder} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-slate-100 p-2 rounded-lg">
                <Truck className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Order Details</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  {detailOrder ? (getOrderReference(detailOrder) || `#${detailOrder.id}`) : ''}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Full details for this delivery order
            </DialogDescription>
          </DialogHeader>

          {detailOrder && (
            <div className="space-y-4 py-2">
              {/* Order info */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <h3 className="font-semibold text-slate-700 mb-2">Order Info</h3>
                <DetailRow label="Product" value={detailOrder.products?.[0]?.name || '—'} />
                <DetailRow label="Quantity" value={`${formatQuantity(detailOrder.quantity)} L`} />
                <DetailRow label="Loading Depot" value={detailOrder.state || '—'} />
                <DetailRow label="Destination" value={
                  detailOrder.destination_state
                    ? `${detailOrder.destination_state}${detailOrder.destination_town ? `, ${detailOrder.destination_town}` : ''}`
                    : '—'
                } />
                <DetailRow label="Status" value={getStatusText(detailOrder.status)} />
                <DetailRow label="Created" value={detailOrder.created_at ? format(new Date(detailOrder.created_at), 'dd MMM yyyy, HH:mm') : '—'} />
                {detailOrder.notes && <DetailRow label="Notes" value={detailOrder.notes} />}
              </div>

              {/* Transport info */}
              <div className="bg-blue-50 rounded-lg p-4 space-y-2 text-sm">
                <h3 className="font-semibold text-blue-700 mb-2">Transport & Dispatch</h3>
                <DetailRow label="Driver" value={detailOrder.driver_name || '—'} />
                <DetailRow label="Driver Phone" value={detailOrder.driver_phone || '—'} />
                <DetailRow label="Truck Number" value={detailOrder.truck_number || '—'} />
                <DetailRow label="Sales Rep" value={detailOrder.supervised_by || '—'} />
                <DetailRow label="Loading Date" value={detailOrder.loading_date || '—'} />
              </div>

              {/* Sale info (only if sold) */}
              {detailOrder.sold_to_name && (
                <div className="bg-emerald-50 rounded-lg p-4 space-y-2 text-sm">
                  <h3 className="font-semibold text-emerald-700 mb-2">Sale Details</h3>
                  <DetailRow label="Buyer" value={detailOrder.sold_to_name} />
                  <DetailRow label="Buyer Phone" value={detailOrder.sold_to_phone || '—'} />
                  <DetailRow label="Delivery Address" value={detailOrder.delivery_address || '—'} />
                  <DetailRow label="Unit Price" value={formatCurrency(detailOrder.products?.[0]?.unit_price)} />
                  <DetailRow label="Total Price" value={formatCurrency(detailOrder.total_price)} />
                  {detailOrder.sold_at && (
                    <DetailRow label="Sold Date" value={format(new Date(detailOrder.sold_at), 'dd MMM yyyy, HH:mm')} />
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Simple label-value row for the detail dialog */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
