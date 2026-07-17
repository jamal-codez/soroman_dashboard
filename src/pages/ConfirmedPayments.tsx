import { Fragment, useEffect, useMemo, useState } from 'react';
import { getCurrentUserRoles } from '@/roles';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { CommaInput } from '@/components/ui/comma-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Search, ShoppingCart, Droplets, Banknote, Pencil, CalendarDays, X, Truck, Paperclip, FileText, ImageIcon, ExternalLink, Trash2, Plus, Wallet, ArrowLeftRight, CheckCircle2, RotateCcw, Clock, Ban, AlertTriangle, CheckCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { StatementPicker, BulkStatementPicker, type StatementLineOption } from '@/components/BankStatementPicker';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiClient, fetchAllPages } from '@/api/client';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format, isThisMonth, isThisWeek, isThisYear, isToday, isYesterday, addDays, isAfter, isBefore, isSameDay, startOfWeek, startOfMonth, startOfYear, subDays } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getOrderReference } from '@/lib/orderReference';
import { SummaryCards } from '@/components/SummaryCards';

interface PaymentOrder {
  id: number;
  reference?: string;
  status: string;
  created_at: string;

  // Orders endpoint fields
  total_price?: string | number;
  amount?: string | number;

  // If present from backend, use it; otherwise we fall back gracefully.
  payment_confirmed_at?: string | null;
  payment_narration?: string | null;

  pfi_id?: string | number | null;
  pfi_number?: string | number | null;
  pfi?: string | number | null;

  user?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    phone?: string;
    company_name?: string;
  };

  products?: Array<{
    id?: number;
    name?: string;
    abbreviation?: string;
    quantity?: string | number;
    unit_price?: string | number;
    price?: string | number;
    unitPrice?: string | number;
    qty?: string | number;
    litres?: string | number;
    unit?: string;
    unit_label?: string;
  }>;

  quantity?: number | string;
  qty?: number | string;
  litres?: number | string;

  state?: string;
  location?: string;
  location_name?: string;

  // narration fallback if present
  narration?: string | null;

  // Payment proof files uploaded at confirm time
  payment_files?: Array<{ id: number; file: string; file_name: string; uploaded_at: string }>;

  // Split payment entries recorded for this order
  payment_records?: Array<{
    id: number;
    amount: string;
    payment_date: string;
    payer_name?: string | null;
    bank_name?: string | null;
    account_number?: string | null;
    account_name?: string | null;
    transaction_reference?: string | null;
  }>;

  truck_number?: string | null;
  customer_details?: Record<string, unknown> | null;

  // Accountability — who confirmed payment, who released, who generated the ticket
  payment_confirmed_by_name?: string | null;
  released_at?: string | null;
  released_by_name?: string | null;
  ticket_generated_at?: string | null;
  ticket_generated_by_name?: string | null;

  // Overpayment resolution state
  overpayment_flagged?: boolean;
  overpayment_status?: 'flagged' | 'refund_requested' | 'refunded' | 'transfer_requested' | 'transferred' | null;

  // Bank snapshot fields
  paid_to_account_number?: string;
  paid_to_account_name?: string;
  paid_to_bank_name?: string;
  bank_account?: Record<string, unknown>;
  acct?: Record<string, unknown>;
  account?: Record<string, unknown>;
  bank_name?: string;
  account_name?: string;
}

interface OrderResponse {
  count: number;
  results: PaymentOrder[];
}

interface OverpaymentRequest {
  id: number;
  source_order_id: number;
  source_order_reference?: string;
  target_order_id: number;
  target_order_reference?: string;
  amount: string;
  narration?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_by_name?: string;
  created_at: string;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
}

const safeToNumber = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const extractLocation = (p: PaymentOrder): string => {
  const rec = p as unknown as Record<string, unknown>;
  return String(
    (rec.location_name as string) ||
      (rec.location as string) ||
      (rec.state as string) ||
      ''
  ).trim();
};

const extractCustomerCompany = (p: PaymentOrder): string => {
  const u = p.user || ({} as PaymentOrder['user']);
  return String(u?.company_name || '').trim();
};

const extractCustomerName = (p: PaymentOrder): string => {
  const u = p.user;
  if (!u) return '';
  return `${u.first_name || ''} ${u.last_name || ''}`.trim();
};

interface BankAccount {
  id: number;
  bank_name: string;
  acct_no: string;
  name: string;
  location?: string;
  is_active?: boolean;
}

const extractBankInfo = (p: PaymentOrder, bankAccounts?: BankAccount[]): { bankName: string; acctNo: string } => {
  const rec = p as unknown as Record<string, unknown>;
  // 1. Check snapshot fields on the order itself
  const snapBank = typeof rec.paid_to_bank_name === 'string' ? rec.paid_to_bank_name.trim() : '';
  const snapAcct = typeof rec.paid_to_account_number === 'string' ? rec.paid_to_account_number.trim() : '';
  if (snapBank || snapAcct) return { bankName: snapBank, acctNo: snapAcct };

  const acctLike = (rec.bank_account || rec.acct || rec.account || {}) as Record<string, unknown>;
  const fromOrderBank = String(acctLike.bank_name || acctLike.bank || rec.bank_name || '').trim();
  const fromOrderAcct = String(acctLike.acct_no || acctLike.account_number || rec.acct_no || '').trim();
  if (fromOrderBank || fromOrderAcct) return { bankName: fromOrderBank, acctNo: fromOrderAcct };

  // 2. Match by location from the bank accounts list
  if (bankAccounts && bankAccounts.length > 0) {
    const location = extractLocation(p);
    if (location) {
      const match = bankAccounts.find((b) => String(b.location || '').toLowerCase() === location.toLowerCase());
      if (match) return { bankName: match.bank_name, acctNo: match.acct_no };
    }
  }
  return { bankName: '', acctNo: '' };
};

/**
 * Parse amount paid from narration.
 * Encoded as [PAID:123456] at the start of the narration string.
 */
const parseAmountPaid = (narration: string | null | undefined): number | null => {
  if (!narration) return null;
  const match = narration.match(/\[PAID:([\d.]+)\]/);
  if (match) return safeToNumber(match[1]);
  return null;
};

/** Strip the [PAID:xxx], [STATUS:xxx], [OVP:xxx] prefixes from narration */
const cleanNarration = (narration: string | null | undefined): string => {
  if (!narration) return '';
  return narration
    .replace(/\[PAID:[\d.]+\]\s*/g, '')
    .replace(/\[STATUS:[^\]]*\]\s*/g, '')
    .replace(/\[OVP:[^\]]*\]\s*/g, '')
    .trim();
};

const parseOvpStatus = (narration: string | null | undefined): string | null => {
  if (!narration) return null;
  const m = narration.match(/\[OVP:([^\]]+)\]/);
  return m ? m[1] : null;
};

const isOverpaymentFlagged = (p: PaymentOrder): boolean => {
  if (p.overpayment_flagged) return true;
  const ovpStatus = p.overpayment_status;
  if (ovpStatus && ovpStatus !== null) return true;
  const narStatus = parseOvpStatus(p.payment_narration ?? p.narration);
  return narStatus !== null;
};

/** Parse explicit status tag from narration */
const parseStatusTag = (narration: string | null | undefined): string | null => {
  if (!narration) return null;
  const match = narration.match(/\[STATUS:([^\]]+)\]/);
  return match ? match[1] : null;
};

