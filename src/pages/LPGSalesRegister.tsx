import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2, AlertTriangle, CheckCircle2, RefreshCw, Receipt, TrendingUp, Package, Wallet } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { apiClient } from '@/api/client';

interface LPGPlant { id: number; name: string }

interface LPGSale {
  id: number;
  plant: number;
  plant_name?: string | null;
  date: string;
  customer_name?: string | null;
  kg: string | number;
  price_per_kg: string | number;
  amount: string | number;
  payment_method: string;
  invoice_number?: string | null;
  cashier_name?: string | null;
}

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtN = (n: number) => n.toLocaleString('en-NG', { maximumFractionDigits: 2 });
const fmtMoney = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return iso; }
};
const todayStr = () => new Date().toISOString().slice(0, 10);

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Bank Transfer' },
  { value: 'pos', label: 'POS' },
  { value: 'credit', label: 'Credit' },
];

const AddSaleDialog = ({
  open, onClose, onSaved, plants,
}: { open: boolean; onClose: () => void; onSaved: () => void; plants: LPGPlant[] }) => {
  const [plantId, setPlantId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [customer, setCustomer] = useState('');
  const [kg, setKg] = useState('');
  const [price, setPrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [invoice, setInvoice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountPreview = toNum(kg) * toNum(price);

  const reset = () => {
    setPlantId(''); setDate(todayStr()); setCustomer(''); setKg(''); setPrice('');
    setPaymentMethod('cash'); setInvoice(''); setError(null);
  };

  const handleSave = async () => {
    if (!plantId || !kg || !price) { setError('Plant, kg, and price are required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await apiClient.admin.addLPGSale({
        plant: Number(plantId), date, customer_name: customer || undefined,
        kg: toNum(kg), price_per_kg: toNum(price), payment_method: paymentMethod,
        invoice_number: invoice || undefined,
      });
      onSaved();
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sale.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100"><Receipt className="w-5 h-5 text-emerald-600" /></div>
            <h2 className="text-lg font-semibold">Record Sale</h2>
          </DialogTitle>
          <DialogDescription className="sr-only">Record a new LPG sale</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Plant *</label>
              <select aria-label="Plant" value={plantId} onChange={e => setPlantId(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
                <option value="">Select…</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Date *</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Customer</label>
            <Input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Optional" className="h-9 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Quantity (kg) *</label>
              <Input type="number" value={kg} onChange={e => setKg(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Price per kg (₦) *</label>
              <Input type="number" value={price} onChange={e => setPrice(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-slate-500">Amount (auto-calculated)</span>
            <span className="font-bold text-slate-900">{fmtMoney(amountPreview)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Payment Method</label>
              <select aria-label="Payment method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Invoice No.</label>
              <Input value={invoice} onChange={e => setInvoice(e.target.value)} placeholder="Optional" className="h-9 text-sm" />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => { reset(); onClose(); }} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Save Sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function LPGSalesRegister() {
  const queryClient = useQueryClient();
  const [addSaleOpen, setAddSaleOpen] = useState(false);
  const [plantFilter, setPlantFilter] = useState('');

  const { data: plantsData } = useQuery({
    queryKey: ['lpg-plants'],
    queryFn: () => apiClient.admin.getLPGPlants({}),
  });
  const plants: LPGPlant[] = useMemo(() => (Array.isArray(plantsData) ? plantsData : []), [plantsData]);

  const { data: salesData, isLoading: salesLoading, refetch: refetchSales } = useQuery({
    queryKey: ['lpg-sales', plantFilter],
    queryFn: () => apiClient.admin.getLPGSales({ plant: plantFilter || undefined, page_size: 100 }),
  });
  const salesEntries: LPGSale[] = salesData?.results || [];

  const refetchAll = () => {
    refetchSales();
    queryClient.invalidateQueries({ queryKey: ['lpg-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['lpg-plants'] });
  };

  const summary = useMemo(() => {
    const totalKg = salesEntries.reduce((sum, s) => sum + toNum(s.kg), 0);
    const totalRevenue = salesEntries.reduce((sum, s) => sum + toNum(s.amount), 0);
    return { count: salesEntries.length, totalKg, totalRevenue };
  }, [salesEntries]);

  const handleDeleteSale = async (id: number) => {
    if (!confirm('Delete this sale?')) return;
    try { await apiClient.admin.deleteLPGSale(id); refetchAll(); } catch (err) { alert(err instanceof Error ? err.message : 'Failed to delete.'); }
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">
            <PageHeader title="LPG Sales Register" description="Daily sales transactions, revenue, and payment method." />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-50"><Receipt size={18} className="text-purple-600" /></div>
                <div><p className="text-xs text-slate-500">Transactions</p><p className="font-bold text-slate-900 text-lg">{summary.count}</p></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50"><Package size={18} className="text-blue-600" /></div>
                <div><p className="text-xs text-slate-500">Total Kg Sold</p><p className="font-bold text-slate-900 text-lg">{fmtN(summary.totalKg)} kg</p></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50"><Wallet size={18} className="text-emerald-600" /></div>
                <div><p className="text-xs text-slate-500">Total Revenue</p><p className="font-bold text-slate-900 text-lg">{fmtMoney(summary.totalRevenue)}</p></div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">Sales Register</p>
                <div className="flex items-center gap-2">
                  <select aria-label="Filter by plant" value={plantFilter} onChange={e => setPlantFilter(e.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs">
                    <option value="">All Plants</option>
                    {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Button size="sm" className="gap-2" onClick={() => setAddSaleOpen(true)}>
                    <Plus size={14} /> Record Sale
                  </Button>
                </div>
              </div>
              {salesLoading ? (
                <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
              ) : salesEntries.length === 0 ? (
                <p className="p-10 text-center text-sm text-slate-400">No sales recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead>Date</TableHead>
                        <TableHead>Plant</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Kg</TableHead>
                        <TableHead className="text-right">Price/Kg</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesEntries.map(s => (
                        <TableRow key={s.id} className="hover:bg-slate-50/60">
                          <TableCell className="text-slate-600 whitespace-nowrap">{fmtDate(s.date)}</TableCell>
                          <TableCell className="font-medium text-slate-800">{s.plant_name}</TableCell>
                          <TableCell className="text-slate-700">{s.customer_name || '—'}</TableCell>
                          <TableCell className="text-right text-slate-600">{fmtN(toNum(s.kg))}</TableCell>
                          <TableCell className="text-right text-slate-600">{fmtMoney(toNum(s.price_per_kg))}</TableCell>
                          <TableCell className="text-right font-bold text-slate-900">{fmtMoney(toNum(s.amount))}</TableCell>
                          <TableCell className="text-xs text-slate-500 capitalize">{s.payment_method}</TableCell>
                          <TableCell className="text-xs text-slate-500 font-mono">{s.invoice_number || '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteSale(s.id)}>
                              <Trash2 size={13} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AddSaleDialog open={addSaleOpen} onClose={() => setAddSaleOpen(false)} onSaved={refetchAll} plants={plants} />
    </div>
  );
}
