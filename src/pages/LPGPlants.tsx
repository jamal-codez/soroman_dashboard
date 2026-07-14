import { useEffect, useMemo, useState } from 'react';
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
import { Flame, Plus, Trash2, AlertTriangle, CheckCircle2, RefreshCw, Building2, Package, AlertOctagon, Pencil, Tag } from 'lucide-react';
import { apiClient } from '@/api/client';

interface LPGPlant {
  id: number;
  name: string;
  code?: string | null;
  location?: number | null;
  location_name?: string | null;
  capacity_kg?: string | number | null;
  low_stock_threshold_kg: string | number;
  price_per_kg?: string | number | null;
  bulk_threshold_kg?: string | number | null;
  is_active: boolean;
  latest_closing_stock_kg?: string | number | null;
}

interface StateOption {
  id: number;
  name: string;
}

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtN = (n: number) => n.toLocaleString('en-NG', { maximumFractionDigits: 2 });

const EMPTY_PLANT_FORM = {
  name: '', code: '', locationId: '', capacity: '', threshold: '5000', pricePerKg: '', bulkThreshold: '100',
};

/** Add when editTarget is null, otherwise edits that plant in place — same
 * fields either way, since price/threshold/code need to stay editable after
 * creation (prices change over time). */
const PlantFormDialog = ({
  open, onClose, onSaved, states, editTarget,
}: { open: boolean; onClose: () => void; onSaved: () => void; states: StateOption[]; editTarget: LPGPlant | null }) => {
  const [form, setForm] = useState(EMPTY_PLANT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editTarget) {
      setForm({
        name: editTarget.name,
        code: editTarget.code || '',
        locationId: editTarget.location ? String(editTarget.location) : '',
        capacity: editTarget.capacity_kg != null ? String(toNum(editTarget.capacity_kg)) : '',
        threshold: String(toNum(editTarget.low_stock_threshold_kg)),
        pricePerKg: editTarget.price_per_kg != null ? String(toNum(editTarget.price_per_kg)) : '',
        bulkThreshold: editTarget.bulk_threshold_kg != null ? String(toNum(editTarget.bulk_threshold_kg)) : '100',
      });
    } else {
      setForm(EMPTY_PLANT_FORM);
    }
    setError(null);
  }, [open, editTarget]);

  const set = (key: keyof typeof form) => (value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Plant name is required.'); return; }
    if (!form.code.trim()) { setError('Plant code is required (e.g. BAU for Bauchi).'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        location: form.locationId ? Number(form.locationId) : undefined,
        capacity_kg: form.capacity ? Number(form.capacity) : undefined,
        low_stock_threshold_kg: form.threshold ? Number(form.threshold) : undefined,
        price_per_kg: form.pricePerKg ? Number(form.pricePerKg) : undefined,
        bulk_threshold_kg: form.bulkThreshold ? Number(form.bulkThreshold) : undefined,
      };
      if (editTarget) {
        await apiClient.admin.updateLPGPlant(editTarget.id, payload);
      } else {
        await apiClient.admin.addLPGPlant(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plant.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100">
              {editTarget ? <Pencil className="w-5 h-5 text-orange-600" /> : <Flame className="w-5 h-5 text-orange-600" />}
            </div>
            <h2 className="text-lg font-semibold">{editTarget ? 'Edit LPG Plant' : 'Add LPG Plant'}</h2>
          </DialogTitle>
          <DialogDescription className="sr-only">{editTarget ? 'Edit this plant' : 'Add a new plant to the master list'}</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Plant Name *</label>
              <Input value={form.name} onChange={e => set('name')(e.target.value)} placeholder="e.g. Bauchi LPG Plant" className="h-9 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Code *</label>
              <Input value={form.code} onChange={e => set('code')(e.target.value.toUpperCase())} placeholder="BAU" maxLength={10} className="h-9 text-sm uppercase" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 -mt-2">Code prefixes receipt numbers, e.g. {form.code || 'BAU'}101.</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Location</label>
            <select aria-label="Plant location" value={form.locationId} onChange={e => set('locationId')(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
              <option value="">— None —</option>
              {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Capacity (kg)</label>
              <Input type="number" value={form.capacity} onChange={e => set('capacity')(e.target.value)} placeholder="Optional" className="h-9 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Low Stock Alert (kg)</label>
              <Input type="number" value={form.threshold} onChange={e => set('threshold')(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="h-px bg-slate-100" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Price per kg (₦)</label>
              <Input type="number" value={form.pricePerKg} onChange={e => set('pricePerKg')(e.target.value)} placeholder="Pre-fills the Sales Register" className="h-9 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Bulk Buyer Min. (kg)</label>
              <Input type="number" value={form.bulkThreshold} onChange={e => set('bulkThreshold')(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            {editTarget ? 'Save Changes' : 'Add Plant'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function LPGPlants() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LPGPlant | null>(null);
  const [deletePlant, setDeletePlant] = useState<LPGPlant | null>(null);

  const { data: plantsData, isLoading: plantsLoading, refetch: refetchPlants } = useQuery({
    queryKey: ['lpg-plants'],
    queryFn: () => apiClient.admin.getLPGPlants({}),
  });
  const plants: LPGPlant[] = useMemo(() => (Array.isArray(plantsData) ? plantsData : []), [plantsData]);

  const { data: statesData } = useQuery({
    queryKey: ['states-for-lpg'],
    queryFn: () => apiClient.admin.getStates(),
  });
  const states: StateOption[] = useMemo(() => {
    const raw = statesData;
    const list = Array.isArray(raw) ? raw : (raw?.results || []);
    return list as StateOption[];
  }, [statesData]);

  const refetchAll = () => {
    refetchPlants();
    queryClient.invalidateQueries({ queryKey: ['lpg-dashboard'] });
  };

  const summary = useMemo(() => {
    const activeCount = plants.filter(p => p.is_active).length;
    const totalStock = plants.reduce((sum, p) => sum + toNum(p.latest_closing_stock_kg), 0);
    const lowStockCount = plants.filter(p => p.latest_closing_stock_kg != null && toNum(p.latest_closing_stock_kg) < toNum(p.low_stock_threshold_kg)).length;
    return { total: plants.length, activeCount, totalStock, lowStockCount };
  }, [plants]);

  const handleDeletePlant = async () => {
    if (!deletePlant) return;
    try {
      await apiClient.admin.deleteLPGPlant(deletePlant.id);
      setDeletePlant(null);
      refetchAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete plant.');
    }
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">
            <PageHeader title="LPG Plants" description="Plant master list — name, location, capacity, status." />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-50"><Building2 size={18} className="text-orange-600" /></div>
                <div><p className="text-xs text-slate-500">Total Plants</p><p className="font-bold text-slate-900 text-lg">{summary.total}</p></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50"><CheckCircle2 size={18} className="text-emerald-600" /></div>
                <div><p className="text-xs text-slate-500">Active Plants</p><p className="font-bold text-slate-900 text-lg">{summary.activeCount}</p></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50"><Package size={18} className="text-blue-600" /></div>
                <div><p className="text-xs text-slate-500">Total Closing Stock</p><p className="font-bold text-slate-900 text-lg">{fmtN(summary.totalStock)} kg</p></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-50"><AlertOctagon size={18} className="text-red-600" /></div>
                <div><p className="text-xs text-slate-500">Low Stock Plants</p><p className="font-bold text-slate-900 text-lg">{summary.lowStockCount}</p></div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Plant Master List</p>
                <Button size="sm" className="gap-2" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
                  <Plus size={14} /> Add Plant
                </Button>
              </div>
              {plantsLoading ? (
                <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
              ) : plants.length === 0 ? (
                <p className="p-10 text-center text-sm text-slate-400">No plants yet — add your first one above.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead>Plant</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Price/kg</TableHead>
                        <TableHead className="text-right">Bulk Min.</TableHead>
                        <TableHead className="text-right">Capacity</TableHead>
                        <TableHead className="text-right">Closing Stock</TableHead>
                        <TableHead className="text-right">Low Stock Alert</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plants.map(p => {
                        const closing = toNum(p.latest_closing_stock_kg);
                        const low = p.latest_closing_stock_kg != null && closing < toNum(p.low_stock_threshold_kg);
                        return (
                          <TableRow key={p.id} className="hover:bg-slate-50/60">
                            <TableCell className="font-semibold text-slate-800">
                              <span className="inline-flex items-center gap-2">
                                <Flame size={13} className="text-orange-500" />{p.name}
                                {p.code && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-600"><Tag size={9} />{p.code}</span>}
                              </span>
                            </TableCell>
                            <TableCell className="text-slate-600 text-xs">{p.location_name || '—'}</TableCell>
                            <TableCell className="text-right text-slate-700 font-medium">
                              {p.price_per_kg != null ? `₦${fmtN(toNum(p.price_per_kg))}` : <span className="text-amber-600 font-normal">Not set</span>}
                            </TableCell>
                            <TableCell className="text-right text-slate-500 text-xs">{fmtN(toNum(p.bulk_threshold_kg ?? 100))} kg</TableCell>
                            <TableCell className="text-right text-slate-600">{p.capacity_kg ? `${fmtN(toNum(p.capacity_kg))} kg` : '—'}</TableCell>
                            <TableCell className={`text-right font-semibold ${low ? 'text-red-600' : 'text-slate-800'}`}>
                              {p.latest_closing_stock_kg != null ? `${fmtN(closing)} kg` : '—'}
                            </TableCell>
                            <TableCell className="text-right text-slate-500 text-xs">{fmtN(toNum(p.low_stock_threshold_kg))} kg</TableCell>
                            <TableCell>
                              {p.is_active ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">Inactive</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-slate-600 hover:text-slate-800" onClick={() => { setEditTarget(p); setFormOpen(true); }}>
                                  <Pencil size={13} /> Edit
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeletePlant(p)}>
                                  <Trash2 size={13} /> Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <PlantFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTarget(null); }}
        onSaved={refetchAll}
        states={states}
        editTarget={editTarget}
      />

      <Dialog open={!!deletePlant} onOpenChange={(v) => { if (!v) setDeletePlant(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <h2 className="text-lg font-semibold">Delete Plant?</h2>
            </DialogTitle>
            <DialogDescription className="sr-only">Confirm deleting this plant</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            This removes <span className="font-medium">{deletePlant?.name}</span> and all of its stock and sales history. This can't be undone.
          </p>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeletePlant(null)}>Cancel</Button>
            <Button size="sm" variant="destructive" className="gap-2" onClick={handleDeletePlant}>
              <Trash2 size={13} /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
