import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, X, Pencil, Trash2, Search, CalendarDays, Tags, Landmark,
  Package, Receipt, Wallet, FileDown, Loader2, Layers,
} from 'lucide-react';
import { client } from '@/api/client';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Expense {
  id: number;
  pfi: number | null;
  pfi_number: string | null;
  category: number | null;
  category_name: string | null;
  category_is_pfi: boolean;
  description: string;
  amount: string;
  date: string;
  vendor: string;
  bank_paid_from: string;
  receipt_reference: string;
  added_by_name: string | null;
  edited_by_name: string | null;
}

interface Category {
  id: number;
  name: string;
  description: string;
  is_system_category: boolean;
  pfi_id: number | null;
  pfi_number: string | null;
  pfi_status: string | null;
  expense_count: number;
  total_amount: string;
}

interface ExpenseListResponse {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  /** 'own' = only this user's entries; 'all' = every entry (oversight roles). */
  scope?: 'own' | 'all';
  total_amount: string;
  total_pfi_amount: string;
  total_general_amount: string;
  banks: string[];
  results: Expense[];
}

type TimePreset = 'month' | 'last_month' | 'year' | 'all' | 'custom';

const PRESETS: { key: TimePreset; label: string }[] = [
  { key: 'month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Date Range' },
];

const PAGE_SIZE = 25;

