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
import { Plus, Trash2, AlertTriangle, CheckCircle2, RefreshCw, Warehouse, TrendingDown, TrendingUp, Package } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { apiClient } from '@/api/client';

interface LPGPlant { id: number; name: string }

interface LPGStockEntry {
  id: number;
  plant: number;
  plant_name?: string | null;
  date: string;
  opening_stock_kg: string | number;
  received_kg: string | number;
  sold_kg: string | number;
  closing_stock_kg: string | number;
  recorded_by_name?: string | null;
  remarks?: string | null;
}

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtN = (n: number) => n.toLocaleString('en-NG', { maximumFractionDigits: 2 });
const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return iso; }
};
const todayStr = () => new Date().toISOString().slice(0, 10);

const AddStockDialog = ({
  open, onClose, onSaved, plants,
}: { open: boolean; onClose: () => void; onSaved: () => void; plants: LPGPlant[] }) => {
  const [plantId, setPlantId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [opening, setOpening] = useState('');
  const [received, setReceived] = useState('');
  const [sold, setSold] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closingPreview = toNum(opening) + toNum(received) - toNum(sold);

  const reset = () => { setPlantId(''); setDate(todayStr()); setOpening(''); setReceived(''); setSold(''); setRemarks(''); setError(null); };

  const handleSave = async () => {
    if (!plantId) { setError('Select a plant.'); return; }
    setSaving(true);
    setError(null);
    try {
      await apiClient.admin.addLPGStockEntry({
        plant: Number(plantId), date, opening_stock_kg: toNum(opening),
        received_kg: toNum(received), sold_kg: toNum(sold), remarks: remarks || undefined,
      });
      onSaved();
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stock entry. (A plant can only have one entry per day.)');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100"><Warehouse className="w-5 h-5 text-blue-600" /></div>
            <h2 className="text-lg font-semibold">Record Stock Movement</h2>
          </DialogTitle>
          <DialogDescription className="sr-only">Record a day's stock entry for a plant</DialogDescription>
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
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Opening (kg)</label>
              <Input type="number" value={opening} onChange={e => setOpening(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Received (kg)</label>
              <Input type="number" value={received} onChange={e => setReceived(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Sold (kg)</label>
              <Input type="number" value={sold} onChange={e => setSold(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-slate-500">Closing Stock (auto-calculated)</span>
            <span className="font-bold text-slate-900">{fmtN(closingPreview)} kg</span>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Remarks</label>
            <Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional" className="h-9 text-sm" />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => { reset(); onClose(); }} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Save Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function LPGStockRegister() {
  const queryClient = useQueryClient();
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [plantFilter, setPlantFilter] = useState('');

  const { data: plantsData } = useQuery({
    queryKey: ['lpg-plants'],
    queryFn: () => apiClient.admin.getLPGPlants({}),
  });
  const plants: LPGPlant[] = useMemo(() => (Array.isArray(plantsData) ? plantsData : []), [plantsData]);

  const { data: stockData, isLoading: stockLoading, refetch: refetchStock } = useQuery({
    queryKey: ['lpg-stock', plantFilter],
    queryFn: () => apiClient.admin.getLPGStockEntries({ plant: plantFilter || undefined, page_size: 100 }),
  });
  const stockEntries: LPGStockEntry[] = stockData?.results || [];

  const refetchAll = () => {
    refetchStock();
    queryClient.invalidateQueries({ queryKey: ['lpg-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['lpg-plants'] });
  };

  const summary = useMemo(() => {
    const totalReceived = stockEntries.reduce((sum, e) => sum + toNum(e.received_kg), 0);
    const totalSold = stockEntries.reduce((sum, e) => sum + toNum(e.sold_kg), 0);
    const totalClosing = stockEntries.reduce((sum, e) => sum + toNum(e.closing_stock_kg), 0);
    return { count: stockEntries.length, totalReceived, totalSold, totalClosing };
  }, [stockEntries]);

  const handleDeleteStock = async (id: number) => {
    if (!confirm('Delete this stock entry?')) return;
    try { await apiClient.admin.deleteLPGStockEntry(id); refetchAll(); } catch (err) { alert(err instanceof Error ? err.message : 'Failed to delete.'); }
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">
            <PageHeader title="LPG Stock Register" description="Daily opening/received/sold stock movement per plant." />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-50"><Warehouse size={18} className="text-orange-600" /></div>
                <div><p className="text-xs text-slate-500">Entries</p><p className="font-bold text-slate-900 text-lg">{summary.count}</p></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50"><TrendingUp size={18} className="text-emerald-600" /></div>
                <div><p className="text-xs text-slate-500">Total Received</p><p className="font-bold text-slate-900 text-lg">{fmtN(summary.totalReceived)} kg</p></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50"><TrendingDown size={18} className="text-amber-600" /></div>
                <div><p className="text-xs text-slate-500">Total Sold</p><p className="font-bold text-slate-900 text-lg">{fmtN(summary.totalSold)} kg</p></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50"><Package size={18} className="text-blue-600" /></div>
                <div><p className="text-xs text-slate-500">Total Closing Stock</p><p className="font-bold text-slate-900 text-lg">{fmtN(summary.totalClosing)} kg</p></div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">Stock Register</p>
                <div className="flex items-center gap-2">
                  <select aria-label="Filter by plant" value={plantFilter} onChange={e => setPlantFilter(e.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs">
                    <option value="">All Plants</option>
                    {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Button size="sm" className="gap-2" onClick={() => setAddStockOpen(true)}>
                    <Plus size={14} /> Record Stock
                  </Button>
                </div>
              </div>
              {stockLoading ? (
                <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
              ) : stockEntries.length === 0 ? (
                <p className="p-10 text-center text-sm text-slate-400">No stock entries yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead>Date</TableHead>
                        <TableHead>Plant</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead className="text-right">Sold</TableHead>
                        <TableHead className="text-right">Closing</TableHead>
                        <TableHead>Recorded By</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockEntries.map(e => (
                        <TableRow key={e.id} className="hover:bg-slate-50/60">
                          <TableCell className="text-slate-600 whitespace-nowrap">{fmtDate(e.date)}</TableCell>
                          <TableCell className="font-medium text-slate-800">{e.plant_name}</TableCell>
                          <TableCell className="text-right text-slate-600">{fmtN(toNum(e.opening_stock_kg))}</TableCell>
                          <TableCell className="text-right text-emerald-700">+{fmtN(toNum(e.received_kg))}</TableCell>
                          <TableCell className="text-right text-amber-700">-{fmtN(toNum(e.sold_kg))}</TableCell>
                          <TableCell className="text-right font-bold text-slate-900">{fmtN(toNum(e.closing_stock_kg))} kg</TableCell>
                          <TableCell className="text-xs text-slate-500">{e.recorded_by_name || '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteStock(e.id)}>
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

      <AddStockDialog open={addStockOpen} onClose={() => setAddStockOpen(false)} onSaved={refetchAll} plants={plants} />
    </div>
  );
}
