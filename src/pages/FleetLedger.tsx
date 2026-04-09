// filepath: /Users/sableboxx/soroman_dashboard-2/src/pages/FleetLedger.tsx
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
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Plus, Search, Download, Loader2, Truck, Pencil, Trash2,
  TrendingUp, TrendingDown, Wallet,
  Calendar as CalendarIcon, FileText, Wrench, CircleDollarSign,
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

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const EXPENSE_CATEGORIES = [
  'Brake Pads', 'Tyres', 'Engine Oil', 'Fuel/Diesel',
  'Truck Servicing', 'Repairs & Maintenance', 'Insurance', 'Licence/Registration',
  'Spare Parts', 'Battery', 'Electrical', 'Body Work', 'Towing', 'Driver Salary', 'Driver Allowance',
  'Loading', 'Other', 
] as const;

const INCOME_CATEGORIES = [
  'Delivery', 'Freight Charges', 'Hire/Charter', 'Refund', 'Other',
] as const;

const ALL_CATEGORIES = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])];

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
  const cleaned = v.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const intPart = (parts[0] || '').replace(/^0+(?=\d)/, '');
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (parts.length > 1) return `${formatted}.${parts[1]}`;
  return formatted;
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

export default function FleetLedger() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Filters ────────────────────────────────────────────────────────
  const [timePreset, setTimePreset] = useState<TimePreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerTruckFilter, setLedgerTruckFilter] = useState<string>('all');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>('all');
  const [ledgerCategoryFilter, setLedgerCategoryFilter] = useState<string>('all');

  // ── Entry dialog ───────────────────────────────────────────────────
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryEditing, setEntryEditing] = useState<LedgerEntry | null>(null);
  const [entryForm, setEntryForm] = useState({
    truck_id: '', entry_type: 'expense' as 'expense' | 'income',
    category: '', custom_category: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
  });
  const [entrySaving, setEntrySaving] = useState(false);

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

  // ═══════════════════════════════════════════════════════════════════
  // Derived data
  // ═══════════════════════════════════════════════════════════════════

  const truckMap = useMemo(() => {
    const m = new Map<number, FleetTruck>();
    trucks.forEach(t => m.set(t.id, t));
    return m;
  }, [trucks]);

  const timeFilteredEntries = useMemo(
    () => allEntries.filter(e => matchesDateRange(e.date, dateRange.from, dateRange.to)),
    [allEntries, dateRange]
  );

  const totals = useMemo(() => {
    let debits = 0; let credits = 0;
    timeFilteredEntries.forEach(e => {
      const a = toNum(e.amount);
      if (e.entry_type === 'expense') debits += a;
      else credits += a;
    });
    return { debits, credits, balance: credits - debits, entries: timeFilteredEntries.length };
  }, [timeFilteredEntries]);

  const filteredLedger = useMemo(() => {
    let result = timeFilteredEntries;
    if (ledgerTruckFilter !== 'all') result = result.filter(e => String(e.truck) === ledgerTruckFilter);
    if (ledgerTypeFilter !== 'all') result = result.filter(e => e.entry_type === ledgerTypeFilter);
    if (ledgerCategoryFilter !== 'all') result = result.filter(e => e.category === ledgerCategoryFilter);
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase();
      result = result.filter(e =>
        (e.description || '').toLowerCase().includes(q) ||
        (e.entered_by || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q) ||
        (e.truck_plate || truckMap.get(e.truck)?.plate_number || '').toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [timeFilteredEntries, ledgerTruckFilter, ledgerTypeFilter, ledgerCategoryFilter, ledgerSearch, truckMap]);

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['fleet-trucks'] });
    qc.invalidateQueries({ queryKey: ['fleet-ledger'] });
  };

  const handlePresetChange = (preset: TimePreset) => {
    setTimePreset(preset);
    if (preset !== 'custom') { setCustomFrom(''); setCustomTo(''); }
  };

  const periodLabel = timePreset === 'custom'
    ? `${customFrom ? format(parseISO(customFrom), 'dd MMM') : '?'} – ${customTo ? format(parseISO(customTo), 'dd MMM yyyy') : '?'}`
    : timePreset === 'all' ? 'All Time' : timePreset.charAt(0).toUpperCase() + timePreset.slice(1);

  const summaryCards = useMemo((): SummaryCard[] => {
    // Unique trucks that have entries in the period
    const trucksInvolved = new Set(timeFilteredEntries.map(e => e.truck)).size;
    // Top expense category by total amount
    const catTotals = new Map<string, number>();
    timeFilteredEntries.forEach(e => {
      if (e.entry_type === 'expense') {
        catTotals.set(e.category, (catTotals.get(e.category) || 0) + toNum(e.amount));
      }
    });
    let topCategory = '—';
    let topCategoryAmt = 0;
    catTotals.forEach((amt, cat) => {
      if (amt > topCategoryAmt) { topCategory = cat; topCategoryAmt = amt; }
    });

    return [
      { title: 'Total Entries', value: String(totals.entries), icon: <FileText size={20} />, tone: 'neutral' },
      { title: 'Trucks Involved', value: String(trucksInvolved), icon: <Truck size={20} />, tone: 'neutral' },
      { title: 'Total Debits', value: fmtShort(totals.debits), icon: <TrendingDown size={20} />, tone: 'red' },
      { title: 'Total Credits', value: fmtShort(totals.credits), icon: <TrendingUp size={20} />, tone: 'green' },
      { title: 'Net Balance', value: fmtShort(totals.balance), icon: <Wallet size={20} />, tone: totals.balance >= 0 ? 'green' : 'red' },
      { title: 'Top Expense', value: topCategory, icon: <CircleDollarSign size={20} />, tone: topCategoryAmt > 0 ? 'amber' : 'neutral' },
    ];
  }, [totals, timeFilteredEntries, trucks, periodLabel]);

  const openAddEntry = () => {
    setEntryEditing(null);
    setEntryForm({
      truck_id: '', entry_type: 'expense', category: '', custom_category: '', amount: '',
      date: format(new Date(), 'yyyy-MM-dd'), description: '',
    });
    setEntryDialogOpen(true);
  };

  const openEditEntry = (e: LedgerEntry) => {
    setEntryEditing(e);
    // Check if category is a known one — if not, it was a custom "Other" entry
    const knownCats: string[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
    const isCustom = !knownCats.includes(e.category);
    setEntryForm({
      truck_id: String(e.truck), entry_type: e.entry_type,
      category: isCustom ? 'Other' : e.category,
      custom_category: isCustom ? e.category : '',
      amount: formatWithCommas(String(toNum(e.amount))),
      date: e.date ? e.date.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
      description: e.description || '',
    });
    setEntryDialogOpen(true);
  };

  const handleSaveEntry = useCallback(async () => {
    if (!entryForm.truck_id) { toast({ title: 'Select a truck', variant: 'destructive' }); return; }
    const resolvedCategory = entryForm.category === 'Other'
      ? entryForm.custom_category.trim()
      : entryForm.category;
    if (!resolvedCategory) { toast({ title: entryForm.category === 'Other' ? 'Enter a custom category name' : 'Select a category', variant: 'destructive' }); return; }
    const rawAmount = Number(stripCommas(entryForm.amount));
    if (!rawAmount || rawAmount <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    if (!entryForm.date) { toast({ title: 'Select a date', variant: 'destructive' }); return; }
    setEntrySaving(true);
    try {
      const currentUser = localStorage.getItem('fullname') || 'Unknown';
      const payload = {
        truck_id: Number(entryForm.truck_id), entry_type: entryForm.entry_type,
        category: resolvedCategory, amount: rawAmount, date: entryForm.date,
        description: entryForm.description.trim() || undefined,
        entered_by: currentUser,
      };
      if (entryEditing) {
        await apiClient.admin.updateFleetLedgerEntry(entryEditing.id, payload);
        toast({ title: 'Entry updated' });
      } else {
        await apiClient.admin.createFleetLedgerEntry(payload);
        toast({ title: 'Entry added' });
      }
      setEntryDialogOpen(false);
      invalidateAll();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save entry', variant: 'destructive' });
    } finally { setEntrySaving(false); }
  }, [entryForm, entryEditing, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.admin.deleteFleetLedgerEntry(deleteTarget.id);
      toast({ title: 'Entry deleted' });
      setDeleteTarget(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Delete failed', variant: 'destructive' });
    } finally { setDeleting(false); }
  }, [deleteTarget, toast]);

  const exportLedger = useCallback(() => {
    const period = timePreset === 'custom'
      ? `${customFrom || '?'}_TO_${customTo || '?'}`
      : timePreset.toUpperCase();
    const rows = filteredLedger.map(e => {
      const plate = e.truck_plate || truckMap.get(e.truck)?.plate_number || '';
      const driver = e.truck_driver || truckMap.get(e.truck)?.driver_name || '';
      const a = toNum(e.amount);
      return {
        Date: e.date ? format(parseISO(e.date), 'dd MMM yyyy') : '',
        Truck: plate, Driver: driver,
        Description: e.description || e.category,
        Category: e.category,
        'Debit (₦)': e.entry_type === 'expense' ? a : '',
        'Credit (₦)': e.entry_type === 'income' ? a : '',
        'Entered By': e.entered_by || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fleet Ledger');
    XLSX.writeFile(wb, `FLEET-LEDGER-${period}.xlsx`);
  }, [filteredLedger, truckMap, timePreset, customFrom, customTo]);

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  const isLoading = trucksQuery.isLoading || ledgerQuery.isLoading;
  const categoryOptions = entryForm.entry_type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

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
              title="Trucks Ledger"
              description="Add, edit, and manage all truck expense and income entries."
              actions={
                <>
                  <Button variant="outline" className="gap-2" onClick={exportLedger}><Download size={16} /> Download Report</Button>
                  <Button className="gap-2" onClick={openAddEntry}>
                    <Plus size={16} /> Add Entry
                  </Button>
                </>
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
            {/* <SummaryCards cards={summaryCards} /> */}

            {/* ── Filters / Toolbar ─────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3">
              {/* Row 1: Search + Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input placeholder="Search by description, category, truck…" className="pl-10" value={ledgerSearch} onChange={e => setLedgerSearch(e.target.value)} />
                </div>
              </div>
              {/* Row 2: Type + Category + Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <select value={ledgerTruckFilter} onChange={e => setLedgerTruckFilter(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="all">Select Truck</option>
                  {trucks.map(t => <option key={t.id} value={String(t.id)}>{t.plate_number}</option>)}
                </select>
                <select value={ledgerTypeFilter} onChange={e => setLedgerTypeFilter(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="all">Select Type</option>
                  <option value="expense">Debits</option>
                  <option value="income">Credits</option>
                </select>
                <select value={ledgerCategoryFilter} onChange={e => setLedgerCategoryFilter(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="all">Select Category</option>
                  {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* ── Ledger Table ──────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}</div>
              ) : filteredLedger.length === 0 ? (
                <div className="p-10 text-center">
                  <FileText className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No ledger entries found</p>
                  <p className="text-sm text-slate-400 mt-1">{allEntries.length > 0 ? 'Adjust your filters or period.' : 'Click "Add Entry" to log an expense or income.'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700">Date</TableHead>
                        <TableHead className="font-semibold text-slate-700">Truck</TableHead>
                        <TableHead className="font-semibold text-slate-700">Description</TableHead>
                        <TableHead className="font-semibold text-slate-700">Category</TableHead>
                        <TableHead className="font-semibold text-red-700">Debit</TableHead>
                        <TableHead className="font-semibold text-emerald-700">Credit</TableHead>
                        <TableHead className="font-semibold text-slate-700">Entered By</TableHead>
                        <TableHead className="font-semibold text-slate-700">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLedger.map(e => {
                        const plate = e.truck_plate || truckMap.get(e.truck)?.plate_number || `#${e.truck}`;
                        const isExp = e.entry_type === 'expense';
                        const a = toNum(e.amount);
                        return (
                          <TableRow key={e.id} className="hover:bg-slate-50/60 transition-colors">
                            <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                              {e.date ? format(parseISO(e.date), 'dd MMM yyyy') : '—'}
                            </TableCell>
                            <TableCell className="text-sm font-semibold text-slate-800">{plate}</TableCell>
                            <TableCell className="text-sm text-slate-700 max-w-[200px]">{e.description || '—'}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${isExp ? 'text-red-700' : 'text-emerald-700'}`}>
                                {isExp ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                                {e.category}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-left font-semibold text-red-600">
                              {isExp ? fmt(a) : ''}
                            </TableCell>
                            <TableCell className="text-sm text-left font-semibold text-emerald-600">
                              {!isExp ? fmt(a) : ''}
                            </TableCell>
                            <TableCell className="text-sm text-black">{e.entered_by || '—'}</TableCell>
                            <TableCell className="text-center">
                              <div className="flex justify-center gap-1">
                                <Button size="sm" variant="outline" className="gap-1.5 text-sm text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800" onClick={() => openEditEntry(e)} title="Edit entry">
                                  <Pencil size={14} />
                                  Edit Entry
                                </Button>
                                {/* <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-700" title="Delete entry"
                                  onClick={() => setDeleteTarget({ id: e.id, label: `${e.category} — ${fmt(a)}` })}>
                                  <Trash2 size={14} />
                                </Button> */}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals row */}
                      {/* <TableRow className="bg-slate-50 border-t-2 border-slate-300">
                        <TableCell className="font-bold text-slate-800 text-sm" colSpan={4}>
                          TOTAL ({filteredLedger.length} entries) · {periodLabel}
                        </TableCell>
                        <TableCell className="text-right font-bold text-red-700 text-sm">{fmt(filteredLedger.reduce((s, e) => s + (e.entry_type === 'expense' ? toNum(e.amount) : 0), 0))}</TableCell>
                        <TableCell className="text-right font-bold text-emerald-700 text-sm">{fmt(filteredLedger.reduce((s, e) => s + (e.entry_type === 'income' ? toNum(e.amount) : 0), 0))}</TableCell>
                        <TableCell colSpan={2} />
                      </TableRow> */}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* {!isLoading && filteredLedger.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {filteredLedger.length} of {allEntries.length} entries · Period: {periodLabel}
              </p>
            )} */}

          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Ledger Entry Dialog                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${entryForm.entry_type === 'expense' ? 'bg-red-100' : 'bg-emerald-100'}`}>
                {entryForm.entry_type === 'expense'
                  ? <TrendingDown className="w-5 h-5 text-red-600" />
                  : <TrendingUp className="w-5 h-5 text-emerald-600" />}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{entryEditing ? 'Edit Entry' : 'New Ledger Entry'}</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  {entryEditing ? 'Update this record' : 'Log a truck debit or credit'}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">{entryEditing ? 'Edit entry' : 'New entry'}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Type toggle */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Entry Type <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEntryForm(f => ({ ...f, entry_type: 'expense', category: '' }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    entryForm.entry_type === 'expense'
                      ? 'bg-red-50 text-red-700 border-red-300 ring-2 ring-red-200'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}>
                  <TrendingDown size={15} className="inline mr-1.5" />Debit (Expense)
                </button>
                <button type="button" onClick={() => setEntryForm(f => ({ ...f, entry_type: 'income', category: '' }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    entryForm.entry_type === 'income'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}>
                  <TrendingUp size={15} className="inline mr-1.5" />Credit (Income)
                </button>
              </div>
            </div>

            {/* Truck */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Truck size={15} className="text-slate-500" /> Truck <span className="text-red-500">*</span>
              </Label>
              <select value={entryForm.truck_id} onChange={e => setEntryForm(f => ({ ...f, truck_id: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select truck</option>
                {trucks.map(t => (
                  <option key={t.id} value={String(t.id)}>{t.plate_number} — {t.driver_name}</option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Wrench size={15} className="text-slate-500" /> Category <span className="text-red-500">*</span>
              </Label>
              <select value={entryForm.category} onChange={e => setEntryForm(f => ({ ...f, category: e.target.value, custom_category: e.target.value !== 'Other' ? '' : f.custom_category }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select category</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {entryForm.category === 'Other' && (
                <Input
                  placeholder="Enter custom category name…"
                  value={entryForm.custom_category}
                  onChange={e => setEntryForm(f => ({ ...f, custom_category: e.target.value }))}
                  className="mt-2"
                />
              )}
            </div>

            {/* Amount + Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <CircleDollarSign size={15} className="text-slate-500" /> Amount (₦) <span className="text-red-500">*</span>
                </Label>
                <Input type="text" inputMode="decimal" placeholder="e.g. 25,000" value={entryForm.amount}
                  onChange={e => setEntryForm(f => ({ ...f, amount: formatWithCommas(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <CalendarIcon size={15} className="text-slate-500" /> Date <span className="text-red-500">*</span>
                </Label>
                <Input type="date" value={entryForm.date}
                  onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <FileText size={15} className="text-slate-500" /> Description
              </Label>
              <Textarea placeholder="e.g. Replaced front brake pads at ABC Motors…" rows={2} value={entryForm.description}
                onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))} />
            </div>

          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEntryDialogOpen(false)} disabled={entrySaving}>Cancel</Button>
            <Button onClick={handleSaveEntry} disabled={entrySaving} className="gap-2">
              {entrySaving ? <Loader2 size={16} className="animate-spin" /> : entryEditing ? <Pencil size={16} /> : <Plus size={16} />}
              {entrySaving ? 'Saving…' : entryEditing ? 'Update Entry' : 'Add Entry'}
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
              {' '}This action cannot be undone.
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
