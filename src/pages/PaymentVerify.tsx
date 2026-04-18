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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { apiClient, fetchAllPages } from '@/api/client';
import { isCurrentUserReadOnly } from '@/roles';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ShieldCheck, Loader2, Download, CheckCircle, DollarSign, PhoneOutgoing, CheckSquare2, CheckCheck, XCircle, Calendar, MapPin, Package, Building2, User, Banknote } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { format, isThisMonth, isThisWeek, isThisYear, isToday, isYesterday } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
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
  products?: Array<{ name?: string; unit_price?: string | number; price?: string | number; unitPrice?: string | number }>;
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

// Replace old PaymentDetailsModal + ConfirmationModal with a single confirm dialog
function VerifyConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  payment,
  bankAccounts,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (narration: string) => void;
  payment: PaymentOrder | null;
  bankAccounts: BankAccount[];
}) {
  if (!payment) return null;

  return (
    <VerifyConfirmModalBody
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      payment={payment}
      bankAccounts={bankAccounts}
    />
  );

}

function VerifyConfirmModalBody({
  isOpen,
  onClose,
  onConfirm,
  payment,
  bankAccounts,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (narration: string) => void;
  payment: PaymentOrder;
  bankAccounts: BankAccount[];
}) {
  const [narration, setNarration] = useState('');
  const [amountPaid, setAmountPaid] = useState('');

  // Reset narration and amount paid whenever the modal opens or a different payment is selected.
  useEffect(() => {
    if (isOpen) {
      setNarration('');
      // Pre-fill with the expected amount
      const expected = parseFloat(payment.amount || '0');
      setAmountPaid(expected > 0 ? String(expected) : '');
    }
  }, [isOpen, payment.id, payment.amount]);

  const isPending = String(payment.status || '').toLowerCase() === 'pending';
  const createdDate = new Date(payment.created_at);
  const { name: customerName, phone: customerPhone } = extractCustomerDisplay(payment);
  const companyName = extractCompanyName(payment);
  const { product, qty, unitPrice } = extractProductInfo(payment);
  const paidInto = extractPaidInto(payment);
  const location = extractLocation(payment);

  const createdText = Number.isNaN(createdDate.getTime()) ? '—' : createdDate.toLocaleString('en-GB');
  const orderRef = getOrderReference(payment) || payment.order_id;
  const totalAmount = `₦${parseFloat(payment.amount || '0').toLocaleString()}`;
  const productSummary = [product, qty ? `${qty} Litres` : '']
    .filter(Boolean)
    .join(' × ')
    .trim();
  return (
    <Dialog open={isOpen} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto p-0">
        <div className="border-b border-slate-200 bg-slate-50 px-6 pt-6 pb-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg text-slate-950">Confirm Payment & Release Order</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Review the details below before confirming. This will release the order for loading.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-3 px-6 py-5 text-sm">
          {/* Date & Order Ref */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
              <Calendar size={15} className="mt-0.5 shrink-0 text-slate-400" />
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Date</div>
                <div className="font-medium text-slate-900">{createdText}</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
              <Search size={15} className="mt-0.5 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Order Ref</div>
                <div className="truncate font-semibold text-slate-950">{orderRef}</div>
              </div>
            </div>
          </div>

          {/* Location & Product */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
              <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Location</div>
                <div className="font-medium text-slate-900">{location || '—'}</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
              <Package size={15} className="mt-0.5 shrink-0 text-slate-400" />
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Product & Qty</div>
                <div className="font-medium text-slate-900">{productSummary || '—'}</div>
              </div>
            </div>
          </div>

          {/* Company & Facilitator */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
              <Building2 size={15} className="mt-0.5 shrink-0 text-slate-400" />
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Company</div>
                <div className="font-semibold uppercase text-slate-900">{companyName || '—'}</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
              <User size={15} className="mt-0.5 shrink-0 text-slate-400" />
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Facilitator</div>
                <div className="font-medium uppercase text-slate-900">{customerName || '—'}</div>
                {customerPhone ? <div className="text-xs text-slate-500">{customerPhone}</div> : null}
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              <Banknote size={14} />
              Paid Into
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] text-slate-400">Account No.</div>
                <div className="font-semibold text-slate-900">{paidInto.account_number || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Bank</div>
                <div className="font-medium uppercase text-slate-900">{paidInto.bank_name || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Account Name</div>
                <div className="font-medium uppercase text-slate-900">{paidInto.account_name || '—'}</div>
              </div>
            </div>
          </div>

          {/* Amount */}
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="text-sm font-medium text-emerald-800">Expected Amount</span>
            <span className="text-lg font-bold text-emerald-900">{totalAmount}</span>
          </div>

          {/* Amount Paid */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Amount Paid (₦)</label>
            <Input
              type="text"
              inputMode="numeric"
              value={amountPaid ? Number(amountPaid).toLocaleString() : ''}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9.]/g, '');
                setAmountPaid(raw);
              }}
              placeholder="Enter the amount the customer actually paid"
              className="h-10"
            />
            {(() => {
              const expected = parseFloat(payment.amount || '0');
              const paid = parseFloat(amountPaid || '0');
              const bal = expected - paid;
              if (!amountPaid || Number.isNaN(paid)) return null;
              if (bal > 0) {
                return (
                  <div className="mt-1.5 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm">
                    <span className="text-red-700">Outstanding Balance</span>
                    <span className="font-bold text-red-800">₦{bal.toLocaleString()}</span>
                  </div>
                );
              }
              if (bal === 0) {
                return (
                  <div className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 font-medium">
                    ✓ Fully paid
                  </div>
                );
              }
              return (
                <div className="mt-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  Overpaid by ₦{Math.abs(bal).toLocaleString()}
                </div>
              );
            })()}
          </div>

          {/* Narration */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Any Remarks</label>
            <Textarea
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="e.g. part payment, short payment, lump sum, bank transfer details…"
              className="min-h-[60px] resize-none"
            />
          </div>

          {/* Warning */}
          {/* <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
            ⚠️ Do not confirm unless payment has been verified. This action allows releasing for loading.
          </div> */}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => {
              const paidNum = parseFloat(amountPaid || '0');
              const prefix = Number.isFinite(paidNum) && paidNum > 0 ? `[PAID:${paidNum}] ` : '';
              onConfirm(`${prefix}${narration}`.trim());
            }} disabled={!isPending} className="gap-1.5">
            <CheckCheck size={16} />
            Confirm & Release
          </Button>
          {!isPending ? (
            <div className="w-full text-xs text-amber-700">This order is no longer pending.</div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}


function getStatusClass(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'pending':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
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

const extractProductInfo = (p: PaymentOrder): { product: string; qty: string; unitPrice: string } => {
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
  const unitPrice =
    rawUnit === undefined || rawUnit === null || rawUnit === ''
      ? ''
      : (() => {
          const n = Number(String(rawUnit).replace(/,/g, ''));
          return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(rawUnit);
        })();

  return { product, qty, unitPrice };
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
  const [updatingPaymentId, setUpdatingPaymentId] = useState<number | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentOrder | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const { toast } = useToast();

  // Track cancel/delete confirmation
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [paymentToCancel, setPaymentToCancel] = useState<PaymentOrder | null>(null);
  const [cancelingOrderId, setCancelingOrderId] = useState<number | null>(null);

  const { data: apiResponse, isLoading } = useQuery<OrderResponse>({
    queryKey: ['verify-orders', 'all'],
    queryFn: async () => {
      return fetchAllPages<PaymentOrder>(
        (p) => apiClient.admin.getVerifyOrders({ status: 'pending', page: p.page, page_size: p.page_size }),
      );
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

  const uniqueLocations = useMemo(() => {
    const locs = allPayments
      .map((p) => {
        return extractLocation(p);
      })
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    return Array.from(new Set(locs)).sort();
  }, [allPayments]);

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
      });
  }, [allPayments, searchQuery, filterType, locationFilter]);

  const updatePaymentMutation = useMutation({
    mutationFn: async (args: { orderId: number; narration: string }) => {
      setUpdatingPaymentId(args.orderId);
      try {
        await apiClient.admin.confirmPayment(args.orderId, { narration: args.narration?.trim() || undefined });
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
    setIsConfirmModalOpen(true);
  };

  const handleCancelClick = (payment: PaymentOrder) => {
    setPaymentToCancel(payment);
    setIsCancelModalOpen(true);
  };

  const handleConfirm = async (narration: string) => {
    if (!selectedPayment?.order_id) return;

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

    try {
      await updatePaymentMutation.mutateAsync({ orderId, narration });
    } finally {
      setIsConfirmModalOpen(false);
      setSelectedPayment(null);
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
            />

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col lg:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      placeholder="Search here..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3">
                  <select
                    aria-label="Timeframe filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={filterType ?? ''}
                    onChange={(e) => {
                      const v = e.target.value as ''|'today'|'yesterday'|'week'|'month'|'year';
                      setFilterType(v === '' ? null : v);
                    }}
                  >
                    <option value="">Select Timeframe</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="year">This Year</option>
                  </select>
                  <select
                    aria-label="Location filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={locationFilter ?? ''}
                    onChange={(e) => setLocationFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Locations</option>
                    {uniqueLocations.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
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
                      const { product, qty, unitPrice } = extractProductInfo(payment);
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
                              <span className="font-semibold text-slate-900">{qty || '—'} Litres</span>
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
              }}
              onConfirm={handleConfirm}
              payment={selectedPayment}
              bankAccounts={bankAccounts}
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
