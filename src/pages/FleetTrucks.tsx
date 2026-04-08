// filepath: /Users/sableboxx/soroman_dashboard-2/src/pages/FleetTrucks.tsx
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Plus, Search, Download, Loader2, Truck, Pencil, Trash2,
  Phone, User, Hash, FileText, TrendingDown, TrendingUp, Wallet,
  ArrowUpDown, Eye, Calendar as CalendarIcon, Fuel,
} from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay, subDays, isWithinInterval } from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface FleetTruck {
  id: number;
  plate_number: string;
  max_capacity?: number;
  driver_name: string;
  driver_phone?: string;
  notes?: string;
  is_active?: boolean;
  created_at?: string;
}

interface LedgerEntry {
  id: number;
  truck: number;
  truck_plate?: string;
  truck_driver?: string;
  entry_type: 'expense' | 'income';
  category: string;
  amount: string | number;
  date: string;
  description?: string;
  entered_by?: string;
  created_at?: string;
}

type PagedResponse<T> = { count: number; results: T[] };

type TimePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';

type SortField = 'plate' | 'debits' | 'credits' | 'balance';
type SortDir = 'asc' | 'desc';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const fmt = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtShort = (n: number) => fmt(n);

const toNum = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Format a raw string with thousand separators for display in input */
const formatWithCommas = (v: string): string => {
  const cleaned = v.replace(/[^0-9]/g, '');
  const intPart = cleaned.replace(/^0+(?=\d)/, '');
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/** Strip commas to get a raw number string */
const stripCommas = (v: string): string => v.replace(/,/g, '');

const safePaged = <T,>(raw: unknown): PagedResponse<T> => {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.results)) return { count: Number(r.count ?? r.results.length), results: r.results as T[] };
    if (Array.isArray(raw)) return { count: (raw as T[]).length, results: raw as T[] };
  }
  return { count: 0, results: [] };
};

const matchesDateRange = (dateStr: string | undefined, from: Date | null, to: Date | null): boolean => {
  if (!dateStr || (!from && !to)) return true;
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    if (from && to) return isWithinInterval(d, { start: startOfDay(from), end: endOfDay(to) });
    if (from) return d >= startOfDay(from);
    if (to) return d <= endOfDay(to);
    return true;
  } catch { return true; }
};

