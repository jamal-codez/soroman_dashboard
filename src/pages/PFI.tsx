import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Download, Plus, Search } from 'lucide-react';
import { apiClient } from '@/api/client';

type PfiStatus = 'active' | 'finished';

type BackendPfi = {
  id: number;
  pfi_number: string;
  status: PfiStatus;
  location?: string | number;
  product?: string | number;
  location_name?: string;
  product_name?: string;
  starting_qty_litres?: number;
  sold_qty_litres?: number;
  sold_qty?: number;
  created_at?: string;
  createdAt?: string;
  finished_at?: string | null;
  finishedAt?: string | null;

  // Backend-computed totals from orders assigned to this PFI
  orders_count?: number;
  total_quantity_litres?: number | string;

  // Optional financial fields (if backend provides)
  total_amount?: number | string;
  totalAmount?: number | string;
  amount?: number | string;
  unit_price?: number | string;
  unitPrice?: number | string;
};

type BackendProduct = { id: number; name: string };

type BackendLocation = {
  id: number;
  name?: string;
  state_name?: string;
  state?: string;
};

const fmt = (n: number) => n.toLocaleString();

const coerceNumber = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const formatCurrency = (v: number): string => {
  const n = Number.isFinite(v) ? v : 0;
  return `₦${n.toLocaleString()}`;
};

const coerceAmount = (p: BackendPfi, soldLitres: number): number => {
  // Prefer backend-computed `total_amount` (sum of order.total_price for eligible orders).
  const direct = p.total_amount ?? p.totalAmount ?? p.amount;
  const directNum = Number(String(direct ?? '').replace(/,/g, ''));
  if (Number.isFinite(directNum) && directNum >= 0) return directNum;

  // Fallback only if backend doesn't provide totals.
  const unit = p.unit_price ?? p.unitPrice;
  const unitNum = Number(String(unit ?? '').replace(/,/g, ''));
  if (Number.isFinite(unitNum) && unitNum > 0) return soldLitres * unitNum;

  return 0;
};

const coerceSoldLitres = (p: BackendPfi): number => {
  // Prefer backend total from orders (eligible orders sum)
  const fromOrders = p.total_quantity_litres;
  const n = Number(String(fromOrders ?? '').replace(/,/g, ''));
  if (Number.isFinite(n) && n >= 0) return n;
  return coerceNumber(p.sold_qty_litres ?? p.sold_qty);
};

