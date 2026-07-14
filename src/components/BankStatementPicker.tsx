import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CheckCheck, FileSearch as FileSearchIcon } from 'lucide-react';
import { apiClient } from '@/api/client';

// A single deposit row pulled from a bank statement upload.
export type StatementLineOption = {
  id: number;
  transaction_date: string;
  depositor_name?: string | null;
  bank_ref?: string | null;
  amount: string | number;
  narration?: string | null;
};

// Minimal shape both PaymentVerify's and ConfirmedPayments' local
// `BankAccount` interfaces already satisfy — structural typing means either
// can be passed in as-is.
export type StatementBankAccount = {
  id: number;
  bank_name: string;
  acct_no: string;
  name: string;
};

// Lets finance pick the real deposit row from an uploaded bank statement
// instead of retyping depositor/amount/ref by hand — selecting a row fills
// the payment line and locks that row so it can't be picked again elsewhere.
export function StatementPicker({
  bankAccountId,
  excludeIds,
  onPick,
}: {
  bankAccountId: string;
  excludeIds: Set<number>;
  onPick: (line: StatementLineOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['statement-picker-lines', bankAccountId, search],
    queryFn: () => apiClient.admin.getBankAccountStatementLines(Number(bankAccountId), {
      status: 'UNMATCHED',
      search: search || undefined,
      page_size: 25,
    }),
    enabled: !!bankAccountId,
  });

  // Already picked into another payment line in this same dialog — hide it
  // here too so the same deposit can't be double-selected or look confusing.
  const lines: StatementLineOption[] = (data?.results || []).filter((l) => !excludeIds.has(l.id));
  const count: number | undefined = typeof data?.count === 'number' ? data.count : undefined;

  if (!bankAccountId) {
    return (
      <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-[11px] text-slate-400">
        Select a bank account above to pick its deposits from a statement.
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-11 flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white text-sm font-bold shadow-sm hover:bg-blue-700 transition-colors"
      >
        <FileSearchIcon size={16} />
        Pick from Bank Statement
        {typeof count === 'number' && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/20 text-xs font-bold">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full min-w-[320px] rounded-lg border border-slate-300 bg-white shadow-xl">
          <div className="p-2 border-b border-slate-100">
            <Input
              autoFocus
              placeholder="Search depositor, ref…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <p className="p-3 text-xs text-slate-400 text-center">Loading…</p>
            ) : lines.length === 0 ? (
              <p className="p-3 text-xs text-slate-400 text-center">No unmatched deposits found for this account.</p>
            ) : (
              lines.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => { onPick(l); setOpen(false); setSearch(''); }}
                  className="w-full text-left px-3 py-2.5 border-b border-slate-50 last:border-0 hover:bg-blue-50 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 truncate min-w-0">{l.depositor_name || '—'}</span>
                    <span className="font-bold text-slate-900 shrink-0">₦{Number(l.amount).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5 text-slate-400">
                    <span className="font-mono truncate min-w-0">{l.bank_ref || '—'}</span>
                    <span className="shrink-0">{l.transaction_date}</span>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="p-1.5 border-t border-slate-100 text-right">
            <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-slate-400 hover:text-slate-600 px-2">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Lets finance pick several deposit rows at once for one bank account and
// auto-generate one payment line per row — instead of "Add Another Payment"
// + StatementPicker, N times over, for a multi-line bank confirmation.
export function BulkStatementPicker({
  bankAccounts,
  excludeIds,
  onPickMany,
}: {
  bankAccounts: StatementBankAccount[];
  excludeIds: Set<number>;
  onPickMany: (bankAccountId: string, lines: StatementLineOption[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [bankAccountId, setBankAccountId] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['statement-picker-lines-bulk', bankAccountId, search],
    queryFn: () => apiClient.admin.getBankAccountStatementLines(Number(bankAccountId), {
      status: 'UNMATCHED',
      search: search || undefined,
      page_size: 50,
    }),
    enabled: !!bankAccountId && open,
  });

  const lines: StatementLineOption[] = (data?.results || []).filter((l) => !excludeIds.has(l.id));

  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const reset = () => { setBankAccountId(''); setSearch(''); setSelected(new Set()); };

  const handleApply = () => {
    const picked = lines.filter((l) => selected.has(l.id));
    if (picked.length === 0 || !bankAccountId) return;
    onPickMany(bankAccountId, picked);
    setOpen(false);
    reset();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full h-10 gap-2 border-2 border-dashed border-emerald-300 text-emerald-700 text-xs uppercase hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-800"
      >
        <FileSearchIcon size={16} />
        Bulk Select from Bank Statement
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="sm:max-w-[480px] w-full">
          <DialogHeader>
            <DialogTitle>Bulk Select Deposits</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Pick several deposits from one bank account — each becomes its own payment entry.
            </DialogDescription>
          </DialogHeader>

          {/* min-w-0 is required here: DialogContent is a grid container, and a
              grid item's default min-width is "auto" — without this, the nowrap
              text in truncated rows below bubbles up and forces the whole
              dialog wider instead of ellipsizing. */}
          <div className="space-y-2.5 min-w-0">
            <select
              aria-label="Bank account"
              className="h-9 w-full border border-slate-300 rounded-md bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={bankAccountId}
              onChange={(e) => { setBankAccountId(e.target.value); setSelected(new Set()); }}
            >
              <option value="">— Select bank account —</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>{b.bank_name} • {b.acct_no} • {b.name}</option>
              ))}
            </select>

            {bankAccountId && (
              <>
                <Input
                  autoFocus
                  placeholder="Search depositor, ref…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 text-xs"
                />
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
                  {isLoading ? (
                    <p className="p-3 text-xs text-slate-400 text-center">Loading…</p>
                  ) : lines.length === 0 ? (
                    <p className="p-3 text-xs text-slate-400 text-center">No unmatched deposits found for this account.</p>
                  ) : (
                    lines.map((l) => (
                      <label key={l.id} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-blue-50 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={selected.has(l.id)}
                          onChange={() => toggle(l.id)}
                          className="h-4 w-4 accent-blue-600 shrink-0 mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-800 truncate min-w-0">{l.depositor_name || '—'}</span>
                            <span className="font-bold text-slate-900 shrink-0">₦{Number(l.amount).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5 text-slate-400">
                            <span className="font-mono truncate min-w-0">{l.bank_ref || '—'}</span>
                            <span className="shrink-0">{l.transaction_date}</span>
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button type="button" size="sm" onClick={handleApply} disabled={selected.size === 0} className="gap-2">
              <CheckCheck size={14} /> Add {selected.size || ''} Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
