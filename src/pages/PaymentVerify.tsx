import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { CommaInput } from '@/components/ui/comma-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { apiClient, fetchAllPages } from '@/api/client';
import { isCurrentUserReadOnly } from '@/roles';
import { Skeleton } from '@/components/ui/skeleton';
import * as XLSX from 'xlsx';
import { Search, ShieldCheck, Loader2, Download, CheckCircle, DollarSign, PhoneOutgoing, CheckSquare2, CheckCheck, XCircle, CalendarDays, X, Fuel, Clock, Paperclip, FileText, ImageIcon, Trash2, Plus } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format, isThisMonth, isThisWeek, isThisYear, isToday, isYesterday, isAfter, isBefore, isSameDay, addDays, parseISO } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getOrderReference } from '@/lib/orderReference';

interface PaymentOrder {
  id: number;
  order_id: string | number;
  amount: string;
  status: 'paid' | 'pending' | 'failed';
  payment_channel: string;
  created_at: string;
  reference: string;
  updated_at: string;

  // Customer fields (varies by endpoint)
  user?: {
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    phone?: string;
    companyName?: string;
    company_name?: string;
    company?: string;
  };
  customer?: {
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    phone?: string;
    companyName?: string;
    company_name?: string;
    company?: string;
  };

  // Order fields sometimes embedded
  products?: Array<{ name?: string; unit_price?: string | number; price?: string | number; unitPrice?: string | number; unit?: string; unit_label?: string }>;
  quantity?: number;
  qty?: number;
  litres?: number;
  state?: string;
  location?: string;
  pickup?: { state?: string; location?: string };
  delivery?: { state?: string; location?: string };
  location_name?: string;
  location_id?: number | null;

  // Account object (as commonly returned by the API)
  acct?: {
    id: number;
    acct_no: string;
    bank_name: string;
    name: string;
  };

  // Some APIs might use different keys
  bank_account?: {
    acct_no?: string;
    account_number?: string;
    bank_name?: string;
    bank?: string;
    name?: string;
    account_name?: string;
  };
  account?: {
    acct_no?: string;
    account_number?: string;
    bank_name?: string;
    bank?: string;
    name?: string;
    account_name?: string;
  };

  // Possible top-level fallbacks
  acct_no?: string;
  bank_name?: string;
  account_name?: string;

  // Backend snapshot fields (preferred for display)
  paid_to_account_number?: string;
  paid_to_account_name?: string;
  paid_to_bank_name?: string;

  bank_account_id?: number | null;

  // Company fields sometimes live at the payment/order level
  companyName?: string;
  company_name?: string;
  company?: string;
  pfi_id?: number | null;
  pfi?: number | string | null;
  customer_details?: Record<string, unknown>;
}

type BankAccount = {
  id: number;
  acct_no: string;
  bank_name: string;
  name: string;
  location?: string;
  location_id?: number | null;
  is_active?: boolean;
};

interface OrderResponse {
  count: number;
  results: PaymentOrder[];
}

// A single split-payment entry as entered in the Confirm Payment dialog
type PaymentLineInput = {
  amount: number;
  payerName: string;
  transactionReference: string;
  bankAccountId?: number;
  paymentDate: string;
};

// Replace old PaymentDetailsModal + ConfirmationModal with a single confirm dialog
function VerifyConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  payment,
  bankAccounts,
  pfiOptions,
  selectedPfiId,
  onChangePfiId,
  isSubmitting,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    narration: string,
    files: File[],
    pfiId?: number,
    bankAccountId?: number,
    paymentLines?: PaymentLineInput[],
  ) => void;
  payment: PaymentOrder | null;
  bankAccounts: BankAccount[];
  pfiOptions: Array<{ id: number; label: string }>;
  selectedPfiId: number | '';
  onChangePfiId: (value: number | '') => void;
  isSubmitting: boolean;
}) {
  if (!payment) return null;

  return (
    <VerifyConfirmModalBody
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      payment={payment}
      bankAccounts={bankAccounts}
      pfiOptions={pfiOptions}
      selectedPfiId={selectedPfiId}
      onChangePfiId={onChangePfiId}
      isSubmitting={isSubmitting}
    />
  );
}

type PaymentLine = {
  amount: string;
  payerName: string;
  bankAccountId: string;
  transactionReference: string;
  paymentDate: string;
};

