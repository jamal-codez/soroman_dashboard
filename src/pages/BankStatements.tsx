//
// BANK STATEMENTS — finance uploads each bank's Excel/CSV statement here
// (once a format is mapped, re-uploads need no setup). Every deposit row is
// kept as a line so finance can always see what's matched vs still
// outstanding, and pick rows straight from here when confirming a payment.
//
import React, { useState, useMemo, useRef } from 'react';
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
import {
  Search, X, Upload, FileSpreadsheet, Banknote, CheckCircle2, Clock,
  Settings2, Trash2, RefreshCw, Building2, AlertTriangle, FileText, MapPin,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { apiClient } from '@/api/client';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface BankAccount {
  id: number;
  bank_name: string;
  acct_no: string;
  name: string;
  is_active?: boolean;
  location?: number | { id: number; name: string } | null;
  pfi_number?: string | null;
}

interface StatementLine {
  id: number;
  statement: number;
  bank_account: number;
  bank_account_name?: string | null;
  bank_name?: string | null;
  transaction_date: string;
  depositor_name?: string | null;
  bank_ref?: string | null;
  amount: string | number;
  narration?: string | null;
  status: 'UNMATCHED' | 'MATCHED';
  matched_order?: number | null;
  matched_order_reference?: string | null;
  matched_by_name?: string | null;
  matched_at?: string | null;
  created_at: string;
}

interface Statement {
  id: number;
  bank_account: number;
  original_file_name: string;
  row_count: number;
  new_line_count: number;
  duplicate_line_count: number;
  uploaded_by_name?: string | null;
  uploaded_at: string;
  matched_count: number;
  unmatched_count: number;
}

interface ColumnMapping {
  id: number;
  bank_account: number;
  header_row: number;
  date_column: string;
  amount_column?: string | null;
  credit_column?: string | null;
  depositor_column?: string | null;
  reference_column?: string | null;
  narration_column?: string | null;
  sample_file_name?: string | null;
}

type LineStatusFilter = 'all' | 'UNMATCHED' | 'MATCHED';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const toNum = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return iso; }
};
const fmtDateTime = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy, HH:mm'); } catch { return iso; }
};
const getLocationName = (a: BankAccount): string =>
  typeof a.location === 'object' && a.location ? a.location.name : '—';

// ═══════════════════════════════════════════════════════════════════════════
// Mapping Setup Dialog — upload sample, map columns, save
// ═══════════════════════════════════════════════════════════════════════════

