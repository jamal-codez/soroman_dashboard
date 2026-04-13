// filepath: /Users/sableboxx/soroman_dashboard-2/src/pages/Records.tsx
//
// RECORDS — Management view for all submitted records.
// Features: Excel export, time-period filters, summary cards, amount totals,
// expense tracking, bulk approve/decline, detail dialog.
//
import { useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
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
import { useToast } from '@/hooks/use-toast';
import {
  Search, FileText, FileSpreadsheet, FileImage, File, Download, Trash2,
  FolderOpen, X, Paperclip, FileArchive, CheckCircle2, XCircle, Clock,
  Eye, Loader2, Receipt, Banknote, TrendingDown,
  Calendar as CalendarIcon, CircleDollarSign, AlertTriangle,
} from 'lucide-react';
import {
  format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, startOfDay, endOfDay, subDays, isWithinInterval,
} from 'date-fns';
import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Backend record shape
// ---------------------------------------------------------------------------

type BackendRecord = {
  id: number;
  category: string;
  title: string;
  description: string;
  amount: string | null;
  status: 'pending' | 'approved' | 'declined';
  extra: Record<string, unknown>;
  file: string | null;
  submitted_by: number | null;
  submitted_by_name: string;
  pfi_id: number | null;
  pfi_number: string;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TimePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';

const TYPE_META: Record<string, { label: string; textColor: string; bgColor: string }> = {
  payment_record:   { label: 'Payment',       textColor: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  daily_sales:      { label: 'Daily Sales',   textColor: 'text-blue-600',    bgColor: 'bg-blue-50' },
  ticket_inventory: { label: 'Tickets',       textColor: 'text-purple-600',  bgColor: 'bg-purple-50' },
  expense_request:  { label: 'Expense',       textColor: 'text-red-600',     bgColor: 'bg-red-50' },
  receipt:          { label: 'Receipt',       textColor: 'text-green-600',   bgColor: 'bg-green-50' },
  report:           { label: 'Report',        textColor: 'text-amber-600',   bgColor: 'bg-amber-50' },
  invoice:          { label: 'Invoice',       textColor: 'text-blue-600',    bgColor: 'bg-blue-50' },
  letter:           { label: 'Letter / Memo', textColor: 'text-amber-600',   bgColor: 'bg-amber-50' },
  other:            { label: 'Other',         textColor: 'text-slate-500',   bgColor: 'bg-slate-50' },
};

const STATUS_BG: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  declined: 'bg-red-50 text-red-700 border-red-200',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fileIcon = (type: string, size = 16) => {
  if (type.includes('pdf')) return <FileText className="text-red-500" size={size} />;
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv'))
    return <FileSpreadsheet className="text-green-600" size={size} />;
  if (type.includes('image')) return <FileImage className="text-blue-500" size={size} />;
  if (type.includes('zip') || type.includes('rar'))
    return <FileArchive className="text-amber-600" size={size} />;
  return <File className="text-slate-500" size={size} />;
};

const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy'); }
  catch { return iso; }
};

const fmtDateShort = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM'); }
  catch { return iso; }
};

const fmtDateTime = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy, HH:mm'); }
  catch { return iso; }
};

