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
import { CommaInput } from '@/components/ui/comma-input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, X, Pencil, Trash2, Search, CalendarDays, Tags, Landmark,
  Package, Receipt, Wallet, FileDown, Loader2, Layers, Paperclip, Upload, Check,
  CheckCircle2, ShieldCheck, BadgeCheck, Banknote, XCircle, CornerUpLeft, Info, MoreHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { client, uploadFiles } from '@/api/client';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ExpenseStatus =
  | 'pending' | 'verified' | 'audit_approved' | 'admin_approved'
  | 'paid' | 'rejected' | 'changes_requested';

type ExpenseAction =
  | 'verify' | 'audit_approve' | 'admin_approve' | 'mark_paid'
  | 'reject' | 'request_changes';

/** Only PAID expenses reach a PFI's cost — the badge has to make that legible. */
const STATUS_STYLE: Record<ExpenseStatus, { label: string; cls: string; step: string }> = {
  pending:           { label: 'Pending',              step: '1 of 4', cls: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200' },
  verified:          { label: 'Verified',             step: '2 of 4', cls: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200' },
  audit_approved:    { label: 'CFO Approved',       step: '3 of 4', cls: 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200' },
  admin_approved:    { label: 'Approved for Payment', step: '4 of 4', cls: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  paid:              { label: 'Paid',                 step: 'done',   cls: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' },
  rejected:          { label: 'Rejected',             step: 'stopped', cls: 'bg-red-50 text-red-800 ring-1 ring-red-200' },
  changes_requested: { label: 'Changes Needed',       step: 'returned', cls: 'bg-orange-50 text-orange-800 ring-1 ring-orange-200' },
};

/** Button label, tone and icon for each transition the API says is available. */
/** Each transition gets the colour of the stage it moves the request INTO, so
 *  the button and the resulting badge always agree. `solid` is the filled
 *  button in the detail view; `subtle` is the compact one in the table row. */
const ACTION_META: Record<ExpenseAction, {
  label: string;
  title: string;
  icon: LucideIcon;
  solid: string;   // filled button in the detail dialog
  menu: string;    // tinted row in the table's action menu
}> = {
  verify: {
    label: 'Verify',
    title: 'Confirm the details are correct and send it to the CFO for approval',
    icon: CheckCircle2,
    solid: 'bg-sky-600 hover:bg-sky-700 text-white border-sky-600',
    menu: 'text-sky-700 focus:text-sky-700 focus:bg-sky-50',
  },
  audit_approve: {
    label: 'CFO Approve',
    title: 'Approve for payment and send it to the Admin for final sign-off',
    icon: ShieldCheck,
    solid: 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600',
    menu: 'text-indigo-700 focus:text-indigo-700 focus:bg-indigo-50',
  },
  admin_approve: {
    label: 'Final Approve',
    title: 'Give final approval — the Expenditure Officer can then pay it',
    icon: BadgeCheck,
    solid: 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600',
    menu: 'text-amber-800 focus:text-amber-800 focus:bg-amber-50',
  },
  mark_paid: {
    label: 'Mark as Paid',
    title: 'Payment has been made — this adds the amount to the PFI cost',
    icon: Banknote,
    solid: 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600',
    menu: 'text-emerald-700 focus:text-emerald-700 focus:bg-emerald-50',
  },
  reject: {
    label: 'Reject',
    title: 'Stop this request — the submitter and all approvers are notified',
    icon: XCircle,
    solid: 'bg-white hover:bg-red-50 text-red-700 border border-red-300',
    menu: 'text-red-700 focus:text-red-700 focus:bg-red-50',
  },
  request_changes: {
    label: 'Send Back',
    title: 'Return it to the submitter to fix and resubmit',
    icon: CornerUpLeft,
    solid: 'bg-white hover:bg-orange-50 text-orange-700 border border-orange-300',
    menu: 'text-orange-700 focus:text-orange-700 focus:bg-orange-50',
  },
};


interface ExpenseAttachment {
  id: number;
  file_name: string;
  content_type: string;
  size_bytes: number;
  url: string;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

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
  attachments: ExpenseAttachment[];
  attachment_count: number;
  status: ExpenseStatus;
  status_label: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string;
  review_history: Array<{
    action: string;
    action_label: string;
    note: string;
    by: string | null;
    at: string;
  }>;
  payee_bank_name: string;
  payee_account_number: string;
  payee_account_name: string;
  verified_by_name: string | null;
  audit_approved_by_name: string | null;
  admin_approved_by_name: string | null;
  paid_by_name: string | null;
  available_actions: ExpenseAction[];
  action_blocked_reason: string;
  created_at: string;
  verified_at: string | null;
  audit_approved_at: string | null;
  admin_approved_at: string | null;
  paid_at: string | null;
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
  can_review?: boolean;
  status_counts?: Record<string, number>;
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

const fmtBytes = (n: number) => {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [reviewing, setReviewing] = useState<{ expense: Expense; action: ExpenseAction } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  // After a reject/send-back, offer to correct the entry immediately.
  const [offerEdit, setOfferEdit] = useState<Expense | null>(null);
  const [timePreset, setTimePreset] = useState<TimePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const [viewing, setViewing] = useState<Expense | null>(null);
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
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    Object.entries(overrides).forEach(([k, v]) => params.set(k, v));
    return params;
  }, [search, categoryFilter, bankFilter, kindFilter, statusFilter, dateFrom, dateTo, page]);

  const expensesQuery = useQuery<ExpenseListResponse>({
    queryKey: ['expenses', { search, categoryFilter, bankFilter, kindFilter, statusFilter, dateFrom, dateTo, page }],
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
  // The modal holds a snapshot; re-point it at the refreshed row after any
  // action so its badge and buttons move with the request.
  const viewingLive = viewing ? expenses.find(e => e.id === viewing.id) ?? viewing : null;
  const totalCount = expensesQuery.data?.count ?? 0;
  const totalPages = expensesQuery.data?.total_pages ?? 1;
  const banks = expensesQuery.data?.banks ?? [];
  // Oversight roles (SuperAdmin/Admin/Audit) get everyone's entries back from
  // the API; everyone else is scoped to their own. The API decides — this only
  // controls how the page describes what's on screen.
  const seesAllEntries = expensesQuery.data?.scope !== 'own';
  // The API decides who may review; this only controls whether the buttons show.
  const canReview = !!expensesQuery.data?.can_review;
  const statusCounts = expensesQuery.data?.status_counts ?? {};

  const saveMutation = useMutation({
    mutationFn: async ({ payload, files }: { payload: Record<string, unknown>; files: File[] }) => {
      const saved = editing
        ? await client.patch(`/expenses/${editing.id}/update/`, payload)
        : await client.post('/expenses/create/', payload);

      // Files go up after the expense exists, since they hang off its id. A
      // failed upload must not read as a failed expense — the row is already
      // saved, so surface it separately rather than throwing.
      if (files.length) {
        try {
          await uploadFiles(`/expenses/${saved.id}/attachments/`, files);
        } catch (err) {
          toast.error(
            `Expense saved, but ${files.length} file${files.length > 1 ? 's' : ''} failed to upload: ${(err as Error).message}`,
          );
        }
      }
      return saved;
    },
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

  const reviewMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: number; action: string; note?: string }) =>
      client.post(`/expenses/${id}/review/`, { action, note: note ?? '' }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      // Approving changes a PFI's cost, so its screens must refresh too.
      queryClient.invalidateQueries({ queryKey: ['pfis'] });
      queryClient.invalidateQueries({ queryKey: ['pfi-expenses'] });
      toast.success(
        vars.action === 'mark_paid' ? 'Marked paid — it now counts towards the PFI cost'
        : vars.action === 'verify' ? 'Verified — sent to the CFO'
        : vars.action === 'audit_approve' ? 'CFO approved — sent to Admin for final approval'
        : vars.action === 'admin_approve' ? 'Approved for payment — sent to the Expenditure Officer'
        : vars.action === 'reject' ? 'Rejected — the submitter has been notified'
        : 'Sent back — the submitter has been notified',
      );
      // A reason was just recorded — the reviewer usually knows the fix, so
      // give them the chance to make it rather than waiting on a round trip.
      if (vars.action === 'reject' || vars.action === 'request_changes') {
        const target = reviewing?.expense ?? null;
        setOfferEdit(target);
      }
      setReviewing(null);
      setReviewNote('');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not complete the review'),
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
      // {
      //   title: 'Categories',
      //   value: String(categories.length),
      //   description: `${pfiCategories.length} PFI · ${generalCategories.length} general`,
      //   icon: <Tags size={18} />,
      //   tone: 'green',
      // },
    ];
  }, [expensesQuery.data, totalCount, categories.length, pfiCategories.length, generalCategories.length]);

  const hasFilters =
    !!search || categoryFilter !== 'all' || bankFilter !== 'all' ||
    kindFilter !== 'all' || statusFilter !== 'all' || timePreset !== 'all';

  const clearFilters = () => {
    setSearchInput(''); setSearch('');
    setCategoryFilter('all'); setBankFilter('all'); setKindFilter('all'); setStatusFilter('all');
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
                <div className="flex items-center gap-2 flex-wrap justify-end">
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
                    New Expense Request
                  </Button>
                </div>
              }
            />

            <SummaryCards cards={summaryCards} />

            {/* Status tabs — awaiting first, because that's the queue that needs work */}
            <div className="flex flex-wrap gap-1.5">
              {([
                ['all', 'All'],
                ['awaiting', 'In Progress'],
                ['pending', 'To Verify'],
                ['verified', 'With CFO'],
                ['audit_approved', 'With Admin'],
                ['admin_approved', 'To Pay'],
                ['paid', 'Paid'],
                ['rejected', 'Rejected'],
              ] as const).map(([key, label]) => {
                const n = statusCounts[key];
                const active = statusFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => { setStatusFilter(key); setPage(1); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : (key === 'awaiting' || key === 'admin_approved') && n > 0
                          ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                    {typeof n === 'number' && n > 0 && (
                      <span className={`ml-1.5 ${active ? 'text-slate-300' : 'text-slate-400'}`}>{n}</span>
                    )}
                  </button>
                );
              })}
            </div>

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
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
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
                        <td colSpan={seesAllEntries ? 9 : 8} className="px-4 py-12 text-center text-slate-400">
                          <Loader2 className="animate-spin inline mr-2" size={16} /> Loading expenses…
                        </td>
                      </tr>
                    ) : expensesQuery.isError ? (
                      <tr>
                        <td colSpan={seesAllEntries ? 9 : 8} className="px-4 py-12 text-center text-red-500">
                          {(expensesQuery.error as Error)?.message || 'Could not load expenses'}
                        </td>
                      </tr>
                    ) : expenses.length === 0 ? (
                      <tr>
                        <td colSpan={seesAllEntries ? 9 : 8} className="px-4 py-12 text-center text-slate-400">
                          {hasFilters ? 'No expenses match these filters.' : 'No expenses recorded yet.'}
                        </td>
                      </tr>
                    ) : (
                      expenses.map(exp => (
                        <tr
                          key={exp.id}
                          className="hover:bg-slate-50/70 cursor-pointer"
                          onClick={() => setViewing(exp)}
                        >
                          <td className="px-4 py-3 whitespace-nowrap text-slate-700">{fmtDate(exp.date)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[exp.status]?.cls ?? 'bg-slate-100 text-slate-600'}`}
                              title={exp.review_note || undefined}
                            >
                              {STATUS_STYLE[exp.status]?.label ?? exp.status}
                            </span>
                            {exp.review_note && (
                              <p className="mt-0.5 text-[11px] text-slate-500 max-w-[180px] truncate" title={exp.review_note}>
                                {exp.review_note}
                              </p>
                            )}
                          </td>
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
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="block truncate min-w-0" title={exp.description}>{exp.description || '—'}</span>
                              {exp.attachment_count > 0 && (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[11px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 shrink-0"
                                  title={`${exp.attachment_count} attachment${exp.attachment_count > 1 ? 's' : ''}`}
                                >
                                  <Paperclip size={10} />{exp.attachment_count}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 min-w-0">
                            <span className="block truncate" title={exp.bank_paid_from || undefined}>{exp.bank_paid_from || '—'}</span>
                            {exp.payee_account_name && (
                              <span
                                className="block text-[11px] text-slate-400 truncate"
                                title={`Pay to ${exp.payee_account_name} · ${exp.payee_bank_name} · ${exp.payee_account_number}`}
                              >
                                → {exp.payee_account_name}
                              </span>
                            )}
                          </td>
                          {seesAllEntries && (
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{exp.added_by_name || '—'}</td>
                          )}
                          <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                            {fmtNaira(exp.amount)}
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-end">
                              {/* One menu instead of a row of buttons — the table
                                  stays readable and every action is one click in. */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    title="Actions"
                                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                  >
                                    <MoreHorizontal size={16} />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  {(exp.available_actions ?? []).map(action => {
                                    const meta = ACTION_META[action];
                                    if (!meta) return null;
                                    const Icon = meta.icon;
                                    const needsNote = action === 'reject' || action === 'request_changes';
                                    return (
                                      <DropdownMenuItem
                                        key={action}
                                        className={`gap-2 text-[13px] cursor-pointer font-medium ${meta.menu}`}
                                        onClick={() => needsNote
                                          ? (setReviewing({ expense: exp, action }), setReviewNote(''))
                                          : reviewMutation.mutate({ id: exp.id, action })}
                                      >
                                        <Icon size={14} /> {meta.label}
                                      </DropdownMenuItem>
                                    );
                                  })}

                                  {(exp.available_actions ?? []).length > 0 && <DropdownMenuSeparator />}

                                  <DropdownMenuItem className="gap-2 text-[13px] cursor-pointer" onClick={() => setViewing(exp)}>
                                    <Info size={14} /> View details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="gap-2 text-[13px] cursor-pointer" onClick={() => { setEditing(exp); setShowForm(true); }}>
                                    <Pencil size={14} /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="gap-2 text-[13px] cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
                                    onClick={() => setPendingDelete(exp)}
                                  >
                                    <Trash2 size={14} /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
        onSubmit={(payload, files) => saveMutation.mutate({ payload, files })}
        isSaving={saveMutation.isPending}
      />

      <CategoryManagerDialog
        open={showCategories}
        onOpenChange={setShowCategories}
        generalCategories={generalCategories}
        pfiCategories={pfiCategories}
      />


      {/* ── Detail view — everything about one request, plus its actions ── */}
      <Dialog open={!!viewingLive} onOpenChange={open => { if (!open) setViewing(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto min-w-0">
          {viewingLive && (() => {
            const v = viewingLive;
            const st = STATUS_STYLE[v.status];
            const trail: Array<[string, string | null, string | null]> = [
              ['Submitted', v.added_by_name, v.created_at],
              ['Verified', v.verified_by_name, v.verified_at],
              ['CFO approved', v.audit_approved_by_name, v.audit_approved_at],
              ['Final approved', v.admin_approved_by_name, v.admin_approved_at],
              ['Paid', v.paid_by_name, v.paid_at],
            ];
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-start justify-between gap-3 min-w-0">
                    <span className="min-w-0">
                      <span className="block text-xl font-bold text-slate-900">{fmtNaira(v.amount)}</span>
                      <span className="block text-sm font-normal text-slate-500 truncate" title={v.category_name || ''}>
                        {v.category_name || 'Uncategorised'}
                      </span>
                    </span>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${st?.cls}`}>
                      {st?.label} <span className="opacity-60">· {st?.step}</span>
                    </span>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 min-w-0">
                  {v.review_note && (
                    <div className={`rounded-md border-l-2 p-3 text-sm ${
                      v.status === 'rejected' ? 'border-red-400 bg-red-50 text-red-900' : 'border-orange-400 bg-orange-50 text-orange-900'
                    }`}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70 mb-0.5">Reviewer note</p>
                      {v.review_note}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm min-w-0">
                    <Detail label="Date" value={fmtDate(v.date)} />
                    <Detail label="PFI" value={v.pfi_number || '—'} />
                    <Detail label="Vendor" value={v.vendor || '—'} />
                    <Detail label="Paid from" value={v.bank_paid_from || '—'} />
                    <div className="col-span-2">
                      <Detail label="Description" value={v.description || '—'} />
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 space-y-2 min-w-0">
                    <p className={labelClass}><Landmark size={12} /> Payment Destination</p>
                    {v.payee_account_name || v.payee_bank_name || v.payee_account_number ? (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm min-w-0">
                        <div className="col-span-2"><Detail label="Account name" value={v.payee_account_name || '—'} /></div>
                        <Detail label="Bank" value={v.payee_bank_name || '—'} />
                        <Detail label="Account number" value={v.payee_account_number || '—'} />
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">No payment destination recorded.</p>
                    )}
                  </div>

                  {v.attachments?.length > 0 && (
                    <div className="space-y-1.5 min-w-0">
                      <p className={labelClass}><Paperclip size={12} /> Attachments ({v.attachments.length})</p>
                      {v.attachments.map(att => (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50 min-w-0"
                        >
                          <Paperclip size={13} className="text-slate-400 shrink-0" />
                          <span className="text-sm text-blue-600 truncate flex-1 min-w-0">{att.file_name}</span>
                          <span className="text-xs text-slate-400 shrink-0">{fmtBytes(att.size_bytes)}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Every reason ever given, permanently. Kept separate from
                      the current note, which is overwritten on each transition. */}
                  {v.review_history?.length > 0 && (
                    <div className="space-y-1.5 min-w-0">
                      <p className={labelClass}><Info size={12} /> Reasons Given ({v.review_history.length})</p>
                      <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
                        {v.review_history.map((h, i) => (
                          <div key={i} className="px-3 py-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                                h.action === 'rejected' ? 'bg-red-100 text-red-700'
                                : h.action === 'changes_requested' ? 'bg-orange-100 text-orange-700'
                                : 'bg-slate-100 text-slate-600'
                              }`}>
                                {h.action_label}
                              </span>
                              <span className="text-[11px] text-slate-400 truncate">
                                {h.by || '—'} · {fmtDate(h.at.slice(0, 10))}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 mt-1 break-words">{h.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Approval trail — who moved it and when */}
                  <div className="space-y-1.5 min-w-0">
                    <p className={labelClass}><Check size={12} /> Approval Trail</p>
                    <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
                      {trail.map(([step, who, when]) => (
                        <div key={step} className="flex items-center gap-3 px-3 py-2 min-w-0">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${when ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                          <span className={`text-sm shrink-0 w-32 ${when ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{step}</span>
                          <span className="text-sm text-slate-500 truncate flex-1 min-w-0">{who || (when ? '—' : 'Not yet')}</span>
                          <span className="text-xs text-slate-400 shrink-0">{when ? fmtDate(when.slice(0, 10)) : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions the API says this user may take right now. When
                      there are none, say why rather than showing an empty row. */}
                  {(v.available_actions ?? []).length === 0 && v.action_blocked_reason && (
                    <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-slate-600">{v.action_blocked_reason}</p>
                    </div>
                  )}

                  {(v.available_actions ?? []).length > 0 && (
                    <div className="pt-3 border-t border-slate-200 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Decision
                      </p>
                      <div className="flex gap-2">
                        {(v.available_actions ?? []).map(action => {
                          const meta = ACTION_META[action];
                          if (!meta) return null;
                          const Icon = meta.icon;
                          const needsNote = action === 'reject' || action === 'request_changes';
                          // Only the button actually in flight spins.
                          const busy = reviewMutation.isPending
                            && reviewMutation.variables?.id === v.id
                            && reviewMutation.variables?.action === action;
                          return (
                            <button
                              key={action}
                              type="button"
                              title={meta.title}
                              disabled={reviewMutation.isPending}
                              onClick={() => needsNote
                                ? (setReviewing({ expense: v, action }), setReviewNote(''))
                                : reviewMutation.mutate({ id: v.id, action })}
                              className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1.5
                                rounded-md px-3 py-2.5 text-[13px] font-semibold shadow-sm transition-colors
                                disabled:opacity-50 disabled:cursor-not-allowed ${meta.solid}`}
                            >
                              {busy ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Icon size={14} className="shrink-0" />}
                              <span className="truncate">{meta.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Record management, filled and colour-coded so each one is
                      unmistakable — Delete sits apart from the decision row above. */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => { setViewing(null); setEditing(v); setShowForm(true); }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2.5 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewing(null)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2.5 text-[13px] font-semibold text-white bg-slate-600 hover:bg-slate-700 shadow-sm transition-colors"
                    >
                      <X size={14} /> Close
                    </button>
                    <button
                      type="button"
                      onClick={() => { setViewing(null); setPendingDelete(v); }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2.5 text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-colors"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Turning something down needs a reason the submitter can act on. */}
      <Dialog open={!!reviewing} onOpenChange={open => { if (!open) { setReviewing(null); setReviewNote(''); } }}>
        <DialogContent className="max-w-md min-w-0">
          <DialogHeader>
            <DialogTitle>
              {reviewing?.action === 'reject' ? 'Reject this request' : 'Send back for changes'}
            </DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-3 min-w-0">
              <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-sm min-w-0">
                <p className="font-semibold text-slate-900">{fmtNaira(reviewing.expense.amount)}</p>
                <p className="text-slate-500 truncate" title={reviewing.expense.category_name || ''}>
                  {reviewing.expense.category_name || 'Uncategorised'} · {fmtDate(reviewing.expense.date)}
                </p>
                {reviewing.expense.added_by_name && (
                  <p className="text-xs text-slate-400 mt-0.5">Submitted by {reviewing.expense.added_by_name}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="review-note" className={labelClass}>
                  {reviewing.action === 'reject' ? 'Why is this rejected?' : 'What needs changing?'} *
                </label>
                <Input
                  id="review-note"
                  className="h-9 text-sm"
                  placeholder={reviewing.action === 'reject' ? 'e.g. Duplicate of expense #42' : 'e.g. Attach the receipt'}
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => { setReviewing(null); setReviewNote(''); }}>Cancel</Button>
                <Button
                  className={reviewing.action === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}
                  disabled={!reviewNote.trim() || reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ id: reviewing.expense.id, action: reviewing.action, note: reviewNote.trim() })}
                >
                  {reviewMutation.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                  {reviewing.action === 'reject' ? 'Reject' : 'Request Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* Reason recorded — offer to fix the entry there and then. */}
      <AlertDialog open={!!offerEdit} onOpenChange={open => { if (!open) setOfferEdit(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reason saved. Edit this entry now?</AlertDialogTitle>
            <AlertDialogDescription>
              {offerEdit && (
                <>
                  Your reason has been recorded permanently against{' '}
                  {fmtNaira(offerEdit.amount)} · {offerEdit.category_name || 'Uncategorised'}.
                  You can correct the entry yourself now, or leave it for{' '}
                  {offerEdit.added_by_name || 'the submitter'} to fix.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Leave it to them</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = offerEdit;
                setOfferEdit(null);
                setViewing(null);
                if (target) { setEditing(target); setShowForm(true); }
              }}
            >
              Edit it now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-800 break-words">{value}</p>
    </div>
  );
}

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
  onSubmit: (payload: Record<string, unknown>, files: File[]) => void;
  isSaving: boolean;
}

const emptyForm = () => ({
  date: toISODate(new Date()),
  category: '',
  vendor: '',
  description: '',
  amount: '',
  bank_paid_from: '',
  payee_bank_name: '',
  payee_account_number: '',
  payee_account_name: '',
});

function ExpenseFormDialog({
  open, onOpenChange, generalCategories, pfiCategories, editing, onSubmit, isSaving,
}: ExpenseFormDialogProps) {
  const [form, setForm] = useState(emptyForm);
  // Files chosen but not yet uploaded — they go up after the expense is saved,
  // since attachments hang off its id.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [existing, setExisting] = useState<ExpenseAttachment[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setPendingFiles([]);
    setExisting(editing?.attachments ?? []);
    setForm(editing
      ? {
          date: editing.date,
          category: editing.category ? String(editing.category) : '',
          vendor: editing.vendor ?? '',
          description: editing.description ?? '',
          amount: editing.amount ?? '',
          bank_paid_from: editing.bank_paid_from ?? '',
          payee_bank_name: editing.payee_bank_name ?? '',
          payee_account_number: editing.payee_account_number ?? '',
          payee_account_name: editing.payee_account_name ?? '',
        }
      : emptyForm());
  }, [editing, open]);

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    // Append rather than replace, so picking twice keeps both batches.
    setPendingFiles(prev => [...prev, ...Array.from(list)]);
  };

  const removePending = (idx: number) =>
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  const removeExisting = async (att: ExpenseAttachment) => {
    setRemovingId(att.id);
    try {
      await client.delete(`/expense-attachments/${att.id}/`);
      setExisting(prev => prev.filter(a => a.id !== att.id));
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('File removed');
    } catch (err) {
      toast.error((err as Error).message || 'Could not remove the file');
    } finally {
      setRemovingId(null);
    }
  };

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
      payee_bank_name: form.payee_bank_name.trim(),
      payee_account_number: form.payee_account_number.trim(),
      payee_account_name: form.payee_account_name.trim(),
    }, pendingFiles);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Expense' : 'Add New Expense'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 min-w-0">
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
              <CommaInput
                id="expense-amount"
                placeholder="0.00"
                className="h-9 text-sm"
                value={form.amount}
                onValueChange={value => set('amount', value)}
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
              placeholder="Who is to be paid e.g ACME Ltd"
              value={form.vendor}
              onChange={e => set('vendor', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="expense-description" className={labelClass}>Description</label>
            <Input
              id="expense-description"
              className="h-9 text-sm"
              placeholder="Payment for..."
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

          {/* Where the money is going — approvers see this before authorising. */}
          <div className="space-y-2 min-w-0 rounded-md border border-slate-200 bg-slate-50/60 p-3">
            <p className={labelClass}><Landmark size={12} /> Payment Destination</p>
            <div className="space-y-1.5">
              <label htmlFor="payee-name" className="text-[11px] font-medium text-slate-500">Account Name</label>
              <Input id="payee-name" className="h-9 text-sm bg-white" placeholder=" "
                value={form.payee_account_name} onChange={e => set('payee_account_name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="payee-bank" className="text-[11px] font-medium text-slate-500">Bank Name</label>
                <Input id="payee-bank" className="h-9 text-sm bg-white" placeholder="e.g. Zenith Bank"
                  value={form.payee_bank_name} onChange={e => set('payee_bank_name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="payee-acct" className="text-[11px] font-medium text-slate-500">Account Number</label>
                <Input id="payee-acct" className="h-9 text-sm bg-white" placeholder="10 digits"
                  value={form.payee_account_number} onChange={e => set('payee_account_number', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Attachments — receipts, invoices, photos. Any type, any size, any number. */}
          <div className="space-y-2 min-w-0">
            <label className={labelClass}><Paperclip size={12} /> Attachments</label>

            {existing.length > 0 && (
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {existing.map(att => (
                  <div key={att.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 min-w-0">
                    <Paperclip size={13} className="text-slate-400 shrink-0" />
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-blue-600 hover:underline truncate flex-1 min-w-0"
                      title={att.file_name}
                    >
                      {att.file_name}
                    </a>
                    <span className="text-xs text-slate-400 shrink-0 tabular-nums">{fmtBytes(att.size_bytes)}</span>
                    <button
                      type="button"
                      title="Remove file"
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0 disabled:opacity-50"
                      disabled={removingId === att.id}
                      onClick={() => removeExisting(att)}
                    >
                      {removingId === att.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {pendingFiles.length > 0 && (
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {pendingFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border border-dashed border-blue-200 bg-blue-50/50 px-3 py-2 min-w-0">
                    <Upload size={13} className="text-blue-500 shrink-0" />
                    <span className="text-sm text-slate-700 truncate flex-1 min-w-0" title={f.name}>{f.name}</span>
                    <span className="text-xs text-slate-400 shrink-0 tabular-nums">{fmtBytes(f.size)}</span>
                    <button
                      type="button"
                      title="Remove"
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                      onClick={() => removePending(i)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label className="flex flex-wrap items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-200 bg-slate-50/60 px-3 py-3 text-center text-sm text-slate-500 cursor-pointer hover:bg-slate-100 hover:border-slate-300 transition-colors">
              <Upload size={14} />
              {pendingFiles.length || existing.length ? 'Add more files' : 'Attach receipts, invoices or photos'}
              <input
                type="file"
                multiple
                className="hidden"
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
              />
            </label>
            <p className="text-[11px] text-slate-400">
              Any file type, any size, as many as you like.
              {!editing && pendingFiles.length > 0 && ' They upload once the expense is saved.'}
            </p>
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

        <div className="space-y-5 min-w-0">
          <form onSubmit={handleCreate} className="space-y-3 p-4 rounded-lg border border-slate-200 bg-slate-50 min-w-0">
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
                  <div key={cat.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 min-w-0">
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
                <div key={cat.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-100 bg-amber-50/40 min-w-0">
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