const MappingSetupDialog = ({
  account, open, onClose, onSaved, existing,
}: {
  account: BankAccount | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existing?: ColumnMapping | null;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'map'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  const [headerRow, setHeaderRow] = useState(1);
  const [fileName, setFileName] = useState('');
  const [dateCol, setDateCol] = useState('');
  const [amountCol, setAmountCol] = useState('');
  const [creditCol, setCreditCol] = useState('');
  const [depositorCol, setDepositorCol] = useState('');
  const [refCol, setRefCol] = useState('');
  const [narrationCol, setNarrationCol] = useState('');
  const [useSeparateCredit, setUseSeparateCredit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('upload'); setHeaders([]); setPreview([]); setHeaderRow(1); setFileName('');
    setDateCol(''); setAmountCol(''); setCreditCol(''); setDepositorCol(''); setRefCol('');
    setNarrationCol(''); setUseSeparateCredit(false); setError(null);
  };

  const handleFileSelected = async (file: File) => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.admin.previewStatementMapping(account.id, file);
      setHeaders(res.headers || []);
      setPreview(res.preview || []);
      setHeaderRow(res.detected_header_row || 1);
      setFileName(res.file_name || file.name);
      setStep('map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!account) return;
    if (!dateCol || (!amountCol && !creditCol)) {
      setError('Date column and an amount/credit column are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.admin.saveStatementMapping(account.id, {
        header_row: headerRow,
        date_column: dateCol,
        amount_column: useSeparateCredit ? undefined : amountCol,
        credit_column: useSeparateCredit ? creditCol : undefined,
        depositor_column: depositorCol || undefined,
        reference_column: refCol || undefined,
        narration_column: narrationCol || undefined,
        sample_file_name: fileName,
      });
      onSaved();
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save mapping.');
    } finally {
      setLoading(false);
    }
  };

  if (!account) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100"><Settings2 className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h2 className="text-lg font-semibold">{existing ? 'Update' : 'Set Up'} Statement Format</h2>
              <p className="text-sm font-normal text-slate-500 mt-0.5">{account.bank_name} — {account.name}</p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Map statement columns for this bank account</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        {step === 'upload' ? (
          <div className="py-6 text-center space-y-3">
            <FileSpreadsheet className="mx-auto text-slate-300" size={40} />
            <p className="text-sm text-slate-600">
              Upload one sample statement (.xlsx or .csv) from {account.bank_name} so we can learn its column layout.
              You won't need to do this again for future uploads on this account.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={loading} className="gap-2">
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
              {loading ? 'Reading file…' : 'Upload Sample Statement'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-500">
              Detected {headers.length} columns from <span className="font-medium">{fileName}</span>. Tell us which one is which:
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Date Column *</label>
                <select aria-label="Date column" value={dateCol} onChange={e => setDateCol(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm">
                  <option value="">Select…</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Depositor / Payer Column</label>
                <select aria-label="Depositor column" value={depositorCol} onChange={e => setDepositorCol(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm">
                  <option value="">None</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Bank Reference Column</label>
                <select aria-label="Reference column" value={refCol} onChange={e => setRefCol(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm">
                  <option value="">None</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Narration Column</label>
                <select aria-label="Narration column" value={narrationCol} onChange={e => setNarrationCol(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm">
                  <option value="">None</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={useSeparateCredit} onChange={e => setUseSeparateCredit(e.target.checked)} />
                This bank has separate Credit/Debit columns
              </label>

              {useSeparateCredit ? (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Credit (deposit) Column *</label>
                  <select aria-label="Credit column" value={creditCol} onChange={e => setCreditCol(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm">
                    <option value="">Select…</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Amount Column *</label>
                  <select aria-label="Amount column" value={amountCol} onChange={e => setAmountCol(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm">
                    <option value="">Select…</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              )}
            </div>

            {preview.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>{headers.map(h => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.slice(0, 3).map((row, i) => (
                      <TableRow key={i}>
                        {headers.map(h => <TableCell key={h} className="whitespace-nowrap text-slate-500">{String(row[h] ?? '—')}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => { reset(); onClose(); }} disabled={loading}>Cancel</Button>
          {step === 'map' && (
            <Button size="sm" onClick={handleSave} disabled={loading} className="gap-2">
              {loading ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Save Format
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

export default function BankStatements() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [lineStatusFilter, setLineStatusFilter] = useState<LineStatusFilter>('all');
  const [lineSearch, setLineSearch] = useState('');
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Statement | null>(null);

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['bank-accounts-for-statements'],
    queryFn: () => apiClient.admin.getBankAccounts({}),
  });

  const accounts: BankAccount[] = useMemo(() => {
    const raw = accountsData;
    const list = Array.isArray(raw) ? raw : (raw?.results || []);
    return list as BankAccount[];
  }, [accountsData]);

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a =>
      a.bank_name?.toLowerCase().includes(q) ||
      a.name?.toLowerCase().includes(q) ||
      a.acct_no?.toLowerCase().includes(q)
    );
  }, [accounts, accountSearch]);

  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedAccountId) || null,
    [accounts, selectedAccountId],
  );

  const { data: mapping, isLoading: mappingLoading, isError: mappingMissing } = useQuery({
    queryKey: ['statement-mapping', selectedAccountId],
    queryFn: () => apiClient.admin.getStatementMapping(selectedAccountId as number),
    enabled: !!selectedAccountId,
    retry: false,
  });

  const { data: statements, isLoading: statementsLoading, refetch: refetchStatements } = useQuery({
    queryKey: ['bank-statements', selectedAccountId],
    queryFn: () => apiClient.admin.getBankStatements(selectedAccountId as number),
    enabled: !!selectedAccountId && !!mapping,
  });

  const { data: linesData, isLoading: linesLoading, refetch: refetchLines } = useQuery({
    queryKey: ['statement-lines', selectedAccountId, lineStatusFilter, lineSearch],
    queryFn: () => apiClient.admin.getBankAccountStatementLines(selectedAccountId as number, {
      status: lineStatusFilter === 'all' ? 'all' : lineStatusFilter,
      search: lineSearch || undefined,
      page_size: 100,
    }),
    enabled: !!selectedAccountId && !!mapping,
  });

  const lines: StatementLine[] = linesData?.results || [];
  const statementsList: Statement[] = statements || [];

  const totals = useMemo(() => {
    const unmatched = lines.filter(l => l.status === 'UNMATCHED');
    const matched = lines.filter(l => l.status === 'MATCHED');
    return {
      unmatchedCount: unmatched.length,
      unmatchedAmount: unmatched.reduce((s, l) => s + toNum(l.amount), 0),
      matchedCount: matched.length,
      matchedAmount: matched.reduce((s, l) => s + toNum(l.amount), 0),
    };
  }, [lines]);

  const handleUploadStatement = async (file: File) => {
    if (!selectedAccountId) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const res = await apiClient.admin.uploadBankStatement(selectedAccountId, file);
      setUploadMsg(`Uploaded — ${res.new_line_count} new row${res.new_line_count !== 1 ? 's' : ''} added${res.duplicate_line_count ? `, ${res.duplicate_line_count} duplicate(s) skipped` : ''}.`);
      refetchStatements();
      refetchLines();
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteStatement = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.admin.deleteBankStatement(deleteTarget.id);
      setDeleteTarget(null);
      refetchStatements();
      refetchLines();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete statement.');
    }
  };

  const needsSetup = !!selectedAccountId && !mappingLoading && (mappingMissing || !mapping);

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">
            <PageHeader
              title="Bank Statements"
              description="Upload each bank's statement so payments can be confirmed by picking the real deposit row instead of retyping it."
            />

            <div className="space-y-5">

              {/* ── Bank Accounts Table ──────────────────────────────────── */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-700">Bank Accounts</p>
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <Input
                      placeholder="Search bank accounts…"
                      className="pl-8 h-9 text-sm"
                      value={accountSearch}
                      onChange={e => setAccountSearch(e.target.value)}
                    />
                  </div>
                </div>
                {accountsLoading ? (
                  <div className="p-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
                ) : filteredAccounts.length === 0 ? (
                  <p className="p-6 text-center text-sm text-slate-400">No bank accounts found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="text-sm">
                      <TableHeader>
                        <TableRow className="bg-slate-50/80">
                          <TableHead>Bank</TableHead>
                          <TableHead>Account Name</TableHead>
                          <TableHead>Account No.</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>PFI</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAccounts.map(a => (
                          <TableRow
                            key={a.id}
                            className={selectedAccountId === a.id ? 'bg-blue-50' : 'hover:bg-slate-50/60'}
                          >
                            <TableCell className="font-semibold text-slate-800 whitespace-nowrap">
                              <span className="inline-flex items-center gap-2">
                                <Building2 size={13} className="text-slate-400" />{a.bank_name || '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-slate-700">{a.name}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-600">{a.acct_no}</TableCell>
                            <TableCell className="text-slate-500 text-xs">
                              <span className="inline-flex items-center gap-1"><MapPin size={11} />{getLocationName(a)}</span>
                            </TableCell>
                            <TableCell className="text-xs text-purple-600">{a.pfi_number || '—'}</TableCell>
                            <TableCell>
                              {a.is_active === false ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">Inactive</span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant={selectedAccountId === a.id ? 'default' : 'outline'}
                                className="h-8 gap-1.5 text-xs"
                                onClick={() => { setSelectedAccountId(a.id); setLineStatusFilter('all'); setLineSearch(''); setUploadMsg(null); }}
                              >
                                <FileText size={12} /> {selectedAccountId === a.id ? 'Viewing' : 'View Statements'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* ── Workspace ──────────────────────────────────────────── */}
              <div className="space-y-4">
                {!selectedAccount ? (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-16 text-center">
                    <Banknote className="mx-auto text-slate-300 mb-3" size={40} />
                    <p className="text-slate-500 font-medium">Select a bank account</p>
                    <p className="text-sm text-slate-400 mt-1">Click "View Statements" on an account above to view or upload its statements.</p>
                  </div>
                ) : mappingLoading ? (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10">
                    <Skeleton className="h-24 w-full rounded" />
                  </div>
                ) : needsSetup ? (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center space-y-3">
                    <Settings2 className="mx-auto text-amber-400" size={36} />
                    <p className="font-semibold text-slate-800">Set up {selectedAccount.bank_name} statement format</p>
                    <p className="text-sm text-slate-500 max-w-md mx-auto">
                      Upload one sample statement so we learn this bank's column layout. After that,
                      every future upload for this account is parsed automatically.
                    </p>
                    <Button onClick={() => setMappingDialogOpen(true)} className="gap-2">
                      <Settings2 size={14} /> Set Up Statement Format
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Header / actions */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-800">{selectedAccount.bank_name} — {selectedAccount.name}</p>
                        <p className="text-xs text-slate-500">{selectedAccount.acct_no} · {getLocationName(selectedAccount)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => setMappingDialogOpen(true)}>
                          <Settings2 size={13} /> Edit Format
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".xlsx,.csv"
                          className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadStatement(f); e.target.value = ''; }}
                        />
                        <Button size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                          {uploading ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
                          {uploading ? 'Uploading…' : 'Upload Statement'}
                        </Button>
                      </div>
                    </div>

                    {uploadMsg && (
                      <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                        {uploadMsg}
                        <button onClick={() => setUploadMsg(null)} title="Dismiss"><X size={13} /></button>
                      </div>
                    )}

                    {/* Summary */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-50"><Clock size={18} className="text-amber-600" /></div>
                        <div>
                          <p className="text-xs text-slate-500">Unmatched</p>
                          <p className="font-bold text-slate-900">{totals.unmatchedCount} rows · {fmt(totals.unmatchedAmount)}</p>
                        </div>
                      </div>
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-50"><CheckCircle2 size={18} className="text-emerald-600" /></div>
                        <div>
                          <p className="text-xs text-slate-500">Matched to Orders</p>
                          <p className="font-bold text-slate-900">{totals.matchedCount} rows · {fmt(totals.matchedAmount)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Statements uploaded */}
                    {statementsList.length > 0 && (
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 pt-3 pb-1">Uploaded Statements</p>
                        <div className="overflow-x-auto">
                          <Table className="text-sm">
                            <TableHeader>
                              <TableRow className="bg-slate-50/80">
                                <TableHead>File</TableHead>
                                <TableHead>Uploaded</TableHead>
                                <TableHead>By</TableHead>
                                <TableHead className="text-right">New Rows</TableHead>
                                <TableHead className="text-right">Duplicates</TableHead>
                                <TableHead className="text-right">Matched</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {statementsList.map(s => (
                                <TableRow key={s.id} className="hover:bg-slate-50/60">
                                  <TableCell className="text-slate-700">
                                    <span className="inline-flex items-center gap-2"><FileText size={13} className="text-slate-400" />{s.original_file_name}</span>
                                  </TableCell>
                                  <TableCell className="text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(s.uploaded_at)}</TableCell>
                                  <TableCell className="text-xs text-slate-500">{s.uploaded_by_name || '—'}</TableCell>
                                  <TableCell className="text-right text-emerald-700 font-semibold">{s.new_line_count}</TableCell>
                                  <TableCell className="text-right text-slate-400">{s.duplicate_line_count || 0}</TableCell>
                                  <TableCell className="text-right text-slate-600">{s.matched_count}</TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => setDeleteTarget(s)}
                                    >
                                      <Trash2 size={13} /> Delete
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {/* Lines table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex gap-1.5">
                          {(['all', 'UNMATCHED', 'MATCHED'] as LineStatusFilter[]).map(s => (
                            <button
                              key={s}
                              onClick={() => setLineStatusFilter(s)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${lineStatusFilter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                            >
                              {s === 'all' ? 'All' : s === 'UNMATCHED' ? 'Unmatched' : 'Matched'}
                            </button>
                          ))}
                        </div>
                        <div className="relative w-56">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                          <Input
                            placeholder="Search depositor, ref…"
                            className="pl-7 h-8 text-xs"
                            value={lineSearch}
                            onChange={e => setLineSearch(e.target.value)}
                          />
                        </div>
                      </div>

                      {linesLoading ? (
                        <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
                      ) : lines.length === 0 ? (
                        <div className="p-10 text-center text-sm text-slate-400">No statement rows yet — upload a statement to get started.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table className="text-sm">
                            <TableHeader>
                              <TableRow className="bg-slate-50/80">
                                <TableHead>Date</TableHead>
                                <TableHead>Depositor</TableHead>
                                <TableHead>Bank Ref</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Matched Order</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lines.map(l => (
                                <TableRow key={l.id} className="hover:bg-slate-50/60">
                                  <TableCell className="whitespace-nowrap text-slate-600">{fmtDate(l.transaction_date)}</TableCell>
                                  <TableCell className="text-slate-800">{l.depositor_name || '—'}</TableCell>
                                  <TableCell className="text-slate-600 font-mono text-xs">{l.bank_ref || '—'}</TableCell>
                                  <TableCell className="text-right font-semibold">{fmt(toNum(l.amount))}</TableCell>
                                  <TableCell>
                                    {l.status === 'MATCHED' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                        <CheckCircle2 size={11} /> Matched
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                        <Clock size={11} /> Unmatched
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-slate-500">
                                    {l.matched_order_reference || '—'}
                                    {l.matched_by_name ? <span className="block text-[10px] text-slate-400">by {l.matched_by_name}</span> : null}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <MappingSetupDialog
        account={selectedAccount}
        open={mappingDialogOpen}
        onClose={() => setMappingDialogOpen(false)}
        existing={mapping}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['statement-mapping', selectedAccountId] });
        }}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <h2 className="text-lg font-semibold">Delete Statement?</h2>
            </DialogTitle>
            <DialogDescription className="sr-only">Confirm deleting this statement</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            This removes <span className="font-medium">{deleteTarget?.original_file_name}</span> and its unmatched rows.
            Statements with rows already matched to a payment can't be deleted.
          </p>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button size="sm" variant="destructive" className="gap-2" onClick={handleDeleteStatement}>
              <Trash2 size={13} /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
