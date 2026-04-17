import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
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
import { Search, Pencil, Power, Loader2, CheckCircle, Fuel } from 'lucide-react';
import { apiClient } from '@/api/client';
import { isCurrentUserReadOnly } from '@/roles';
import { useToast } from '@/hooks/use-toast';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
}

interface State {
  id: string;
  name: string;
  status: 'Active' | 'Suspended';
  products: Product[];
}

const Pricing = () => {
  const readOnly = isCurrentUserReadOnly();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: states = [], isLoading } = useQuery<State[]>({
    queryKey: ['state-prices'],
    queryFn: () => apiClient.admin.getStatesPricing(),
    retry: 2,
  });

  const updateStateMutation = useMutation({
    mutationFn: (updatedState: { id: number; products: { id: number; price: number }[] }) =>
      apiClient.admin.updateStatePrice(updatedState),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['state-prices'] });
      toast({ title: 'Prices updated', description: 'Product prices saved successfully.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update prices.', variant: 'destructive' });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (stateId: string) => apiClient.admin.toggleStateStatus(stateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['state-prices'] });
      toast({ title: 'Status updated' });
    },
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [editingState, setEditingState] = useState<State | null>(null);
  const [tempPrices, setTempPrices] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const productNames = useMemo(() => {
    const names = new Set<string>();
    states.forEach(s => (s.products || []).forEach(p => names.add(p.name)));
    const sorted = Array.from(names).sort();
    const petrolIdx = sorted.findIndex(n => n.toLowerCase() === 'petrol');
    if (petrolIdx > 0) sorted.unshift(sorted.splice(petrolIdx, 1)[0]);
    return sorted;
  }, [states]);

  const filteredStates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return states;
    return states.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.products || []).some(p => p.name.toLowerCase().includes(q))
    );
  }, [states, searchQuery]);

  const openEdit = (state: State) => {
    const prices: Record<string, number> = {};
    (state.products || []).forEach(p => { prices[p.id] = p.price; });
    setTempPrices(prices);
    setEditingState(state);
  };

  const handleSave = async () => {
    if (!editingState) return;
    setSaving(true);
    try {
      await updateStateMutation.mutateAsync({
        id: Number(editingState.id),
        products: editingState.products.map(p => ({
          id: Number(p.id),
          price: tempPrices[p.id] ?? p.price,
        })),
      });
      setEditingState(null);
      setTempPrices({});
    } catch {
      // toast handled by mutation
    } finally {
      setSaving(false);
    }
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
              title="Manage Pricing"
              description="View and update product pricing across all locations."
            />

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input
                  placeholder="Search locations or products…"
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-4">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : filteredStates.length === 0 ? (
                <div className="p-10 text-center text-slate-500">
                  {searchQuery.trim() ? 'No locations match your search.' : 'No pricing data available.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3 [&>th]:text-xs [&>th]:font-semibold [&>th]:text-slate-600 [&>th]:uppercase [&>th]:tracking-wider">
                        <TableHead className="w-[48px] text-center">#</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Status</TableHead>
                        {productNames.map(name => (
                          <TableHead key={name} className="text-right">{name}</TableHead>
                        ))}
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStates.map((state, idx) => {
                        const isEven = idx % 2 === 0;
                        const productMap = new Map((state.products || []).map(p => [p.name, p]));

                        return (
                          <TableRow key={state.id} className={`transition-colors hover:bg-blue-50/40 ${isEven ? 'bg-white' : 'bg-slate-50/50'}`}>
                            <TableCell className="px-4 text-slate-400 text-center text-xs">{idx + 1}</TableCell>
                            <TableCell className="px-4 font-semibold text-slate-800">{state.name}</TableCell>
                            <TableCell className="px-4">
                              {state.status === 'Active' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-green-50 text-green-700 border-green-200">
                                  <CheckCircle size={11} /> Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-red-50 text-red-600 border-red-200">
                                  <Power size={11} /> Suspended
                                </span>
                              )}
                            </TableCell>
                            {productNames.map(name => {
                              const product = productMap.get(name);
                              return (
                                <TableCell key={name} className="px-4 text-right whitespace-nowrap text-sm">
                                  {product ? (
                                    <span className="font-medium text-slate-800">₦{product.price.toLocaleString()}</span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </TableCell>
                              );
                            })}
                            <TableCell className="px-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                {!readOnly && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 gap-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                    onClick={() => openEdit(state)}
                                  >
                                    <Pencil size={14} /> Edit
                                  </Button>
                                )}
                                {!readOnly && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`h-8 px-2 gap-1 ${state.status === 'Active' ? 'text-red-500 hover:text-red-700 hover:bg-red-50' : 'text-green-600 hover:text-green-800 hover:bg-green-50'}`}
                                    onClick={() => toggleStatusMutation.mutate(state.id)}
                                  >
                                    <Power size={14} /> {state.status === 'Active' ? 'Suspend' : 'Activate'}
                                  </Button>
                                )}
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

      {/* Edit Prices Dialog */}
      <Dialog open={!!editingState} onOpenChange={(open) => { if (!open) { setEditingState(null); setTempPrices({}); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fuel size={18} className="text-blue-600" />
              Edit Prices — {editingState?.name}
            </DialogTitle>
            <DialogDescription>Update product prices for this location, then save.</DialogDescription>
          </DialogHeader>

          {editingState && (
            <div className="space-y-4 py-2">
              {[...editingState.products].sort((a, b) => {
                if (a.name.toLowerCase() === 'petrol') return -1;
                if (b.name.toLowerCase() === 'petrol') return 1;
                return a.name.localeCompare(b.name);
              }).map((product) => (
                <div key={product.id} className="flex items-center gap-4">
                  <Label className="flex-1 text-sm font-medium text-slate-700">{product.name}</Label>
                  <div className="relative w-36">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₦</span>
                    <Input
                      type="number"
                      className="pl-7 h-10 text-right font-semibold tabular-nums"
                      value={tempPrices[product.id] ?? product.price}
                      onChange={(e) =>
                        setTempPrices(prev => ({ ...prev, [product.id]: parseFloat(e.target.value) || 0 }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setEditingState(null); setTempPrices({}); }} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {saving ? 'Saving…' : 'Save Prices'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pricing;