/** Determine payment status from sales value vs amount paid, or explicit tag */
const getPaymentStatus = (salesValue: number, amountPaid: number | null, narration?: string | null): { label: string; color: string } => {
  // Explicit tag takes precedence
  const explicit = parseStatusTag(narration);
  if (explicit) {
    if (explicit === 'Fully Paid') return { label: 'Fully Paid', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (explicit === 'Partially Paid') return { label: 'Partially Paid', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    if (explicit === 'Overpaid') return { label: 'Overpaid', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    if (explicit === 'Unpaid') return { label: 'Unpaid', color: 'bg-red-50 text-red-700 border-red-200' };
    return { label: explicit, color: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
  if (amountPaid === null) return { label: '\u2014', color: 'bg-slate-100 text-slate-600' };
  if (amountPaid >= salesValue) return { label: 'Fully Paid', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (amountPaid > 0) return { label: 'Partially Paid', color: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: 'Unpaid', color: 'bg-red-50 text-red-700 border-red-200' };
};

const extractProductInfo = (p: PaymentOrder): { product: string; qty: number; unitPrice: number; unitLabel: string } => {
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

  const qty =
    toNumber(p.quantity) ??
    toNumber(p.qty) ??
    toNumber(p.litres) ??
    toNumber(products?.[0]?.quantity) ??
    toNumber(products?.[0]?.qty) ??
    toNumber(products?.[0]?.litres) ?? 0;

  const rawUnit = products?.[0]?.unit_price ?? products?.[0]?.unitPrice ?? products?.[0]?.price;
  const unitPrice = toNumber(rawUnit) ?? 0;

  const unitLabel = products?.[0]?.unit_label || products?.[0]?.unit || 'Litres';

  return { product: product || '', qty, unitPrice, unitLabel };
};

const extractPfi = (p: PaymentOrder): string => {
  const rec = p as unknown as Record<string, unknown>;
  const v =
    (rec.pfi as string | number | undefined) ??
    (rec.pfi_number as string | number | undefined) ??
    (rec.pfi_no as string | number | undefined) ??
    (rec.pfi_ref as string | number | undefined) ??
    (rec.pfi_reference as string | number | undefined) ??
    (rec.pfi_id as string | number | undefined);
  return String(v ?? '').trim();
};

const extractTruckNumber = (p: PaymentOrder): string => {
  const rec = p as unknown as Record<string, unknown>;
  const cd = (p.customer_details || {}) as Record<string, unknown>;
  const rt = (rec.release_ticket || rec.releaseTicket || {}) as Record<string, unknown>;
  return String(
    (rec.truck_number as string | undefined) ||
      (rec.truckNumber as string | undefined) ||
      (rt.truck_number as string | undefined) ||
      (rt.truckNumber as string | undefined) ||
      (cd.truckNumber as string | undefined) ||
      (cd.truck_number as string | undefined) ||
      ''
  ).trim();
};

const extractDriverName = (p: PaymentOrder): string => {
  const rec = p as unknown as Record<string, unknown>;
  const cd = (p.customer_details || {}) as Record<string, unknown>;
  return String(
    (rec.driver_name as string | undefined) ||
      (cd.driverName as string | undefined) ||
      (cd.driver_name as string | undefined) ||
      ''
  ).trim();
};

const extractDriverPhone = (p: PaymentOrder): string => {
  const rec = p as unknown as Record<string, unknown>;
  const cd = (p.customer_details || {}) as Record<string, unknown>;
  return String(
    (rec.driver_phone as string | undefined) ||
      (cd.driverPhone as string | undefined) ||
      (cd.driver_phone as string | undefined) ||
      ''
  ).trim();
};

const getPaymentDate = (p: PaymentOrder): Date => {
  const raw = p.payment_confirmed_at || p.created_at;
  return new Date(raw);
};

/** Amount actually paid and outstanding balance for an order. Orders with no
 * split payment records yet are treated as fully paid (legacy single-payment orders). */
const getOrderPaymentTotals = (p: PaymentOrder): { paid: number; balance: number } => {
  const salesValue = safeToNumber(p.total_price ?? p.amount);
  const records = p.payment_records ?? [];
  if (records.length === 0) return { paid: salesValue, balance: 0 };
  const paid = records.reduce((sum, r) => sum + safeToNumber(r.amount), 0);
  return { paid, balance: salesValue - paid };
};

export default function ConfirmedPayments() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'year' | null>('today');
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [pfiFilter, setPfiFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });

  // Users scoped to specific location(s) and/or PFI(s) (set in Settings) don't need
  // to manually filter by them — their data is already confined server-side.
  const scopedLocationNames: string[] = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('location_names') || '[]'); } catch { return []; }
  }, []);
  const isLocationScoped = scopedLocationNames.length > 0;

  const scopedPfiNumbers: string[] = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('pfi_numbers') || '[]'); } catch { return []; }
  }, []);
  const isPfiScoped = scopedPfiNumbers.length > 0;

  // Edit modal state
  const [editOrder, setEditOrder] = useState<PaymentOrder | null>(null);
  const [editRemarks, setEditRemarks] = useState('');
  const [editAmountPaid, setEditAmountPaid] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editAttachedFiles, setEditAttachedFiles] = useState<File[]>([]);
  const [editDriverName, setEditDriverName] = useState('');
  const [editDriverPhone, setEditDriverPhone] = useState('');
  const [editBankAccountId, setEditBankAccountId] = useState('');

  // File viewer state
  const [filesOrder, setFilesOrder] = useState<PaymentOrder | null>(null);
  const [fetchedFiles, setFetchedFiles] = useState<Array<{ id: number; file: string; file_name: string; uploaded_at: string }>>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<number | null>(null);

  const openFilesModal = async (p: PaymentOrder) => {
    setFilesOrder(p);
    setFetchedFiles(p.payment_files ?? []);
    // Always fetch fresh from the API
    setFilesLoading(true);
    try {
      const orderId = Number(p.id);
      const files = await apiClient.admin.getPaymentFiles(orderId);
      setFetchedFiles(files);
    } catch {
      // silently fall back to whatever was on the order object
    } finally {
      setFilesLoading(false);
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    setDeletingFileId(fileId);
    try {
      await apiClient.admin.deletePaymentFile(fileId);
      setFetchedFiles((prev) => prev.filter((f) => f.id !== fileId));
      await queryClient.refetchQueries({ queryKey: ['confirmed-payments-orders'] });
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setDeletingFileId(null);
    }
  };

  // Delete order state
  const [orderToDelete, setOrderToDelete] = useState<PaymentOrder | null>(null);

  // Payment records (split payments) state — lives inside the Edit dialog
  type EditPaymentLine = {
    amount: string;
    paymentDate: string;
    payerName: string;
    bankAccountId: string;
    transactionReference: string;
    statementLineId?: number;
  };
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const emptyPaymentLine = (): EditPaymentLine => ({
    amount: '', paymentDate: todayStr(), payerName: '', bankAccountId: '', transactionReference: '',
  });

  const [existingPaymentRecords, setExistingPaymentRecords] = useState<Array<{
    id: number;
    amount: string;
    payment_date: string;
    payer_name?: string | null;
    bank_name?: string | null;
    account_number?: string | null;
    account_name?: string | null;
    transaction_reference?: string | null;
  }>>([]);
  const [newPaymentLines, setNewPaymentLines] = useState<EditPaymentLine[]>([emptyPaymentLine()]);
  const [savingPayments, setSavingPayments] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateNewPaymentLine = (idx: number, patch: Partial<EditPaymentLine>) =>
    setNewPaymentLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addNewPaymentLine = () => setNewPaymentLines((prev) => [...prev, emptyPaymentLine()]);
  const removeNewPaymentLine = (idx: number) =>
    setNewPaymentLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const pickedStatementIds = useMemo(
    () => new Set(newPaymentLines.map((l) => l.statementLineId).filter((id): id is number => id != null)),
    [newPaymentLines],
  );

  const handleBulkPick = (bankAccountId: string, lines: StatementLineOption[]) => {
    setNewPaymentLines((prev) => {
      const blankIdx = prev.findIndex((l) => !l.amount && !l.statementLineId);
      const rest = blankIdx === -1 ? prev : prev.filter((_, i) => i !== blankIdx);
      const picked: EditPaymentLine[] = lines.map((l) => ({
        amount: String(l.amount),
        paymentDate: l.transaction_date,
        payerName: l.depositor_name || '',
        bankAccountId,
        transactionReference: l.bank_ref || '',
        statementLineId: l.id,
      }));
      return [...rest, ...picked];
    });
  };

  const handleDeletePaymentRecord = async (id: number) => {
    setDeletingPaymentId(id);
    try {
      await apiClient.admin.deleteOrderPaymentRecord(id);
      setExistingPaymentRecords((prev) => prev.filter((r) => r.id !== id));
      await queryClient.refetchQueries({ queryKey: ['confirmed-payments-orders'] });
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setDeletingPaymentId(null);
    }
  };

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      await apiClient.admin.deleteOrder(orderId);
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['confirmed-payments-orders'] });
      toast({ title: 'Order deleted', description: 'The order has been removed.' });
      setOrderToDelete(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // ── Overpayment resolution flow ───────────────────────────────────────
  const isAdmin = getCurrentUserRoles().some((r) => r === 0 || r === 1);

  // Unified resolve dialog (replaces separate flag / refund / transfer dialogs)
  const [resolveSource, setResolveSource] = useState<PaymentOrder | null>(null);
  const [resolveMode, setResolveMode] = useState<'refund' | 'transfer'>('refund');

  // Refund fields
  const [refundAmount, setRefundAmount] = useState('');
  const [refundNarration, setRefundNarration] = useState('');

  // Transfer fields
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNarration, setTransferNarration] = useState('');

  // Admin pending requests panel
  const [showRequestsPanel, setShowRequestsPanel] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const openResolveDialog = (p: PaymentOrder, mode: 'refund' | 'transfer' = 'refund') => {
    const overpaid = Math.abs(Math.min(0, getOrderPaymentTotals(p).balance));
    setResolveSource(p);
    setResolveMode(mode);
    setRefundAmount(String(overpaid));
    setRefundNarration('');
    setTransferTargetId('');
    setTransferAmount(String(overpaid));
    setTransferNarration('');
  };

  // Refund mutation
  const refundOverpaymentMutation = useMutation({
    mutationFn: async () => {
      if (!resolveSource) throw new Error('No source order');
      const amt = parseFloat(refundAmount || '0');
      if (!(amt > 0)) throw new Error('Enter an amount greater than zero');
      return apiClient.admin.refundOverpayment(resolveSource.id, {
        amount: amt,
        narration: refundNarration.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['confirmed-payments-orders'] });
      toast({ title: 'Refund recorded', description: 'The overpayment refund has been recorded.' });
      setResolveSource(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Refund failed', description: err.message, variant: 'destructive' });
    },
  });

  // Request Transfer mutation (pending admin/audit approval)
  const requestTransferMutation = useMutation({
    mutationFn: async () => {
      if (!resolveSource) throw new Error('No source order selected');
      const targetId = Number(transferTargetId);
      if (!Number.isFinite(targetId) || targetId <= 0) throw new Error('Enter a valid target order ID');
      const amt = parseFloat(transferAmount || '0');
      if (!(amt > 0)) throw new Error('Enter an amount greater than zero');
      return apiClient.admin.requestOverpaymentTransfer(resolveSource.id, {
        target_order_id: targetId,
        amount: amt,
        narration: transferNarration.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['confirmed-payments-orders'] });
      toast({
        title: 'Transfer request submitted',
        description: 'Pending admin/audit approval. The transfer executes once approved.',
      });
      setResolveSource(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Request failed', description: err.message, variant: 'destructive' });
    },
  });

  // Admin: load pending transfer requests
  const requestsQuery = useQuery({
    queryKey: ['overpayment-requests', 'pending'],
    queryFn: () => apiClient.admin.listOverpaymentRequests({ status: 'pending' }),
    enabled: isAdmin,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const pendingRequests: OverpaymentRequest[] = (requestsQuery.data?.results ?? []) as OverpaymentRequest[];

  // Admin: approve transfer request
  const approveRequestMutation = useMutation({
    mutationFn: (id: number) => apiClient.admin.approveOverpaymentRequest(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['overpayment-requests'] }),
        queryClient.refetchQueries({ queryKey: ['confirmed-payments-orders'] }),
      ]);
      toast({ title: 'Transfer approved', description: 'The overpayment has been transferred successfully.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    },
  });

  // Admin: reject transfer request
  const rejectRequestMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiClient.admin.rejectOverpaymentRequest(id, reason),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['overpayment-requests'] });
      toast({ title: 'Request rejected', description: 'The transfer request has been rejected.' });
      setRejectingId(null);
      setRejectReason('');
    },
    onError: (err: Error) => {
      toast({ title: 'Rejection failed', description: err.message, variant: 'destructive' });
    },
  });

  const PAYMENT_STATUSES = ['Fully Paid', 'Partially Paid', 'Unpaid', 'Overpaid'] as const;

  const openEditModal = (p: PaymentOrder) => {
    const rawNarration = String(p.payment_narration ?? p.narration ?? '');
    const amountPaid = parseAmountPaid(rawNarration);
    const remarks = cleanNarration(rawNarration);
    const salesValue = safeToNumber(p.total_price ?? p.amount);
    const status = getPaymentStatus(salesValue, amountPaid, rawNarration);
    setEditOrder(p);
    setEditRemarks(remarks);
    setEditAmountPaid(amountPaid !== null ? String(amountPaid) : String(salesValue));
    setEditStatus(status.label === '\u2014' ? 'Fully Paid' : status.label);
    setEditAttachedFiles([]);

    setEditDriverName(extractDriverName(p));
    setEditDriverPhone(extractDriverPhone(p));

    const { bankName, acctNo } = extractBankInfo(p, bankAccounts);
    const match = bankAccounts.find(
      (b) => b.bank_name === bankName && b.acct_no === acctNo
    );
    setEditBankAccountId(match ? String(match.id) : '');

    // Payment records already come embedded on the order object.
    setExistingPaymentRecords(p.payment_records ?? []);
    setNewPaymentLines([emptyPaymentLine()]);
  };

  const updateNarrationMutation = useMutation({
    mutationFn: async ({
      orderId,
      narration,
      files,
      patch,
    }: {
      orderId: number;
      narration: string;
      files: File[];
      patch: Parameters<typeof apiClient.admin.patchAdminOrder>[1];
    }) => {
      if (Object.keys(patch).length > 0) {
        await apiClient.admin.patchAdminOrder(orderId, patch);
      }
      await apiClient.admin.updateNarration(orderId, narration);
      // Upload files after updating narration — fire-and-forget if there are any
      if (files.length > 0) {
        await apiClient.admin.uploadPaymentFiles(orderId, files);
      }
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['confirmed-payments-orders'] });
      toast({ title: 'Updated', description: 'Payment details updated successfully.' });
      setEditOrder(null);
      setEditAttachedFiles([]);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleSaveEdit = async () => {
    if (!editOrder) return;

    // Record any new split-payment lines FIRST — if a reference turns out to
    // be invalid/duplicate, stop here and leave the order fields untouched.
    const linesToSubmit = newPaymentLines.filter((l) => parseFloat(l.amount || '0') > 0);
    if (linesToSubmit.length > 0) {
      for (const l of linesToSubmit) {
        if (l.statementLineId == null) {
          toast({ title: 'Pick from bank statement', description: 'Each new payment must be picked from the bank statement — manual entry is not allowed.', variant: 'destructive' });
          return;
        }
        const ref = l.transactionReference.trim();
        if (!ref || !/^[A-Za-z0-9]+$/.test(ref)) {
          toast({ title: 'Invalid reference', description: 'Each new payment needs a non-empty alphanumeric transaction reference.', variant: 'destructive' });
          return;
        }
      }
      const refs = linesToSubmit.map((l) => l.transactionReference.trim().toLowerCase());
      if (new Set(refs).size !== refs.length) {
        toast({ title: 'Duplicate reference', description: 'Each payment must have a unique transaction reference.', variant: 'destructive' });
        return;
      }

      setSavingPayments(true);
      try {
        for (const l of linesToSubmit) {
          await apiClient.admin.addOrderPaymentRecord(editOrder.id, {
            amount: parseFloat(l.amount || '0'),
            payment_date: l.paymentDate || todayStr(),
            payer_name: l.payerName.trim() || undefined,
            bank_account: l.bankAccountId || undefined,
            transaction_reference: l.transactionReference.trim(),
            statement_line_ids: l.statementLineId ? [l.statementLineId] : undefined,
          });
        }
        setNewPaymentLines([emptyPaymentLine()]);
      } catch (err) {
        toast({ title: 'Error recording payment', description: (err as Error).message, variant: 'destructive' });
        setSavingPayments(false);
        return;
      }
      setSavingPayments(false);
    }

    const paidNum = parseFloat(editAmountPaid || '0');
    const prefix = Number.isFinite(paidNum) && paidNum > 0 ? `[PAID:${paidNum}] ` : '';
    const statusTag = editStatus ? `[STATUS:${editStatus}] ` : '';
    const fullNarration = `${prefix}${statusTag}${editRemarks}`.trim();

    const patch: Parameters<typeof apiClient.admin.patchAdminOrder>[1] = {};

    if (editDriverName.trim() !== extractDriverName(editOrder)) {
      patch.driver_name = editDriverName.trim();
    }
    if (editDriverPhone.trim() !== extractDriverPhone(editOrder)) {
      patch.driver_phone = editDriverPhone.trim();
    }

    const { bankName: origBankName, acctNo: origAcctNo } = extractBankInfo(editOrder, bankAccounts);
    const origMatch = bankAccounts.find((b) => b.bank_name === origBankName && b.acct_no === origAcctNo);
    const origBankId = origMatch ? String(origMatch.id) : '';
    if (editBankAccountId !== origBankId) {
      const selected = bankAccounts.find((b) => String(b.id) === editBankAccountId);
      if (selected) {
        patch.paid_to_bank_name = selected.bank_name;
        patch.paid_to_account_number = selected.acct_no;
        patch.paid_to_account_name = selected.name;
      }
    }

    updateNarrationMutation.mutate({ orderId: editOrder.id, narration: fullNarration, files: editAttachedFiles, patch });
  };

  const { serverDateFrom, serverDateTo } = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (dateRange.from) {
      const to = dateRange.to ?? dateRange.from;
      return { serverDateFrom: format(dateRange.from, 'yyyy-MM-dd'), serverDateTo: format(to, 'yyyy-MM-dd') };
    }
    if (filterType === 'today') return { serverDateFrom: todayStr, serverDateTo: todayStr };
    if (filterType === 'yesterday') {
      const y = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      return { serverDateFrom: y, serverDateTo: y };
    }
    if (filterType === 'week') return { serverDateFrom: format(startOfWeek(new Date()), 'yyyy-MM-dd'), serverDateTo: todayStr };
    if (filterType === 'month') return { serverDateFrom: format(startOfMonth(new Date()), 'yyyy-MM-dd'), serverDateTo: todayStr };
    if (filterType === 'year') return { serverDateFrom: format(startOfYear(new Date()), 'yyyy-MM-dd'), serverDateTo: todayStr };
    return { serverDateFrom: undefined as string | undefined, serverDateTo: undefined as string | undefined };
  }, [filterType, dateRange]);

  const listQuery = useQuery<OrderResponse>({
    queryKey: ['confirmed-payments-orders', serverDateFrom, serverDateTo],
    queryFn: async () => {
      return fetchAllPages<PaymentOrder>(
        (p) => apiClient.admin.getAllAdminOrders({
          page: p.page, page_size: p.page_size,
          date_from: serverDateFrom, date_to: serverDateTo,
        }),
      );
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: bankAccountsResponse } = useQuery<{ results?: BankAccount[]; count?: number } | BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const res = await apiClient.admin.getBankAccounts({ active: true });
      return res;
    },
    staleTime: 60_000,
  });

  const bankAccounts: BankAccount[] = useMemo(() => {
    if (!bankAccountsResponse) return [];
    if (Array.isArray(bankAccountsResponse)) return bankAccountsResponse;
    if (Array.isArray((bankAccountsResponse as any).results)) return (bankAccountsResponse as any).results;
    return [];
  }, [bankAccountsResponse]);

  // PFI stock summary — scoped server-side to the user's assigned PFIs/locations;
  // also respects whichever location/PFI filter is currently selected on the page.
  const pfiStockQuery = useQuery({
    queryKey: ['pfi-stock-summary', locationFilter, pfiFilter],
    queryFn: () => apiClient.admin.getPfiStockSummary({
      location: locationFilter || undefined,
      pfi: pfiFilter || undefined,
    }),
    staleTime: 30_000,
  });
  const pfiStockRows = pfiStockQuery.data?.results ?? [];

  const isLoading = listQuery.isLoading;

  const allPayments = useMemo(() => listQuery.data?.results ?? [], [listQuery.data?.results]);

  const transferTargetIdNum = Number(transferTargetId);
  const transferTargetQuery = useQuery({
    queryKey: ['transfer-target-lookup', transferTargetId],
    queryFn: async () => {
      const res = await apiClient.admin.getOrderAudit({ q: transferTargetId.trim(), page: 1, page_size: 20 });
      const results = (res as { results?: unknown[] }).results ?? [];
      const match = results.find((o: unknown) => Number((o as { id: number }).id) === transferTargetIdNum);
      if (!match) throw new Error('Order not found');
      return match as { id: number; order_reference?: string | null; customer_name?: string | null; company_name?: string | null };
    },
    enabled: Number.isFinite(transferTargetIdNum) && transferTargetIdNum > 0 && transferTargetId.trim().length > 0,
    staleTime: 30_000,
    retry: false,
  });
  const transferTarget = transferTargetQuery.data ?? null;

  const confirmedPayments = useMemo(() => {
    const s = (v: unknown) => String(v || '').toLowerCase();
    return allPayments.filter((p) => {
      const st = s(p.status);
      return st === 'paid' || st === 'released' || st === 'loaded';
    });
  }, [allPayments]);

  const uniqueLocations = useMemo(() => {
    const locs = confirmedPayments
      .map((p) => extractLocation(p))
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    return Array.from(new Set(locs)).sort();
  }, [confirmedPayments]);

  const uniqueProducts = useMemo(() => {
    const prods = confirmedPayments
      .map((p) => extractProductInfo(p).product)
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    return Array.from(new Set(prods)).sort();
  }, [confirmedPayments]);

  const uniquePfis = useMemo(() => {
    const pfis = confirmedPayments
      .map((p) => extractPfi(p))
      .filter((v) => v.length > 0);
    return Array.from(new Set(pfis)).sort();
  }, [confirmedPayments]);

  // Each PFI belongs to exactly one location — derive that mapping from the
  // loaded orders so picking a PFI can auto-fill the matching location.
  const pfiToLocation = useMemo(() => {
    const map = new Map<string, string>();
    confirmedPayments.forEach((p) => {
      const pfi = extractPfi(p);
      const loc = extractLocation(p);
      if (pfi && loc && !map.has(pfi)) map.set(pfi, loc);
    });
    return map;
  }, [confirmedPayments]);

  // Lock the location filter for users scoped to exactly one location — they
  // don't need to pick it themselves, and their data is already confined to it.
  useEffect(() => {
    if (isLocationScoped && scopedLocationNames.length === 1 && !locationFilter) {
      setLocationFilter(scopedLocationNames[0]);
    }
  }, [isLocationScoped, scopedLocationNames, locationFilter]);

  // Same for PFI scope — independent of location scope.
  useEffect(() => {
    if (isPfiScoped && scopedPfiNumbers.length === 1 && !pfiFilter) {
      setPfiFilter(scopedPfiNumbers[0]);
    }
  }, [isPfiScoped, scopedPfiNumbers, pfiFilter]);

  const isLockedLocation = isLocationScoped && scopedLocationNames.length === 1 && locationFilter === scopedLocationNames[0];
  const isLockedPfi = isPfiScoped && scopedPfiNumbers.length === 1 && pfiFilter === scopedPfiNumbers[0];
  // Scoped to exactly one location/PFI: that's fixed, no need to pick it.
  // Scoped to several: still let them pick among those.
  const showLocationSelect = !isLocationScoped || scopedLocationNames.length > 1;
  const showPfiSelect = !isPfiScoped || scopedPfiNumbers.length > 1;
  const hasActiveFilters = !!(
    searchQuery.trim() ||
    (locationFilter && !isLockedLocation) ||
    productFilter ||
    (pfiFilter && !isLockedPfi) ||
    filterType !== 'today' ||
    dateRange.from
  );

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterType('today');
    setLocationFilter(null);
    setProductFilter(null);
    setPfiFilter(null);
    setDateRange({ from: null, to: null });
  };

  const filtered = useMemo(() => {
    return confirmedPayments
      .filter((p) => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        const ref = String(getOrderReference(p) || p.reference || p.id || '').toLowerCase();
        const company = extractCustomerCompany(p).toLowerCase();
        const customer = extractCustomerName(p).toLowerCase();
        const location = extractLocation(p).toLowerCase();
        const pfi = extractPfi(p).toLowerCase();
        const truck = extractTruckNumber(p).toLowerCase();
        const paymentRef = (p.payment_records ?? []).some(
          (r) => (r.transaction_reference || '').toLowerCase().includes(q)
        );
        return ref.includes(q) || company.includes(q) || customer.includes(q) || location.includes(q) || pfi.includes(q) || truck.includes(q) || paymentRef;
      })
      .filter((p) => {
        if (dateRange.from) {
          // A single picked date (no "to" yet) filters to just that day.
          const to = dateRange.to ?? dateRange.from;
          const d = getPaymentDate(p);
          return (isSameDay(d, dateRange.from) || isAfter(d, dateRange.from)) &&
                 (isSameDay(d, to) || isBefore(d, addDays(to, 1)));
        }
        if (filterType === 'all' || !filterType) return true;
        const d = getPaymentDate(p);
        if (filterType === 'today') return isToday(d);
        if (filterType === 'yesterday') return isYesterday(d);
        if (filterType === 'week') return isThisWeek(d);
        if (filterType === 'month') return isThisMonth(d);
        if (filterType === 'year') return isThisYear(d);
        return true;
      })
      .filter((p) => {
        if (!locationFilter) return true;
        return extractLocation(p) === locationFilter;
      })
      .filter((p) => {
        if (!productFilter) return true;
        return extractProductInfo(p).product.toLowerCase().includes(productFilter.toLowerCase());
      })
      .filter((p) => {
        if (!pfiFilter) return true;
        return extractPfi(p) === pfiFilter;
      });
  }, [confirmedPayments, filterType, locationFilter, searchQuery, productFilter, pfiFilter, dateRange]);

  const summary = useMemo(() => {
    const totalOrders = filtered.length;
    const totalAmount = filtered.reduce((sum, p) => sum + safeToNumber(p.total_price ?? p.amount), 0);
    const totalQty = filtered.reduce((sum, p) => sum + extractProductInfo(p).qty, 0);
    const totalPaid = filtered.reduce((sum, p) => sum + getOrderPaymentTotals(p).paid, 0);
    const totalBalance = filtered.reduce((sum, p) => sum + getOrderPaymentTotals(p).balance, 0);

    return { totalOrders, totalAmount, totalQty, totalPaid, totalBalance };
  }, [filtered]);

  const buildReportData = () => {
    const generatedAt = new Date().toLocaleString('en-GB');

    const locationLabel = locationFilter ? locationFilter : (isLocationScoped ? scopedLocationNames.join(', ') : 'All Locations');
    const productLabel = productFilter ? productFilter : 'All Products';
    const pfiLabel = pfiFilter ? pfiFilter : (isPfiScoped ? scopedPfiNumbers.join(', ') : 'All PFIs');
    // Prefer a selected PFI, then a selected location, for the export file name.
    const reportNamePrefix = (pfiFilter || locationFilter || '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .trim();
    const periodLabel = dateRange.from
      ? (dateRange.to && !isSameDay(dateRange.from, dateRange.to)
          ? `${format(dateRange.from, 'dd MMM yyyy')} – ${format(dateRange.to, 'dd MMM yyyy')}`
          : format(dateRange.from, 'dd MMM yyyy'))
      : filterType === 'all' ? 'All Time'
      : filterType ? `${filterType.charAt(0).toUpperCase()}${filterType.slice(1)}`
      : 'Custom Range';

    const totalQtyAll = filtered.reduce((sum, p) => sum + extractProductInfo(p).qty, 0);
    const ordersCountAll = filtered.length;
    const totalAmountAll = filtered.reduce((sum, p) => sum + safeToNumber(p.total_price ?? p.amount), 0);
    const exportUnitLabel = filtered.length > 0 ? extractProductInfo(filtered[0]).unitLabel : 'L';

    const headers = [
      'S/N', 'Date', 'Ref', 'Truck No.', 'Customer', `Qty (${exportUnitLabel})`, 'Product', 'Rate', 'Sales Value', 'Paying Company', 'Location',
      'Payment Date', 'Amount', 'Balance', 'Payer', 'Bank', 'Reference', 'Payment Confirmed By',
      // 'Released By',
      // 'Ticket Generated By',
    ];
    // Sort oldest to newest for the exported file
    const exportSorted = [...filtered].sort((a, b) => getPaymentDate(a).getTime() - getPaymentDate(b).getTime());
    const rows: Array<Array<string>> = [];
    const paymentCells = (r: { payment_date: string; amount: string; payer_name?: string | null; bank_name?: string | null; account_number?: string | null; transaction_reference?: string | null } | undefined, balance: number) => r
      ? [
          format(new Date(r.payment_date), 'dd/MM/yyyy'),
          `N${safeToNumber(r.amount).toLocaleString()}`,
          `N${balance.toLocaleString()}`,
          r.payer_name || '—',
          r.bank_name ? `${r.bank_name}${r.account_number ? ` (${r.account_number})` : ''}` : '—',
          r.transaction_reference || '—',
        ]
      : ['', '', '', '', '', ''];

    let totalAmountPaidAll = 0;
    let totalBalanceAll = 0;

    exportSorted.forEach((p, idx) => {
      const d = getPaymentDate(p);
      const date = Number.isNaN(d.getTime()) ? '' : format(d, 'dd/MM/yyyy HH:mm');
      const ref = getOrderReference(p) || p.reference || p.id;
      const truckNo = extractTruckNumber(p);
      const customer = extractCustomerName(p);
      const { product, qty, unitPrice } = extractProductInfo(p);
      const salesValue = safeToNumber(p.total_price ?? p.amount);
      const company = extractCustomerCompany(p);
      const location = extractLocation(p);
      const records = [...(p.payment_records ?? [])].sort(
        (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
      );
      const [recordedFirstPayment, ...restPayments] = records;
      const firstPayment = recordedFirstPayment ?? (() => {
        const { bankName, acctNo } = extractBankInfo(p, bankAccounts);
        return {
          id: -1,
          amount: String(salesValue),
          payment_date: (Number.isNaN(d.getTime()) ? new Date() : d).toISOString(),
          payer_name: company,
          bank_name: bankName,
          account_number: acctNo,
          transaction_reference: '',
        };
      })();

      let cumulative = firstPayment ? safeToNumber(firstPayment.amount) : 0;
      // Order row — carries the first/only payment in the payment columns
      rows.push([
        String(idx + 1), date, String(ref ?? ''), truckNo, customer,
        qty.toLocaleString(), product, unitPrice ? `N${unitPrice.toLocaleString()}` : '',
        `N${salesValue.toLocaleString()}`, company, location,
        ...paymentCells(firstPayment, salesValue - cumulative),
        p.payment_confirmed_by_name || '—',
        // p.released_by_name || '—',
        // p.ticket_generated_by_name || '—',
      ]);
      // Additional payments — order columns left blank, one row per extra payment received
      restPayments.forEach((r) => {
        cumulative += safeToNumber(r.amount);
        rows.push([
          '', '', '', '', '', '', '', '', '', '', '',
          ...paymentCells(r, salesValue - cumulative),
          '',
          // '',
        ]);
      });

      totalAmountPaidAll += cumulative;
      totalBalanceAll += salesValue - cumulative;
    });

    const totalsRow = [
      'TOTAL', '', '', '', '',
      totalQtyAll.toLocaleString(), '', '', `N${totalAmountAll.toLocaleString()}`, '', '',
      '', `N${totalAmountPaidAll.toLocaleString()}`, `N${totalBalanceAll.toLocaleString()}`, '', '', '',
      '', '',
    ];

    const headingBlock: Array<[string, string]> = [
      ['Report Generated', generatedAt],
      ['Period', periodLabel],
      ['Location', locationLabel],
      ['PFI', pfiLabel],
      ['Product', productLabel],
      ['Number of Orders', ordersCountAll.toLocaleString()],
      ['Total Quantity', `${totalQtyAll.toLocaleString()} ${exportUnitLabel}`],
      ['Total Sales Value', `N${totalAmountAll.toLocaleString()}`],
      ['Total Amount Paid', `N${totalAmountPaidAll.toLocaleString()}`],
      ['Total Balance', `N${totalBalanceAll.toLocaleString()}`],
    ];

    // Reports should read consistently in ALL CAPS, end to end.
    const upper = (v: unknown): string => String(v ?? '').toUpperCase();
    const headersUp = headers.map(upper);
    const rowsUp = rows.map((row) => row.map(upper));
    const totalsRowUp = totalsRow.map(upper);
    const headingBlockUp = headingBlock.map(([label, value]) => [upper(label), upper(value)] as [string, string]);

    return {
      generatedAt, headingBlock: headingBlockUp, headers: headersUp, rows: rowsUp, totalsRow: totalsRowUp,
      totalQtyAll, ordersCountAll, totalAmountAll, exportUnitLabel, reportNamePrefix,
    };
  };

  // Lays the 10 label/value summary facts out as a 5-row × 4-column grid
  // (left half = report scope, right half = totals) instead of one long
  // thin column — reads much better on a wide landscape page/sheet.
  const pairHeadingBlock = (headingBlock: Array<[string, string]>): Array<[string, string, string, string]> => {
    const half = Math.ceil(headingBlock.length / 2);
    const left = headingBlock.slice(0, half);
    const right = headingBlock.slice(half);
    return left.map((l, i) => [l[0], l[1], right[i]?.[0] ?? '', right[i]?.[1] ?? '']);
  };

  // Per-column horizontal alignment shared by both exports — numeric/money
  // columns right-aligned, the S/N column centered, everything else left.
  const COLUMN_ALIGN: Array<'left' | 'center' | 'right'> = [
    'center', 'left', 'left', 'left', 'left', 'right', 'left', 'right', 'right', 'left', 'left',
    'left', 'right', 'right', 'left', 'left', 'left', 'left', 'left',
  ];

  const exportToXLS = () => {
    const { headingBlock, headers, rows, totalsRow, reportNamePrefix } = buildReportData();
    const colCount = headers.length;

    const NAVY = 'FF1E293B';
    const WHITE = 'FFFFFFFF';
    const LIGHT = 'FFF5F8FC';
    const BAND = 'FFEFF3F8';
    const TOTAL_FILL = 'FFE2E8F0';
    const BORDER_COLOR = 'FFB0C4DE';
    const thinBorder = { style: 'thin' as const, color: { argb: BORDER_COLOR } };
    const allBorders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Soroman Dashboard';
    workbook.created = new Date();
    const ws = workbook.addWorksheet('Report', { views: [{ showGridLines: false }] });

    const lastColLetter = ws.getColumn(colCount).letter;

    // ── Title bar ──────────────────────────────────────────────────────
    ws.mergeCells(`A1:${lastColLetter}1`);
    const titleCell = ws.getCell('A1');
    titleCell.value = 'PAYMENTS REPORT';
    titleCell.font = { name: 'Calibri', bold: true, size: 16, color: { argb: WHITE } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 26;

    // ── Summary grid (label/value × 2 columns) ──────────────────────────
    const pairs = pairHeadingBlock(headingBlock);
    let r = 3;
    pairs.forEach(([l1, v1, l2, v2]) => {
      const row = ws.getRow(r);
      row.height = 18;
      const cells: Array<[number, string, boolean]> = [
        [1, l1, true], [2, v1, false], [3, l2, true], [4, v2, false],
      ];
      cells.forEach(([col, val, isLabel]) => {
        const cell = row.getCell(col);
        cell.value = val;
        cell.font = { name: 'Calibri', bold: isLabel, size: 10, color: { argb: 'FF1E3A5F' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isLabel ? LIGHT : WHITE } };
        cell.border = allBorders;
        cell.alignment = { vertical: 'middle', horizontal: isLabel ? 'left' : 'left', indent: 1 };
      });
      r += 1;
    });
    ws.getColumn(1).width = 22;
    ws.getColumn(2).width = 22;
    ws.getColumn(3).width = 22;
    ws.getColumn(4).width = 22;

    // ── Spacer ───────────────────────────────────────────────────────────
    r += 1;

    // ── Column headers ───────────────────────────────────────────────────
    const headerRowIdx = r;
    const headerRow = ws.getRow(headerRowIdx);
    headerRow.height = 22;
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.border = allBorders;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    r += 1;

    // ── Data rows (zebra-striped, bordered, vertically centered) ────────
    rows.forEach((row, idx) => {
      const xlRow = ws.getRow(r);
      xlRow.height = 16;
      row.forEach((val, ci) => {
        const cell = xlRow.getCell(ci + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 9.5 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : BAND } };
        cell.border = allBorders;
        cell.alignment = { vertical: 'middle', horizontal: COLUMN_ALIGN[ci] || 'left' };
      });
      r += 1;
    });

    // ── Totals row ────────────────────────────────────────────────────────
    const totalsRowXl = ws.getRow(r);
    totalsRowXl.height = 18;
    totalsRow.forEach((val, ci) => {
      const cell = totalsRowXl.getCell(ci + 1);
      cell.value = val;
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
      cell.border = allBorders;
      cell.alignment = { vertical: 'middle', horizontal: COLUMN_ALIGN[ci] || 'left' };
    });

    // Balanced column widths so every field is readable without manual resizing.
    const widths = [6, 12, 12, 12, 18, 12, 12, 12, 16, 20, 14, 12, 14, 14, 18, 18, 16];
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // ── PFI Stock Summary — appended below the main report ──────────────
    r += 2;
    const pfiAlign: Array<'left' | 'right'> = ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'right'];
    const pfiHeaders = ['PFI', 'LOCATION', 'PRODUCT', 'INITIAL STOCK', 'SOLD TODAY', 'TOTAL SOLD', 'REMAINING', 'REVENUE'];
    const pfiBodyRows = pfiStockRows.map((pr) => [
      pr.pfi_number, pr.location_name || '—', pr.product_name || '—',
      safeToNumber(pr.initial_stock).toLocaleString(),
      safeToNumber(pr.sold_today).toLocaleString(),
      safeToNumber(pr.total_sold).toLocaleString(),
      safeToNumber(pr.balance).toLocaleString(),
      `N${safeToNumber(pr.revenue).toLocaleString()}`,
    ].map((v) => String(v).toUpperCase()));
    const pfiSum = (key: 'initial_stock' | 'sold_today' | 'total_sold' | 'balance' | 'revenue') =>
      pfiStockRows.reduce((s, pr) => s + safeToNumber(pr[key]), 0);
    const pfiTotalsRow = [
      'TOTAL', '', '',
      pfiSum('initial_stock').toLocaleString(), pfiSum('sold_today').toLocaleString(),
      pfiSum('total_sold').toLocaleString(), pfiSum('balance').toLocaleString(),
      `N${pfiSum('revenue').toLocaleString()}`,
    ];

    if (pfiBodyRows.length > 0) {
      const pfiColCount = pfiHeaders.length;
      ws.mergeCells(`A${r}:${ws.getColumn(pfiColCount).letter}${r}`);
      const pfiTitleCell = ws.getCell(`A${r}`);
      pfiTitleCell.value = 'PFI STOCK SUMMARY';
      pfiTitleCell.font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
      pfiTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      pfiTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(r).height = 22;
      r += 1;

      const pfiHeaderRow = ws.getRow(r);
      pfiHeaderRow.height = 20;
      pfiHeaders.forEach((h, i) => {
        const cell = pfiHeaderRow.getCell(i + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.border = allBorders;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
      r += 1;

      pfiBodyRows.forEach((row, idx) => {
        const xlRow = ws.getRow(r);
        xlRow.height = 16;
        row.forEach((val, ci) => {
          const cell = xlRow.getCell(ci + 1);
          cell.value = val;
          cell.font = { name: 'Calibri', size: 9.5 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : BAND } };
          cell.border = allBorders;
          cell.alignment = { vertical: 'middle', horizontal: pfiAlign[ci] || 'left' };
        });
        r += 1;
      });

      const pfiTotalsXlRow = ws.getRow(r);
      pfiTotalsXlRow.height = 18;
      pfiTotalsRow.forEach((val, ci) => {
        const cell = pfiTotalsXlRow.getCell(ci + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
        cell.border = allBorders;
        cell.alignment = { vertical: 'middle', horizontal: pfiAlign[ci] || 'left' };
      });
    }

    // Freeze the header row so it stays visible while scrolling.
    ws.views = [{ state: 'frozen', ySplit: headerRowIdx, showGridLines: false }];

    const fileName = reportNamePrefix
      ? `${reportNamePrefix} PAYMENTS REPORT ${format(new Date(), 'dd-MM-yy')}.xlsx`
      : `Payment Report ${format(new Date(), 'dd-MM-yy')}.xlsx`;

    workbook.xlsx.writeBuffer().then((buffer) => {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const exportToPDF = () => {
    const { headingBlock, headers, rows, totalsRow, reportNamePrefix } = buildReportData();
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 297, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('PAYMENTS REPORT', 14, 10.5);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    // ── Summary block — bordered 4-column label/value grid, properly spaced.
    const pairs = pairHeadingBlock(headingBlock);
    autoTable(doc, {
      startY: 22,
      body: pairs,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.5, valign: 'middle', lineColor: [176, 196, 222], lineWidth: 0.2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 45, fillColor: [238, 244, 251], textColor: [30, 58, 95] },
        1: { cellWidth: 60 },
        2: { fontStyle: 'bold', cellWidth: 45, fillColor: [238, 244, 251], textColor: [30, 58, 95] },
        3: { cellWidth: 60 },
      },
    });

    // Explicit, balanced widths for every column so the table never looks
    // lopsided or overflows the page — text shrinks to fit instead of wrapping
    // unevenly. Widths are in mm and sum to ~269mm, comfortably inside the
    // ~283mm usable width on a landscape A4 page with 7mm margins.
    const colWidthsMm = [8, 16, 14, 14, 20, 14, 14, 14, 18, 22, 16, 14, 16, 14, 20, 20, 15];
    const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {};
    colWidthsMm.forEach((w, i) => { columnStyles[i] = { cellWidth: w, halign: COLUMN_ALIGN[i] || 'left' }; });

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
      head: [headers],
      body: rows,
      foot: [totalsRow],
      // Only print the totals once, at the very end — not on every page.
      showFoot: 'lastPage',
      margin: { left: 7, right: 7 },
      tableWidth: 'wrap',
      theme: 'grid',
      styles: {
        fontSize: 6.5,
        cellPadding: 1.4,
        overflow: 'linebreak',
        valign: 'middle',
        lineColor: [176, 196, 222],
        lineWidth: 0.15,
      },
      columnStyles,
      alternateRowStyles: { fillColor: [245, 248, 252] },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6.5, halign: 'center', valign: 'middle', fontStyle: 'bold' },
      footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7, valign: 'middle' },
    });

    // ── PFI Stock Summary — appended below the main report ────────────────
    if (pfiStockRows.length > 0) {
      const pfiHeaders = ['PFI', 'LOCATION', 'PRODUCT', 'INITIAL STOCK', 'SOLD TODAY', 'TOTAL SOLD', 'REMAINING', 'REVENUE'];
      const pfiAlign: Array<'left' | 'right'> = ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'right'];
      const pfiBodyRows = pfiStockRows.map((pr) => [
        pr.pfi_number, pr.location_name || '—', pr.product_name || '—',
        safeToNumber(pr.initial_stock).toLocaleString(),
        safeToNumber(pr.sold_today).toLocaleString(),
        safeToNumber(pr.total_sold).toLocaleString(),
        safeToNumber(pr.balance).toLocaleString(),
        `N${safeToNumber(pr.revenue).toLocaleString()}`,
      ].map((v) => String(v).toUpperCase()));
      const pfiSum = (key: 'initial_stock' | 'sold_today' | 'total_sold' | 'balance' | 'revenue') =>
        pfiStockRows.reduce((s, pr) => s + safeToNumber(pr[key]), 0);
      const pfiTotalsRow = [
        'TOTAL', '', '',
        pfiSum('initial_stock').toLocaleString(), pfiSum('sold_today').toLocaleString(),
        pfiSum('total_sold').toLocaleString(), pfiSum('balance').toLocaleString(),
        `N${pfiSum('revenue').toLocaleString()}`,
      ];

      const pfiColWidthsMm = [40, 50, 35, 28, 28, 28, 28, 32];
      const pfiColumnStyles: Record<number, { cellWidth: number; halign: 'left' | 'right' }> = {};
      pfiColWidthsMm.forEach((w, i) => { pfiColumnStyles[i] = { cellWidth: w, halign: pfiAlign[i] }; });

      doc.addPage();
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, 297, 16, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.text('PFI STOCK SUMMARY', 14, 10.5);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');

      autoTable(doc, {
        startY: 22,
        head: [pfiHeaders],
        body: pfiBodyRows,
        foot: [pfiTotalsRow],
        showFoot: 'lastPage',
        margin: { left: 7, right: 7 },
        tableWidth: 'wrap',
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, valign: 'middle', lineColor: [176, 196, 222], lineWidth: 0.15 },
        columnStyles: pfiColumnStyles,
        alternateRowStyles: { fillColor: [245, 248, 252] },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8, halign: 'center', valign: 'middle', fontStyle: 'bold' },
        footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8.5, valign: 'middle' },
      });
    }

    const fileName = reportNamePrefix
      ? `${reportNamePrefix} PAYMENTS REPORT ${format(new Date(), 'dd-MM-yy')}.pdf`
      : `PAYMENTS REPORT ${format(new Date(), 'dd-MM-yy')}.pdf`;
    doc.save(fileName);
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">
            <PageHeader
              title="Payments Report"
              description="View all paid and released orders, with filters, totals, and export."
              actions={
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 border-amber-300 text-amber-800 hover:bg-amber-50"
                      onClick={() => setShowRequestsPanel(true)}
                    >
                      <Clock size={15} />
                      Transfer Requests
                      {pendingRequests.length > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                          {pendingRequests.length}
                        </span>
                      )}
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="default" className="gap-2">
                        <Download className="h-4 w-4" />
                        Download Report
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={exportToXLS}>Export as Excel (.xlsx)</DropdownMenuItem>
                      <DropdownMenuItem onClick={exportToPDF}>Export as PDF</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              }
            />

            <SummaryCards
              gridClassName="grid-cols-1 sm:grid-cols-3"
              cards={[
                {
                  title: 'Total Quantity',
                  value: isLoading ? '\u2026' : `${summary.totalQty.toLocaleString()} Litres`,
                  description: isLoading ? undefined : `${summary.totalOrders.toLocaleString()} orders`,
                  icon: <Droplets className="h-4 w-4" />,
                  tone: 'neutral',
                },
                {
                  title: 'Sales Value',
                  value: isLoading ? '\u2026' : `\u20A6${summary.totalAmount.toLocaleString()}`,
                  className: "text-emerald-700",
                  icon: <Banknote className="h-4 w-4" />,
                  tone: 'green',
                },
                {
                  title: 'Amount Paid',
                  value: isLoading ? '\u2026' : `\u20A6${summary.totalPaid.toLocaleString()}`,
                  description: isLoading ? undefined : `\u20A6${summary.totalBalance.toLocaleString()} balance`,
                  className: "text-blue-700",
                  icon: <Wallet className="h-4 w-4" />,
                  tone: summary.totalBalance > 0 ? 'red' : 'blue',
                },
              ]}
            />

            {/* ── PFI Stock Summary ─────────────────────────────────────── */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100">
                  <Droplets size={14} className="text-amber-700" />
                </span>
                <h3 className="text-sm font-semibold text-slate-800">PFI Stock Summary</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase bg-slate-50/30">
                      <th className="px-4 py-2.5 text-left">PFI</th>
                      <th className="px-4 py-2.5 text-left">Location</th>
                      <th className="px-4 py-2.5 text-left">Product</th>
                      <th className="px-4 py-2.5 text-right">Initial Stock</th>
                      <th className="px-4 py-2.5 text-right">Volume Sold Today</th>
                      <th className="px-4 py-2.5 text-right">Total Volume Sold</th>
                      <th className="px-4 py-2.5 text-right">Volume Remaining</th>
                      <th className="px-4 py-2.5 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pfiStockQuery.isLoading ? (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
                    ) : pfiStockQuery.isError ? (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-red-600">Failed to load PFI stock summary.</td></tr>
                    ) : pfiStockRows.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">No PFIs in scope for the current filter.</td></tr>
                    ) : (
                      pfiStockRows.map((r, idx) => {
                        const balance = safeToNumber(r.balance);
                        return (
                          <tr key={r.pfi_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                            <td className="px-4 py-2.5 font-semibold text-slate-800">{r.pfi_number}</td>
                            <td className="px-4 py-2.5 text-slate-600">{r.location_name || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-600">{r.product_name || '—'}</td>
                            <td className="px-4 py-2.5 text-right text-slate-700">{safeToNumber(r.initial_stock).toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right text-slate-700">{safeToNumber(r.sold_today).toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-slate-800">{safeToNumber(r.total_sold).toLocaleString()}</td>
                            <td className={`px-4 py-2.5 text-right font-semibold ${balance < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                              {balance.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">
                              {'₦'}{safeToNumber(r.revenue).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {/* {pfiStockRows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-amber-50/60 font-bold text-slate-800 text-xs">
                        <td className="px-4 py-3 uppercase" colSpan={3}>Total</td>
                        <td className="px-4 py-3 text-right">{pfiStockRows.reduce((s, r) => s + safeToNumber(r.initial_stock), 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">{pfiStockRows.reduce((s, r) => s + safeToNumber(r.sold_today), 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">{pfiStockRows.reduce((s, r) => s + safeToNumber(r.total_sold), 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">{pfiStockRows.reduce((s, r) => s + safeToNumber(r.balance), 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-emerald-700">{'₦'}{pfiStockRows.reduce((s, r) => s + safeToNumber(r.revenue), 0).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  )} */}
                </table>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-4">
              {/* Search — full width */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search by reference, customer, company, truck…"
                    className="pl-10 h-10 text-sm w-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Period + Date Range — same row, 2 columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 items-end">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Period</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(['today', 'yesterday', 'week', 'month', 'year', 'all'] as const).map((tf) => (
                      <Button
                        key={tf}
                        type="button"
                        size="sm"
                        variant={filterType === tf ? 'default' : 'outline'}
                        className="h-9 text-xs capitalize"
                        onClick={() => {
                          setFilterType(tf);
                          setDateRange({ from: null, to: null });
                        }}
                      >
                        {tf === 'all' ? 'All Time' : tf}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Custom Date / Range</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full h-10 justify-start text-left font-normal text-sm ${dateRange.from ? 'border-blue-300 text-blue-700' : ''}`}
                      >
                        <CalendarDays className="mr-2 h-4 w-4 text-slate-400" />
                        {dateRange.from
                          ? (dateRange.to && !isSameDay(dateRange.from, dateRange.to)
                              ? `${format(dateRange.from, 'dd MMM')} – ${format(dateRange.to, 'dd MMM yyyy')}`
                              : format(dateRange.from, 'dd MMM yyyy'))
                          : 'Pick a date or range'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{ from: dateRange.from ?? undefined, to: dateRange.to ?? undefined }}
                        onSelect={(range) => {
                          setDateRange({ from: range?.from ?? null, to: range?.to ?? null });
                          if (range?.from) setFilterType(null);
                        }}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Location, Product, PFI — same row */}
              <div className={`grid grid-cols-1 gap-4 pt-3 border-t border-slate-100 ${
                showLocationSelect && showPfiSelect ? 'sm:grid-cols-3' : showLocationSelect || showPfiSelect ? 'sm:grid-cols-2' : 'sm:grid-cols-1'
              }`}>
                {showLocationSelect && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Location</label>
                    <select
                      aria-label="Filter by location"
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      value={locationFilter ?? ''}
                      onChange={(e) => setLocationFilter(e.target.value || null)}
                    >
                      <option value="">All Locations</option>
                      {uniqueLocations.map((loc) => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Product</label>
                  <select
                    aria-label="Filter by product"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    value={productFilter ?? ''}
                    onChange={(e) => setProductFilter(e.target.value || null)}
                  >
                    <option value="">All Products</option>
                    {uniqueProducts.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {showPfiSelect && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">PFI</label>
                    <select
                      aria-label="Filter by PFI"
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      value={pfiFilter ?? ''}
                      onChange={(e) => {
                        const value = e.target.value || null;
                        setPfiFilter(value);
                        const matchedLocation = value ? pfiToLocation.get(value) : undefined;
                        if (matchedLocation) setLocationFilter(matchedLocation);
                      }}
                    >
                      <option value="">All PFIs</option>
                      {uniquePfis.map((pfi) => (
                        <option key={pfi} value={pfi}>{pfi}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Clear / scope note — separated bottom row */}
              {(hasActiveFilters || isLocationScoped || isPfiScoped) && (
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500 space-x-3">
                    {isLocationScoped && (
                      <span>Scoped location{scopedLocationNames.length > 1 ? 's' : ''}: <span className="font-medium text-slate-700">{scopedLocationNames.join(', ')}</span></span>
                    )}
                    {isPfiScoped && (
                      <span>Scoped PFI{scopedPfiNumbers.length > 1 ? 's' : ''}: <span className="font-medium text-slate-700">{scopedPfiNumbers.join(', ')}</span></span>
                    )}
                  </p>
                  {hasActiveFilters && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 gap-1.5 text-slate-500 hover:text-red-600"
                      onClick={clearAllFilters}
                    >
                      <X size={14} />
                      Clear filters
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-[50px]">S/N</TableHead>
                    <TableHead className="min-w-[90px]">Date & Time</TableHead>
                    <TableHead className="min-w-[110px]">Order Reference</TableHead>
                    <TableHead className="min-w-[110px]">Location</TableHead>
                    {/* <TableHead className="min-w-[100px]">Truck Number</TableHead> */}
                    <TableHead className="min-w-[140px]">Facilitator</TableHead>
                    <TableHead className="min-w-[140px]">Company Name</TableHead>
                    <TableHead className="min-w-[120px]">Quantity</TableHead>
                    <TableHead className="min-w-[120px]">Unit Price</TableHead>
                    <TableHead className="min-w-[120px] text-right">Sales Value</TableHead>
                    <TableHead className="min-w-[110px] text-right whitespace-nowrap">Amount Paid</TableHead>
                    <TableHead className="min-w-[110px] text-right">Balance</TableHead>
                    <TableHead className="min-w-[120px]">Depositor</TableHead>
                    <TableHead className="min-w-[140px] whitespace-nowrap">Payment Bank</TableHead>
                    <TableHead className="min-w-[120px]">Reference</TableHead>
                    <TableHead className="min-w-[90px] whitespace-nowrap">Payment Date</TableHead>
                    <TableHead className="min-w-[140px] whitespace-nowrap">Payment Confirmed By</TableHead>
                    {/* <TableHead className="min-w-[140px] whitespace-nowrap">Released By</TableHead> */}
                    {/* <TableHead className="min-w-[140px] whitespace-nowrap">Ticket Generated By</TableHead> */}
                    <TableHead className="w-[30px]">Del</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(6)].map((_, idx) => (
                      <TableRow key={idx}>
                        {[...Array(17)].map((_, ci) => (
                          <TableCell key={ci}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={17} className="text-center h-24 text-slate-500">
                        No confirmed payments found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((p, idx) => {
                      const d = getPaymentDate(p);
                      const dateStr = Number.isNaN(d.getTime()) ? '\u2014' : format(d, 'dd/MM/yy');
                      const timeStr = Number.isNaN(d.getTime()) ? '' : format(d, 'HH:mm');
                      const ref = getOrderReference(p) || p.reference || p.id;
                      const truckNo = extractTruckNumber(p);
                      const customerName = extractCustomerName(p);
                      const { product, qty, unitPrice, unitLabel } = extractProductInfo(p);
                      const salesValue = safeToNumber(p.total_price ?? p.amount);
                      const company = extractCustomerCompany(p);
                      const location = extractLocation(p);
                      const records = [...(p.payment_records ?? [])].sort(
                        (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
                      );
                      const [recordedFirstPayment, ...restPayments] = records;
                      const firstPayment = recordedFirstPayment ?? (() => {
                        const { bankName, acctNo } = extractBankInfo(p, bankAccounts);
                        return {
                          id: -1,
                          amount: String(salesValue),
                          payment_date: (Number.isNaN(d.getTime()) ? new Date() : d).toISOString(),
                          payer_name: company,
                          bank_name: bankName,
                          account_number: acctNo,
                          transaction_reference: '',
                        };
                      })();

                      let cumulative = firstPayment ? safeToNumber(firstPayment.amount) : 0;
                      const firstBalance = salesValue - cumulative;

                      const renderPaymentCells = (r: typeof firstPayment, balance: number) => (
                        <>
                          <TableCell className="text-right text-sm font-bold text-emerald-800">
                            {r ? `${'\u20A6'}${safeToNumber(r.amount).toLocaleString()}` : '\u2014'}
                          </TableCell>
                          <TableCell className={`text-right text-sm font-bold ${r ? (balance > 0 ? 'text-red-700' : 'text-slate-500') : 'text-slate-300'}`}>
                            {r ? `${'\u20A6'}${balance.toLocaleString()}` : '\u2014'}
                          </TableCell>
                          <TableCell className="text-sm uppercase text-slate-700 max-w-[120px] truncate" title={r?.payer_name || undefined}>{r?.payer_name || '\u2014'}</TableCell>
                          <TableCell
                            className="text-sm uppercase text-slate-700 max-w-[140px] truncate"
                            title={r ? `${r.bank_name || ''}${r.account_number ? ` (${r.account_number})` : ''}` : undefined}
                          >
                            {r ? `${r.bank_name || '\u2014'}${r.account_number ? ` (${r.account_number})` : ''}` : '\u2014'}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-slate-600 max-w-[120px] truncate" title={r?.transaction_reference || undefined}>{r?.transaction_reference || '\u2014'}</TableCell>
                          <TableCell className="text-sm text-slate-700 whitespace-nowrap">
                            {r?.payment_date ? format(new Date(r.payment_date), 'dd/MM/yy') : '\u2014'}
                          </TableCell>
                        </>
                      );

                      return (
                        <Fragment key={p.id}>
                        <TableRow
                          className="hover:bg-slate-50/60 cursor-pointer"
                          onClick={() => openEditModal(p)}
                        >
                          <TableCell className="text-slate-500">{filtered.length - idx}</TableCell>
                          <TableCell>
                            <div className="text-sm">{dateStr}</div>
                            <div className="text-xs text-slate-400">{timeStr}</div>
                          </TableCell>
                          <TableCell className="text-slate-950 font-mono font-semibold max-w-[130px] truncate" title={String(ref ?? '')}>{ref}</TableCell>
                          {/* <TableCell className="text-sm">{truckNo || '\u2014'}</TableCell> */}
                          <TableCell className="text-sm max-w-[140px]" title={location || undefined}>
                            {location || '\u2014'}
                          </TableCell>
                          <TableCell className="uppercase font-semibold max-w-[140px] truncate" title={customerName || undefined}>
                            {customerName || '\u2014'}
                          </TableCell>
                          <TableCell className="text-sm uppercase font-semibold max-w-[140px]" title={company || undefined}>
                            {company || '\u2014'}
                          </TableCell>
                          <TableCell className="max-w-[150px]">
                            <div className="font-semibold truncate" title={qty ? `${qty.toLocaleString()} ${unitLabel}` : undefined}>{qty ? `${qty.toLocaleString()} ${unitLabel}` : '\u2014'}</div>
                            {product && <div className="text-xs text-slate-400 truncate" title={product}>{product}</div>}
                          </TableCell>
                          <TableCell className="">
                            {unitPrice ? `\u20A6${unitPrice.toLocaleString()}` : '\u2014'}
                          </TableCell>
                          <TableCell className="text-right font-bold text-blue-800">
                            {'\u20A6'}{salesValue.toLocaleString()}
                          </TableCell>
                          
                          {renderPaymentCells(firstPayment, firstBalance)}
                          <TableCell className="text-sm text-slate-700 max-w-[140px] truncate" title={p.payment_confirmed_by_name || undefined}>
                            {p.payment_confirmed_by_name || '—'}
                          </TableCell>
                          {/* <TableCell className="text-sm text-slate-700 max-w-[140px] truncate" title={p.released_by_name || undefined}>
                            {p.released_by_name || '—'}
                          </TableCell> */}
                          {/* <TableCell className="text-sm text-slate-700 max-w-[140px] truncate" title={p.ticket_generated_by_name || undefined}>
                            {p.ticket_generated_by_name || '—'}
                          </TableCell> */}
                          <TableCell>
                            <button
                              type="button"
                              title="Delete order"
                              onClick={(e) => { e.stopPropagation(); setOrderToDelete(p); }}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={15} />
                            </button>
                          </TableCell>
                        </TableRow>
                        {restPayments.map((r) => {
                          cumulative += safeToNumber(r.amount);
                          const rowBalance = salesValue - cumulative;
                          return (
                            <TableRow key={r.id} className="bg-emerald-50/30 hover:bg-emerald-50/50">
                              <TableCell />
                              <TableCell />
                              <TableCell />
                              <TableCell />
                              <TableCell />
                              <TableCell />
                              <TableCell />
                              <TableCell />
                              <TableCell />
                              {renderPaymentCells(r, rowBalance)}
                              <TableCell />
                              <TableCell />
                            </TableRow>
                          );
                        })}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Edit Payment Details Dialog */}
            <Dialog open={!!editOrder} onOpenChange={(v) => { if (!v) setEditOrder(null); }}>
              <DialogContent className="w-[75vw] sm:w-full sm:max-w-[500px] lg:max-w-[750px] max-h-[80vh] border border-slate-300 shadow-xl p-0 flex flex-col gap-0">
                <div className="border-b border-slate-800  bg-black px-4 sm:px-6 py-3 sm:py-4 shrink-0">
                  <DialogHeader className="space-y-1">
                    <DialogTitle className="text-white text-base">Edit Order</DialogTitle>
                    <DialogDescription className="text-slate-200 text-xs sm:text-sm">
                      {editOrder && (
                        <>
                          Order <span className="font-mono font-bold">{getOrderReference(editOrder) || editOrder.id}</span>
                          {(extractCustomerCompany(editOrder) || extractCustomerName(editOrder))
                            ? ` — ${extractCustomerCompany(editOrder) || extractCustomerName(editOrder)}`
                            : ''}
                        </>
                      )}
                    </DialogDescription>
                  </DialogHeader>
                </div>

                <div className="bg-white px-4 sm:px-6 py-4 sm:py-5 flex-1 overflow-y-auto min-h-0 flex flex-col gap-5 lg:grid lg:grid-cols-1 lg:gap-6 lg:items-start">
                <div className="grid grid-cols-2 gap-x-3">
                  {editOrder && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-4 text-xs">
                      <div>
                        <div className="text-slate-400 uppercase tracking-wider text-[10px]">Customer</div>
                        <div className="font-bold text-sm uppercase text-slate-800 truncate">{extractCustomerName(editOrder) || '—'}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 pt-4 uppercase tracking-wider text-[10px]">Company</div>
                        <div className="font-bold text-sm uppercase text-slate-800 truncate">{extractCustomerCompany(editOrder) || '—'}</div>
                      </div>
                    </div>
                  )}

                  {editOrder && (() => {
                    const { qty, unitPrice, unitLabel } = extractProductInfo(editOrder);
                    const truckNo = extractTruckNumber(editOrder);
                    const salesValue = safeToNumber(editOrder.total_price ?? editOrder.amount);
                    return (
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-4 text-xs">
                        {/* <div>
                          <div className="text-slate-400 uppercase tracking-wider text-[10px]">Truck Number</div>
                          <div className="font-bold text-slate-800 truncate">{truckNo || '—'}</div>
                        </div> */}
                        <div>
                          <div className="text-slate-400 uppercase tracking-wider text-[10px]">Quantity</div>
                          <div className="font-bold text-sm text-slate-800 truncate">{qty ? `${qty.toLocaleString()} ${unitLabel}` : '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400 pt-4 uppercase tracking-wider text-[10px]">Unit Price (₦)</div>
                          <div className="font-bold text-sm text-slate-800 truncate">{unitPrice ? unitPrice.toLocaleString() : '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400 pt-4 uppercase tracking-wider text-[10px]">Sales Value (₦)</div>
                          <div className="font-bold text-sm text-emerald-700 truncate">{salesValue ? salesValue.toLocaleString() : '—'}</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="h-px bg-slate-200" />

                <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800">Bank Account</label>
                    <select
                      aria-label="Bank account"
                      className="h-10 w-full border border-slate-300 rounded-md bg-white px-3 text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-slate-400"
                      value={editBankAccountId}
                      onChange={(e) => setEditBankAccountId(e.target.value)}
                    >
                      <option value="">{'— Select bank account —'}</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>{b.bank_name} | {b.acct_no} | {b.name}</option>
                      ))}
                    </select>
                    {(() => {
                      const selected = bankAccounts.find((b) => String(b.id) === editBankAccountId);
                      if (!selected) return null;
                      return (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                          <div>
                            <div className="text-slate-400 uppercase tracking-wider text-[10px]">Bank</div>
                            <div className="font-semibold text-slate-800 truncate">{selected.bank_name}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 uppercase tracking-wider text-[10px]">Account Number</div>
                            <div className="font-semibold text-slate-800 truncate">{selected.acct_no}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 uppercase tracking-wider text-[10px]">Account Name</div>
                            <div className="font-semibold text-slate-800 truncate">{selected.name}</div>
                          </div>
                        </div>
                      );
                    })()}
                </div>

                <div className="h-px bg-slate-200" />

                <div className="space-y-2.5">
                  {/* Payments — existing entries + add new split-payment lines, same UX as Confirm Payment */}
                  <label className="text-sm font-semibold text-slate-800">Payments Recorded</label>

                    {existingPaymentRecords.length > 0 && (
                      <div className="rounded-md border border-slate-200 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
                              <th className="text-left font-semibold py-2.5 pl-2.5">Date</th>
                              <th className="text-left font-semibold py-2.5">Amount</th>
                              <th className="text-left font-semibold py-2.5 pl-2">Payer</th>
                              <th className="text-left font-semibold py-2.5 pl-2">Bank</th>
                              <th className="text-left font-semibold py-2.5 pl-2">Reference</th>
                              <th className="w-[28px]"><span className="sr-only">Remove</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {existingPaymentRecords.map((r) => (
                              <tr key={r.id} className="border-t border-slate-100">
                                <td className="py-2.5 pl-2.5 text-sm text-slate-600 whitespace-nowrap">
                                  {r.payment_date ? format(new Date(r.payment_date), 'dd/MM/yy') : '—'}
                                </td>
                                <td className="py-2.5 text-sm font-semibold text-emerald-700">
                                  ₦{safeToNumber(r.amount).toLocaleString()}
                                </td>
                                <td className="py-2.5 pl-2 text-sm uppercase font-bold text-slate-700">{r.payer_name || '—'}</td>
                                <td className="py-2.5 pl-2 text-sm text-slate-700">
                                  {r.bank_name || '—'}{r.account_number ? ` (${r.account_number})` : ''}
                                </td>
                                <td className="py-2.5 pl-2 font-mono text-slate-500">{r.transaction_reference || '—'}</td>
                                <td className="py-2.5 pr-2">
                                  <button
                                    type="button"
                                    title="Remove entry"
                                    disabled={deletingPaymentId === r.id}
                                    onClick={() => handleDeletePaymentRecord(r.id)}
                                    className="text-slate-400 hover:text-red-600 disabled:opacity-40"
                                  >
                                    {deletingPaymentId === r.id
                                      ? <span className="inline-block w-3 h-3 border border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                                      : <Trash2 size={12} />}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="h-px bg-slate-200" />

                    <BulkStatementPicker
                      bankAccounts={bankAccounts}
                      excludeIds={pickedStatementIds}
                      onPickMany={handleBulkPick}
                    />

                    {newPaymentLines.map((line, idx) => (
                      <div key={idx} className="rounded-lg border border-slate-300 bg-slate-50 p-3 space-y-2.5">
                        {newPaymentLines.length > 1 && (
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">New Payment {idx + 1}</span>
                            <button type="button" title="Remove this payment" onClick={() => removeNewPaymentLine(idx)} className="text-slate-400 hover:text-red-600">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                        <div>
                          <label className="mb-1 block text-[11px] uppercase font-medium text-slate-600">Bank Account</label>
                          <select
                            aria-label="Bank account"
                            className="h-9 w-full border border-slate-300 rounded-md bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            value={line.bankAccountId}
                            onChange={(e) => updateNewPaymentLine(idx, { bankAccountId: e.target.value, statementLineId: undefined })}
                          >
                            <option value="">{'— Select —'}</option>
                            {bankAccounts.map((b) => (
                              <option key={b.id} value={b.id}>{b.bank_name} • {b.acct_no} • {b.name}</option>
                            ))}
                          </select>
                        </div>

                        <StatementPicker
                          bankAccountId={line.bankAccountId}
                          excludeIds={pickedStatementIds}
                          onPick={(picked) => updateNewPaymentLine(idx, {
                            amount: String(picked.amount),
                            paymentDate: picked.transaction_date,
                            payerName: picked.depositor_name || '',
                            transactionReference: (picked.bank_ref || '').replace(/[^A-Za-z0-9]/g, ''),
                            statementLineId: picked.id,
                          })}
                        />

                        {line.statementLineId ? (
                          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 space-y-1">
                            <p className="text-[11px] font-medium text-emerald-700 flex items-center gap-1.5">
                              <CheckCheck size={13} /> Picked from bank statement
                            </p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                              <div><span className="text-slate-400">Amount:</span> <span className="font-semibold text-slate-800">₦{parseFloat(line.amount || '0').toLocaleString()}</span></div>
                              <div><span className="text-slate-400">Date:</span> <span className="font-semibold text-slate-800">{line.paymentDate || '—'}</span></div>
                              <div><span className="text-slate-400">Depositor:</span> <span className="font-semibold text-slate-800">{line.payerName || '—'}</span></div>
                              <div><span className="text-slate-400">Reference:</span> <span className="font-semibold text-slate-800 font-mono">{line.transactionReference || '—'}</span></div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic px-1">
                            Pick a deposit from the bank statement above to fill in this payment — amount, date, depositor and reference come from the statement, not manual entry.
                          </p>
                        )}
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={addNewPaymentLine}
                      className="w-full h-10 gap-2 border-2 border-dashed border-blue-300 font-semibold text-xs uppercase text-blue-700 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-800"
                    >
                      <Plus size={16} />
                      Add Another Payment
                    </Button>

                    {(() => {
                      const salesValue = safeToNumber(editOrder?.total_price ?? editOrder?.amount);
                      const existingTotal = existingPaymentRecords.reduce((s, r) => s + safeToNumber(r.amount), 0);
                      const newTotal = newPaymentLines.reduce((s, l) => s + (parseFloat(l.amount || '0') || 0), 0);
                      const totalPaid = existingTotal + newTotal;
                      const bal = salesValue - totalPaid;
                      return (
                        <>
                          <div className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 ${
                            bal === 0 ? 'border-emerald-300 bg-emerald-100' : bal > 0 ? 'border-amber-300 bg-amber-100' : 'border-blue-300 bg-blue-100'
                          }`}>
                            <span className="text-sm font-semibold text-slate-700">
                              ₦{totalPaid.toLocaleString()} <span className="text-slate-400">of</span> ₦{salesValue.toLocaleString()}
                            </span>
                            <span className={`text-sm font-bold ${bal === 0 ? 'text-emerald-800' : bal > 0 ? 'text-amber-800' : 'text-blue-800'}`}>
                              {bal === 0 ? 'Complete' : bal > 0 ? `₦${bal.toLocaleString()} remaining` : `₦${Math.abs(bal).toLocaleString()} overpaid`}
                            </span>
                          </div>
                          {bal < -0.01 && editOrder && (() => {
                            const ovpStatus = editOrder.overpayment_status ?? parseOvpStatus(editOrder.payment_narration ?? editOrder.narration);
                            const resolved = ovpStatus === 'refunded' || ovpStatus === 'transferred';
                            const requested = ovpStatus === 'transfer_requested';
                            const refunded = ovpStatus === 'refunded';
                            if (resolved) {
                              return (
                                <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
                                  <CheckCheck size={14} className="text-emerald-600 shrink-0" />
                                  <span className="text-sm text-emerald-800 font-medium">
                                    Overpayment {refunded ? 'refunded' : 'transferred'} — resolved.
                                  </span>
                                </div>
                              );
                            }
                            if (requested) {
                              return (
                                <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                                  <Clock size={14} className="text-amber-600 shrink-0" />
                                  <span className="text-sm text-amber-800 font-medium">
                                    Transfer request pending admin/audit approval.
                                  </span>
                                </div>
                              );
                            }
                            return (
                              <div className="mt-2 rounded-lg border border-blue-300 bg-blue-50 px-3.5 py-3 space-y-2">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle size={14} className="text-blue-600 shrink-0" />
                                  <span className="text-sm font-semibold text-blue-900">
                                    Overpaid by ₦{Math.abs(bal).toLocaleString()} — needs resolution
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                                    onClick={() => { const src = editOrder; setEditOrder(null); openResolveDialog(src, 'refund'); }}
                                  >
                                    <RotateCcw size={13} /> Refund
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700"
                                    onClick={() => { const src = editOrder; setEditOrder(null); openResolveDialog(src, 'transfer'); }}
                                  >
                                    <ArrowLeftRight size={13} /> Transfer to Order
                                  </Button>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      );
                    })()}
                  </div>
                </div>

                  {/* Driver Name/Phone, Amount Paid, Status, Remarks, Payment Proof Files — commented out per request
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-800">Driver Name</label>
                      <Input
                        value={editDriverName}
                        onChange={(e) => setEditDriverName(e.target.value)}
                        placeholder="Driver full name"
                        className="h-10 border-slate-300 text-slate-900 font-medium"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-800">Driver Phone</label>
                      <Input
                        value={editDriverPhone}
                        onChange={(e) => setEditDriverPhone(e.target.value)}
                        placeholder="e.g. 0801 234 5678"
                        className="h-10 border-slate-300 text-slate-900 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800">Amount Paid (₦)</label>
                    <CommaInput
                      value={editAmountPaid}
                      onValueChange={setEditAmountPaid}
                      placeholder="Enter amount paid"
                      className="h-10 border-slate-300 text-slate-900 font-medium"
                    />
                    {editOrder && (() => {
                      const sv = safeToNumber(editOrder.total_price ?? editOrder.amount);
                      const paid = parseFloat(editAmountPaid || '0');
                      const bal = sv - paid;
                      if (Number.isNaN(paid)) return null;
                      if (bal > 0) return (
                        <div className="mt-1.5 flex items-center justify-between rounded-md border border-red-300 bg-red-100 px-3 py-2 text-sm">
                          <span className="text-red-900 font-medium">Outstanding Balance</span>
                          <span className="font-bold text-red-950">{'\u20A6'}{bal.toLocaleString()}</span>
                        </div>
                      );
                      if (bal === 0) return (
                        <div className="mt-1.5 rounded-md border border-emerald-300 bg-emerald-100 px-3 py-2 text-sm text-emerald-900 font-semibold">
                          {'\u2713'} Fully paid
                        </div>
                      );
                      return (
                        <div className="mt-1.5 rounded-md border border-blue-300 bg-blue-100 px-3 py-2 text-sm text-blue-900 font-medium">
                          Overpaid by {'\u20A6'}{Math.abs(bal).toLocaleString()}
                        </div>
                      );
                    })()}
                  </div>
                  */}

                  {/* Status, Remarks, Payment Proof Files — commented out per request
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800">Payment Status</label>
                    <select
                      aria-label="Payment status"
                      className="h-10 w-full border border-slate-300 rounded-md bg-white px-3 text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-slate-400"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                    >
                      {PAYMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800">Remarks</label>
                    <Textarea
                      value={editRemarks}
                      onChange={(e) => setEditRemarks(e.target.value)}
                      placeholder="e.g. part payment, bank transfer details..."
                      className="min-h-[80px] resize-none border-slate-300 text-slate-900 font-medium"
                    />
                  </div>

                  <div>
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
                          if (picked.length) setEditAttachedFiles(prev => [...prev, ...picked]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <p className="mt-1 text-xs text-slate-600">You can upload images or PDFs</p>
                    {editAttachedFiles.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {editAttachedFiles.map((f, i) => {
                          const isImage = f.type.startsWith('image/');
                          return (
                            <li key={i} className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm">
                              {isImage ? <ImageIcon size={14} className="shrink-0 text-blue-400" /> : <FileText size={14} className="shrink-0 text-slate-400" />}
                              <span className="flex-1 truncate text-slate-800 font-medium">{f.name}</span>
                              <span className="text-xs text-slate-500 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                              <button type="button" title="Remove file" onClick={() => setEditAttachedFiles(prev => prev.filter((_, j) => j !== i))} className="shrink-0 text-slate-500 hover:text-red-600">
                                <Trash2 size={13} />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  */}

                <div className="flex items-center justify-end gap-3 border-t border-slate-300 bg-slate-100 px-4 sm:px-6 py-3 sm:py-4 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setEditOrder(null)}>Cancel</Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={updateNarrationMutation.isPending || savingPayments} className="gap-1.5">
                    {updateNarrationMutation.isPending || savingPayments ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Delete Order Confirmation Dialog */}
            <Dialog open={!!orderToDelete} onOpenChange={(v) => { if (!v) setOrderToDelete(null); }}>
              <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                  <DialogTitle className="text-slate-950">Delete order</DialogTitle>
                  <DialogDescription className="text-slate-600">
                    This will permanently delete the order from the system. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <div className="font-medium">You are about to delete:</div>
                  <div className="mt-1">
                    <span className="text-red-900/80">Order Ref:</span>{' '}
                    <span className="font-semibold">{orderToDelete ? (getOrderReference(orderToDelete) || orderToDelete.id) : '—'}</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-red-900/80">Sales Value:</span>{' '}
                    <span className="font-semibold">
                      {orderToDelete ? `₦${safeToNumber(orderToDelete.total_price ?? orderToDelete.amount).toLocaleString()}` : '—'}
                    </span>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setOrderToDelete(null)}>Close</Button>
                  <Button
                    variant="destructive"
                    disabled={deleteOrderMutation.isPending}
                    onClick={() => orderToDelete && deleteOrderMutation.mutate(Number(orderToDelete.id))}
                  >
                    {deleteOrderMutation.isPending ? 'Deleting...' : 'Delete'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* ── Resolve Overpayment (unified dialog) ─────────────────────── */}
            <Dialog open={!!resolveSource} onOpenChange={(v) => { if (!v) setResolveSource(null); }}>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-slate-950">
                    <Wallet size={18} className="text-blue-600" /> Resolve Overpayment
                  </DialogTitle>
                  <DialogDescription className="text-slate-600">
                    Choose how to handle the excess payment on this order.
                  </DialogDescription>
                </DialogHeader>

                {resolveSource && (() => {
                  const overpaid = Math.abs(Math.min(0, getOrderPaymentTotals(resolveSource).balance));
                  return (
                    <div className="space-y-4">
                      {/* Order summary banner */}
                      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex items-center justify-between">
                        <div>
                          <span className="text-blue-900/60">Order:</span>{' '}
                          <span className="font-semibold font-mono">{getOrderReference(resolveSource) || resolveSource.id}</span>
                        </div>
                        <div>
                          <span className="text-blue-900/60">Overpaid:</span>{' '}
                          <span className="font-bold">₦{overpaid.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Mode selector */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => { setResolveMode('refund'); setRefundAmount(String(overpaid)); }}
                          className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-semibold transition-all ${
                            resolveMode === 'refund'
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm'
                              : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          <RotateCcw size={15} /> Refund Customer
                        </button>
                        <button
                          type="button"
                          onClick={() => { setResolveMode('transfer'); setTransferAmount(String(overpaid)); }}
                          className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-semibold transition-all ${
                            resolveMode === 'transfer'
                              ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm'
                              : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          <ArrowLeftRight size={15} /> Transfer to Order
                        </button>
                      </div>

                      {/* Refund form */}
                      {resolveMode === 'refund' && (
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-800">Refund Amount (₦)</label>
                            <CommaInput
                              value={refundAmount}
                              onValueChange={setRefundAmount}
                              placeholder="Enter amount refunded"
                              className="h-10 border-slate-300 text-slate-900 font-medium"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-800">Narration <span className="font-normal text-slate-400">(optional)</span></label>
                            <Textarea
                              value={refundNarration}
                              onChange={(e) => setRefundNarration(e.target.value)}
                              placeholder="e.g. Refunded via bank transfer"
                              className="border-slate-300 text-slate-900"
                              rows={2}
                            />
                          </div>
                        </div>
                      )}

                      {/* Transfer form */}
                      {resolveMode === 'transfer' && (
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-800">Target Order ID</label>
                            <Input
                              value={transferTargetId}
                              onChange={(e) => setTransferTargetId(e.target.value.replace(/[^0-9]/g, ''))}
                              placeholder="Enter the order ID to transfer to"
                              className="h-10 border-slate-300 text-slate-900 font-medium"
                              inputMode="numeric"
                            />
                            {transferTargetId && (
                              transferTargetQuery.isLoading ? (
                                <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                  <span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin shrink-0" />
                                  Looking up order…
                                </div>
                              ) : transferTarget ? (
                                <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                                  <CheckCircle2 size={13} className="shrink-0" />
                                  <span className="font-semibold font-mono">{transferTarget.order_reference || `#${transferTarget.id}`}</span>
                                  <span className="truncate">— {transferTarget.company_name || transferTarget.customer_name || 'Unknown'}</span>
                                </div>
                              ) : transferTargetQuery.isError ? (
                                <div className="mt-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                  Order not found. Check the ID and try again.
                                </div>
                              ) : null
                            )}
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-800">Amount to Transfer (₦)</label>
                            <CommaInput
                              value={transferAmount}
                              onValueChange={setTransferAmount}
                              placeholder="Enter amount"
                              className="h-10 border-slate-300 text-slate-900 font-medium"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-800">Narration <span className="font-normal text-slate-400">(optional)</span></label>
                            <Textarea
                              value={transferNarration}
                              onChange={(e) => setTransferNarration(e.target.value)}
                              placeholder="Reason for transfer, e.g. customer's request"
                              className="border-slate-300 text-slate-900"
                              rows={2}
                            />
                          </div>
                          <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                            <Clock size={13} className="mt-0.5 shrink-0 text-slate-400" />
                            An admin or audit officer must approve this before the transfer executes.
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setResolveSource(null)}>Cancel</Button>
                  {resolveMode === 'refund' ? (
                    <Button
                      type="button"
                      disabled={refundOverpaymentMutation.isPending || !refundAmount}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => refundOverpaymentMutation.mutate()}
                    >
                      {refundOverpaymentMutation.isPending ? 'Recording…' : <><RotateCcw size={14} /> Record Refund</>}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled={requestTransferMutation.isPending || !transferTargetId || !transferAmount}
                      className="gap-2"
                      onClick={() => requestTransferMutation.mutate()}
                    >
                      {requestTransferMutation.isPending ? 'Submitting…' : <><ArrowLeftRight size={14} /> Submit Transfer Request</>}
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* ── Admin: Pending Transfer Requests panel ───────────────────── */}
            {isAdmin && (
              <Dialog open={showRequestsPanel} onOpenChange={(v) => { if (!v) setShowRequestsPanel(false); }}>
                <DialogContent className="sm:max-w-[640px] max-h-[80vh] flex flex-col p-0">
                  <div className="border-b border-slate-200 bg-slate-900 px-5 py-4 shrink-0 rounded-t-lg">
                    <DialogHeader>
                      <DialogTitle className="text-white flex items-center gap-2">
                        <Clock size={16} className="text-amber-400" /> Overpayment Transfer Requests
                      </DialogTitle>
                      <DialogDescription className="text-slate-400">
                        Review and approve or reject pending overpayment transfer requests.
                      </DialogDescription>
                    </DialogHeader>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {requestsQuery.isLoading ? (
                      <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2">
                        <span className="animate-spin inline-block w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full" />
                        Loading requests…
                      </div>
                    ) : pendingRequests.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                        <CheckCheck size={32} className="opacity-30" />
                        <p className="text-sm">No pending transfer requests.</p>
                      </div>
                    ) : (
                      pendingRequests.map((req) => (
                        <div key={req.id} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500">From:</span>
                                <span className="font-semibold font-mono text-slate-800">
                                  {req.source_order_reference ?? `#${req.source_order_id}`}
                                </span>
                                <ArrowLeftRight size={12} className="text-slate-400" />
                                <span className="text-slate-500">To:</span>
                                <span className="font-semibold font-mono text-slate-800">
                                  {req.target_order_reference ?? `#${req.target_order_id}`}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500">
                                <span>Amount: <span className="font-bold text-blue-700">₦{parseFloat(req.amount).toLocaleString()}</span></span>
                                {req.requested_by_name && <span>By: {req.requested_by_name}</span>}
                                <span>{format(new Date(req.created_at), 'dd MMM yyyy, HH:mm')}</span>
                              </div>
                              {req.narration && (
                                <div className="text-xs text-slate-600 italic">"{req.narration}"</div>
                              )}
                            </div>
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              pending
                            </span>
                          </div>

                          {rejectingId === req.id ? (
                            <div className="space-y-2">
                              <Input
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Reason for rejection (optional)"
                                className="h-9 text-sm border-slate-300"
                              />
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => { setRejectingId(null); setRejectReason(''); }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  className="flex-1 gap-1.5"
                                  disabled={rejectRequestMutation.isPending}
                                  onClick={() => rejectRequestMutation.mutate({ id: req.id, reason: rejectReason })}
                                >
                                  <Ban size={13} /> {rejectRequestMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="flex-1 gap-1.5 border-red-200 text-red-700 hover:bg-red-50"
                                onClick={() => { setRejectingId(req.id); setRejectReason(''); }}
                              >
                                <Ban size={13} /> Reject
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                disabled={approveRequestMutation.isPending}
                                onClick={() => approveRequestMutation.mutate(req.id)}
                              >
                                <CheckCheck size={13} /> {approveRequestMutation.isPending ? 'Approving…' : 'Approve & Transfer'}
                              </Button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {/* ── File Viewer Dialog ── */}
            <Dialog open={!!filesOrder} onOpenChange={(v) => { if (!v) { setFilesOrder(null); setFetchedFiles([]); } }}>
              <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Paperclip size={16} /> Payment Files
                  </DialogTitle>
                  <DialogDescription>
                    {filesOrder ? `Order ${getOrderReference(filesOrder) || filesOrder.id}` : ''}
                  </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                  {filesLoading ? (
                    <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2">
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full" />
                      Loading files…
                    </div>
                  ) : fetchedFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
                      <Paperclip size={32} className="opacity-30" />
                      <p className="text-sm">No files attached to this payment.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {fetchedFiles.map((f) => {
                        const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(f.file_name ?? f.file);
                        const uploadedDate = f.uploaded_at ? new Date(f.uploaded_at).toLocaleString() : '';
                        return (
                          <div key={f.id} className="rounded-lg border border-slate-200 overflow-hidden bg-white hover:shadow-sm transition-shadow">
                            {isImage ? (
                              <a href={f.file} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={f.file}
                                  alt={f.file_name}
                                  className="w-full h-36 object-cover bg-slate-100"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              </a>
                            ) : (
                              <div className="w-full h-36 bg-slate-50 flex items-center justify-center">
                                <FileText size={40} className="text-slate-300" />
                              </div>
                            )}
                            <div className="px-3 py-2">
                              <div className="text-sm font-medium text-slate-700 truncate" title={f.file_name}>{f.file_name}</div>
                              {uploadedDate && <div className="text-xs text-slate-400 mt-0.5">{uploadedDate}</div>}
                              <div className="mt-2 flex items-center justify-between">
                                <a
                                  href={f.file}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={f.file_name}
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                >
                                  <ExternalLink size={11} /> Open / Download
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFile(f.id)}
                                  disabled={deletingFileId === f.id}
                                  className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                                  title="Delete file"
                                >
                                  {deletingFileId === f.id
                                    ? <span className="animate-spin inline-block w-3 h-3 border border-red-400 border-t-transparent rounded-full" />
                                    : <Trash2 size={13} />}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
