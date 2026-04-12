//
// RECORDS — Management view for all submitted records.
// Compact table, plain text styling, inline approve/decline.
//
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
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
  Eye,
} from 'lucide-react';

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
  file: string | null;        // URL to uploaded file
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

const TYPE_META: Record<string, { label: string; textColor: string }> = {
  payment_record:   { label: 'Payment',       textColor: 'text-emerald-600' },
  daily_sales:      { label: 'Daily Sales',   textColor: 'text-blue-600' },
  ticket_inventory: { label: 'Tickets',       textColor: 'text-purple-600' },
  expense_request:  { label: 'Expense',       textColor: 'text-red-600' },
  receipt:          { label: 'Receipt',       textColor: 'text-green-600' },
  report:           { label: 'Report',        textColor: 'text-amber-600' },
  invoice:          { label: 'Invoice',       textColor: 'text-blue-600' },
  letter:           { label: 'Letter / Memo', textColor: 'text-amber-600' },
  other:            { label: 'Other',         textColor: 'text-slate-500' },
};

const STATUS_COLOR: Record<string, string> = {
  pending:  'text-amber-600',
  approved: 'text-green-600',
  declined: 'text-red-600',
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
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch { return iso; }
};

const fmtDateTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    );
  } catch { return iso; }
};