const toNum = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmtAmount = (v: string | number | null | undefined) => {
  const n = toNum(v);
  if (n === 0 && !v) return '';
  return `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const fmtAmountShort = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const downloadBackendFile = (url: string, filename?: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || url.split('/').pop() || 'download';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const fileNameFromUrl = (url: string) => {
  try { return decodeURIComponent(url.split('/').pop() || ''); } catch { return url; }
};

const guessFileType = (url: string) => {
  const lower = url.toLowerCase();
  if (lower.includes('.pdf')) return 'pdf';
  if (lower.match(/\.(xlsx?|csv)/)) return 'sheet';
  if (lower.match(/\.(jpe?g|png|gif|webp|bmp|svg)/)) return 'image';
  if (lower.match(/\.(zip|rar|7z|tar|gz)/)) return 'zip';
  return 'other';
};

const descPreview = (desc: string, max = 50) => {
  const clean = desc.split('\n').filter((l) => !l.startsWith('PFI:')).join(' ').trim();
  if (!clean) return '—';
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
};

const cleanDescription = (desc: string) =>
  desc.split('\n').filter((l) => !l.startsWith('PFI:')).join('\n').trim();

const matchesDateRange = (dateStr: string | undefined, from: Date | null, to: Date | null): boolean => {
  if (!dateStr || (!from && !to)) return true;
  try {
    const d = parseISO(dateStr);
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Records() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const role = parseInt(localStorage.getItem('role') || '10');
  const isAdmin = role <= 1;

  // ── Filters ────────────────────────────────────────────────────────
  const [timePreset, setTimePreset] = useState<TimePreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [submitterFilter, setSubmitterFilter] = useState<string | null>(null);
  const [pfiFilter, setPfiFilter] = useState<string | null>(null);

  // ── Dialogs ────────────────────────────────────────────────────────
  const [viewRecord, setViewRecord] = useState<BackendRecord | null>(null);
  const [actionRecord, setActionRecord] = useState<BackendRecord | null>(null);
  const [actionType, setActionType] = useState<'approved' | 'declined'>('approved');
  const [actionNote, setActionNote] = useState('');
  const [deleteRecord, setDeleteRecord] = useState<BackendRecord | null>(null);

  // ── Bulk selection ─────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ═══════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════

  const { data: recordsRaw = [], isLoading, isError, error } = useQuery<BackendRecord[]>({
    queryKey: ['records'],
    queryFn: async () => {
      const res = await apiClient.admin.getRecords();
      return Array.isArray(res) ? res : (res?.results ?? []);
    },
    staleTime: 30_000,
  });

  const records = recordsRaw;

  // ═══════════════════════════════════════════════════════════════════
  // Date range
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

  const timeFilteredRecords = useMemo(
    () => records.filter((r) => matchesDateRange(r.created_at, dateRange.from, dateRange.to)),
    [records, dateRange]
  );

  const submitters = useMemo(
    () => Array.from(new Set(timeFilteredRecords.map((r) => r.submitted_by_name))).sort(),
    [timeFilteredRecords]
  );

  const pfiNumbers = useMemo(() => {
    const set = new Set<string>();
    timeFilteredRecords.forEach((r) => {
      const pfi = r.pfi_number || (r.extra?.pfi_number ? String(r.extra.pfi_number) : '');
      if (pfi) set.add(pfi);
    });
    return Array.from(set).sort();
  }, [timeFilteredRecords]);

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    timeFilteredRecords.forEach((r) => (m[r.category] = (m[r.category] || 0) + 1));
    return m;
  }, [timeFilteredRecords]);

  const statusCounts = useMemo(() => {
    const m = { pending: 0, approved: 0, declined: 0 };
    timeFilteredRecords.forEach((r) => {
      if (r.status in m) m[r.status as keyof typeof m] += 1;
    });
    return m;
  }, [timeFilteredRecords]);

  const filtered = useMemo(() => {
    return timeFilteredRecords
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.submitted_by_name.toLowerCase().includes(q) ||
          (r.amount && r.amount.includes(q)) ||
          (r.pfi_number && r.pfi_number.toLowerCase().includes(q)) ||
          (r.extra?.pfi_number && String(r.extra.pfi_number).toLowerCase().includes(q))
        );
      })
      .filter((r) => !typeFilter || r.category === typeFilter)
      .filter((r) => !statusFilter || r.status === statusFilter)
      .filter((r) => !submitterFilter || r.submitted_by_name === submitterFilter)
      .filter((r) => {
        if (!pfiFilter) return true;
        const pfi = r.pfi_number || (r.extra?.pfi_number ? String(r.extra.pfi_number) : '');
        return pfi === pfiFilter;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [timeFilteredRecords, search, typeFilter, statusFilter, submitterFilter, pfiFilter]);

  // ═══════════════════════════════════════════════════════════════════
  // Financial summaries
  // ═══════════════════════════════════════════════════════════════════

  const financials = useMemo(() => {
    let totalAmount = 0;
    let pendingAmount = 0;
    let approvedAmount = 0;
    let declinedAmount = 0;
    let expenseTotal = 0;
    let expensePending = 0;
    let expenseApproved = 0;
    let paymentTotal = 0;
    let receiptTotal = 0;

    timeFilteredRecords.forEach((r) => {
      const amt = toNum(r.amount);
      totalAmount += amt;
      if (r.status === 'pending') pendingAmount += amt;
      if (r.status === 'approved') approvedAmount += amt;
      if (r.status === 'declined') declinedAmount += amt;
      if (r.category === 'expense_request') {
        expenseTotal += amt;
        if (r.status === 'pending') expensePending += amt;
        if (r.status === 'approved') expenseApproved += amt;
      }
      if (r.category === 'payment_record') paymentTotal += amt;
      if (r.category === 'receipt') receiptTotal += amt;
    });

    return {
      totalAmount, pendingAmount, approvedAmount, declinedAmount,
      expenseTotal, expensePending, expenseApproved,
      paymentTotal, receiptTotal,
    };
  }, [timeFilteredRecords]);

  // ═══════════════════════════════════════════════════════════════════
  // Summary cards
  // ═══════════════════════════════════════════════════════════════════

  const periodLabel = timePreset === 'custom'
    ? `${customFrom ? format(parseISO(customFrom), 'dd MMM') : '?'} – ${customTo ? format(parseISO(customTo), 'dd MMM yyyy') : '?'}`
    : timePreset === 'all' ? 'All Time' : timePreset.charAt(0).toUpperCase() + timePreset.slice(1);

  const summaryCards = useMemo((): SummaryCard[] => [
    {
      title: 'Total Records',
      value: String(timeFilteredRecords.length),
      description: `${statusCounts.pending} pending review`,
      icon: <FolderOpen size={20} />,
      tone: 'neutral',
    },
    {
      title: 'Pending Amount',
      value: fmtAmountShort(financials.pendingAmount),
      description: `${statusCounts.pending} record${statusCounts.pending !== 1 ? 's' : ''} awaiting action`,
      icon: <Clock size={20} />,
      tone: 'amber',
    },
    {
      title: 'Expense Requests',
      value: fmtAmountShort(financials.expenseTotal),
      description: financials.expensePending > 0
        ? `${fmtAmountShort(financials.expensePending)} pending · ${fmtAmountShort(financials.expenseApproved)} approved`
        : `${fmtAmountShort(financials.expenseApproved)} approved`,
      icon: <Receipt size={20} />,
      tone: 'red',
    },
    {
      title: 'Payments Recorded',
      value: fmtAmountShort(financials.paymentTotal),
      description: `${typeCounts['payment_record'] || 0} payment records`,
      icon: <Banknote size={20} />,
      tone: 'green',
    },
    {
      title: 'Approved Total',
      value: fmtAmountShort(financials.approvedAmount),
      description: `${statusCounts.approved} approved records`,
      icon: <CheckCircle2 size={20} />,
      tone: 'green',
    },
    {
      title: 'Receipts / Proof',
      value: fmtAmountShort(financials.receiptTotal),
      description: `${typeCounts['receipt'] || 0} receipts attached`,
      icon: <CircleDollarSign size={20} />,
      tone: 'neutral',
    },
  ], [timeFilteredRecords, statusCounts, typeCounts, financials]);

  // ═══════════════════════════════════════════════════════════════════
  // Totals for filtered rows
  // ═══════════════════════════════════════════════════════════════════

  const filteredTotals = useMemo(() => {
    let total = 0;
    let expenses = 0;
    let payments = 0;
    filtered.forEach((r) => {
      const amt = toNum(r.amount);
      total += amt;
      if (r.category === 'expense_request') expenses += amt;
      if (r.category === 'payment_record') payments += amt;
    });
    return { total, expenses, payments };
  }, [filtered]);

  // ═══════════════════════════════════════════════════════════════════
  // Mutations
  // ═══════════════════════════════════════════════════════════════════

  const approveMut = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      apiClient.admin.approveRecord(id, note),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['records'] });
      toast({ title: '✅ Record Approved', description: `Record #${vars.id} has been approved.` });
      setActionRecord(null);
      setActionNote('');
      setSelectedIds(new Set());
    },
    onError: (err) => {
      toast({ title: 'Approve failed', description: String(err), variant: 'destructive' });
    },
  });

  const declineMut = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      apiClient.admin.declineRecord(id, note),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['records'] });
      toast({ title: '❌ Record Declined', description: `Record #${vars.id} has been declined.` });
      setActionRecord(null);
      setActionNote('');
      setSelectedIds(new Set());
    },
    onError: (err) => {
      toast({ title: 'Decline failed', description: String(err), variant: 'destructive' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.admin.deleteRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records'] });
      toast({ title: 'Record deleted' });
      setDeleteRecord(null);
      if (viewRecord?.id === deleteRecord?.id) setViewRecord(null);
    },
    onError: (err) => {
      toast({ title: 'Delete failed', description: String(err), variant: 'destructive' });
    },
  });

  // ── Bulk mutations ─────────────────────────────────────────────────
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const handleBulkAction = useCallback(async (action: 'approved' | 'declined') => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    let success = 0;
    let failed = 0;
    for (const id of selectedIds) {
      try {
        if (action === 'approved') {
          await apiClient.admin.approveRecord(id, 'Bulk approved');
        } else {
          await apiClient.admin.declineRecord(id, 'Bulk declined');
        }
        success++;
      } catch {
        failed++;
      }
    }
    queryClient.invalidateQueries({ queryKey: ['records'] });
    setSelectedIds(new Set());
    setBulkProcessing(false);
    toast({
      title: action === 'approved' ? `✅ ${success} Approved` : `❌ ${success} Declined`,
      description: failed > 0 ? `${failed} failed` : undefined,
    });
  }, [selectedIds, queryClient, toast]);

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const handlePresetChange = (preset: TimePreset) => {
    setTimePreset(preset);
    if (preset !== 'custom') { setCustomFrom(''); setCustomTo(''); }
  };

  const quickAction = (rec: BackendRecord, type: 'approved' | 'declined') => {
    setActionType(type);
    setActionNote('');
    setActionRecord(rec);
  };

  const handleStatusChange = () => {
    if (!actionRecord) return;
    if (actionType === 'approved') {
      approveMut.mutate({ id: actionRecord.id, note: actionNote.trim() });
    } else {
      declineMut.mutate({ id: actionRecord.id, note: actionNote.trim() });
    }
  };

  const handleDelete = () => {
    if (!deleteRecord) return;
    deleteMut.mutate(deleteRecord.id);
  };

  const hasFilters = !!(typeFilter || statusFilter || submitterFilter || pfiFilter || search);
  const clearFilters = () => {
    setTypeFilter(null);
    setStatusFilter(null);
    setSubmitterFilter(null);
    setPfiFilter(null);
    setSearch('');
  };

  // ── Selection helpers ──────────────────────────────────────────────
  const pendingFiltered = filtered.filter((r) => r.status === 'pending');
  const allPendingSelected = pendingFiltered.length > 0 && pendingFiltered.every((r) => selectedIds.has(r.id));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingFiltered.map((r) => r.id)));
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // Export to Excel
  // ═══════════════════════════════════════════════════════════════════

  const exportToExcel = useCallback(() => {
    if (filtered.length === 0) {
      toast({ title: 'Nothing to export', description: 'No records match your current filters.', variant: 'destructive' });
      return;
    }

    const period = timePreset === 'custom'
      ? `${customFrom || '?'}_TO_${customTo || '?'}`
      : timePreset.toUpperCase();

    // ── Main records sheet ────────────────────────────────────────
    const mainRows = filtered.map((r) => {
      const tm = TYPE_META[r.category] || TYPE_META.other;
      const amt = toNum(r.amount);
      const pfi = r.pfi_number || (r.extra?.pfi_number ? String(r.extra.pfi_number) : '');
      return {
        'Date': r.created_at ? fmtDate(r.created_at) : '',
        'Type': tm.label,
        'Title': r.title,
        'Description': cleanDescription(r.description),
        'PFI Reference': pfi,
        'Amount (₦)': amt || '',
        'Status': r.status.charAt(0).toUpperCase() + r.status.slice(1),
        'Submitted By': r.submitted_by_name,
        'Has File': r.file ? 'Yes' : 'No',
        'Record ID': r.id,
      };
    });

    // ── Expense summary sheet ─────────────────────────────────────
    const expenseRecords = filtered.filter((r) => r.category === 'expense_request');
    const expenseRows = expenseRecords.map((r) => {
      const amt = toNum(r.amount);
      const itemTitle = r.extra?.itemTitle ? String(r.extra.itemTitle) : r.title.replace('Expense - ', '');
      const reason = r.extra?.reason ? String(r.extra.reason) : cleanDescription(r.description);
      return {
        'Date': r.created_at ? fmtDate(r.created_at) : '',
        'Expense Item': itemTitle,
        'Reason': reason,
        'Amount (₦)': amt || '',
        'Status': r.status.charAt(0).toUpperCase() + r.status.slice(1),
        'Requested By': r.submitted_by_name,
        'PFI': r.pfi_number || (r.extra?.pfi_number ? String(r.extra.pfi_number) : ''),
      };
    });

    // ── Payment summary sheet ─────────────────────────────────────
    const paymentRecords = filtered.filter((r) => r.category === 'payment_record');
    const paymentRows: Record<string, unknown>[] = [];
    paymentRecords.forEach((r) => {
      const lines = (r.extra?.lines as Array<{
        product: string; rate: string; litres: string; ticketNo?: string; buyer: string;
      }>) || [];
      if (lines.length > 0) {
        lines.forEach((line) => {
          paymentRows.push({
            'Date': r.created_at ? fmtDate(r.created_at) : '',
            'Product': line.product,
            'Rate (₦/ltr)': toNum(line.rate) || '',
            'Litres': toNum(line.litres) || '',
            'Total (₦)': (toNum(line.rate) * toNum(line.litres)) || '',
            'Ticket No': line.ticketNo || '',
            'Buyer': line.buyer,
            'Status': r.status.charAt(0).toUpperCase() + r.status.slice(1),
            'Submitted By': r.submitted_by_name,
            'PFI': r.pfi_number || (r.extra?.pfi_number ? String(r.extra.pfi_number) : ''),
          });
        });
      } else {
        paymentRows.push({
          'Date': r.created_at ? fmtDate(r.created_at) : '',
          'Product': '',
          'Rate (₦/ltr)': '',
          'Litres': '',
          'Total (₦)': toNum(r.amount) || '',
          'Ticket No': '',
          'Buyer': '',
          'Status': r.status.charAt(0).toUpperCase() + r.status.slice(1),
          'Submitted By': r.submitted_by_name,
          'PFI': r.pfi_number || '',
        });
      }
    });

    // ── Summary totals sheet ──────────────────────────────────────
    const byType = new Map<string, { count: number; total: number; pending: number; approved: number; declined: number }>();
    filtered.forEach((r) => {
      const tm = TYPE_META[r.category] || TYPE_META.other;
      const key = tm.label;
      const existing = byType.get(key) || { count: 0, total: 0, pending: 0, approved: 0, declined: 0 };
      const amt = toNum(r.amount);
      existing.count++;
      existing.total += amt;
      if (r.status === 'pending') existing.pending += amt;
      if (r.status === 'approved') existing.approved += amt;
      if (r.status === 'declined') existing.declined += amt;
      byType.set(key, existing);
    });
    const summaryRows: Record<string, unknown>[] = Array.from(byType.entries()).map(([type, data]) => ({
      'Record Type': type,
      'Count': data.count,
      'Total Amount (₦)': data.total || '',
      'Pending (₦)': data.pending || '',
      'Approved (₦)': data.approved || '',
      'Declined (₦)': data.declined || '',
    }));
    summaryRows.push({
      'Record Type': 'GRAND TOTAL',
      'Count': filtered.length,
      'Total Amount (₦)': filteredTotals.total || '',
      'Pending (₦)': financials.pendingAmount || '',
      'Approved (₦)': financials.approvedAmount || '',
      'Declined (₦)': financials.declinedAmount || '',
    });

    // ── Build workbook ────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    const wsMain = XLSX.utils.json_to_sheet(mainRows);
    wsMain['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 35 }, { wch: 50 },
      { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 8 },
    ];
    XLSX.utils.book_append_sheet(wb, wsMain, 'All Records');

    if (summaryRows.length > 1) {
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    }

    if (expenseRows.length > 0) {
      const wsExpense = XLSX.utils.json_to_sheet(expenseRows);
      wsExpense['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 45 }, { wch: 16 }, { wch: 10 }, { wch: 20 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsExpense, 'Expenses');
    }

    if (paymentRows.length > 0) {
      const wsPayments = XLSX.utils.json_to_sheet(paymentRows);
      wsPayments['!cols'] = [
        { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 12 },
        { wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 20 }, { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments');
    }

    // ── Daily Sales sheet ─────────────────────────────────────────
    const salesRecords = filtered.filter((r) => r.category === 'daily_sales');
    if (salesRecords.length > 0) {
      const salesRows = salesRecords.map((r) => ({
        'Date': r.created_at ? fmtDate(r.created_at) : '',
        'Product': r.extra?.product ? String(r.extra.product) : '',
        'Depot': r.extra?.depot ? String(r.extra.depot) : '',
        'Opening Vol (ltr)': r.extra?.openingVolume ? toNum(r.extra.openingVolume as string) : '',
        'Closing Vol (ltr)': r.extra?.closingVolume ? toNum(r.extra.closingVolume as string) : '',
        'Volume Sold (ltr)': r.extra?.volumeSold ? toNum(r.extra.volumeSold as string) : '',
        'Amount Collected (₦)': r.extra?.amountCollected ? toNum(r.extra.amountCollected as string) : '',
        'Tickets Collected': r.extra?.ticketsCollected || '',
        'Tickets Remaining': r.extra?.ticketsRemaining || '',
        'Notes': r.extra?.notes ? String(r.extra.notes) : '',
        'Status': r.status.charAt(0).toUpperCase() + r.status.slice(1),
        'Submitted By': r.submitted_by_name,
      }));
      const wsSales = XLSX.utils.json_to_sheet(salesRows);
      wsSales['!cols'] = [
        { wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
        { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 30 },
        { wch: 10 }, { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, wsSales, 'Daily Sales');
    }

    // ── Receipts sheet ────────────────────────────────────────────
    const receiptRecords = filtered.filter((r) => r.category === 'receipt');
    if (receiptRecords.length > 0) {
      const receiptRows = receiptRecords.map((r) => ({
        'Date': r.created_at ? fmtDate(r.created_at) : '',
        'Item': r.title.replace('Receipt - ', ''),
        'Vendor': r.extra?.vendor ? String(r.extra.vendor) : '',
        'Amount (₦)': toNum(r.amount) || '',
        'Notes': r.extra?.notes ? String(r.extra.notes) : cleanDescription(r.description),
        'Status': r.status.charAt(0).toUpperCase() + r.status.slice(1),
        'Has Attachment': r.file ? 'Yes' : 'No',
        'Submitted By': r.submitted_by_name,
      }));
      const wsReceipts = XLSX.utils.json_to_sheet(receiptRows);
      wsReceipts['!cols'] = [
        { wch: 14 }, { wch: 25 }, { wch: 20 }, { wch: 16 },
        { wch: 35 }, { wch: 10 }, { wch: 14 }, { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, wsReceipts, 'Receipts');
    }

    const filename = `RECORDS-${period}-${format(new Date(), 'yyyyMMdd')}.xlsx`;
    XLSX.writeFile(wb, filename);

    toast({
      title: 'Export complete',
      description: `Downloaded ${filename} with ${filtered.length} records.`,
    });
  }, [filtered, timePreset, customFrom, customTo, filteredTotals, financials, toast]);

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

            {/* ── Header ────────────────────────────────────────── */}
            <PageHeader
              title="Records"
              description="All submitted documents, expense requests, receipts, and records."
              actions={
                <>
                  <Button variant="outline" className="gap-2" onClick={exportToExcel} disabled={filtered.length === 0}>
                    <Download size={16} /> Export to Excel
                  </Button>
                </>
              }
            />

            {/* ── Time Filter ──────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-slate-600 mr-1">
                  <CalendarIcon size={14} className="inline mr-1" />Period:
                </span>
                {(['today', 'yesterday', 'week', 'month', 'year', 'all', 'custom'] as TimePreset[]).map((tp) => (
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
                    <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-[160px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">To</Label>
                    <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-[160px]" />
                  </div>
                </div>
              )}
            </div>

            {/* ── Summary Cards ─────────────────────────────────── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Search + Filters ─────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input placeholder="Search by title, description, staff, amount…" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                <select
                  title="Filter by status"
                  value={statusFilter ?? ''}
                  onChange={(e) => setStatusFilter(e.target.value || null)}
                  className="h-10 w-full sm:w-auto sm:min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All Statuses ({timeFilteredRecords.length})</option>
                  {(['pending', 'approved', 'declined'] as const).map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)} ({statusCounts[s]})</option>
                  ))}
                </select>
                <select
                  title="Filter by type"
                  value={typeFilter ?? ''}
                  onChange={(e) => setTypeFilter(e.target.value || null)}
                  className="h-10 w-full sm:w-auto sm:min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All Types</option>
                  {Object.entries(TYPE_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label} ({typeCounts[k] || 0})</option>
                  ))}
                </select>
                {pfiNumbers.length > 0 && (
                  <select
                    title="Filter by PFI"
                    value={pfiFilter ?? ''}
                    onChange={(e) => setPfiFilter(e.target.value || null)}
                    className="h-10 w-full sm:w-auto sm:min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">All PFIs</option>
                    {pfiNumbers.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
                {submitters.length > 1 && (
                  <select
                    title="Filter by submitter"
                    value={submitterFilter ?? ''}
                    onChange={(e) => setSubmitterFilter(e.target.value || null)}
                    className="h-10 w-full sm:w-auto sm:min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">All Staff</option>
                    {submitters.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                {hasFilters && (
                  <Button variant="ghost" size="sm" className="h-10 text-xs gap-1 shrink-0" onClick={clearFilters}>
                    <X size={14} /> Clear Filters
                  </Button>
                )}
              </div>
            </div>

            {/* ── Bulk Actions Bar ──────────────────────────────── */}
            {isAdmin && selectedIds.size > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-indigo-700">
                  {selectedIds.size} record{selectedIds.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2 ml-auto">
                  <Button
                    size="sm"
                    className="gap-1.5 bg-green-600 hover:bg-green-700 text-xs"
                    onClick={() => handleBulkAction('approved')}
                    disabled={bulkProcessing}
                  >
                    {bulkProcessing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Approve All
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 text-xs"
                    onClick={() => handleBulkAction('declined')}
                    disabled={bulkProcessing}
                  >
                    {bulkProcessing ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                    Decline All
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
            )}

            {/* ── Records Table ─────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
                </div>
              ) : isError ? (
                <div className="p-10 text-center">
                  <AlertTriangle className="mx-auto text-red-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">Failed to load records</p>
                  {error && <p className="text-sm text-red-400 max-w-md mx-auto mt-1 break-words">{(error as Error).message || String(error)}</p>}
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => queryClient.invalidateQueries({ queryKey: ['records'] })}>
                    Retry
                  </Button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-10 text-center">
                  <FolderOpen className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">
                    {records.length === 0 ? 'No records yet' : 'No records match your filters'}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    {records.length === 0
                      ? 'Records will appear here once staff submit them.'
                      : 'Try adjusting your filters or time period.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        {isAdmin && (
                          <TableHead className="w-10 text-center">
                            <input
                              type="checkbox"
                              title="Select all pending"
                              checked={allPendingSelected}
                              onChange={toggleSelectAll}
                              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                            />
                          </TableHead>
                        )}
                        <TableHead className="font-semibold text-slate-700">Date</TableHead>
                        <TableHead className="font-semibold text-slate-700">Type</TableHead>
                        <TableHead className="font-semibold text-slate-700">Title</TableHead>
                        <TableHead className="font-semibold text-slate-700">PFI</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Amount</TableHead>
                        <TableHead className="font-semibold text-slate-700">Submitted By</TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((rec) => {
                        const tm = TYPE_META[rec.category] || TYPE_META.other;
                        const amt = toNum(rec.amount);
                        const isExpense = rec.category === 'expense_request';
                        const isSelected = selectedIds.has(rec.id);

                        return (
                          <TableRow
                            key={rec.id}
                            className={`cursor-pointer hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-indigo-50/50' : ''} ${isExpense && rec.status === 'pending' ? 'border-l-2 border-l-red-400' : ''}`}
                            onClick={() => setViewRecord(rec)}
                          >
                            {isAdmin && (
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {rec.status === 'pending' && (
                                  <input
                                    type="checkbox"
                                    title={`Select record ${rec.id}`}
                                    checked={isSelected}
                                    onChange={() => toggleSelect(rec.id)}
                                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                                  />
                                )}
                              </TableCell>
                            )}
                            <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                              {rec.created_at ? fmtDateShort(rec.created_at) : '—'}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${tm.bgColor} ${tm.textColor}`}>
                                {tm.label}
                              </span>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm font-medium text-slate-800 truncate max-w-[220px]">{rec.title}</p>
                              <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{descPreview(rec.description, 40)}</p>
                            </TableCell>
                            <TableCell className="text-xs text-indigo-600 font-medium whitespace-nowrap">
                              {rec.pfi_number || (rec.extra?.pfi_number ? String(rec.extra.pfi_number) : <span className="text-slate-300">—</span>)}
                            </TableCell>
                            <TableCell className={`text-right text-sm font-semibold whitespace-nowrap ${isExpense ? 'text-red-600' : amt > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                              {amt > 0 ? (
                                <span className="inline-flex items-center gap-1">
                                  {isExpense && <TrendingDown size={12} />}
                                  {fmtAmount(rec.amount)}
                                </span>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 whitespace-nowrap truncate max-w-[120px]">
                              {rec.submitted_by_name}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${STATUS_BG[rec.status] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                {rec.status === 'pending' && <Clock size={11} />}
                                {rec.status === 'approved' && <CheckCircle2 size={11} />}
                                {rec.status === 'declined' && <XCircle size={11} />}
                                {rec.status.charAt(0).toUpperCase() + rec.status.slice(1)}
                              </span>
                            </TableCell>
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-center gap-1">
                                {rec.file && (
                                  <button title="Has attachment" className="p-1 text-blue-400 hover:text-blue-600">
                                    <Paperclip size={13} />
                                  </button>
                                )}
                                <button title="View details" className="p-1 text-purple-400 hover:text-purple-600" onClick={() => setViewRecord(rec)}>
                                  <Eye size={14} />
                                </button>
                                {isAdmin && rec.status === 'pending' && (
                                  <>
                                    <button title="Approve" className="p-1 text-green-500 hover:text-green-700" onClick={() => quickAction(rec, 'approved')}>
                                      <CheckCircle2 size={14} />
                                    </button>
                                    <button title="Decline" className="p-1 text-red-500 hover:text-red-700" onClick={() => quickAction(rec, 'declined')}>
                                      <XCircle size={14} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}

                      {/* ── Totals row ──────────────────────────── */}
                      {filtered.length > 0 && (
                        <TableRow className="bg-slate-50 border-t-2 border-slate-300">
                          {isAdmin && <TableCell />}
                          <TableCell className="font-bold text-slate-800 text-sm" colSpan={4}>
                            TOTAL ({filtered.length} record{filtered.length !== 1 ? 's' : ''}) · {periodLabel}
                          </TableCell>
                          <TableCell className="text-right font-bold text-slate-800 text-sm whitespace-nowrap">
                            {fmtAmount(filteredTotals.total)}
                          </TableCell>
                          <TableCell colSpan={3}>
                            {filteredTotals.expenses > 0 && (
                              <span className="text-xs text-red-600 font-medium">
                                Expenses: {fmtAmount(filteredTotals.expenses)}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* ── Footer info ──────────────────────────────────── */}
            {!isLoading && filtered.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {filtered.length} of {records.length} record{records.length !== 1 ? 's' : ''} · Period: {periodLabel}
              </p>
            )}

          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* VIEW RECORD DIALOG                                               */}
      {/* ================================================================ */}
      <Dialog open={!!viewRecord} onOpenChange={(o) => !o && setViewRecord(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {viewRecord && (() => {
            const tm = TYPE_META[viewRecord.category] || TYPE_META.other;
            const pfi = viewRecord.pfi_number || (viewRecord.extra?.pfi_number ? String(viewRecord.extra.pfi_number) : null);
            const fileName = viewRecord.file ? fileNameFromUrl(viewRecord.file) : null;
            const fileType = viewRecord.file ? guessFileType(viewRecord.file) : '';
            const isExpense = viewRecord.category === 'expense_request';

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-slate-900 pr-6 flex items-center gap-2">
                    {isExpense && <Receipt size={18} className="text-red-500 flex-shrink-0" />}
                    {viewRecord.title}
                  </DialogTitle>
                  <DialogDescription className="sr-only">Record details</DialogDescription>
                </DialogHeader>

                {/* Expense banner */}
                {isExpense && viewRecord.status === 'pending' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-700">Expense Request — Awaiting Approval</p>
                      <p className="text-xs text-red-600 mt-0.5">
                        Amount: <strong>{fmtAmount(viewRecord.amount)}</strong>
                      </p>
                    </div>
                  </div>
                )}

                {/* Details list */}
                <div className="mt-4 space-y-3 text-sm">
                  <div className="grid grid-cols-[120px_1fr] gap-y-2.5 gap-x-3">
                    <span className="text-slate-400 font-medium">Type</span>
                    <span className={`font-medium ${tm.textColor}`}>{tm.label}</span>

                    <span className="text-slate-400 font-medium">Status</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border w-fit ${STATUS_BG[viewRecord.status] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {viewRecord.status === 'pending' && <Clock size={11} />}
                      {viewRecord.status === 'approved' && <CheckCircle2 size={11} />}
                      {viewRecord.status === 'declined' && <XCircle size={11} />}
                      {viewRecord.status.charAt(0).toUpperCase() + viewRecord.status.slice(1)}
                    </span>

                    <span className="text-slate-400 font-medium">Date</span>
                    <span className="text-slate-700">{fmtDateTime(viewRecord.created_at)}</span>

                    <span className="text-slate-400 font-medium">Submitted By</span>
                    <span className="text-slate-700">{viewRecord.submitted_by_name}</span>

                    {viewRecord.amount && toNum(viewRecord.amount) > 0 && (
                      <>
                        <span className="text-slate-400 font-medium">Amount</span>
                        <span className={`font-semibold text-base ${isExpense ? 'text-red-600' : 'text-slate-900'}`}>
                          {fmtAmount(viewRecord.amount)}
                        </span>
                      </>
                    )}

                    {pfi && (
                      <>
                        <span className="text-slate-400 font-medium">PFI Reference</span>
                        <span className="text-indigo-600 font-medium">{pfi}</span>
                      </>
                    )}

                    {fileName && (
                      <>
                        <span className="text-slate-400 font-medium">Attachment</span>
                        <span className="text-slate-700 inline-flex items-center gap-1.5">
                          {fileIcon(fileType, 14)}
                          <span className="truncate max-w-[200px]">{fileName}</span>
                        </span>
                      </>
                    )}
                  </div>

                  {/* Description */}
                  {viewRecord.description && cleanDescription(viewRecord.description) && (
                    <div className="pt-1 border-t border-slate-100">
                      <p className="text-slate-400 font-medium text-xs uppercase tracking-wide mb-1.5 pt-3">Details</p>
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{cleanDescription(viewRecord.description)}</pre>
                    </div>
                  )}

                  {/* Payment lines */}
                  {viewRecord.extra && viewRecord.category === 'payment_record' && Array.isArray(viewRecord.extra.lines) && viewRecord.extra.lines.length > 0 && (() => {
                    const lines = viewRecord.extra.lines as Array<{ product: string; rate: string; litres: string; ticketNo?: string; buyer: string }>;
                    return (
                      <div className="pt-1 border-t border-slate-100">
                        <p className="text-slate-400 font-medium text-xs uppercase tracking-wide mb-1.5 pt-3">Payment Lines</p>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                              <th className="pb-1.5 pr-2 font-medium">Product</th>
                              <th className="pb-1.5 pr-2 font-medium">Rate</th>
                              <th className="pb-1.5 pr-2 font-medium">Litres</th>
                              <th className="pb-1.5 pr-2 font-medium">Ticket</th>
                              <th className="pb-1.5 pr-2 font-medium">Buyer</th>
                              <th className="pb-1.5 font-medium text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((l, i) => (
                              <tr key={i} className="border-b border-slate-50">
                                <td className="py-1.5 pr-2 font-medium text-slate-700">{l.product}</td>
                                <td className="py-1.5 pr-2 text-slate-600">₦{l.rate}</td>
                                <td className="py-1.5 pr-2 text-slate-600">{l.litres}</td>
                                <td className="py-1.5 pr-2 text-slate-600">{l.ticketNo || '—'}</td>
                                <td className="py-1.5 pr-2 text-slate-600">{l.buyer}</td>
                                <td className="py-1.5 text-right font-semibold text-emerald-700">
                                  ₦{((parseFloat(l.rate) || 0) * (parseFloat(l.litres) || 0)).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  {/* Daily Sales data */}
                  {viewRecord.extra && viewRecord.category === 'daily_sales' && (() => {
                    const d = viewRecord.extra;
                    return (
                      <div className="pt-1 border-t border-slate-100">
                        <p className="text-slate-400 font-medium text-xs uppercase tracking-wide mb-1.5 pt-3">Sales Data</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {d.depot && <><span className="text-slate-400">Depot</span><span className="text-slate-700 font-medium">{String(d.depot)}</span></>}
                          {d.product && <><span className="text-slate-400">Product</span><span className="text-slate-700 font-medium">{String(d.product)}</span></>}
                          {d.openingVolume && <><span className="text-slate-400">Opening Volume</span><span className="text-slate-700">{String(d.openingVolume)} ltr</span></>}
                          {d.closingVolume && <><span className="text-slate-400">Closing Volume</span><span className="text-slate-700">{String(d.closingVolume)} ltr</span></>}
                          {d.volumeSold && <><span className="text-slate-400">Volume Sold</span><span className="text-slate-700 font-semibold">{String(d.volumeSold)} ltr</span></>}
                          {d.amountCollected && <><span className="text-slate-400">Amount Collected</span><span className="text-emerald-700 font-semibold">₦{String(d.amountCollected)}</span></>}
                          {d.ticketsCollected && <><span className="text-slate-400">Tickets Collected</span><span className="text-slate-700">{String(d.ticketsCollected)}</span></>}
                          {d.ticketsRemaining && <><span className="text-slate-400">Tickets Remaining</span><span className="text-slate-700">{String(d.ticketsRemaining)}</span></>}
                        </div>
                        {d.notes && (
                          <p className="text-sm text-slate-600 mt-2 bg-slate-50 rounded p-2">{String(d.notes)}</p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Ticket inventory rows */}
                  {viewRecord.extra && viewRecord.category === 'ticket_inventory' && Array.isArray(viewRecord.extra.rows) && viewRecord.extra.rows.length > 0 && (() => {
                    const rows = viewRecord.extra.rows as Array<{ size: string; label?: string; quantity: string }>;
                    return (
                      <div className="pt-1 border-t border-slate-100">
                        <p className="text-slate-400 font-medium text-xs uppercase tracking-wide mb-1.5 pt-3">Ticket Counts</p>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                              <th className="pb-1.5 font-medium">Size</th>
                              <th className="pb-1.5 font-medium text-right">Qty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr key={i} className="border-b border-slate-50">
                                <td className="py-1.5 font-medium text-slate-700">{r.label || r.size}</td>
                                <td className="py-1.5 text-right font-semibold text-slate-700">{r.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  {/* Expense details */}
                  {viewRecord.extra && viewRecord.category === 'expense_request' && (
                    <div className="pt-1 border-t border-slate-100">
                      <p className="text-slate-400 font-medium text-xs uppercase tracking-wide mb-1.5 pt-3">Expense Details</p>
                      <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
                        {viewRecord.extra.itemTitle && (
                          <><span className="text-slate-400">Item</span><span className="text-slate-700 font-medium">{String(viewRecord.extra.itemTitle)}</span></>
                        )}
                        {viewRecord.extra.reason && (
                          <><span className="text-slate-400">Reason</span><span className="text-slate-700">{String(viewRecord.extra.reason)}</span></>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Receipt details */}
                  {viewRecord.extra && viewRecord.category === 'receipt' && (
                    <div className="pt-1 border-t border-slate-100">
                      <p className="text-slate-400 font-medium text-xs uppercase tracking-wide mb-1.5 pt-3">Receipt Details</p>
                      <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
                        {viewRecord.extra.vendor && (
                          <><span className="text-slate-400">Vendor</span><span className="text-slate-700 font-medium">{String(viewRecord.extra.vendor)}</span></>
                        )}
                        {viewRecord.extra.notes && (
                          <><span className="text-slate-400">Notes</span><span className="text-slate-700">{String(viewRecord.extra.notes)}</span></>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Image preview */}
                  {viewRecord.file && guessFileType(viewRecord.file) === 'image' && (
                    <div className="pt-1 border-t border-slate-100">
                      <p className="text-slate-400 font-medium text-xs uppercase tracking-wide mb-1.5 pt-3">Preview</p>
                      <img src={viewRecord.file} alt={fileName || 'attachment'} className="w-full max-h-64 object-contain rounded-lg" />
                    </div>
                  )}
                </div>

                {/* Footer */}
                <DialogFooter className="pt-4 flex-col sm:flex-row gap-2">
                  {viewRecord.file && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                      onClick={() => downloadBackendFile(viewRecord.file!, fileName || undefined)}>
                      <Download size={13} /> Download File
                    </Button>
                  )}
                  {isAdmin && viewRecord.status === 'pending' && (
                    <>
                      <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-xs"
                        onClick={() => { setActionType('approved'); setActionNote(''); setActionRecord(viewRecord); }}>
                        <CheckCircle2 size={13} /> Approve
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5 text-red-600 hover:bg-red-50 text-xs"
                        onClick={() => { setActionType('declined'); setActionNote(''); setActionRecord(viewRecord); }}>
                        <XCircle size={13} /> Decline
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 text-xs"
                      onClick={() => { setViewRecord(null); setDeleteRecord(viewRecord); }}>
                      <Trash2 size={13} /> Delete
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ================================================================ */}
      {/* Approve / Decline Dialog                                         */}
      {/* ================================================================ */}
      <Dialog open={!!actionRecord} onOpenChange={(o) => { if (!o) { setActionRecord(null); setActionNote(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              {actionType === 'approved'
                ? <><CheckCircle2 size={16} className="text-green-600" /> Approve Record</>
                : <><XCircle size={16} className="text-red-600" /> Decline Record</>}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {actionType === 'approved' ? `Approve "${actionRecord?.title}"?` : `Decline "${actionRecord?.title}"?`}
              {actionRecord?.amount && toNum(actionRecord.amount) > 0 && (
                <span className="block mt-1 font-semibold text-slate-700">Amount: {fmtAmount(actionRecord.amount)}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="action-note" className="text-sm font-medium">
                Note <span className="text-xs text-slate-400 font-normal">(optional)</span>
              </Label>
              <textarea id="action-note"
                placeholder={actionType === 'approved' ? 'e.g. Approved, proceed' : 'e.g. Please resubmit with clearer receipt'}
                value={actionNote} onChange={(e) => setActionNote(e.target.value)} rows={3}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => { setActionRecord(null); setActionNote(''); }}>Cancel</Button>
            {actionType === 'approved' ? (
              <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1.5" onClick={handleStatusChange}
                disabled={approveMut.isPending}>
                {approveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Approve
              </Button>
            ) : (
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleStatusChange}
                disabled={declineMut.isPending}>
                {declineMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                Decline
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================ */}
      {/* Delete Confirmation                                              */}
      {/* ================================================================ */}
      <Dialog open={!!deleteRecord} onOpenChange={(o) => !o && setDeleteRecord(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-red-100 p-2 rounded-lg"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <span>Delete Record</span>
            </DialogTitle>
            <DialogDescription className="text-xs pt-2">
              Permanently delete <strong>&ldquo;{deleteRecord?.title}&rdquo;</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteRecord(null)} disabled={deleteMut.isPending}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteMut.isPending} className="gap-1.5">
              {deleteMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