const getPresetRange = (preset: TimePreset): { from: Date | null; to: Date | null } => {
  const now = new Date();
  switch (preset) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case 'week': return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month': return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'year': return { from: startOfYear(now), to: endOfYear(now) };
    case 'all': return { from: null, to: null };
    case 'custom': return { from: null, to: null };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function FleetTrucks() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Filters ────────────────────────────────────────────────────────
  const [timePreset, setTimePreset] = useState<TimePreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [truckSearch, setTruckSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('balance');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── Drill-down ─────────────────────────────────────────────────────
  const [selectedTruck, setSelectedTruck] = useState<FleetTruck | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [detailTypeFilter, setDetailTypeFilter] = useState<string>('all');

  // ── Truck CRUD dialog ──────────────────────────────────────────────
  const [truckDialogOpen, setTruckDialogOpen] = useState(false);
  const [truckEditing, setTruckEditing] = useState<FleetTruck | null>(null);
  const [truckForm, setTruckForm] = useState({ plate_number: '', driver_name: '', driver_phone: '', max_capacity: '', notes: '' });
  const [truckSaving, setTruckSaving] = useState(false);

  // ── Delete confirm ─────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ═══════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════

  const trucksQuery = useQuery({
    queryKey: ['fleet-trucks'],
    queryFn: async () => safePaged<FleetTruck>(await apiClient.admin.getFleetTrucks({ page_size: 500 })),
    staleTime: 30_000,
  });
  const trucks = useMemo(() => trucksQuery.data?.results || [], [trucksQuery.data]);

  const ledgerQuery = useQuery({
    queryKey: ['fleet-ledger'],
    queryFn: async () => safePaged<LedgerEntry>(await apiClient.admin.getFleetLedger({ page_size: 5000 })),
    staleTime: 30_000,
  });
  const allEntries = useMemo(() => ledgerQuery.data?.results || [], [ledgerQuery.data]);

  // ═══════════════════════════════════════════════════════════════════
  // Date range logic
  // ═══════════════════════════════════════════════════════════════════

  const dateRange = useMemo(() => {
    if (timePreset === 'custom') {
      return {
        from: customFrom ? parseISO(customFrom) : null,
        to: customTo ? parseISO(customTo) : null,
      };
    }
    return getPresetRange(timePreset);
  }, [timePreset, customFrom, customTo]);

  const filteredEntries = useMemo(
    () => allEntries.filter(e => matchesDateRange(e.date, dateRange.from, dateRange.to)),
    [allEntries, dateRange]
  );

  // ═══════════════════════════════════════════════════════════════════
  // Per-truck summaries
  // ═══════════════════════════════════════════════════════════════════

  const truckSummaries = useMemo(() => {
    const map = new Map<number, { debits: number; credits: number }>();
    filteredEntries.forEach(e => {
      const cur = map.get(e.truck) || { debits: 0, credits: 0 };
      const a = toNum(e.amount);
      if (e.entry_type === 'expense') cur.debits += a;
      else cur.credits += a;
      map.set(e.truck, cur);
    });
    return map;
  }, [filteredEntries]);

  // ── Global totals ──────────────────────────────────────────────────

  const totals = useMemo(() => {
    let debits = 0;
    let credits = 0;
    filteredEntries.forEach(e => {
      const a = toNum(e.amount);
      if (e.entry_type === 'expense') debits += a;
      else credits += a;
    });
    return { debits, credits, balance: credits - debits, truckCount: trucks.length, entries: filteredEntries.length };
  }, [filteredEntries, trucks]);

  // ── Sorted & filtered trucks ───────────────────────────────────────

  const displayTrucks = useMemo(() => {
    let list = trucks.map(t => {
      const s = truckSummaries.get(t.id) || { debits: 0, credits: 0 };
      return { ...t, debits: s.debits, credits: s.credits, balance: s.credits - s.debits };
    });

    if (truckSearch.trim()) {
      const q = truckSearch.toLowerCase();
      list = list.filter(t =>
        t.plate_number.toLowerCase().includes(q) ||
        t.driver_name.toLowerCase().includes(q) ||
        (t.driver_phone || '').includes(q)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'plate': cmp = a.plate_number.localeCompare(b.plate_number); break;
        case 'debits': cmp = a.debits - b.debits; break;
        case 'credits': cmp = a.credits - b.credits; break;
        case 'balance': cmp = a.balance - b.balance; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [trucks, truckSummaries, truckSearch, sortField, sortDir]);

  // ── Drill-down entries for selected truck ──────────────────────────

  const detailEntries = useMemo(() => {
    if (!selectedTruck) return [];
    let entries = allEntries
      .filter(e => e.truck === selectedTruck.id)
      .filter(e => matchesDateRange(e.date, dateRange.from, dateRange.to));

    if (detailTypeFilter !== 'all') entries = entries.filter(e => e.entry_type === detailTypeFilter);

    if (detailSearch.trim()) {
      const q = detailSearch.toLowerCase();
      entries = entries.filter(e =>
        (e.description || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q) ||
        (e.entered_by || '').toLowerCase().includes(q)
      );
    }

    return entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [selectedTruck, allEntries, dateRange, detailTypeFilter, detailSearch]);

  // Running balance for the detail view (oldest first)
  const detailWithBalance = useMemo(() => {
    const sorted = [...detailEntries].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let running = 0;
    const result = sorted.map(e => {
      const a = toNum(e.amount);
      if (e.entry_type === 'income') running += a;
      else running -= a;
      return { ...e, runningBalance: running };
    });
    return result.reverse();
  }, [detailEntries]);

  const detailTotals = useMemo(() => {
    let debits = 0; let credits = 0;
    detailEntries.forEach(e => {
      const a = toNum(e.amount);
      if (e.entry_type === 'expense') debits += a;
      else credits += a;
    });
    return { debits, credits, balance: credits - debits };
  }, [detailEntries]);

  // ═══════════════════════════════════════════════════════════════════
  // Summary cards
  // ═══════════════════════════════════════════════════════════════════

  const summaryCards = useMemo((): SummaryCard[] => {
    // Active trucks = trucks that have at least 1 ledger entry in the selected period
    const activeTruckIds = new Set(filteredEntries.map(e => e.truck));
    const activeTruckCount = trucks.filter(t => activeTruckIds.has(t.id)).length;
    // Avg cost per truck = total debits ÷ fleet size (fleet cost-efficiency KPI)
    const avgCostPerTruck = totals.truckCount > 0 ? totals.debits / totals.truckCount : 0;

    return [
      { title: 'total trucks', value: String(totals.truckCount), icon: <Truck size={20} />, tone: 'neutral' },
      { title: 'active this period', value: String(activeTruckCount), icon: <TrendingUp size={20} />, tone: activeTruckCount > 0 ? 'green' : 'amber' },
      { title: 'average cost per truck', value: fmtShort(avgCostPerTruck), icon: <Wallet size={20} />, tone: avgCostPerTruck > 0 ? 'red' : 'neutral' },
    ];
  }, [totals, filteredEntries, trucks]);

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['fleet-trucks'] });
    qc.invalidateQueries({ queryKey: ['fleet-ledger'] });
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'plate' ? 'asc' : 'desc'); }
  };

  const handlePresetChange = (preset: TimePreset) => {
    setTimePreset(preset);
    if (preset !== 'custom') { setCustomFrom(''); setCustomTo(''); }
  };

  const openAddTruck = () => {
    setTruckEditing(null);
    setTruckForm({ plate_number: '', driver_name: '', driver_phone: '', max_capacity: '', notes: '' });
    setTruckDialogOpen(true);
  };

  const openEditTruck = (t: FleetTruck) => {
    setTruckEditing(t);
    setTruckForm({
      plate_number: t.plate_number,
      driver_name: t.driver_name,
      driver_phone: t.driver_phone || '',
      max_capacity: t.max_capacity ? t.max_capacity.toLocaleString() : '',
      notes: t.notes || '',
    });
    setTruckDialogOpen(true);
  };

  const handleSaveTruck = useCallback(async () => {
    if (!truckForm.plate_number.trim()) {
      toast({ title: 'Plate number is required', variant: 'destructive' }); return;
    }
    if (!truckForm.driver_name.trim()) {
      toast({ title: 'Driver name is required', variant: 'destructive' }); return;
    }
    setTruckSaving(true);
    try {
      const capacityRaw = Number(stripCommas(truckForm.max_capacity));
      const payload = {
        plate_number: truckForm.plate_number.trim().toUpperCase(),
        driver_name: truckForm.driver_name.trim(),
        driver_phone: truckForm.driver_phone.trim() || '',
        max_capacity: capacityRaw > 0 ? capacityRaw : null,
        notes: truckForm.notes.trim() || '',
      };
      if (truckEditing) {
        await apiClient.admin.updateFleetTruck(truckEditing.id, payload);
        toast({ title: 'Truck updated' });
      } else {
        await apiClient.admin.createFleetTruck(payload);
        toast({ title: 'Truck added' });
      }
      setTruckDialogOpen(false);
      invalidateAll();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save truck', variant: 'destructive' });
    } finally { setTruckSaving(false); }
  }, [truckForm, truckEditing, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.admin.deleteFleetTruck(deleteTarget.id);
      toast({ title: 'Truck deleted' });
      setDeleteTarget(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Delete failed', variant: 'destructive' });
    } finally { setDeleting(false); }
  }, [deleteTarget, toast]);

  // ── Export: Summary ────────────────────────────────────────────────
  const exportSummary = useCallback(() => {
    const period = timePreset === 'custom'
      ? `${customFrom || '?'}_TO_${customTo || '?'}`
      : timePreset.toUpperCase();
    const rows = displayTrucks.map(t => ({
      'Plate Number': t.plate_number,
      'Driver': t.driver_name,
      'Phone': t.driver_phone || '',
      'Max Capacity (L)': t.max_capacity || '',
      'Debits (₦)': t.debits,
      'Credits (₦)': t.credits,
      'Balance (₦)': t.balance,
    }));
    rows.push({
      'Plate Number': 'TOTAL',
      'Driver': '',
      'Phone': '',
      'Max Capacity (L)': '' as any,
      'Debits (₦)': totals.debits,
      'Credits (₦)': totals.credits,
      'Balance (₦)': totals.balance,
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fleet Summary');
    XLSX.writeFile(wb, `FLEET-SUMMARY-${period}.xlsx`);
  }, [displayTrucks, totals, timePreset, customFrom, customTo]);

  // ── Export: Single truck detail ────────────────────────────────────
  const exportTruckDetail = useCallback(() => {
    if (!selectedTruck) return;
    const period = timePreset === 'custom'
      ? `${customFrom || '?'}_TO_${customTo || '?'}`
      : timePreset.toUpperCase();
    let running = 0;
    const sorted = [...detailEntries].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const rows = sorted.map(e => {
      const a = toNum(e.amount);
      const debit = e.entry_type === 'expense' ? a : 0;
      const credit = e.entry_type === 'income' ? a : 0;
      running += credit - debit;
      return {
        'Date': e.date ? format(parseISO(e.date), 'dd MMM yyyy') : '',
        'Description': e.description || e.category,
        'Category': e.category,
        'Debit (₦)': debit || '',
        'Credit (₦)': credit || '',
        'Balance (₦)': running,
        'Entered By': e.entered_by || '',
      };
    });
    rows.push({
      'Date': '',
      'Description': 'TOTAL',
      'Category': '',
      'Debit (₦)': detailTotals.debits as any,
      'Credit (₦)': detailTotals.credits as any,
      'Balance (₦)': detailTotals.balance,
      'Entered By': '',
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selectedTruck.plate_number);
    XLSX.writeFile(wb, `TRUCK-LEDGER-${selectedTruck.plate_number}-${period}.xlsx`);
  }, [selectedTruck, detailEntries, detailTotals, timePreset, customFrom, customTo]);

  // ═══════════════════════════════════════════════════════════════════
  // Render helpers
  // ═══════════════════════════════════════════════════════════════════

  const isLoading = trucksQuery.isLoading || ledgerQuery.isLoading;

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown
      size={13}
      className={`inline ml-1 ${sortField === field ? 'text-slate-900' : 'text-slate-400'}`}
    />
  );

  const periodLabel = timePreset === 'custom'
    ? `${customFrom ? format(parseISO(customFrom), 'dd MMM') : '?'} – ${customTo ? format(parseISO(customTo), 'dd MMM yyyy') : '?'}`
    : timePreset === 'all'
      ? 'All Time'
      : timePreset.charAt(0).toUpperCase() + timePreset.slice(1);

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

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
              title="Fleet Trucks"
              description="At-a-glance truck performance — debits, credits, and balance per truck for any period."
              actions={
                <div className="flex gap-2">
                  <Button className="gap-2" onClick={openAddTruck}>
                    <Plus size={16} /> Add Truck
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={exportSummary}>
                    <Download size={16} /> Download Report
                  </Button>
                </div>
              }
            />

            {/* ── Time Filter ──────────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-slate-600 mr-1">
                  <CalendarIcon size={14} className="inline mr-1" />Period:
                </span>
                {(['today', 'yesterday', 'week', 'month', 'year', 'all', 'custom'] as TimePreset[]).map(tp => (
                  <button
                    key={tp}
                    onClick={() => handlePresetChange(tp)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      timePreset === tp
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {tp === 'all' ? 'All Time' : tp === 'custom' ? 'Date Range' : tp.charAt(0).toUpperCase() + tp.slice(1)}
                  </button>
                ))}
              </div>
              {timePreset === 'custom' && (
                <div className="flex flex-wrap gap-3 mt-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">From</Label>
                    <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 w-[160px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">To</Label>
                    <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 w-[160px]" />
                  </div>
                </div>
              )}
            </div>

            {/* ── Summary Cards ─────────────────────────────────────── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Search bar ───────────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input placeholder="Search by truck or driver" className="pl-10" value={truckSearch} onChange={e => setTruckSearch(e.target.value)} />
              </div>
              {/* <Button variant="outline" className="gap-2" onClick={exportSummary}><Download size={16} /> Export</Button>
              <Button className="gap-2 sm:hidden" onClick={openAddTruck}><Plus size={16} /> Add Truck</Button> */}
            </div>

            {/* ── Trucks Table ──────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded" />)}</div>
              ) : displayTrucks.length === 0 ? (
                <div className="p-10 text-center">
                  <Truck className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No trucks found</p>
                  <p className="text-sm text-slate-400 mt-1">{trucks.length > 0 ? 'Adjust your search.' : 'Click "Add Truck" to register one.'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700 cursor-pointer select-none" onClick={() => toggleSort('plate')}>
                          Truck Number <SortIcon field="plate" />
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 hidden md:table-cell">Capacity (L)</TableHead>
                        <TableHead className="font-semibold text-slate-700 hidden md:table-cell">Truck Driver</TableHead>
                        <TableHead className="font-semibold text-red-700 text-left cursor-pointer select-none" onClick={() => toggleSort('debits')}>
                          Debits <SortIcon field="debits" />
                        </TableHead>
                        <TableHead className="font-semibold text-emerald-700 text-left cursor-pointer select-none" onClick={() => toggleSort('credits')}>
                          Credits <SortIcon field="credits" />
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 text-left cursor-pointer select-none" onClick={() => toggleSort('balance')}>
                          Balance <SortIcon field="balance" />
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 text-center w-[140px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayTrucks.map(t => {
                        const balColor = t.balance > 0 ? 'text-emerald-700' : t.balance < 0 ? 'text-red-700' : 'text-slate-500';
                        return (
                          <TableRow
                            key={t.id}
                            className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                            onClick={() => { setSelectedTruck(t); setDetailSearch(''); setDetailTypeFilter('all'); }}
                          >
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-5 w-5 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-slate-200 transition-colors">
                                  <Truck size={10} className="text-slate-600" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-900">{t.plate_number}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm font-semibold text-slate-700 hidden md:table-cell">
                              {t.max_capacity ? `${t.max_capacity.toLocaleString()} L` : '—'}
                            </TableCell>
                            <TableCell className="text-sm text-slate-500 hidden md:table-cell">
                                <p className="text-sm font-bold uppercase text-slate-900">{t.driver_name}</p> 
                                <p className="text-xs text-slate-500">{t.driver_phone || '—'}</p>
                            </TableCell>
                            <TableCell className="text-sm text-left font-semibold text-red-600">
                              {t.debits > 0 ? fmt(t.debits) : '—'}
                            </TableCell>
                            <TableCell className="text-sm text-left font-semibold text-emerald-600">
                              {t.credits > 0 ? fmt(t.credits) : '—'}
                            </TableCell>
                            <TableCell className={`text-sm text-left font-bold ${balColor}`}>
                              {t.debits === 0 && t.credits === 0 ? '—' : fmt(t.balance)}
                            </TableCell>
                            <TableCell className="text-left" onClick={e => e.stopPropagation()}>
                              <div className="flex justify-center gap-1">
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-600 hover:text-blue-800" title="View ledger"
                                  onClick={() => { setSelectedTruck(t); setDetailSearch(''); setDetailTypeFilter('all'); }}>
                                  <Eye size={14} />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEditTruck(t)} title="Edit truck">
                                  <Pencil size={14} />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-700" title="Delete truck"
                                  onClick={() => setDeleteTarget({ id: t.id, label: t.plate_number })}>
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals row */}
                      {/* <TableRow className="bg-slate-50 border-t-2 border-slate-300">
                        <TableCell className="font-bold text-slate-800 text-sm">TOTAL ({displayTrucks.length} trucks)</TableCell>
                        <TableCell className="hidden md:table-cell" />
                        <TableCell className="text-right font-bold text-red-700 text-sm">{fmt(totals.debits)}</TableCell>
                        <TableCell className="text-right font-bold text-emerald-700 text-sm">{fmt(totals.credits)}</TableCell>
                        <TableCell className={`text-right font-bold text-sm ${totals.balance >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                          {fmt(totals.balance)}
                        </TableCell>
                        <TableCell />
                      </TableRow> */}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* {!isLoading && displayTrucks.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {displayTrucks.length} of {trucks.length} truck{trucks.length !== 1 ? 's' : ''} · Period: {periodLabel}
              </p>
            )} */}

          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Drill-Down: Truck Ledger Sheet                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!selectedTruck} onOpenChange={open => { if (!open) setSelectedTruck(null); }}>
        <DialogContent className="sm:max-w-[900px] max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg"><Truck className="w-5 h-5 text-green-700" /></div>
              <div className="min-w-0">
                <h2 className="text-lg text-green-700 font-bold">{selectedTruck?.plate_number}</h2>
                <p className="text-sm font-normal text-black mt-0.5">
                  Quantity: <span className="font-semibold uppercase">{selectedTruck?.max_capacity ? `${selectedTruck.max_capacity.toLocaleString()} L` : '—'}</span>
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Truck ledger detail</DialogDescription>
          </DialogHeader>

          {/* Detail summary strip */}
          <div className="grid grid-cols-3 gap-3 my-2 shrink-0">
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-red-500">Debits</p>
              <p className="text-lg font-bold text-red-700 mt-0.5">{fmt(detailTotals.debits)}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-500">Credits</p>
              <p className="text-lg font-bold text-emerald-700 mt-0.5">{fmt(detailTotals.credits)}</p>
            </div>
            <div className={`rounded-lg p-3 text-center ${detailTotals.balance >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${detailTotals.balance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Balance</p>
              <p className={`text-lg font-bold mt-0.5 ${detailTotals.balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(detailTotals.balance)}</p>
            </div>
          </div>

          {/* Detail toolbar */}
          <div className="flex flex-col sm:flex-row gap-2 my-1 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input placeholder="Search entries…" className="pl-9 h-9 text-sm" value={detailSearch} onChange={e => setDetailSearch(e.target.value)} />
            </div>
            <select value={detailTypeFilter} onChange={e => setDetailTypeFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm w-full sm:w-[140px]">
              <option value="all">All Types</option>
              <option value="expense">Debits only</option>
              <option value="income">Credits only</option>
            </select>
            <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={exportTruckDetail}>
              <Download size={14} /> Export
            </Button>
          </div>

          {/* Detail table */}
          <div className="flex-1 overflow-auto border rounded-lg">
            {detailWithBalance.length === 0 ? (
              <div className="p-10 text-center">
                <FileText className="mx-auto text-slate-300 mb-2" size={32} />
                <p className="text-slate-500 text-sm font-medium">No entries for this truck in the selected period</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 sticky top-0">
                    <TableHead className="font-semibold text-slate-700 text-xs">Date</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs">Description</TableHead>
                    <TableHead className="font-semibold text-red-700 text-xs text-right">Debit</TableHead>
                    <TableHead className="font-semibold text-emerald-700 text-xs text-right">Credit</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailWithBalance.map(e => {
                    const isExp = e.entry_type === 'expense';
                    const a = toNum(e.amount);
                    return (
                      <TableRow key={e.id} className="hover:bg-slate-50/60">
                        <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                          {e.date ? format(parseISO(e.date), 'dd MMM yyyy') : '—'}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-slate-800">{e.description || e.category}</p>
                          {e.description && e.category && (
                            <p className="text-[11px] text-slate-400 mt-0.5">{e.category}{e.entered_by ? ` · ${e.entered_by}` : ''}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-right font-medium text-red-600">
                          {isExp ? fmt(a) : ''}
                        </TableCell>
                        <TableCell className="text-sm text-right font-medium text-emerald-600">
                          {!isExp ? fmt(a) : ''}
                        </TableCell>
                        <TableCell className={`text-sm text-right font-semibold ${e.runningBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {fmt(e.runningBalance)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Totals row */}
                  <TableRow className="bg-slate-50 border-t-2 border-slate-300 sticky bottom-0">
                    <TableCell className="font-bold text-slate-700 text-xs">TOTAL</TableCell>
                    <TableCell className="text-xs text-slate-500">{detailWithBalance.length} entries</TableCell>
                    <TableCell className="text-right font-bold text-red-700 text-sm">{fmt(detailTotals.debits)}</TableCell>
                    <TableCell className="text-right font-bold text-emerald-700 text-sm">{fmt(detailTotals.credits)}</TableCell>
                    <TableCell className={`text-right font-bold text-sm ${detailTotals.balance >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                      {fmt(detailTotals.balance)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Truck Add/Edit Dialog                                          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={truckDialogOpen} onOpenChange={setTruckDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg"><Truck className="w-5 h-5 text-blue-600" /></div>
              <div>
                <h2 className="text-lg font-semibold">{truckEditing ? 'Edit Truck' : 'Add Truck'}</h2>
                <p className="text-sm font-normal text-slate-500 mt-0">
                  {truckEditing ? 'Update truck and driver details' : 'Register a new truck'}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">{truckEditing ? 'Edit truck' : 'Add truck'}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Hash size={15} className="text-slate-500" /> Truck Number <span className="text-red-500">*</span>
              </Label>
              <Input placeholder="e.g. ABC-123-XY" value={truckForm.plate_number}
                onChange={e => setTruckForm(f => ({ ...f, plate_number: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <User size={15} className="text-slate-500" /> Driver's Name <span className="text-red-500">*</span>
              </Label>
              <Input placeholder="e.g. Musa Abdullahi" value={truckForm.driver_name}
                onChange={e => setTruckForm(f => ({ ...f, driver_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Phone size={15} className="text-slate-500" /> Driver's Phone
              </Label>
              <Input placeholder="e.g. 08012345678" value={truckForm.driver_phone}
                onChange={e => setTruckForm(f => ({ ...f, driver_phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Fuel size={15} className="text-slate-500" /> Max Capacity (Litres)
              </Label>
              <Input type="text" inputMode="numeric" placeholder="e.g. 45,000" value={truckForm.max_capacity}
                onChange={e => setTruckForm(f => ({ ...f, max_capacity: formatWithCommas(e.target.value) }))} />
              <p className="text-xs text-slate-400">The maximum volume this truck can carry</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <FileText size={15} className="text-slate-500" /> Notes
              </Label>
              <Textarea placeholder="Optional notes…" rows={2} value={truckForm.notes}
                onChange={e => setTruckForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setTruckDialogOpen(false)} disabled={truckSaving}>Cancel</Button>
            <Button onClick={handleSaveTruck} disabled={truckSaving} className="gap-2">
              {truckSaving ? <Loader2 size={16} className="animate-spin" /> : truckEditing ? <Pencil size={16} /> : <Plus size={16} />}
              {truckSaving ? 'Saving…' : truckEditing ? 'Update Truck' : 'Add Truck'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Delete Confirmation                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-red-100 p-2 rounded-lg"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <span>Confirm Delete</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Are you sure you want to delete <strong>{deleteTarget?.label}</strong>?
              All ledger entries for this truck will also be removed.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