const fmtAmount = (v: string | null | undefined) => {
  if (!v) return '';
  const n = parseFloat(v.replace(/,/g, ''));
  if (!Number.isFinite(n)) return `₦${v}`;
  return `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

/** Download a backend-hosted file by opening its URL */
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

/** Extract filename from a URL path */
const fileNameFromUrl = (url: string) => {
  try { return decodeURIComponent(url.split('/').pop() || ''); } catch { return url; }
};

/** Guess file type category from URL for icon display */
const guessFileType = (url: string) => {
  const lower = url.toLowerCase();
  if (lower.includes('.pdf')) return 'pdf';
  if (lower.match(/\.(xlsx?|csv)/)) return 'sheet';
  if (lower.match(/\.(jpe?g|png|gif|webp|bmp|svg)/)) return 'image';
  if (lower.match(/\.(zip|rar|7z|tar|gz)/)) return 'zip';
  return 'other';
};

/** Strip PFI prefix line from description for preview */
const descPreview = (desc: string, max = 50) => {
  const clean = desc.split('\n').filter((l) => !l.startsWith('PFI:')).join(' ').trim();
  if (!clean) return '—';
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
};

/** Strip PFI prefix line from description for dialog display */
const cleanDescription = (desc: string) =>
  desc.split('\n').filter((l) => !l.startsWith('PFI:')).join('\n').trim();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Records() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const role = parseInt(localStorage.getItem('role') || '10');
  const isAdmin = role <= 1;

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [submitterFilter, setSubmitterFilter] = useState<string | null>(null);

  const [viewRecord, setViewRecord] = useState<BackendRecord | null>(null);
  const [actionRecord, setActionRecord] = useState<BackendRecord | null>(null);
  const [actionType, setActionType] = useState<'approved' | 'declined'>('approved');
  const [actionNote, setActionNote] = useState('');
  const [deleteRecord, setDeleteRecord] = useState<BackendRecord | null>(null);

  // ---- Fetch records from backend ----
  const { data: recordsRaw = [], isLoading, isError, error } = useQuery<BackendRecord[]>({
    queryKey: ['records'],
    queryFn: async () => {
      const res = await apiClient.admin.getRecords();
      // Handle both paginated { results: [] } and plain array responses
      return Array.isArray(res) ? res : (res?.results ?? []);
    },
    staleTime: 30_000,
  });

  const records = recordsRaw;

  const submitters = useMemo(() => Array.from(new Set(records.map((r) => r.submitted_by_name))).sort(), [records]);

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    records.forEach((r) => (m[r.category] = (m[r.category] || 0) + 1));
    return m;
  }, [records]);

  const statusCounts = useMemo(() => {
    const m = { pending: 0, approved: 0, declined: 0 };
    records.forEach((r) => { if (r.status in m) m[r.status as keyof typeof m] += 1; });
    return m;
  }, [records]);

  const filtered = useMemo(() => {
    return records
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
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [records, search, typeFilter, statusFilter, submitterFilter]);

  // ---- Approve mutation ----
  const approveMut = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      apiClient.admin.approveRecord(id, note),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['records'] });
      toast({ title: '✅ Record Approved', description: `Record #${vars.id} has been approved.` });
      setActionRecord(null);
      setActionNote('');
    },
    onError: (err) => {
      toast({ title: 'Approve failed', description: String(err), variant: 'destructive' });
    },
  });

  // ---- Decline mutation ----
  const declineMut = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      apiClient.admin.declineRecord(id, note),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['records'] });
      toast({ title: '❌ Record Declined', description: `Record #${vars.id} has been declined.` });
      setActionRecord(null);
      setActionNote('');
    },
    onError: (err) => {
      toast({ title: 'Decline failed', description: String(err), variant: 'destructive' });
    },
  });

  // ---- Delete mutation ----
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

  // --- Quick approve/decline (from table) ---
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

  const hasFilters = !!(typeFilter || statusFilter || submitterFilter || search);
  const clearFilters = () => { setTypeFilter(null); setStatusFilter(null); setSubmitterFilter(null); setSearch(''); };

  // ========================================================================

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-5">

            <PageHeader title="Records" description="All submitted documents, requests, and records." />

            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className={`cursor-pointer transition-all ${!statusFilter ? 'ring-2 ring-primary' : 'hover:shadow-md'}`} onClick={() => setStatusFilter(null)}>
                <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center gap-1">
                  <FolderOpen size={20} className="text-slate-500" />
                  <p className="text-2xl font-bold text-slate-900">{records.length}</p>
                  <p className="text-[11px] text-slate-500 font-medium">All Records</p>
                </CardContent>
              </Card>
              {(['pending', 'approved', 'declined'] as const).map((s) => {
                const icons = { pending: Clock, approved: CheckCircle2, declined: XCircle };
                const Icon = icons[s];
                return (
                  <Card key={s} className={`cursor-pointer transition-all ${statusFilter === s ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                    onClick={() => setStatusFilter((prev) => (prev === s ? null : s))}>
                    <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center gap-1">
                      <Icon size={20} className={STATUS_COLOR[s]} />
                      <p className="text-2xl font-bold text-slate-900">{statusCounts[s]}</p>
                      <p className="text-[11px] text-slate-500 font-medium capitalize">{s}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-wrap">
              <div className="relative flex-1 max-w-md min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input placeholder="Search records…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
              </div>
              <select title="Filter by type" value={typeFilter ?? ''} onChange={(e) => setTypeFilter(e.target.value || null)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">All Types</option>
                {Object.entries(TYPE_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label} ({typeCounts[k] || 0})</option>
                ))}
              </select>
              <select title="Filter by status" value={statusFilter ?? ''} onChange={(e) => setStatusFilter(e.target.value || null)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">All Statuses</option>
                <option value="pending">Pending ({statusCounts.pending})</option>
                <option value="approved">Approved ({statusCounts.approved})</option>
                <option value="declined">Declined ({statusCounts.declined})</option>
              </select>
              {submitters.length > 1 && (
                <select title="Filter by submitter" value={submitterFilter ?? ''} onChange={(e) => setSubmitterFilter(e.target.value || null)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">All Staff</option>
                  {submitters.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {hasFilters && (
                <Button variant="ghost" size="sm" className="h-9 text-xs gap-1" onClick={clearFilters}><X size={14} /> Clear</Button>
              )}
            </div>

            {/* Table */}
            {isLoading ? (
              <Card>
                <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  <p className="text-slate-500 font-medium">Loading records…</p>
                </CardContent>
              </Card>
            ) : isError ? (
              <Card>
                <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
                  <XCircle size={48} className="text-red-300" />
                  <p className="text-slate-500 font-medium">Failed to load records</p>
                  {error && <p className="text-sm text-red-400 max-w-md break-words">{(error as Error).message || String(error)}</p>}
                  <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['records'] })}>Retry</Button>
                </CardContent>
              </Card>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
                  <FolderOpen size={48} className="text-slate-300" />
                  <p className="text-slate-500 font-medium">{records.length === 0 ? 'No records yet' : 'No records match your filters'}</p>
                  <p className="text-sm text-slate-400">{records.length === 0 ? 'Records will appear here once staff submit them.' : 'Try adjusting your filters.'}</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 text-[11px] uppercase tracking-wide">
                        <TableHead className="py-2.5 pl-4 pr-2">Date</TableHead>
                        <TableHead className="py-2.5 px-2">Type</TableHead>
                        <TableHead className="py-2.5 px-2">Title</TableHead>
                        <TableHead className="py-2.5 px-2">PFI</TableHead>
                        <TableHead className="py-2.5 px-2 text-right">Amount</TableHead>
                        <TableHead className="py-2.5 px-2">By</TableHead>
                        <TableHead className="py-2.5 px-2">Status</TableHead>
                        <TableHead className="py-2.5 px-2 pr-4 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((rec) => {
                        const tm = TYPE_META[rec.category] || TYPE_META.other;
                        return (
                          <TableRow key={rec.id} className="cursor-pointer hover:bg-slate-50/60 transition-colors group" onClick={() => setViewRecord(rec)}>
                            <TableCell className="py-2 pl-4 pr-2 text-xs text-slate-500 whitespace-nowrap">{fmtDate(rec.created_at)}</TableCell>
                            <TableCell className={`py-2 px-2 text-xs font-medium whitespace-nowrap ${tm.textColor}`}>{tm.label}</TableCell>
                            <TableCell className="py-2 px-2">
                              <p className="text-[13px] font-medium text-slate-800 truncate max-w-[200px]">{rec.title}</p>
                              <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{descPreview(rec.description, 40)}</p>
                            </TableCell>
                            <TableCell className="py-2 px-2 text-xs text-indigo-600 font-medium whitespace-nowrap">
                              {rec.pfi_number || (rec.extra?.pfi_number ? String(rec.extra.pfi_number) : <span className="text-slate-300">—</span>)}
                            </TableCell>
                            <TableCell className="py-2 px-2 text-right text-[13px] font-semibold text-slate-700 whitespace-nowrap">
                              {rec.amount ? fmtAmount(rec.amount) : <span className="text-slate-300">—</span>}
                            </TableCell>
                            <TableCell className="py-2 px-2 text-xs text-slate-600 whitespace-nowrap truncate max-w-[100px]">{rec.submitted_by_name}</TableCell>
                            <TableCell className={`py-2 px-2 text-xs font-medium capitalize whitespace-nowrap ${STATUS_COLOR[rec.status] || 'text-slate-500'}`}>
                              {rec.status}
                            </TableCell>
                            <TableCell className="py-2 px-2 pr-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}

            {filtered.length > 0 && (
              <p className="text-xs text-slate-400 text-center pt-1">
                Showing {filtered.length} of {records.length} record{records.length !== 1 ? 's' : ''}
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

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-slate-900 pr-6">
                    {viewRecord.title}
                  </DialogTitle>
                  <DialogDescription className="sr-only">Record details</DialogDescription>
                </DialogHeader>

                {/* Details list */}
                <div className="mt-4 space-y-3 text-sm">
                  <div className="grid grid-cols-[120px_1fr] gap-y-2.5 gap-x-3">
                    <span className="text-slate-400 font-medium">Type</span>
                    <span className={`font-medium ${tm.textColor}`}>{tm.label}</span>

                    <span className="text-slate-400 font-medium">Status</span>
                    <span className={`font-medium capitalize ${STATUS_COLOR[viewRecord.status] || 'text-slate-500'}`}>{viewRecord.status}</span>

                    <span className="text-slate-400 font-medium">Date</span>
                    <span className="text-slate-700">{fmtDateTime(viewRecord.created_at)}</span>

                    <span className="text-slate-400 font-medium">Submitted By</span>
                    <span className="text-slate-700">{viewRecord.submitted_by_name}</span>

                    {viewRecord.amount && (
                      <>
                        <span className="text-slate-400 font-medium">Amount</span>
                        <span className="text-slate-900 font-semibold">{fmtAmount(viewRecord.amount)}</span>
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

                  {/* Ticket inventory rows */}
                  {viewRecord.extra && viewRecord.category === 'ticket_inventory' && Array.isArray(viewRecord.extra.rows) && viewRecord.extra.rows.length > 0 && (() => {
                    const rows = viewRecord.extra.rows as Array<{ size: string; quantity: string }>;
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
                                <td className="py-1.5 font-medium text-slate-700">₦{r.size}</td>
                                <td className="py-1.5 text-right font-semibold text-slate-700">{r.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  {/* Image preview — backend file URL */}
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

      {/* Approve / Decline Dialog */}
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
              <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1.5" onClick={handleStatusChange}><CheckCircle2 size={13} /> Approve</Button>
            ) : (
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleStatusChange}><XCircle size={13} /> Decline</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteRecord} onOpenChange={(o) => !o && setDeleteRecord(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Delete Record</DialogTitle>
            <DialogDescription className="text-xs">
              Permanently delete <strong>"{deleteRecord?.title}"</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteRecord(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