const exportPfiCsv = (pfis: BackendPfi[]) => {
  const headers = [
    'PFI',
    'Location',
    'Product',
    'Starting (L)',
    'Sold (L)',
    'Remaining (L)',
    'Orders Count',
    'Total Amount',
    'Status',
    'Created At',
    'Finished At',
  ];
  const rows = pfis.map((p) => {
    const starting = coerceNumber(p.starting_qty_litres);
    const sold = coerceSoldLitres(p);
    const remaining = Math.max(0, starting - sold);
    const totalAmount = coerceAmount(p, sold);
    const ordersCount = Number.isFinite(Number(p.orders_count)) ? Number(p.orders_count) : 0;

    const loc = String(p.location_name ?? p.location ?? '');
    const prod = String(p.product_name ?? p.product ?? '');
    const createdAt = String(p.created_at ?? p.createdAt ?? '');
    const finishedAt = String(p.finished_at ?? p.finishedAt ?? '');

    return [
      p.pfi_number,
      loc,
      prod,
      String(starting),
      String(sold),
      String(remaining),
      String(ordersCount),
      String(totalAmount),
      p.status,
      createdAt,
      finishedAt,
    ];
  });

  const csv = [headers, ...rows]
    .map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pfis.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

type FinishConfirmState = {
  open: boolean;
  pfiId?: number;
};

type PfiMetric = 'totalSold' | 'remaining' | 'todaySold';

type BackendErrorBody = Record<string, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const extractFieldErrors = (msg: string): { status?: number; body?: BackendErrorBody; human?: string } => {
  // apiClient.safeReadError embeds JSON into message sometimes, but often it's plain text.
  // We just return the raw message for fallback.
  return { human: msg };
};

export default function PFIPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | PfiStatus>('all');
  const [metric, setMetric] = useState<PfiMetric>('todaySold');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    pfiNumber: '',
    location: '',
    product: '',
    startingQty: '',
    notes: '',
  });
  const [createErrors, setCreateErrors] = useState<{ conflict?: string; fields?: Record<string, string[]>; message?: string }>({});

  const [finishConfirm, setFinishConfirm] = useState<FinishConfirmState>({ open: false });

  const pfiQuery = useQuery<{ results?: BackendPfi[] } & Record<string, unknown>>({
    queryKey: ['pfis'],
    queryFn: async () => apiClient.admin.getPfis({ page: 1, page_size: 1000 }),
    staleTime: 30_000,
    retry: 1,
  });

  const productsQuery = useQuery<{ results?: BackendProduct[] } & Record<string, unknown>>({
    queryKey: ['products'],
    queryFn: async () => apiClient.admin.getProducts({ page: 1, page_size: 500 }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const productOptions = useMemo(() => {
    const rec = (productsQuery.data && typeof productsQuery.data === 'object') ? (productsQuery.data as Record<string, unknown>) : null;
    const raw = (rec?.results as unknown) ?? (Array.isArray(productsQuery.data) ? productsQuery.data : []);
    const list = (raw || []) as BackendProduct[];
    return list
      .filter((p) => p && typeof p.id === 'number' && typeof p.name === 'string')
      .map((p) => ({ id: p.id, label: p.name }));
  }, [productsQuery.data]);

  const locationsQuery = useQuery<{ results?: BackendLocation[] } & Record<string, unknown>>({
    queryKey: ['locations'],
    queryFn: async () => apiClient.admin.getStates(),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const locationOptions = useMemo(() => {
    const rec = (locationsQuery.data && typeof locationsQuery.data === 'object') ? (locationsQuery.data as Record<string, unknown>) : null;
    const raw = (rec?.results as unknown) ?? (Array.isArray(locationsQuery.data) ? locationsQuery.data : []);
    const list = (raw || []) as BackendLocation[];
    return list
      .filter((l) => l && typeof l.id === 'number')
      .map((l) => ({
        id: l.id,
        label: String(l.name ?? l.state_name ?? l.state ?? `Location ${l.id}`),
      }));
  }, [locationsQuery.data]);

  const pfis: BackendPfi[] = useMemo(() => {
    const rec = (pfiQuery.data && typeof pfiQuery.data === 'object') ? (pfiQuery.data as Record<string, unknown>) : null;
    const raw = (rec?.results as unknown) ?? (Array.isArray(pfiQuery.data) ? pfiQuery.data : []);
    return (raw || []) as BackendPfi[];
  }, [pfiQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pfis
      .filter((p) => (status === 'all' ? true : p.status === status))
      .filter((p) => {
        if (!q) return true;
        const loc = String(p.location_name ?? p.location ?? '').toLowerCase();
        const prod = String(p.product_name ?? p.product ?? '').toLowerCase();
        return (
          String(p.pfi_number || '').toLowerCase().includes(q) ||
          loc.includes(q) ||
          prod.includes(q)
        );
      });
  }, [pfis, search, status]);

  const onCreate = async () => {
    setCreateErrors({});

    const pfi_number = createForm.pfiNumber.trim();
    const location = Number(String(createForm.location).trim());
    const product = Number(String(createForm.product).trim());
    const starting_qty_litres = String(createForm.startingQty).replace(/,/g, '').trim();
    const notes = createForm.notes.trim();

    const startingAsNumber = Number(starting_qty_litres);

    if (!pfi_number || !Number.isFinite(location) || !Number.isFinite(product) || !Number.isFinite(startingAsNumber) || startingAsNumber <= 0) {
      toast({
        title: 'Missing information',
        description: 'Provide PFI number, location, product, and valid starting quantity.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await apiClient.admin.createPfi({
        pfi_number,
        location,
        product,
        starting_qty_litres: `${startingAsNumber.toFixed(2)}`,
        notes: notes || undefined,
      });

      setCreateOpen(false);
      setCreateForm({ pfiNumber: '', location: '', product: '', startingQty: '', notes: '' });
      await queryClient.invalidateQueries({ queryKey: ['pfis'] });
      toast({ title: 'PFI created', description: `${pfi_number} created.` });
    } catch (e) {
      const err = e as Error;
      const message = err?.message || 'Request failed';

      // Best-effort parsing: include status code in client error messages when available.
      // apiClient.createPfi throws safeReadError() only, so we detect common cases.
      if (message.includes('409') || /conflict/i.test(message)) {
        setCreateErrors({ conflict: 'Active PFI already exists for that location + product.' });
        return;
      }

      // If backend returns serializer-style text, show it.
      // If it returns JSON-like text, try parse.
      let parsedFields: Record<string, string[]> | undefined;
      const jsonStart = message.indexOf('{');
      if (jsonStart >= 0) {
        const maybeJson = message.slice(jsonStart);
        try {
          const body = JSON.parse(maybeJson) as unknown;
          if (isRecord(body)) {
            const fieldErrors: Record<string, string[]> = {};
            Object.entries(body).forEach(([k, v]) => {
              if (Array.isArray(v)) fieldErrors[k] = v.map((x) => String(x));
              else if (typeof v === 'string') fieldErrors[k] = [v];
            });
            if (Object.keys(fieldErrors).length) parsedFields = fieldErrors;
          }
        } catch {
          // ignore
        }
      }

      setCreateErrors({ fields: parsedFields, message: parsedFields ? undefined : message });

      toast({
        title: 'Failed to create PFI',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const finishPfi = async (id: number) => {
    try {
      await apiClient.admin.finishPfi(id);
      await queryClient.invalidateQueries({ queryKey: ['pfis'] });
      toast({ title: 'PFI finished', description: 'This PFI is now marked as finished.' });
    } catch (e) {
      toast({
        title: 'Failed to finish PFI',
        description: (e as Error)?.message || 'Request failed',
        variant: 'destructive',
      });
    }
  };

  const selectedFinishPfi = useMemo(
    () => pfis.find((p) => p.id === finishConfirm.pfiId),
    [finishConfirm.pfiId, pfis]
  );

  const metricLabel: Record<PfiMetric, string> = {
    todaySold: "Today's Sales",
    totalSold: 'Total Sales',
    remaining: 'Remaining',
  };

  const metricValue = (p: BackendPfi) => {
    const starting = coerceNumber(p.starting_qty_litres);
    const sold = coerceSoldLitres(p);
    const remaining = Math.max(0, starting - sold);

    // Backend movements/today-sold aggregates not exposed yet; show 0 for today.
    if (metric === 'todaySold') return 0;
    if (metric === 'totalSold') return sold;
    return remaining;
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
              title="PFI Tracking"
              description="Track PFIs by location and product, monitor sold and remaining litres, and add new PFIs."
              actions={
                <div className="flex gap-2">
                  {/* <Button variant="outline" onClick={() => exportPfiCsv(filtered)}>
                    <Download className="mr-1" size={16} /> Export CSV
                  </Button> */}
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-1" size={16} /> Add PFI
                  </Button>
                </div>
              }
            />

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="grid grid-cols-2 lg:grid-cols-2 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    className="pl-10 h-11"
                    placeholder="Search by PFI, location, product…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <Select value={status} onValueChange={(v: 'all' | PfiStatus) => setStatus(v)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="finished">Finished</SelectItem>
                  </SelectContent>
                </Select>

                {/* <Select value={metric} onValueChange={(v: PfiMetric) => setMetric(v)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Metric" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todaySold">Today's Sales</SelectItem>
                    <SelectItem value="totalSold">Total Sales</SelectItem>
                    <SelectItem value="remaining">Remaining</SelectItem>
                  </SelectContent>
                </Select> */}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((p) => {
                const starting = coerceNumber(p.starting_qty_litres);
                const sold = coerceSoldLitres(p);
                const remaining = Math.max(0, starting - sold);
                const totalAmount = coerceAmount(p, sold);
                const pct = starting > 0 ? Math.min(100, Math.round((sold / starting) * 100)) : 0;

                const isActive = p.status === 'active';
                const cardAccent = isActive ? 'border-emerald-200' : 'border-rose-200';
                const headerBg = isActive ? 'bg-emerald-50' : 'bg-rose-50';
                const badgeClass = isActive
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-rose-600 text-white border-rose-600';

                const locationLabel = String(p.location_name ?? p.location ?? '');
                const productLabel = String(p.product_name ?? p.product ?? '');
                const createdAt = p.created_at ?? p.createdAt;
                const finishedAt = p.finished_at ?? p.finishedAt;

                return (
                  <Card key={p.id} className={`border ${cardAccent} overflow-hidden`}>
                    <CardHeader className={`pb-3 ${headerBg}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mt-1 text-lg font-bold text-slate-900 truncate">
                            {p.pfi_number} - {productLabel}
                          </div>
                          <CardTitle className="text-sm font-normal leading-tight truncate">{locationLabel}</CardTitle>
                        </div>

                        <Badge variant="outline" className={badgeClass}>
                          {isActive ? 'ACTIVE' : 'FINISHED'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-slate-700">{metricLabel[metric]}</div>
                        <div className={`text-sm font-semibold ${isActive ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {fmt(metricValue(p))} Litres
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs text-slate-600">
                          {/* <span>Sales Progress</span> */}
                          <span className='justify-end'>{pct}%</span>
                        </div>
                        <Progress value={pct} className={isActive ? 'bg-emerald-100' : 'bg-rose-100'} />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border border-slate-200 p-2">
                          <div className="text-[11px] text-slate-600">Total Quantity</div>
                          <div className="text-sm font-semibold">{fmt(starting)} Litres</div>
                        </div>
                        <div className="rounded-md border border-slate-200 p-2">
                          <div className="text-[11px] text-slate-600">Qty Sold</div>
                          <div className="text-sm font-semibold">{fmt(sold)} Litres</div>
                        </div>

                        <div className="rounded-md border border-slate-200 p-2">
                          <div className="text-[11px] text-slate-600">Orders</div>
                          <div className="text-sm font-semibold">{fmt(Number(p.orders_count ?? 0))}</div>
                        </div>

                        <div className="rounded-md border border-slate-200 p-2">
                          <div className="text-[11px] text-slate-600">Remaining</div>
                          <div className={`text-sm font-semibold ${remaining > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {fmt(remaining)} Litres
                          </div>
                        </div>

                        <div className="rounded-md border border-slate-200 p-2">
                          <div className="text-[11px] text-slate-600">Total Amount</div>
                          <div className="text-sm font-semibold text-slate-900">{formatCurrency(totalAmount)}</div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant={isActive ? 'default' : 'outline'}
                          className="flex-1"
                          disabled={!isActive}
                          onClick={() => setFinishConfirm({ open: true, pfiId: p.id })}
                        >
                          Close PFI
                        </Button>
                        {/* <Button
                          className="flex-1"
                          variant="secondary"
                          onClick={() => {
                            toast({
                              title: 'Not wired yet',
                              description: 'PFI drilldown requires a backend endpoint for movements/orders by PFI.',
                            });
                          }}
                        >
                          View
                        </Button> */}
                      </div>

                      <div className="space-y-1 text-[11px] text-slate-500">
                        <div>Created: {createdAt ? new Date(createdAt).toLocaleString() : '-'}</div>
                        {p.status === 'finished' && finishedAt && (
                          <div>Finished: {new Date(String(finishedAt)).toLocaleString()}</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {filtered.length === 0 && (
                <div className="col-span-full text-center text-slate-500 py-10">
                  {pfiQuery.isLoading ? 'Loading PFIs…' : 'No PFIs found.'}
                </div>
              )}
            </div>

            <Dialog open={createOpen} onOpenChange={(open) => {
              setCreateOpen(open);
              if (open) setCreateErrors({});
            }}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create New PFI</DialogTitle>
                  {/* <DialogDescription>
                    Select a location and product from the backend lists. IDs are not hardcoded.
                  </DialogDescription> */}
                </DialogHeader>

                {createErrors.conflict ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {createErrors.conflict}
                  </div>
                ) : null}

                {createErrors.message ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {createErrors.message}
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="pfiNumber">PFI Name</Label>
                    <Input
                      id="pfiNumber"
                      placeholder="PFI 50"
                      value={createForm.pfiNumber}
                      onChange={(e) => setCreateForm((p) => ({ ...p, pfiNumber: e.target.value }))}
                    />
                    {createErrors.fields?.pfi_number?.length ? (
                      <div className="mt-1 text-xs text-red-600">{createErrors.fields.pfi_number.join(' ')}</div>
                    ) : null}
                  </div>

                  <div>
                    <Label htmlFor="location">Location</Label>
                    <select
                      id="location"
                      aria-label="Location"
                      className="w-full border border-gray-300 rounded px-3 py-2 h-11"
                      value={createForm.location}
                      onChange={(e) => setCreateForm((p) => ({ ...p, location: e.target.value }))}
                    >
                      <option value="">Select location</option>
                      {locationOptions.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    {locationsQuery.isError ? (
                      <div className="text-xs text-red-600 mt-1">Failed to load locations</div>
                    ) : null}
                    {createErrors.fields?.location?.length ? (
                      <div className="mt-1 text-xs text-red-600">{createErrors.fields.location.join(' ')}</div>
                    ) : null}
                  </div>

                  <div>
                    <Label htmlFor="product">Product</Label>
                    <select
                      id="product"
                      aria-label="Product"
                      className="w-full border border-gray-300 rounded px-3 py-2 h-11"
                      value={createForm.product}
                      onChange={(e) => setCreateForm((p) => ({ ...p, product: e.target.value }))}
                    >
                      <option value="">Select product</option>
                      {productOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    {productsQuery.isError ? (
                      <div className="text-xs text-red-600 mt-1">Failed to load products</div>
                    ) : null}
                    {createErrors.fields?.product?.length ? (
                      <div className="mt-1 text-xs text-red-600">{createErrors.fields.product.join(' ')}</div>
                    ) : null}
                  </div>

                  <div>
                    <Label htmlFor="startingQty">Starting Quantity (Litres)</Label>
                    <Input
                      id="startingQty"
                      inputMode="decimal"
                      placeholder="1000.00"
                      value={createForm.startingQty}
                      onChange={(e) => setCreateForm((p) => ({ ...p, startingQty: e.target.value }))}
                    />
                    {createErrors.fields?.starting_qty_litres?.length ? (
                      <div className="mt-1 text-xs text-red-600">{createErrors.fields.starting_qty_litres.join(' ')}</div>
                    ) : null}
                  </div>

                  {/* <div>
                    <Label htmlFor="notes">Notes (optional)</Label>
                    <Input
                      id="notes"
                      placeholder="optional"
                      value={createForm.notes}
                      onChange={(e) => setCreateForm((p) => ({ ...p, notes: e.target.value }))}
                    />
                    {createErrors.fields?.notes?.length ? (
                      <div className="mt-1 text-xs text-red-600">{createErrors.fields.notes.join(' ')}</div>
                    ) : null}
                  </div> */}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={onCreate}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={finishConfirm.open} onOpenChange={(open) => setFinishConfirm((s) => ({ ...s, open }))}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Finish PFI?</DialogTitle>
                </DialogHeader>

                <div className="space-y-2 text-sm text-slate-700">
                  <div>
                    This will mark the PFI as <span className="font-semibold">finished</span>.
                  </div>

                  {selectedFinishPfi && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="font-semibold text-slate-900 truncate">
                        {String(selectedFinishPfi.location_name ?? selectedFinishPfi.location ?? '-')}
                      </div>
                      <div className="text-slate-700 truncate">
                        {String(selectedFinishPfi.product_name ?? selectedFinishPfi.product ?? '-')}
                      </div>
                      <div className="text-slate-600 text-xs mt-1">{selectedFinishPfi.pfi_number}</div>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setFinishConfirm({ open: false })}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (finishConfirm.pfiId) void finishPfi(finishConfirm.pfiId);
                      setFinishConfirm({ open: false });
                    }}
                  >
                    Yes, finish
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