function VerifyConfirmModalBody({
  isOpen,
  onClose,
  onConfirm,
  payment,
  bankAccounts,
  pfiOptions,
  selectedPfiId,
  onChangePfiId,
  isSubmitting,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    narration: string,
    files: File[],
    pfiId?: number,
    bankAccountId?: number,
    paymentLines?: PaymentLineInput[],
    unitPrice?: number,
  ) => void;
  payment: PaymentOrder;
  bankAccounts: BankAccount[];
  pfiOptions: Array<{ id: number; label: string }>;
  selectedPfiId: number | '';
  onChangePfiId: (value: number | '') => void;
  isSubmitting: boolean;
}) {
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [lines, setLines] = useState<PaymentLine[]>([]);
  const [unitPriceInput, setUnitPriceInput] = useState('');

  const { name: customerName, phone: customerPhone } = extractCustomerDisplay(payment);
  const originalAmountValue = parseFloat(payment.amount || '0');
  const paidInto = extractPaidInto(payment);
  const { qtyNum, unitPriceNum: originalUnitPriceNum } = extractProductInfo(payment);

  const editedUnitPriceNum = unitPriceInput.trim() === '' ? undefined : Number(unitPriceInput.replace(/,/g, ''));
  const unitPriceChanged =
    editedUnitPriceNum !== undefined &&
    Number.isFinite(editedUnitPriceNum) &&
    editedUnitPriceNum > 0 &&
    editedUnitPriceNum !== originalUnitPriceNum;

  // The expected sales value live-updates as the unit price is edited, so the
  // split-payment balance check below always compares against the current total.
  const expectedAmountValue =
    unitPriceChanged && qtyNum !== undefined ? editedUnitPriceNum * qtyNum : originalAmountValue;

  const todayStr = () => new Date().toISOString().slice(0, 10);

  // Reset state whenever the modal opens or a different payment is selected.
  useEffect(() => {
    if (isOpen) {
      setAttachedFiles([]);
      setUnitPriceInput(originalUnitPriceNum !== undefined ? String(originalUnitPriceNum) : '');
      const matched = bankAccounts.find(
        (b) => b.acct_no && paidInto.account_number && b.acct_no === paidInto.account_number
      );
      setLines([{
        amount: originalAmountValue > 0 ? String(originalAmountValue) : '',
        payerName: customerName || '',
        bankAccountId: matched ? String(matched.id) : '',
        transactionReference: '',
        paymentDate: todayStr(),
      }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, payment.id]);

  const updateLine = (idx: number, patch: Partial<PaymentLine>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () =>
    setLines((prev) => [...prev, { amount: '', payerName: customerName || '', bankAccountId: '', transactionReference: '', paymentDate: todayStr() }]);
  const removeLine = (idx: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const totalEntered = lines.reduce((s, l) => s + (parseFloat(l.amount || '0') || 0), 0);
  const balance = expectedAmountValue - totalEntered;

  const isPending = String(payment.status || '').toLowerCase() === 'pending';
  // Transaction reference is optional — if provided it must be alphanumeric and unique across lines.
  const referenceList = lines.map((l) => l.transactionReference.trim().toLowerCase()).filter(Boolean);
  const referencesAreUnique = new Set(referenceList).size === referenceList.length;
  const linesValid = lines.length > 0 && lines.every((l) => {
    const amt = parseFloat(l.amount || '0');
    const ref = l.transactionReference.trim();
    const refOk = ref.length === 0 || /^[A-Za-z0-9]+$/.test(ref);
    return amt > 0 && refOk;
  });
  const canConfirm = isPending
    && typeof selectedPfiId === 'number'
    && linesValid
    && referencesAreUnique
    && !isSubmitting;
  const createdDate = new Date(payment.created_at);
  const companyName = extractCompanyName(payment);
  const { product, qty, unitPrice, unitLabel } = extractProductInfo(payment);
  const location = extractLocation(payment);

  const createdText = Number.isNaN(createdDate.getTime()) ? '—' : createdDate.toLocaleString('en-GB');
  const orderRef = getOrderReference(payment) || payment.order_id;
  const totalAmount = `₦${expectedAmountValue.toLocaleString()}`;
  const productSummary = [product, qty ? `${qty} ${unitLabel}` : '']
    .filter(Boolean)
    .join(' × ')
    .trim();
  return (
    <Dialog open={isOpen} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto p-0 border border-slate-300 shadow-xl">
        <div className="border-b border-slate-800 bg-black px-6 pt-5 pb-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg text-white">Confirm Payment</DialogTitle>
            <DialogDescription className="text-sm text-slate-300">
              <span className="font-mono font-semibold text-slate-100">{orderRef}</span> · {totalAmount} sales value
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 bg-white px-6 py-5 text-sm">
          {/* Compact order summary */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-2 gap-y-1.5 text-xs">
              <div><span className="text-slate-400">Date:</span> <span className="font-medium text-slate-700">{createdText}</span></div>
              <div><span className="text-slate-400">Location:</span> <span className="font-medium text-slate-700">{location || '—'}</span></div>
              <div className="col-span-2"><span className="text-slate-400">Product:</span> <span className="font-medium text-slate-700">{productSummary || '—'}</span></div>
              <div className="col-span-2"><span className="text-slate-400">Customer:</span> <span className="font-medium text-slate-700">{[companyName, customerName].filter(Boolean).join(' — ') || '—'}</span></div>
            </div>
          </div>

          {/* Editable unit price — recomputes the sales total live */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-slate-600">
                Unit Price (₦{qtyNum !== undefined ? ` per ${unitLabel}` : ''})
              </label>
              <CommaInput
                value={unitPriceInput}
                onValueChange={setUnitPriceInput}
                placeholder="Unit price"
                className="h-9 text-sm bg-white"
              />
            </div>
            <div className="text-right">
              <div className="text-[11px] font-medium text-slate-500">Sales Total</div>
              <div className={`text-sm font-bold ${unitPriceChanged ? 'text-blue-700' : 'text-slate-800'}`}>
                ₦{expectedAmountValue.toLocaleString()}
              </div>
            </div>
          </div>

          {/* PFI Assignment */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-700 shrink-0">Assign to PFI</label>
            <select
              aria-label="Select PFI"
              required
              className="flex-1 h-9 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={selectedPfiId === '' ? '' : String(selectedPfiId)}
              onChange={(e) => onChangePfiId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select PFI</option>
              {pfiOptions.map((opt) => (
                <option key={opt.id} value={String(opt.id)}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Split payments — record each installment received for this order */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-slate-700">Payments Received</label>

            {lines.map((line, idx) => (
              <div key={idx} className="rounded-lg border border-slate-300 bg-slate-50 p-3 space-y-2.5">
                {lines.length > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Payment {idx + 1}</span>
                    <button type="button" title="Remove this payment" onClick={() => removeLine(idx)} className="text-slate-400 hover:text-red-600">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Amount (₦)</label>
                    <CommaInput
                      value={line.amount}
                      onValueChange={(v) => updateLine(idx, { amount: v })}
                      placeholder="e.g. 5,000,000"
                      className="h-9 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Date</label>
                    <Input
                      type="date"
                      value={line.paymentDate}
                      onChange={(e) => updateLine(idx, { paymentDate: e.target.value })}
                      className="h-9 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Payer's Name</label>
                    <Input
                      value={line.payerName}
                      onChange={(e) => updateLine(idx, { payerName: e.target.value })}
                      placeholder="Who sent the money"
                      className="h-9 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Transaction Reference</label>
                    <Input
                      value={line.transactionReference}
                      onChange={(e) => updateLine(idx, { transactionReference: e.target.value.replace(/[^A-Za-z0-9]/g, '') })}
                      // placeholder="Alphanumeric, unique if provided"
                      className="h-9 text-sm font-mono bg-white"
                    />
                  </div>
                </div>
                <div className="">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Bank Account</label>
                    <select
                      aria-label="Bank account"
                      className="h-9 w-full border border-slate-300 rounded-md bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={line.bankAccountId}
                      onChange={(e) => updateLine(idx, { bankAccountId: e.target.value })}
                    >
                      <option value="">{'— Select —'}</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>{b.bank_name} • {b.acct_no} • {b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={addLine}
              className="w-full h-10 gap-2 border-2 border-dashed border-blue-300 text-blue-700 text-xs uppercase hover:bg-blue-50 hover:border-blue-400 hover:text-blue-800"
            >
              <Plus size={16} />
              Add Another Payment
            </Button>
          </div>

          {/* Live running total vs. expected sales value */}
          <div className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 ${
            balance === 0 ? 'border-emerald-300 bg-emerald-100' : balance > 0 ? 'border-amber-300 bg-amber-100' : 'border-blue-300 bg-blue-100'
          }`}>
            <span className="text-xs font-semibold text-slate-700">
              ₦{totalEntered.toLocaleString()} <span className="text-slate-400">of</span> ₦{expectedAmountValue.toLocaleString()}
            </span>
            <span className={`text-xs font-bold ${balance === 0 ? 'text-emerald-800' : balance > 0 ? 'text-amber-800' : 'text-blue-800'}`}>
              {balance === 0 ? 'Complete ✓' : balance > 0 ? `₦${balance.toLocaleString()} remaining` : `₦${Math.abs(balance).toLocaleString()} overpaid`}
            </span>
          </div>

          {/* File attachments */}
          {/* <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Paperclip size={12} /> Payment Proof
            </label>
            <label className="flex items-center justify-center gap-2 w-full h-20 border-2 border-dashed border-slate-400 rounded-lg cursor-pointer hover:border-slate-600 hover:bg-slate-100 transition-colors text-sm text-slate-700 bg-slate-50">
              <Paperclip size={15} className="text-slate-700" />
              <span className="font-medium">Click to attach payment receipts</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  if (picked.length) setAttachedFiles(prev => [...prev, ...picked]);
                  e.target.value = '';
                }}
              />
            </label>
            <p className="mt-1 text-xs text-slate-600">You can upload images or PDFs</p>
            {attachedFiles.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {attachedFiles.map((f, i) => {
                  const isImage = f.type.startsWith('image/');
                  return (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm">
                      {isImage ? <ImageIcon size={14} className="shrink-0 text-blue-400" /> : <FileText size={14} className="shrink-0 text-slate-400" />}
                      <span className="flex-1 truncate text-slate-800 font-medium">{f.name}</span>
                      <span className="text-xs text-slate-500 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      <button type="button" title="Remove file" onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} className="shrink-0 text-slate-500 hover:text-red-600">
                        <Trash2 size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div> */}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-300 bg-slate-100 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="gap-1.5 bg-green-700 hover:bg-green-900"
            disabled={!canConfirm}
            onClick={() => {
              // Guard against double-clicks firing this twice before the
              // parent's mutation flips isSubmitting/disables this button —
              // each extra click otherwise creates duplicate payment records.
              if (isSubmitting) return;
              const prefix = totalEntered > 0 ? `[PAID:${totalEntered}] ` : '';
              const paymentLines: PaymentLineInput[] = lines.map((l) => ({
                amount: parseFloat(l.amount || '0'),
                payerName: l.payerName.trim(),
                transactionReference: l.transactionReference.trim(),
                bankAccountId: l.bankAccountId ? Number(l.bankAccountId) : undefined,
                paymentDate: l.paymentDate || todayStr(),
              }));
              onConfirm(
                prefix.trim(),
                attachedFiles,
                typeof selectedPfiId === 'number' ? selectedPfiId : undefined,
                paymentLines[0]?.bankAccountId,
                paymentLines,
                unitPriceChanged ? editedUnitPriceNum : undefined,
              );
            }}
          >
            <CheckCheck size={16} />
            {isSubmitting ? 'Confirming…' : 'Confirm Payment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function getStatusClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'paid':     return 'bg-green-50 text-green-700 border-green-200 ring-1 ring-green-100';
    case 'pending':  return 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-100';
    case 'released': return 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-100';
    case 'loaded':   return 'bg-violet-50 text-violet-700 border-violet-200 ring-1 ring-violet-100';
    case 'canceled':
    case 'failed':   return 'bg-red-50 text-red-700 border-red-200 ring-1 ring-red-100';
    default:         return 'bg-slate-50 text-slate-600 border-slate-200 ring-1 ring-slate-100';
  }
}

// Backends sometimes return variant status strings (or stale states) across different admin endpoints.
// Treat these as "confirmable" on the frontend, but still allow the confirm endpoint to be the source of truth.
const isConfirmableStatus = (status: unknown): boolean => {
  const s = String(status || '').trim().toLowerCase();
  // Backend confirm-payment currently enforces pending-only; keep frontend aligned to reduce 409 conflicts.
  return s === 'pending';
};

function extractAccountDetails(p: PaymentOrder, bankAccounts?: BankAccount[]) {
  const rec = p as unknown as Record<string, unknown>;
  const acctLike = (rec.acct || rec.bank_account || rec.account || {}) as Record<string, unknown>;

  const state =
    (typeof rec.state === 'string' ? (rec.state as string) : '') ||
    (typeof rec.location === 'string' ? (rec.location as string) : '') ||
    '';

  const acctId =
    (typeof acctLike.id === 'number' ? acctLike.id : undefined) ||
    (typeof (rec.bank_account_id as unknown) === 'number' ? (rec.bank_account_id as number) : undefined) ||
    (typeof (rec.acct_id as unknown) === 'number' ? (rec.acct_id as number) : undefined);

  const list = Array.isArray(bankAccounts) ? bankAccounts : [];
  const byId = acctId ? list.find((b) => b.id === acctId) : undefined;
  const byLocation = state ? list.find((b) => (b.location || '') === state) : undefined;
  const fallback = byId || byLocation;

  const acct_no =
    (typeof acctLike.acct_no === 'string' ? acctLike.acct_no : undefined) ||
    (typeof acctLike.account_number === 'string' ? acctLike.account_number : undefined) ||
    (fallback?.acct_no || undefined) ||
    (typeof rec.acct_no === 'string' ? (rec.acct_no as string) : '') ||
    '';

  const name =
    (typeof acctLike.name === 'string' ? acctLike.name : undefined) ||
    (typeof acctLike.account_name === 'string' ? acctLike.account_name : undefined) ||
    (fallback?.name || undefined) ||
    (typeof rec.account_name === 'string' ? (rec.account_name as string) : '') ||
    '';

  const bank_name =
    (typeof acctLike.bank_name === 'string' ? acctLike.bank_name : undefined) ||
    (typeof acctLike.bank === 'string' ? acctLike.bank : undefined) ||
    (fallback?.bank_name || undefined) ||
    (typeof rec.bank_name === 'string' ? (rec.bank_name as string) : '') ||
    '';

  return { acct_no, name, bank_name };
}

function extractPaidInto(p: PaymentOrder): { account_name: string; account_number: string; bank_name: string } {
  const rec = p as unknown as Record<string, unknown>;

  const snapNumber = typeof rec.paid_to_account_number === 'string' ? (rec.paid_to_account_number as string) : '';
  const snapName = typeof rec.paid_to_account_name === 'string' ? (rec.paid_to_account_name as string) : '';
  const snapBank = typeof rec.paid_to_bank_name === 'string' ? (rec.paid_to_bank_name as string) : '';

  if (snapNumber.trim()) {
    return {
      account_name: snapName.trim(),
      account_number: snapNumber.trim(),
      bank_name: snapBank.trim(),
    };
  }

  const acctLike = (rec.bank_account || rec.acct || rec.account || {}) as Record<string, unknown>;

  const account_number =
    (typeof acctLike.acct_no === 'string' ? (acctLike.acct_no as string) : '') ||
    (typeof acctLike.account_number === 'string' ? (acctLike.account_number as string) : '') ||
    (typeof rec.acct_no === 'string' ? (rec.acct_no as string) : '') ||
    '';

  const account_name =
    (typeof acctLike.name === 'string' ? (acctLike.name as string) : '') ||
    (typeof acctLike.account_name === 'string' ? (acctLike.account_name as string) : '') ||
    (typeof rec.account_name === 'string' ? (rec.account_name as string) : '') ||
    '';

  const bank_name =
    (typeof acctLike.bank_name === 'string' ? (acctLike.bank_name as string) : '') ||
    (typeof acctLike.bank === 'string' ? (acctLike.bank as string) : '') ||
    (typeof rec.bank_name === 'string' ? (rec.bank_name as string) : '') ||
    '';

  return {
    account_name: String(account_name || '').trim(),
    account_number: String(account_number || '').trim(),
    bank_name: String(bank_name || '').trim(),
  };
}

const extractLocation = (p: PaymentOrder): string => {
  const rec = p as unknown as Record<string, unknown>;

  const pickup = (rec.pickup as Record<string, unknown> | undefined) || undefined;
  const delivery = (rec.delivery as Record<string, unknown> | undefined) || undefined;

  // Verify-orders should provide explicit location fields; prefer them first.
  const v =
    (typeof rec.location_name === 'string' ? (rec.location_name as string) : undefined) ||
    (typeof rec.locationName === 'string' ? (rec.locationName as string) : undefined) ||
    (typeof rec.location === 'string' ? (rec.location as string) : undefined) ||
    (typeof rec.state === 'string' ? (rec.state as string) : undefined) ||
    // Legacy fallbacks (other endpoints)
    (typeof pickup?.state === 'string' ? pickup.state : undefined) ||
    (typeof pickup?.location === 'string' ? pickup.location : undefined) ||
    (typeof delivery?.state === 'string' ? delivery.state : undefined) ||
    (typeof delivery?.location === 'string' ? delivery.location : undefined) ||
    '';

  return String(v || '').trim();
};

const extractCustomerDisplay = (p: PaymentOrder): { name: string; phone: string } => {
  const u = p.user || p.customer || ({} as PaymentOrder['user']);
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  const phone = String(u?.phone_number || u?.phone || '').trim();
  return { name, phone };
};

const extractProductInfo = (p: PaymentOrder): { product: string; qty: string; qtyNum: number | undefined; unitPrice: string; unitPriceNum: number | undefined; unitLabel: string } => {
  const products = Array.isArray(p.products) ? p.products : [];
  const product = products
    .map((x) => x?.name)
    .filter(Boolean)
    .join(', ');

  const toNumber = (v: unknown): number | undefined => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s) return undefined;
      const n = Number(s.replace(/,/g, ''));
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };

  const qtyNum =
    toNumber(p.quantity) ??
    toNumber(p.qty) ??
    toNumber(p.litres) ??
    // Some verify-order serializers return quantity on the first product line
    toNumber(products?.[0] as unknown as { quantity?: unknown }) ??
    toNumber((products?.[0] as unknown as Record<string, unknown>)?.quantity) ??
    toNumber((products?.[0] as unknown as Record<string, unknown>)?.qty) ??
    toNumber((products?.[0] as unknown as Record<string, unknown>)?.litres);

  const qty = qtyNum !== undefined ? qtyNum.toLocaleString() : '';

  const rawUnit = products?.[0]?.unit_price ?? products?.[0]?.unitPrice ?? products?.[0]?.price;
  const unitPriceNum = rawUnit === undefined || rawUnit === null || rawUnit === ''
    ? undefined
    : (() => {
        const n = Number(String(rawUnit).replace(/,/g, ''));
        return Number.isFinite(n) ? n : undefined;
      })();
  const unitPrice = unitPriceNum === undefined
    ? (rawUnit !== undefined && rawUnit !== null ? String(rawUnit) : '')
    : unitPriceNum.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const unitLabel = products?.[0]?.unit_label || products?.[0]?.unit || 'Litres';

  return { product, qty, qtyNum, unitPrice, unitPriceNum, unitLabel };
};

const extractCompanyName = (p: PaymentOrder): string => {
  const rec = p as unknown as Record<string, unknown>;
  const u = (rec.user as Record<string, unknown> | undefined) || undefined;
  const c = (rec.customer as Record<string, unknown> | undefined) || undefined;
  const cd = (rec.customer_details as Record<string, unknown> | undefined) || undefined;

  const v =
    // Backend: VerifyOrderUserSerializer now exposes this explicitly
    (typeof u?.company_name === 'string' ? u.company_name : undefined) ||
    (typeof u?.companyName === 'string' ? u.companyName : undefined) ||
    (typeof u?.company === 'string' ? u.company : undefined) ||
    (typeof c?.company_name === 'string' ? c.company_name : undefined) ||
    (typeof c?.companyName === 'string' ? c.companyName : undefined) ||
    (typeof c?.company === 'string' ? c.company : undefined) ||
    (typeof cd?.company_name === 'string' ? (cd.company_name as string) : undefined) ||
    (typeof cd?.companyName === 'string' ? (cd.companyName as string) : undefined) ||
    (typeof cd?.company === 'string' ? (cd.company as string) : undefined) ||
    (typeof rec.company_name === 'string' ? (rec.company_name as string) : undefined) ||
    (typeof rec.companyName === 'string' ? (rec.companyName as string) : undefined) ||
    (typeof rec.company === 'string' ? (rec.company as string) : undefined) ||
    '';

  return String(v || '').trim();
};

export default function PaymentVerification() {
  const queryClient = useQueryClient();
  const readOnly = isCurrentUserReadOnly();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today'|'yesterday'|'week'|'month'|'year'|null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const [updatingPaymentId, setUpdatingPaymentId] = useState<number | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentOrder | null>(null);
  const [selectedPfiId, setSelectedPfiId] = useState<number | ''>('');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const { toast } = useToast();

  // Track cancel/delete confirmation
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [paymentToCancel, setPaymentToCancel] = useState<PaymentOrder | null>(null);
  const [cancelingOrderId, setCancelingOrderId] = useState<number | null>(null);

  const { data: apiResponse, isLoading } = useQuery<OrderResponse>({
    queryKey: ['verify-orders', 'all'],
    queryFn: async () => {
      const [verifyRes, allRes] = await Promise.all([
        fetchAllPages<PaymentOrder>(
          (p) => apiClient.admin.getVerifyOrders({ status: 'pending', page: p.page, page_size: p.page_size })
        ).catch(() => ({ count: 0, results: [] as PaymentOrder[] })),
        fetchAllPages<any>(
          (p) => apiClient.admin.getAllAdminOrders({ status: 'pending', page: p.page, page_size: p.page_size })
        ).catch(() => ({ count: 0, results: [] }))
      ]);

      const map = new Map<number, PaymentOrder>();

      // 1. Populate map with pending orders from general all-orders
      allRes.results.forEach((item: any) => {
        if (item && typeof item.id === 'number') {
          const amount = item.amount || String(item.total_price || '0');
          map.set(item.id, {
            ...item,
            amount,
            order_id: item.order_id || item.id,
            status: 'pending' as const,
            payment_channel: item.payment_channel || '',
            reference: item.reference || '',
          });
        }
      });

      // 2. Overlay or merge with the verify-orders pending items (taking precedence for bank/payment specifics)
      verifyRes.results.forEach((item: PaymentOrder) => {
        if (item) {
          const rawOrderId = item.order_id;
          const orderId = typeof rawOrderId === 'number'
            ? rawOrderId
            : (typeof rawOrderId === 'string' ? parseInt(rawOrderId, 10) : null);
          const targetId = (orderId && !isNaN(orderId)) ? orderId : (typeof item.id === 'number' ? item.id : null);

          if (typeof targetId === 'number') {
            const existing = map.get(targetId);
            const amount = item.amount || (existing ? existing.amount : '0');
            map.set(targetId, {
              ...existing,
              ...item,
              id: targetId,
              amount,
              status: 'pending' as const,
            });
          }
        }
      });

      const mergedResults = Array.from(map.values());
      return {
        count: mergedResults.length,
        results: mergedResults
      };
    },
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const allPayments = useMemo(() => apiResponse?.results || [], [apiResponse?.results]);

  // Finance-configured bank accounts (used as fallback when verify-orders response omits details)
  const { data: bankAccountsResponse } = useQuery<{ results?: BankAccount[]; count?: number } | BankAccount[]>({
    queryKey: ['bank-accounts', 'verify-payment-fallback'],
    queryFn: async () => {
      const res = await apiClient.admin.getBankAccounts({ active: true });
      return res;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const bankAccounts: BankAccount[] = useMemo(() => {
    if (!bankAccountsResponse) return [];
    return Array.isArray(bankAccountsResponse)
      ? bankAccountsResponse
      : (bankAccountsResponse.results || []);
  }, [bankAccountsResponse]);

  const pfiQuery = useQuery<{ results?: Array<{ id: number; pfi_number?: string | number; pfi_no?: string | number }> } & Record<string, unknown>>({
    queryKey: ['pfis', 'active'],
    queryFn: async () => apiClient.admin.getPfis({ status: 'active', page: 1, page_size: 500 }),
    staleTime: 60_000,
    retry: 1,
  });

  const pfiOptions = useMemo(() => {
    const rec = (pfiQuery.data && typeof pfiQuery.data === 'object') ? (pfiQuery.data as Record<string, unknown>) : null;
    const raw = (rec?.results as unknown) ?? (Array.isArray(pfiQuery.data) ? pfiQuery.data : []);
    const list = (raw || []) as Array<{ id: number; pfi_number?: string | number; pfi_no?: string | number }>;
    return list
      .filter((p) => p && typeof p.id === 'number')
      .map((p) => ({ id: p.id, label: String(p.pfi_number ?? p.pfi_no ?? `PFI-${p.id}`) }));
  }, [pfiQuery.data]);

  const uniqueLocations = useMemo(() => {
    const locs = allPayments
      .map((p) => {
        return extractLocation(p);
      })
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    return Array.from(new Set(locs)).sort();
  }, [allPayments]);

  const uniqueProducts = useMemo(() => {
    const names = allPayments
      .flatMap(p => (p.products || []).map(x => x?.name))
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return Array.from(new Set(names)).sort();
  }, [allPayments]);

  const hasActiveFilters = !!(locationFilter || productFilter || filterType || dateRange.from);

  const clearAllFilters = () => {
    setLocationFilter(null);
    setProductFilter(null);
    setFilterType(null);
    setDateRange({ from: null, to: null });
    setSearchQuery('');
  };

  const filteredPayments = useMemo(() => {
    return allPayments
      // Only show entries that are likely confirmable; this reduces 409 conflicts caused by mismatched list/status.
      .filter((p) => isConfirmableStatus(p.status))
      .filter(p => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        const orderRef = String(getOrderReference(p) || '').toLowerCase();
        const orderId = String(p.order_id || '').toLowerCase();
        const { name: customerName, phone: customerPhone } = extractCustomerDisplay(p);
        const companyName = extractCompanyName(p);
        const location = extractLocation(p);
        const amount = String(p.amount || '');
        return (
          orderRef.includes(q) ||
          orderId.includes(q) ||
          customerName.toLowerCase().includes(q) ||
          customerPhone.toLowerCase().includes(q) ||
          companyName.toLowerCase().includes(q) ||
          location.toLowerCase().includes(q) ||
          amount.includes(q)
        );
      })
      .filter(p => {
        if (!filterType) return true;
        const d = new Date(p.created_at);
        if (filterType === 'today') return isToday(d);
        if (filterType === 'yesterday') return isYesterday(d);
        if (filterType === 'week') return isThisWeek(d);
        if (filterType === 'month') return isThisMonth(d);
        if (filterType === 'year') return isThisYear(d);
        return true;
      })
      .filter(p => {
        if (!locationFilter) return true;
        return extractLocation(p) === locationFilter;
      })
      .filter(p => {
        if (!productFilter) return true;
        const { product } = extractProductInfo(p);
        return product.includes(productFilter);
      })
      .filter(p => {
        if (dateRange.from && dateRange.to) {
          const d = new Date(p.created_at);
          return (isSameDay(d, dateRange.from) || isAfter(d, dateRange.from)) &&
                 (isSameDay(d, dateRange.to) || isBefore(d, addDays(dateRange.to, 1)));
        }
        return true;
      });
  }, [allPayments, searchQuery, filterType, locationFilter, productFilter, dateRange]);

  const updatePaymentMutation = useMutation({
    mutationFn: async (args: {
      orderId: number;
      narration: string;
      files: File[];
      pfiId?: number;
      bankAccount?: BankAccount;
      paymentLines?: PaymentLineInput[];
      unitPrice?: number;
    }) => {
      setUpdatingPaymentId(args.orderId);
      try {
        // Record every split-payment entry FIRST — if any transaction reference
        // turns out to be a duplicate, this throws and the order is never touched.
        for (const line of args.paymentLines || []) {
          await apiClient.admin.addOrderPaymentRecord(args.orderId, {
            amount: line.amount,
            payment_date: line.paymentDate || undefined,
            payer_name: line.payerName || undefined,
            transaction_reference: line.transactionReference || undefined,
            bank_account: line.bankAccountId,
          });
        }
        await apiClient.admin.confirmPayment(args.orderId, {
          narration: args.narration?.trim() || undefined,
          pfi_id: args.pfiId,
          unit_price: args.unitPrice,
        });
        // Snapshot the (first) bank account used onto the order, for display
        // in the main orders table.
        if (args.bankAccount) {
          await apiClient.admin.patchAdminOrder(args.orderId, {
            paid_to_bank_name: args.bankAccount.bank_name,
            paid_to_account_number: args.bankAccount.acct_no,
            paid_to_account_name: args.bankAccount.name,
          });
        }
        // Upload files after confirming — fire-and-forget if there are any
        if (args.files.length > 0) {
          await apiClient.admin.uploadPaymentFiles(args.orderId, args.files);
        }
      } finally {
        setUpdatingPaymentId(null);
      }
    },
    onSuccess: async (_data, args) => {
      // Refresh verify-orders list so the confirmed item disappears.
      await queryClient.invalidateQueries({ queryKey: ['verify-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['verify-orders', 'all'] });

      // Refresh shared all-orders cache so Confirm Release, Loading Tickets, Payments Report update.
      queryClient.invalidateQueries({ queryKey: ['all-orders'] });

      // Also refresh audit-related caches so the action timeline updates immediately if open elsewhere.
      queryClient.invalidateQueries({ queryKey: ['order-audit'] });
      queryClient.invalidateQueries({ queryKey: ['order-audit-events', args.orderId] });

      toast({
        title: 'Success ✅',
        description: 'Payment has been successfully confirmed and order has been released.',
      });
    },
    onError: async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const is409 = typeof message === 'string' && message.includes('(409)');

      toast({
        title: is409 ? 'Already updated' : 'Error',
        description: message || 'Failed to verify payment',
        variant: 'destructive',
      });

      // If state changed elsewhere, refresh the list so UI stays consistent.
      if (is409) {
        await queryClient.invalidateQueries({ queryKey: ['verify-orders'] });
        await queryClient.invalidateQueries({ queryKey: ['verify-orders', 'all'] });
      }
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      setCancelingOrderId(orderId);
      try {
        await apiClient.admin.deleteOrder(orderId);
      } finally {
        setCancelingOrderId(null);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['verify-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['verify-orders', 'all'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['recent-orders'] });

      toast({
        title: 'Order cancelled',
        description: 'The order has been deleted from the system.',
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Failed to cancel order',
        description: message || 'Unable to delete order',
        variant: 'destructive',
      });
    },
  });

  const handleVerifyClick = (payment: PaymentOrder) => {
    // Re-check the latest status we have before opening the dialog.
    if (!isConfirmableStatus(payment.status)) {
      const s = String(payment.status || '').toLowerCase();
      toast({
        title: 'Cannot confirm payment',
        description: `This order is currently ${s || 'not pending'} and cannot be confirmed.`,
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    setSelectedPayment(payment);
    setSelectedPfiId(payment.pfi_id && Number.isFinite(Number(payment.pfi_id)) ? Number(payment.pfi_id) : '');
    setIsConfirmModalOpen(true);
  };

  const handleCancelClick = (payment: PaymentOrder) => {
    setPaymentToCancel(payment);
    setIsCancelModalOpen(true);
  };

  const handleConfirm = async (
    narration: string,
    files: File[],
    pfiId?: number,
    bankAccountId?: number,
    paymentLines?: PaymentLineInput[],
    unitPrice?: number,
  ) => {
    if (!selectedPayment?.order_id) return;
    // Defensive re-entrancy guard: never let a second confirm run while one
    // is still in flight — that's what created duplicate payment records.
    if (updatePaymentMutation.isPending) return;

    if (!Number.isFinite(Number(pfiId))) {
      toast({
        title: 'PFI required',
        description: 'Select an active PFI before confirming payment.',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    if (!paymentLines || paymentLines.length === 0) {
      toast({
        title: 'Payment required',
        description: 'Add at least one payment before confirming.',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    const status = String(selectedPayment.status || '').toLowerCase();
    if (!isConfirmableStatus(status)) {
      toast({
        title: 'Cannot confirm payment',
        description: `This order is already ${status || 'not pending'} and cannot be confirmed again.`,
        variant: 'destructive',
        duration: 3000,
      });
      setIsConfirmModalOpen(false);
      setSelectedPayment(null);
      return;
    }

    // IMPORTANT: verify-orders rows are OrderPaymentInfo; use order_id (Order.id) for confirm-payment.
    const orderId = Number(selectedPayment.order_id);
    if (!Number.isFinite(orderId)) {
      toast({
        title: 'Cannot confirm payment',
        description: 'Invalid order id returned from verify-orders endpoint.',
        variant: 'destructive',
        duration: 3000,
      });
      setIsConfirmModalOpen(false);
      setSelectedPayment(null);
      return;
    }

    const bankAccount = typeof bankAccountId === 'number' ? bankAccounts.find((b) => b.id === bankAccountId) : undefined;

    try {
      await updatePaymentMutation.mutateAsync({ orderId, narration, files, pfiId: Number(pfiId), bankAccount, paymentLines, unitPrice });
    } finally {
      setIsConfirmModalOpen(false);
      setSelectedPayment(null);
      setSelectedPfiId('');
    }
  };

  const confirmCancelOrder = async () => {
    if (!paymentToCancel?.order_id) return;

    const orderId = Number(paymentToCancel.order_id);
    if (!Number.isFinite(orderId)) {
      toast({
        title: 'Cannot cancel order',
        description: 'Invalid order id returned from verify-orders endpoint.',
        variant: 'destructive',
      });
      setIsCancelModalOpen(false);
      setPaymentToCancel(null);
      return;
    }

    try {
      await deleteOrderMutation.mutateAsync(orderId);
    } finally {
      setIsCancelModalOpen(false);
      setPaymentToCancel(null);
    }
  };

  const summaryCards = useMemo((): SummaryCard[] => {
    // Reflects the active filters (search/period/location/product/date range) —
    // not the full unfiltered queue — so the cards match what's actually on screen.
    const totalQty = filteredPayments.reduce((s, p) => {
      const { qty } = extractProductInfo(p);
      const n = parseFloat(qty.replace(/,/g, '') || '0');
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
    const totalAmt = filteredPayments.reduce((s, p) => {
      const n = parseFloat(String(p.amount || '0').replace(/,/g, ''));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
    return [
      { title: 'Pending Payments', value: String(filteredPayments.length), icon: <Clock size={20} />, tone: filteredPayments.length > 0 ? 'amber' : 'neutral' },
      { title: 'Total Volume', value: `${totalQty.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`, icon: <Fuel size={20} />, tone: 'green' },
      { title: 'Total Amount', value: `₦${totalAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, icon: <DollarSign size={20} />, tone: 'green' },
    ];
  }, [filteredPayments]);

  const exportToCSV = () => {
    const headers = ['Date', 'Order Reference', 'Account No', 'Account Name', 'Bank', 'Amount', 'Status'];
    const rows = filteredPayments.map(p => {
      const { acct_no, name, bank_name } = extractAccountDetails(p, bankAccounts);
      return [
        format(new Date(p.created_at), 'dd/MM/yyyy'),
        getOrderReference(p) || p.order_id,
        acct_no,
        name,
        bank_name,
        p.amount,
        p.status,
      ];
    });

    const csvContent = [headers, ...rows]
      .map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `pending_payments_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToXLS = () => {
    const title = 'PENDING PAYMENTS REPORT';
    const subtitle = `EXPORTED: ${format(new Date(), 'dd/MM/yyyy HH:mm').toUpperCase()}`;
    const totalRows = `TOTAL RECORDS: ${filteredPayments.length.toLocaleString()}`;

    const headers = ['DATE', 'ORDER REFERENCE', 'FACILITATOR', 'PHONE', 'COMPANY', 'LOCATION', 'PRODUCT', 'QUANTITY (L)', 'UNIT PRICE (₦)', 'AMOUNT (₦)', 'ACCOUNT NO', 'ACCOUNT NAME', 'BANK', 'STATUS'];

    const fmt = (n: string | number | undefined | null) => {
      const num = parseFloat(String(n ?? '').replace(/,/g, ''));
      return Number.isFinite(num) && num > 0 ? num.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(n ?? '—').toUpperCase();
    };

    const rows = filteredPayments.map(p => {
      const { acct_no, name, bank_name } = extractAccountDetails(p, bankAccounts);
      const { name: customerName, phone } = extractCustomerDisplay(p);
      const companyName = extractCompanyName(p);
      const location = extractLocation(p);
      const { product, qty, unitPrice } = extractProductInfo(p);
      const amount = parseFloat(String(p.amount || '0').replace(/,/g, ''));
      const qtyNum = parseFloat(String(qty).replace(/,/g, ''));
      const upNum = parseFloat(String(unitPrice).replace(/,/g, ''));
      return [
        format(new Date(p.created_at), 'dd/MM/yyyy HH:mm'),
        String(getOrderReference(p) || p.order_id).toUpperCase(),
        customerName.toUpperCase(),
        phone.toUpperCase(),
        companyName.toUpperCase(),
        location.toUpperCase(),
        product.toUpperCase(),
        Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum.toLocaleString(undefined, { maximumFractionDigits: 0 }) : (qty || '—'),
        Number.isFinite(upNum) && upNum > 0 ? upNum.toLocaleString(undefined, { maximumFractionDigits: 2 }) : (unitPrice || '—'),
        Number.isFinite(amount) ? amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(p.amount || '—'),
        acct_no.toUpperCase(),
        name.toUpperCase(),
        bank_name.toUpperCase(),
        String(p.status || '—').toUpperCase(),
      ];
    });

    const totalAmt = filteredPayments.reduce((s, p) => {
      const n = parseFloat(String(p.amount || '0').replace(/,/g, ''));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);

    const summaryRow = ['', '', '', '', '', '', '', '', 'TOTAL AMOUNT:', `₦${totalAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, '', '', '', ''];

    const aoa = [
      [title],
      [subtitle],
      [totalRows],
      [],
      headers,
      ...rows,
      [],
      summaryRow,
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Merge title cells across all columns
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: headers.length - 1 } },
    ];

    // Auto column widths (based on headers + data rows)
    ws['!cols'] = headers.map((h, i) => ({
      wch: Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length), 10) + 2,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PENDING PAYMENTS');
    XLSX.writeFile(wb, `PENDING_PAYMENTS_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
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
              title="Pending Payments"
              description="Review incoming payment, confirm payments, and track verification status."
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={exportToXLS}
                  disabled={filteredPayments.length === 0}
                >
                  <Download size={15} />
                  Export Excel
                </Button>
              }
            />

            <SummaryCards cards={summaryCards} />

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col gap-3">
                {/* Row 1: Search + quick timeframe buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      placeholder="Search reference, customer, company, product…"
                      className="pl-10"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {(['today', 'yesterday', 'week', 'month', 'year'] as const).map(tf => (
                      <Button
                        key={tf}
                        size="sm"
                        variant={filterType === tf ? 'default' : 'outline'}
                        className="h-9 text-xs capitalize"
                        onClick={() => {
                          setFilterType(filterType === tf ? null : tf);
                          setDateRange({ from: null, to: null });
                        }}
                      >
                        {tf}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Row 2: Location, Product, Date Range, Clear */}
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Location</label>
                    <select
                      aria-label="Location filter"
                      className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={locationFilter ?? ''}
                      onChange={e => setLocationFilter(e.target.value || null)}
                    >
                      <option value="">All Locations</option>
                      {uniqueLocations.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Product</label>
                    <select
                      aria-label="Product filter"
                      className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={productFilter ?? ''}
                      onChange={e => setProductFilter(e.target.value || null)}
                    >
                      <option value="">All Products</option>
                      {uniqueProducts.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 min-w-[200px]">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Date Range</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full h-9 justify-start text-left font-normal text-sm">
                          <CalendarDays className="mr-2 h-4 w-4 text-slate-400" />
                          {dateRange.from && dateRange.to
                            ? `${format(dateRange.from, 'dd MMM')} – ${format(dateRange.to, 'dd MMM yyyy')}`
                            : 'Pick date range'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="range"
                          selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined}
                          onSelect={(range) => {
                            setDateRange({ from: range?.from ?? null, to: range?.to ?? null });
                            if (range?.from) setFilterType(null);
                          }}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {hasActiveFilters && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 gap-1 text-slate-500 hover:text-red-600 shrink-0"
                      onClick={clearAllFilters}
                    >
                      <X size={14} />
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S/N</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Facilitator</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Paid Into</TableHead>
                    <TableHead>Expected Amount</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(5)].map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-28 ml-auto" /></TableCell>
                       </TableRow>
                     ))
                  ) : filteredPayments.length === 0 ? (
                     <TableRow>
                      <TableCell colSpan={11} className="text-center h-24 text-slate-500">
                         No pending payments found
                       </TableCell>
                     </TableRow>
                   ) : (
                    filteredPayments.map((payment, idx) => {
                      const created = new Date(payment.created_at);
                      const { name: customerName, phone: customerPhone } = extractCustomerDisplay(payment);
                      const companyName = extractCompanyName(payment);
                      const location = extractLocation(payment);
                      const { product, qty, unitPrice, unitLabel } = extractProductInfo(payment);
                      const paidInto = extractPaidInto(payment);
                       return (
                         <TableRow key={payment.id} className="hover:bg-slate-50/50">
                          <TableCell className="text-sm text-center text-slate-600">{idx + 1}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-slate-600">
                            <div>{Number.isNaN(created.getTime()) ? '—' : created.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                            <div className="text-slate-400 text-xs">{Number.isNaN(created.getTime()) ? '' : created.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                          </TableCell>
                          <TableCell className="font-semibold text-slate-950">
                            {getOrderReference(payment) || payment.order_id}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm uppercase font-medium text-slate-800">{customerName || '—'}</span>
                              {customerPhone ? (
                                <a
                                  href={`tel:${customerPhone}`}
                                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Call"
                                >
                                  <PhoneOutgoing size={11} className="text-green-600" />
                                  {customerPhone}
                                </a>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium uppercase text-slate-900">{companyName || '—'}</span>
                          </TableCell>
                          
                          <TableCell className="text-slate-700">{location || '—'}</TableCell>
                          <TableCell className="text-slate-700">{product || '—'}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900">{qty || '—'} {unitLabel}</span>
                              <span className="text-xs text-slate-500">{unitPrice ? `Unit Price: ₦${unitPrice}` : '—'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900">{paidInto.account_number || '—'}</span>
                              <span className="text-xs text-slate-500">{paidInto.bank_name || '—'}</span>
                            </div>
                          </TableCell>
                           <TableCell className="text-right font-bold text-slate-950">
                             ₦{parseFloat(String(payment.amount || '0')).toLocaleString()}
                           </TableCell>
                           <TableCell className="text-left">
                             {!readOnly && (
                             <div className="flex items-center justify-end gap-1.5">
                               <Button
                                 variant="default"
                                 size="sm"
                                 disabled={updatingPaymentId === payment.id}
                                 onClick={() => handleVerifyClick(payment)}
                                 className="h-8 gap-1 px-2.5 text-xs"
                               >
                                 {updatingPaymentId === payment.id ? (
                                   <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                 ) : (
                                   <CheckCheck className="h-3.5 w-3.5" />
                                 )}
                                 Confirm
                               </Button>

                               <Button
                                 variant="destructive"
                                 size="sm"
                                 disabled={cancelingOrderId === Number(payment.order_id)}
                                 onClick={() => handleCancelClick(payment)}
                                 className="h-8 gap-1 px-2.5 text-xs"
                               >
                                 {cancelingOrderId === Number(payment.order_id) ? (
                                   <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                 ) : (
                                   <XCircle className="h-3.5 w-3.5" />
                                 )}
                                 Cancel
                               </Button>
                             </div>
                             )}
                           </TableCell>
                         </TableRow>
                       );
                     })
                   )}
                </TableBody>
              </Table>
            </div>

            <VerifyConfirmModal
              isOpen={isConfirmModalOpen}
              onClose={() => {
                setIsConfirmModalOpen(false);
                setSelectedPayment(null);
                setSelectedPfiId('');
              }}
              onConfirm={handleConfirm}
              payment={selectedPayment}
              bankAccounts={bankAccounts}
              pfiOptions={pfiOptions}
              selectedPfiId={selectedPfiId}
              onChangePfiId={setSelectedPfiId}
              isSubmitting={updatePaymentMutation.isPending}
            />

            {/* Cancel/Delete confirmation modal */}
            <Dialog open={isCancelModalOpen} onOpenChange={(v) => (v ? null : (setIsCancelModalOpen(false), setPaymentToCancel(null)))}>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle className="text-slate-950">Cancel order</DialogTitle>
                  <DialogDescription className="text-slate-600">
                    This will permanently delete the order from the system. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <div className="font-medium">You are about to delete:</div>
                  <div className="mt-1">
                    <span className="text-red-900/80">Order Ref:</span>{' '}
                    <span className="font-semibold">{paymentToCancel ? (getOrderReference(paymentToCancel) || String(paymentToCancel.order_id)) : '—'}</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-red-900/80">Amount:</span>{' '}
                    <span className="font-semibold">{paymentToCancel ? `₦${parseFloat(paymentToCancel.amount || '0').toLocaleString()}` : '—'}</span>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => { setIsCancelModalOpen(false); setPaymentToCancel(null); }}>
                    Close
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmCancelOrder}
                    disabled={!!cancelingOrderId}
                  >
                    {cancelingOrderId ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Deleting...
                      </span>
                    ) : (
                      'Delete order'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