const fmtNaira = (value: string | number | null | undefined) => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
  if (!Number.isFinite(n)) return '₦0';
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const toISODate = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Resolve a preset into the date_from / date_to the API expects. */
const presetRange = (preset: TimePreset, customFrom: string, customTo: string) => {
  const now = new Date();
  switch (preset) {
    case 'month':
      return {
        from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case 'last_month':
      return {
        from: toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toISODate(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'year':
      return {
        from: toISODate(new Date(now.getFullYear(), 0, 1)),
        to: toISODate(new Date(now.getFullYear(), 11, 31)),
      };
    case 'custom':
      return { from: customFrom, to: customTo };
    case 'all':
    default:
      return { from: '', to: '' };
  }
};

const selectClass =
  'w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300';

const labelClass =
  'text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5';

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [bankFilter, setBankFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [timePreset, setTimePreset] = useState<TimePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const [exporting, setExporting] = useState(false);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { from: dateFrom, to: dateTo } = presetRange(timePreset, customFrom, customTo);

  const buildParams = useCallback((overrides: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (categoryFilter !== 'all') params.set('category', categoryFilter);
    if (bankFilter !== 'all') params.set('bank', bankFilter);
    if (kindFilter !== 'all') params.set('kind', kindFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    Object.entries(overrides).forEach(([k, v]) => params.set(k, v));
    return params;
  }, [search, categoryFilter, bankFilter, kindFilter, dateFrom, dateTo, page]);

  const expensesQuery = useQuery<ExpenseListResponse>({
    queryKey: ['expenses', { search, categoryFilter, bankFilter, kindFilter, dateFrom, dateTo, page }],
    queryFn: () => client.get(`/expenses/?${buildParams()}`),
  });

  const categoriesQuery = useQuery<Category[]>({
    queryKey: ['expense-categories'],
    queryFn: () => client.get('/expense-categories/'),
  });

  const categories = categoriesQuery.data ?? [];
  const generalCategories = useMemo(() => categories.filter(c => !c.is_system_category), [categories]);
  const pfiCategories = useMemo(() => categories.filter(c => c.is_system_category), [categories]);

  const expenses = expensesQuery.data?.results ?? [];
  const totalCount = expensesQuery.data?.count ?? 0;
  const totalPages = expensesQuery.data?.total_pages ?? 1;
  const banks = expensesQuery.data?.banks ?? [];
  // Oversight roles (SuperAdmin/Admin/Audit) get everyone's entries back from
  // the API; everyone else is scoped to their own. The API decides — this only
  // controls how the page describes what's on screen.
  const seesAllEntries = expensesQuery.data?.scope !== 'own';

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing
        ? client.patch(`/expenses/${editing.id}/update/`, payload)
        : client.post('/expenses/create/', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['pfis'] });
      queryClient.invalidateQueries({ queryKey: ['pfi-expenses'] });
      toast.success(editing ? 'Expense updated' : 'Expense added');
      setShowForm(false);
      setEditing(null);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save expense'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => client.delete(`/expenses/${id}/update/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['pfis'] });
      queryClient.invalidateQueries({ queryKey: ['pfi-expenses'] });
      toast.success('Expense deleted');
      setPendingDelete(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete expense');
      setPendingDelete(null);
    },
  });

  const summaryCards = useMemo((): SummaryCard[] => {
    const data = expensesQuery.data;
    return [
      {
        title: 'Total Expenses',
        value: fmtNaira(data?.total_amount),
        // description: `${totalCount} ${totalCount === 1 ? 'entry' : 'entries'} in view`,
        icon: <Wallet size={18} />,
        tone: 'blue',
      },
      {
        title: 'PFI Expenses',
        value: fmtNaira(data?.total_pfi_amount),
        // description: 'Booked to a PFI — included in that PFI’s cost',
        icon: <Package size={18} />,
        tone: 'amber',
      },
      {
        title: 'General Expenses',
        value: fmtNaira(data?.total_general_amount),
        // description: 'Booked to a non-PFI category',
        icon: <Layers size={18} />,
        tone: 'neutral',
      },
      {
        title: 'Categories',
        value: String(categories.length),
        description: `${pfiCategories.length} PFI · ${generalCategories.length} general`,
        icon: <Tags size={18} />,
        tone: 'green',
      },
    ];
  }, [expensesQuery.data, totalCount, categories.length, pfiCategories.length, generalCategories.length]);

  const hasFilters =
    !!search || categoryFilter !== 'all' || bankFilter !== 'all' ||
    kindFilter !== 'all' || timePreset !== 'all';

  const clearFilters = () => {
    setSearchInput(''); setSearch('');
    setCategoryFilter('all'); setBankFilter('all'); setKindFilter('all');
    setTimePreset('all'); setCustomFrom(''); setCustomTo('');
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = buildParams({ page: '1', page_size: '1000' });
      const data: ExpenseListResponse = await client.get(`/expenses/?${params}`);
      const rows = data.results ?? [];
      if (rows.length === 0) {
        toast.error('Nothing to export for the current filters');
        return;
      }
      const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [
        ['Date', 'Category', 'Type', 'PFI', 'Vendor', 'Description', 'Bank Paid From', 'Amount', 'Added By'].join(','),
        ...rows.map(r => [
          esc(r.date), esc(r.category_name), esc(r.category_is_pfi ? 'PFI' : 'General'),
          esc(r.pfi_number), esc(r.vendor), esc(r.description),
          esc(r.bank_paid_from), esc(r.amount), esc(r.added_by_name),
        ].join(',')),
        ['', '', '', '', '', '', 'TOTAL', esc(data.total_amount), ''].join(','),
      ].join('\n');

      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `expenses-${toISODate(new Date())}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} expenses`);
    } catch (err) {
      toast.error((err as Error).message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const activeCategoryName = categories.find(c => String(c.id) === categoryFilter)?.name;

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />

      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            <PageHeader
              title="Expenses"
              description="Every cost logged in one place. Filing an expense under a PFI category adds it to that PFI's running cost in PFI Tracking."
              actions={
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowCategories(true)}>
                    <Tags size={15} />
                    Categories
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleExport}
                    disabled={exporting || totalCount === 0}
                  >
                    {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
                    Export CSV
                  </Button>
                  <Button size="sm" className="gap-2" onClick={() => { setEditing(null); setShowForm(true); }}>
                    <Plus size={15} />
                    Add Expense
                  </Button>
                </div>
              }
            />

            <SummaryCards cards={summaryCards} />

            {/* ── Filters ───────────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  placeholder="Search by vendor, description, bank, reference or category…"
                  className="pl-10 h-10 text-sm bg-slate-50 border-slate-200 focus:bg-white"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button
                    title="Clear search"
                    onClick={() => setSearchInput('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="border-t border-slate-100" />

              <div className="space-y-1.5">
                <p className={labelClass}><CalendarDays size={12} /> Period</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTimePreset(key);
                        if (key !== 'custom') { setCustomFrom(''); setCustomTo(''); }
                        setPage(1);
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                        timePreset === key
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {timePreset === 'custom' && (
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Input
                      type="date"
                      aria-label="From date"
                      className="h-9 w-auto text-sm bg-slate-50 border-slate-200"
                      value={customFrom}
                      onChange={e => { setCustomFrom(e.target.value); setPage(1); }}
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <Input
                      type="date"
                      aria-label="To date"
                      className="h-9 w-auto text-sm bg-slate-50 border-slate-200"
                      value={customTo}
                      onChange={e => { setCustomTo(e.target.value); setPage(1); }}
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100" />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <p className={labelClass}><Tags size={12} /> Category</p>
                  <select
                    aria-label="Filter by category"
                    className={selectClass}
                    value={categoryFilter}
                    onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
                  >
                    <option value="all">All Categories</option>
                    {generalCategories.length > 0 && (
                      <optgroup label="General Categories">
                        {generalCategories.map(c => (
                          <option key={c.id} value={String(c.id)}>{c.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {pfiCategories.length > 0 && (
                      <optgroup label="PFIs">
                        {pfiCategories.map(c => (
                          <option key={c.id} value={String(c.id)}>{c.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <p className={labelClass}><Landmark size={12} /> Bank Paid From</p>
                  <select
                    aria-label="Filter by bank"
                    className={selectClass}
                    value={bankFilter}
                    onChange={e => { setBankFilter(e.target.value); setPage(1); }}
                  >
                    <option value="all">All Banks</option>
                    {banks.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <p className={labelClass}><Layers size={12} /> Type</p>
                  <select
                    aria-label="Filter by expense type"
                    className={selectClass}
                    value={kindFilter}
                    onChange={e => { setKindFilter(e.target.value); setPage(1); }}
                  >
                    <option value="all">All Expenses</option>
                    <option value="pfi">PFI Expenses</option>
                    <option value="general">General Expenses</option>
                  </select>
                </div>
              </div>

              {hasFilters && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    {timePreset !== 'all' && (
                      <FilterChip
                        icon={<CalendarDays size={11} />}
                        label={timePreset === 'custom'
                          ? `${customFrom || 'start'} → ${customTo || 'today'}`
                          : PRESETS.find(p => p.key === timePreset)?.label ?? ''}
                        onClear={() => { setTimePreset('all'); setCustomFrom(''); setCustomTo(''); setPage(1); }}
                      />
                    )}
                    {categoryFilter !== 'all' && (
                      <FilterChip
                        icon={<Tags size={11} />}
                        label={activeCategoryName ?? 'Category'}
                        onClear={() => { setCategoryFilter('all'); setPage(1); }}
                      />
                    )}
                    {bankFilter !== 'all' && (
                      <FilterChip
                        icon={<Landmark size={11} />}
                        label={bankFilter}
                        onClear={() => { setBankFilter('all'); setPage(1); }}
                      />
                    )}
                    {kindFilter !== 'all' && (
                      <FilterChip
                        icon={<Layers size={11} />}
                        label={kindFilter === 'pfi' ? 'PFI Expenses' : 'General Expenses'}
                        onClear={() => { setKindFilter('all'); setPage(1); }}
                      />
                    )}
                    {search && (
                      <FilterChip
                        icon={<Search size={11} />}
                        label={`"${search}"`}
                        onClear={() => setSearchInput('')}
                      />
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs text-slate-500" onClick={clearFilters}>
                    Clear all
                  </Button>
                </div>
              )}
            </div>

            {/* ── Table ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Receipt size={15} className="text-slate-400" />
                  Expense Entries
                  <span className="text-slate-400 font-normal">({totalCount})</span>
                </h2>
                <span className="text-sm font-semibold text-slate-900 tabular-nums">
                  {fmtNaira(expensesQuery.data?.total_amount)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Date</th>
                      <th className="px-4 py-3 text-left font-semibold">Category</th>
                      <th className="px-4 py-3 text-left font-semibold">Vendor</th>
                      <th className="px-4 py-3 text-left font-semibold">Description</th>
                      <th className="px-4 py-3 text-left font-semibold">Bank Paid From</th>
                      {seesAllEntries && <th className="px-4 py-3 text-left font-semibold">Added By</th>}
                      <th className="px-4 py-3 text-right font-semibold">Amount</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expensesQuery.isLoading ? (
                      <tr>
                        <td colSpan={seesAllEntries ? 8 : 7} className="px-4 py-12 text-center text-slate-400">
                          <Loader2 className="animate-spin inline mr-2" size={16} /> Loading expenses…
                        </td>
                      </tr>
                    ) : expensesQuery.isError ? (
                      <tr>
                        <td colSpan={seesAllEntries ? 8 : 7} className="px-4 py-12 text-center text-red-500">
                          {(expensesQuery.error as Error)?.message || 'Could not load expenses'}
                        </td>
                      </tr>
                    ) : expenses.length === 0 ? (
                      <tr>
                        <td colSpan={seesAllEntries ? 8 : 7} className="px-4 py-12 text-center text-slate-400">
                          {hasFilters ? 'No expenses match these filters.' : 'No expenses recorded yet.'}
                        </td>
                      </tr>
                    ) : (
                      expenses.map(exp => (
                        <tr key={exp.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 whitespace-nowrap text-slate-700">{fmtDate(exp.date)}</td>
                          <td className="px-4 py-3">
                            {exp.category_name ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium max-w-[260px] ${
                                  exp.category_is_pfi
                                    ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-100'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                                title={exp.category_name}
                              >
                                {exp.category_is_pfi && <Package size={11} className="shrink-0" />}
                                <span className="truncate">{exp.category_name}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{exp.vendor || '—'}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-[320px]">
                            <span className="block truncate" title={exp.description}>{exp.description || '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{exp.bank_paid_from || '—'}</td>
                          {seesAllEntries && (
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{exp.added_by_name || '—'}</td>
                          )}
                          <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                            {fmtNaira(exp.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                title="Edit expense"
                                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                onClick={() => { setEditing(exp); setShowForm(true); }}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                title="Delete expense"
                                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setPendingDelete(exp)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    Page {page} of {totalPages} · {totalCount} entries
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ExpenseFormDialog
        open={showForm}
        onOpenChange={open => { setShowForm(open); if (!open) setEditing(null); }}
        generalCategories={generalCategories}
        pfiCategories={pfiCategories}
        editing={editing}
        onSubmit={payload => saveMutation.mutate(payload)}
        isSaving={saveMutation.isPending}
      />

      <CategoryManagerDialog
        open={showCategories}
        onOpenChange={setShowCategories}
        generalCategories={generalCategories}
        pfiCategories={pfiCategories}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  {fmtNaira(pendingDelete.amount)} · {pendingDelete.category_name || 'Uncategorised'} ·{' '}
                  {fmtDate(pendingDelete.date)}
                  {pendingDelete.pfi_number
                    ? ` — it will also come off ${pendingDelete.pfi_number}'s total cost.`
                    : '.'}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FilterChip({ icon, label, onClear }: { icon: ReactNode; label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full max-w-[280px]">
      {icon}
      <span className="truncate">{label}</span>
      <button onClick={onClear} title="Remove filter" className="ml-0.5 hover:text-slate-900">
        <X size={10} />
      </button>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generalCategories: Category[];
  pfiCategories: Category[];
  editing: Expense | null;
  onSubmit: (payload: Record<string, unknown>) => void;
  isSaving: boolean;
}

const emptyForm = () => ({
  date: toISODate(new Date()),
  category: '',
  vendor: '',
  description: '',
  amount: '',
  bank_paid_from: '',
});

function ExpenseFormDialog({
  open, onOpenChange, generalCategories, pfiCategories, editing, onSubmit, isSaving,
}: ExpenseFormDialogProps) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(editing
      ? {
          date: editing.date,
          category: editing.category ? String(editing.category) : '',
          vendor: editing.vendor ?? '',
          description: editing.description ?? '',
          amount: editing.amount ?? '',
          bank_paid_from: editing.bank_paid_from ?? '',
        }
      : emptyForm());
  }, [editing, open]);

  const set = (key: keyof ReturnType<typeof emptyForm>, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const selectedCategory = [...pfiCategories, ...generalCategories]
    .find(c => String(c.id) === form.category);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const amount = form.amount.replace(/,/g, '').trim();
    if (!form.date) return toast.error('Pick a date');
    if (!form.category) return toast.error('Pick a category');
    if (!amount || Number(amount) <= 0) return toast.error('Enter an amount greater than zero');

    onSubmit({
      date: form.date,
      category: Number(form.category),
      vendor: form.vendor.trim(),
      description: form.description.trim(),
      amount,
      bank_paid_from: form.bank_paid_from.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Expense' : 'Add New Expense'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="expense-date" className={labelClass}>Date *</label>
              <Input
                id="expense-date"
                type="date"
                className="h-9 text-sm"
                value={form.date}
                onChange={e => set('date', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="expense-amount" className={labelClass}>Amount (₦) *</label>
              <Input
                id="expense-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="h-9 text-sm"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="expense-category" className={labelClass}>Category *</label>
            <select
              id="expense-category"
              className={selectClass}
              value={form.category}
              onChange={e => set('category', e.target.value)}
            >
              <option value="">Select a category…</option>
              {generalCategories.length > 0 && (
                <optgroup label="General Categories">
                  {generalCategories.map(c => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </optgroup>
              )}
              {pfiCategories.length > 0 && (
                <optgroup label="PFIs">
                  {pfiCategories.map(c => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {selectedCategory?.is_system_category && (
              <p className="text-xs text-amber-700 flex items-center gap-1.5">
                <Package size={12} />
                This expense will be added to {selectedCategory.name} in PFI Tracking.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="expense-vendor" className={labelClass}>Vendor</label>
            <Input
              id="expense-vendor"
              className="h-9 text-sm"
              placeholder="Who was paid, e.g. Ace Haulage"
              value={form.vendor}
              onChange={e => set('vendor', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="expense-description" className={labelClass}>Description</label>
            <Input
              id="expense-description"
              className="h-9 text-sm"
              placeholder="What the payment was for"
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="expense-bank" className={labelClass}>Bank Paid From</label>
            <Input
              id="expense-bank"
              className="h-9 text-sm"
              placeholder="e.g. Zenith Bank"
              value={form.bank_paid_from}
              onChange={e => set('bank_paid_from', e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              {editing ? 'Save Changes' : 'Add Expense'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface CategoryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generalCategories: Category[];
  pfiCategories: Category[];
}

function CategoryManagerDialog({
  open, onOpenChange, generalCategories, pfiCategories,
}: CategoryManagerDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description: string }) =>
      client.post('/expense-categories/', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setName(''); setDescription('');
      toast.success('Category created');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create category'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => client.delete(`/expense-categories/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Category deleted');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete category'),
  });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Category name is required');
    createMutation.mutate({ name: name.trim(), description: description.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Expense Categories</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <form onSubmit={handleCreate} className="space-y-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
            <p className="text-sm font-semibold text-slate-800">Add a general category</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                className="h-9 text-sm bg-white"
                placeholder="Name, e.g. Transportation"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <Input
                className="h-9 text-sm bg-white"
                placeholder="Description (optional)"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" className="gap-2" disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Category
            </Button>
          </form>

          <div className="space-y-2">
            <p className={labelClass}><Tags size={12} /> General Categories ({generalCategories.length})</p>
            {generalCategories.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">None yet — add one above.</p>
            ) : (
              <div className="space-y-2">
                {generalCategories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{cat.name}</p>
                      {cat.description && <p className="text-xs text-slate-500 truncate">{cat.description}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">
                        {cat.expense_count} {cat.expense_count === 1 ? 'expense' : 'expenses'} · {fmtNaira(cat.total_amount)}
                      </p>
                    </div>
                    <button
                      title="Delete category"
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                      onClick={() => deleteMutation.mutate(cat.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className={labelClass}><Package size={12} /> PFI Categories ({pfiCategories.length})</p>
            <p className="text-xs text-slate-500">
              Created automatically — every PFI is a category. Expenses filed here roll into that PFI's total cost.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {pfiCategories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-100 bg-amber-50/40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{cat.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {cat.expense_count} {cat.expense_count === 1 ? 'expense' : 'expenses'} · {fmtNaira(cat.total_amount)}
                      {cat.pfi_status ? ` · ${cat.pfi_status}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
