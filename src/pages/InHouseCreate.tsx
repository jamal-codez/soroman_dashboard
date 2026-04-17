// Page for CREATING new in-house / truck-out delivery orders.
// Visible to: Admins (0,1) and Ticketing Officers (4).

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
  Plus, Search, Download, Loader2, Truck, Fuel, MapPin, Package,
  AlertCircle, CheckCircle, Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { getOrderReference } from '@/lib/orderReference';
import {
  type InHouseOrder, type InHouseOrderResponse, type State, type Product,
  getStatusText, getStatusClass,
  formatQuantity, formatWithCommas, stripCommas,
} from '@/lib/inHouseHelpers';

export default function InHouseCreate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Create dialog state ────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    product_id: '',
    quantity: '',
    state_id: '',
  });

  // ── Filters ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // ── Reference data ─────────────────────────────────────────────────
  const {
    data: statesRaw,
    isLoading: statesLoading,
    isError: statesError,
  } = useQuery<State[]>({
    queryKey: ['states'],
    queryFn: async () => {
      const res = await apiClient.admin.getStates();
      const arr = Array.isArray(res) ? res : Array.isArray(res?.results) ? res.results : [];
      return arr as State[];
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const states = useMemo(() => (statesRaw || []) as State[], [statesRaw]);
  const depots = useMemo(() => states.filter((s) => s.classifier?.toLowerCase() === 'depot'), [states]);

  const {
    data: productsRaw,
    isLoading: productsLoading,
    isError: productsError,
  } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      // Helper: normalise any API response into an array
      const toArr = (res: unknown): Product[] => {
        if (Array.isArray(res)) return res;
        const obj = res as Record<string, unknown> | null;
        if (obj && Array.isArray(obj.results)) return obj.results;
        return [];
      };

      // Try several endpoints in order — some may be restricted by role.
      const endpoints = [
        () => apiClient.admin.getProducts({ page_size: 100 }),
        () => apiClient.admin.getProductsInventory({ page_size: 100 }),
        () => apiClient.admin.getProductInventory(),
        () => apiClient.admin.getStatesPricing(),
      ];

      for (const fn of endpoints) {
        try {
          const res = await fn();
          const arr = toArr(res);
          if (arr.length > 0) {
            // getStatesPricing returns price objects with nested product data —
            // normalise them to { id, name } if needed.
            const first = arr[0] as Record<string, unknown>;
            if (first && first.product && typeof first.product === 'object') {
              // shape: { product: { id, name, ... }, price, state, ... }
              const seen = new Set<number>();
              return arr
                .map((item: Record<string, unknown>) => {
                  const p = item.product as Record<string, unknown>;
                  return p ? { id: Number(p.id), name: String(p.name || ''), abbreviation: p.abbreviation ? String(p.abbreviation) : undefined } : null;
                })
                .filter((p): p is Product => p !== null && !seen.has(p.id) && (seen.add(p.id), true));
            }
            return arr as Product[];
          }
        } catch {
          // this endpoint failed — try next
        }
      }

      return [];
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const products = useMemo(() => (productsRaw || []) as Product[], [productsRaw]);

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
        const state = (o.state || '').toLowerCase();
        return (
          ref.includes(q) || product.includes(q) ||
          state.includes(q) || String(o.id).includes(q)
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

    return [
      { title: 'Total Orders', value: String(total), icon: <Package size={20} />, tone: 'neutral' as const },
      // { title: 'Total Volume', value: `${totalQty.toLocaleString()} L`, icon: <Fuel size={20} />, tone: 'neutral' as const },
      { title: 'Awaiting Ticket', value: String(awaiting), icon: <Clock size={20} />, tone: 'amber' as const },
      { title: 'Loaded & Dispatched', value: String(loaded), icon: <Truck size={20} />, tone: 'neutral' as const },
      // { title: 'Sold', value: String(sold), icon: <CheckCircle size={20} />, tone: 'green' as const },
    ];
  }, [orders]);

  // ── Create order handler ───────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!form.product_id) {
      toast({ title: 'Product is required', description: 'Select a product to dispatch.', variant: 'destructive' });
      return;
    }
    if (!form.state_id) {
      toast({ title: 'Loading depot is required', description: 'Select the loading depot.', variant: 'destructive' });
      return;
    }
    const rawQty = Number(stripCommas(form.quantity));
    if (!rawQty || rawQty <= 0) {
      toast({ title: 'Quantity is required', description: 'Enter the volume in litres.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      await apiClient.admin.createInHouseOrder({
        product_id: Number(form.product_id),
        quantity: rawQty,
        state_id: Number(form.state_id),
        loading_date: format(new Date(), 'yyyy-MM-dd'),
      });
      toast({ title: 'Order Created', description: 'In-house order created successfully.' });
      setForm({
        product_id: '', quantity: '', state_id: '',
      });
      setCreateOpen(false);
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

  // ── Export ─────────────────────────────────────────────────────────
  const exportToExcel = useCallback(() => {
    const rows = filteredOrders.map((o) => ({
      Reference: getOrderReference(o) || String(o.id),
      Product: o.products?.[0]?.name || '',
      'Quantity (L)': Number(o.quantity || 0),
      'Loading Depot': o.state || '',
      Status: getStatusText(o.status),
      Date: o.created_at ? format(new Date(o.created_at), 'yyyy-MM-dd HH:mm') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Delivery Orders');
    XLSX.writeFile(wb, 'DELIVERY-ORDERS.xlsx');
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
              title="Truck-Out Orders"
              description="Create and dispatch truck-out orders for Soroman Trucks."
              actions={
                <>
                  <Button
                    className="gap-2"
                    onClick={() => {
                      setForm({
                        product_id: '', quantity: '', state_id: '',
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

            <SummaryCards cards={summaryCards} />

            {/* Toolbar */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search by product, driver, truck, state…"
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
                    {orders.length > 0 ? 'Try adjusting your filters.' : 'Click "Create Order" to create one.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700">Reference</TableHead>
                        <TableHead className="font-semibold text-slate-700">Product</TableHead>
                        <TableHead className="font-semibold text-slate-700">Quantity</TableHead>
                        <TableHead className="font-semibold text-slate-700">Depot</TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => {
                        const ref = getOrderReference(order) || `#${order.id}`;
                        const productName = order.products?.[0]?.name || '—';
                        const qty = formatQuantity(order.quantity);
                        const state = order.state || '—';
                        const dateStr = order.created_at ? format(new Date(order.created_at), 'dd MMM yyyy') : '—';

                        return (
                          <TableRow key={order.id} className="hover:bg-slate-50/60 transition-colors">
                            <TableCell className="text-sm font-semibold text-slate-800">{ref}</TableCell>
                            <TableCell className="text-sm">{productName}</TableCell>
                            <TableCell className="text-sm font-semibold">{qty} Litres</TableCell>
                            <TableCell className="text-sm">{state}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${getStatusClass(order.status)}`}>
                                {getStatusText(order.status)}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">{dateStr}</TableCell>
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

      {/* ─── Create In-House Order Dialog ──────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <Truck className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">New Truck-Out Order</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  Create and dispatch truck-out orders for Soroman Trucks
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
                <option value="">
                  {productsLoading
                    ? 'Loading products…'
                    : productsError
                      ? '⚠ Failed to load products'
                      : products.length === 0
                        ? 'No products available'
                        : 'Select product'}
                </option>
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
                  setForm((f) => ({ ...f, quantity: formatted }));
                }}
              />
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
                <option value="">
                  {statesLoading
                    ? 'Loading depots…'
                    : statesError
                      ? '⚠ Failed to load depots'
                      : depots.length === 0
                        ? 'No depots available'
                        : 'Select depot'}
                </option>
                {depots.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-2">
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {creating ? 'Creating…' : 'Create Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
