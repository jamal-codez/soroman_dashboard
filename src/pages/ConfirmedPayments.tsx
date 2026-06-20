import { Fragment, useMemo, useState } from 'react';
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
import { Download, Search, ShoppingCart, Droplets, Banknote, Pencil, CalendarDays, X, Truck, Users, Paperclip, FileText, ImageIcon, ExternalLink, Trash2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiClient, fetchAllPages } from '@/api/client';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format, isThisMonth, isThisWeek, isThisYear, isToday, isYesterday, addDays, isAfter, isBefore, isSameDay } from 'date-fns';
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

/** Strip the [PAID:xxx] and [STATUS:xxx] prefixes from narration */
const cleanNarration = (narration: string | null | undefined): string => {
  if (!narration) return '';
  return narration.replace(/\[PAID:[\d.]+\]\s*/g, '').replace(/\[STATUS:[^\]]*\]\s*/g, '').trim();
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

export default function ConfirmedPayments() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'year'>('today');
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [pfiFilter, setPfiFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });

  // Edit modal state
  const [editOrder, setEditOrder] = useState<PaymentOrder | null>(null);
  const [editRemarks, setEditRemarks] = useState('');
  const [editAmountPaid, setEditAmountPaid] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editAttachedFiles, setEditAttachedFiles] = useState<File[]>([]);
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnitPrice, setEditUnitPrice] = useState('');
  const [editTotalPrice, setEditTotalPrice] = useState('');
  const [editTruckNumber, setEditTruckNumber] = useState('');
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
      await queryClient.refetchQueries({ queryKey: ['all-orders', 'shared'] });
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

  const handleDeletePaymentRecord = async (id: number) => {
    setDeletingPaymentId(id);
    try {
      await apiClient.admin.deleteOrderPaymentRecord(id);
      setExistingPaymentRecords((prev) => prev.filter((r) => r.id !== id));
      await queryClient.refetchQueries({ queryKey: ['all-orders', 'shared'] });
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
      await queryClient.refetchQueries({ queryKey: ['all-orders', 'shared'] });
      toast({ title: 'Order deleted', description: 'The order has been removed.' });
      setOrderToDelete(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
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

    const { qty, unitPrice } = extractProductInfo(p);
    setEditQuantity(qty ? String(qty) : '');
    setEditUnitPrice(unitPrice ? String(unitPrice) : '');
    setEditTotalPrice(salesValue ? String(salesValue) : '');
    setEditTruckNumber(extractTruckNumber(p));
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
      await queryClient.refetchQueries({ queryKey: ['all-orders', 'shared'] });
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

    const { qty: origQty, unitPrice: origUnitPrice } = extractProductInfo(editOrder);
    const newQty = parseFloat(editQuantity || '0');
    if (editQuantity.trim() && Number.isFinite(newQty) && newQty !== origQty) {
      patch.quantity = newQty;
    }

    const newUnitPrice = parseFloat(editUnitPrice || '0');
    if (editUnitPrice.trim() && Number.isFinite(newUnitPrice) && newUnitPrice !== origUnitPrice) {
      patch.unit_price = newUnitPrice;
    }

    const origPrice = safeToNumber(editOrder.total_price ?? editOrder.amount);
    const newPrice = parseFloat(editTotalPrice || '0');
    if (editTotalPrice.trim() && Number.isFinite(newPrice) && newPrice !== origPrice) {
      patch.total_price = newPrice;
    }

    if (editTruckNumber.trim() !== extractTruckNumber(editOrder)) {
      patch.truck_number = editTruckNumber.trim();
    }
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

  const listQuery = useQuery<OrderResponse>({
    queryKey: ['all-orders', 'shared'],
    queryFn: async () => {
      return fetchAllPages<PaymentOrder>(
        (p) => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size }),
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

  const isLoading = listQuery.isLoading;

  const allPayments = useMemo(() => listQuery.data?.results ?? [], [listQuery.data?.results]);

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

  const hasActiveFilters = !!(locationFilter || productFilter || pfiFilter || filterType !== 'today' || dateRange.from);

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
        return ref.includes(q) || company.includes(q) || customer.includes(q) || location.includes(q) || pfi.includes(q) || truck.includes(q);
      })
      .filter((p) => {
        if (filterType === 'all') return true;
        const d = getPaymentDate(p);
        if (filterType === 'today') return isToday(d);
        if (filterType === 'yesterday') return isYesterday(d);
        if (filterType === 'week') return isThisWeek(d);
        if (filterType === 'month') return isThisMonth(d);
        if (filterType === 'year') return isThisYear(d);
        return true;
      })
      .filter((p) => {
        if (dateRange.from && dateRange.to) {
          const d = getPaymentDate(p);
          return (isSameDay(d, dateRange.from) || isAfter(d, dateRange.from)) &&
                 (isSameDay(d, dateRange.to) || isBefore(d, addDays(dateRange.to, 1)));
        }
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
    const avgOrderValue = totalOrders > 0 ? Math.round(totalAmount / totalOrders) : 0;
    const uniqueCustomers = new Set(filtered.map((p) => extractCustomerCompany(p) || extractCustomerName(p)).filter(Boolean)).size;

    return { totalOrders, totalAmount, totalQty, avgOrderValue, uniqueCustomers };
  }, [filtered]);

  const buildReportData = () => {
    const generatedAt = new Date().toLocaleString('en-GB');

    const locationLabel = locationFilter ? locationFilter : 'All Locations';
    const productLabel = productFilter ? productFilter : 'All Products';

    const totalQtyAll = filtered.reduce((sum, p) => sum + extractProductInfo(p).qty, 0);
    const ordersCountAll = filtered.length;
    const totalAmountAll = filtered.reduce((sum, p) => sum + safeToNumber(p.total_price ?? p.amount), 0);
    const exportUnitLabel = filtered.length > 0 ? extractProductInfo(filtered[0]).unitLabel : 'Litres';

    const headingBlock: Array<[string, string]> = [
      ['Date', generatedAt],
      ['Location', locationLabel],
      ['Product', productLabel],
      ['Quantity Sold', `${totalQtyAll.toLocaleString()} ${exportUnitLabel}`],
      ['Number of Orders', String(ordersCountAll)],
      ['Total Amount', `N ${totalAmountAll.toLocaleString()}`],
    ];

    const headers = [
      'S/N', 'Date', 'Reference', 'Truck No.', 'Facilitator', `Quantity (${exportUnitLabel})`, 'Unit Price', 'Sales Value', 'Paying Company', 'Bank Account',
      'Payment Date', 'Payment Amount', 'Balance', 'Payer', 'Payment Bank', 'Transaction Reference',
    ];
    // Sort oldest to newest for the exported file
    const exportSorted = [...filtered].sort((a, b) => getPaymentDate(a).getTime() - getPaymentDate(b).getTime());
    const rows: Array<Array<string>> = [];
    exportSorted.forEach((p, idx) => {
      const d = getPaymentDate(p);
      const date = Number.isNaN(d.getTime()) ? '' : format(d, 'dd/MM/yyyy HH:mm');
      const ref = getOrderReference(p) || p.reference || p.id;
      const truckNo = extractTruckNumber(p);
      const customer = extractCustomerName(p);
      const { product, qty, unitPrice } = extractProductInfo(p);
      const salesValue = safeToNumber(p.total_price ?? p.amount);
      const company = extractCustomerCompany(p);
      const { bankName: bank, acctNo: bankAcctNo } = extractBankInfo(p, bankAccounts);
      // Order row — payment columns left blank
      rows.push([
        String(idx + 1), date, String(ref ?? ''), truckNo, customer,
        `${qty.toLocaleString()} ${product}`, unitPrice ? `N${unitPrice.toLocaleString()}` : '',
        `N${salesValue.toLocaleString()}`, company, bankAcctNo ? `${bank} (${bankAcctNo})` : bank,
        '', '', '', '', '', '',
      ]);
      // Payment sub-rows — order columns left blank, one row per payment received
      const records = [...(p.payment_records ?? [])].sort(
        (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
      );
      let cumulative = 0;
      records.forEach((r) => {
        cumulative += safeToNumber(r.amount);
        const rowBalance = salesValue - cumulative;
        rows.push([
          '', '', '', '', '', '', '', '', '', '',
          r.payment_date ? format(new Date(r.payment_date), 'dd/MM/yyyy') : '',
          `N${safeToNumber(r.amount).toLocaleString()}`,
          `N${rowBalance.toLocaleString()}`,
          r.payer_name || '',
          r.bank_name ? `${r.bank_name}${r.account_number ? ` (${r.account_number})` : ''}` : '',
          r.transaction_reference || '',
        ]);
      });
    });

    return { generatedAt, headingBlock, headers, rows, totalQtyAll, ordersCountAll, totalAmountAll, exportUnitLabel };
  };

  const exportToXLS = () => {
    const { headingBlock, headers, rows } = buildReportData();
    const sheetData = [...headingBlock, [], headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `Payment Report ${format(new Date(), 'dd-MM-yy')}.xlsx`);
  };

  const exportToPDF = () => {
    const { headingBlock, headers, rows } = buildReportData();
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(14);
    doc.text('Payments Report', 14, 14);

    autoTable(doc, {
      startY: 20,
      body: headingBlock,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
    });

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
      head: [headers],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`Payment Report ${format(new Date(), 'dd-MM-yy')}.pdf`);
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="default" className="gap-2">
                      <Download className="h-4 w-4" />
                      Download Report
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={exportToXLS}>Export as Excel (.xlsx)</DropdownMenuItem>
                    <DropdownMenuItem onClick={exportToPDF}>Export as PDF</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />

            <SummaryCards
              cards={[
                {
                  title: 'Total Trucks',
                  value: isLoading ? '\u2026' : summary.totalOrders.toLocaleString(),
                  icon: <Truck className="h-4 w-4" />,
                  tone: 'neutral',
                },
                {
                  title: 'Total Quantity',
                  value: isLoading ? '\u2026' : `${summary.totalQty.toLocaleString()} L`,
                  icon: <Droplets className="h-4 w-4" />,
                  tone: 'neutral',
                },
                {
                  title: 'Total Sales Value',
                  value: isLoading ? '\u2026' : `\u20A6${summary.totalAmount.toLocaleString()}`,
                  className: "text-emerald-700",
                  icon: <Banknote className="h-4 w-4" />,
                  tone: 'green',
                },
              ]}
            />

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3">
              {/* Row 1: Search + Timeframe + Date Range + Clear */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_180px_220px_auto] gap-3 items-end">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      placeholder="Reference, customer, company, truck…"
                      className="pl-10 h-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Timeframe</label>
                  <select
                    aria-label="Filter by timeframe"
                    className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={filterType ?? ''}
                    onChange={(e) => {
                      setFilterType(e.target.value as typeof filterType);
                      setDateRange({ from: null, to: null });
                    }}
                  >
                    {(['today', 'yesterday', 'week', 'month', 'year', 'all'] as const).map((tf) => (
                      <option key={tf} value={tf}>{tf === 'all' ? 'All Time' : tf.charAt(0).toUpperCase() + tf.slice(1)}</option>
                    ))}
                  </select>
                </div>

                <div>
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
                      <Calendar
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
                    className="h-9 gap-1 text-slate-500 hover:text-red-600"
                    onClick={clearAllFilters}
                  >
                    <X size={14} />
                    Clear
                  </Button>
                )}
              </div>

              {/* Row 2: Location, Product, PFI */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Location</label>
                  <select
                    aria-label="Filter by location"
                    className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={locationFilter ?? ''}
                    onChange={(e) => setLocationFilter(e.target.value || null)}
                  >
                    <option value="">All Locations</option>
                    {uniqueLocations.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Product</label>
                  <select
                    aria-label="Filter by product"
                    className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={productFilter ?? ''}
                    onChange={(e) => setProductFilter(e.target.value || null)}
                  >
                    <option value="">All Products</option>
                    {uniqueProducts.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">PFI</label>
                  <select
                    aria-label="Filter by PFI"
                    className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={pfiFilter ?? ''}
                    onChange={(e) => setPfiFilter(e.target.value || null)}
                  >
                    <option value="">All PFIs</option>
                    {uniquePfis.map((pfi) => (
                      <option key={pfi} value={pfi}>{pfi}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-[50px]">S/N</TableHead>
                    <TableHead className="min-w-[90px]">Date</TableHead>
                    <TableHead className="min-w-[110px]">Reference</TableHead>
                    <TableHead className="min-w-[100px]">Truck Number</TableHead>
                    <TableHead className="min-w-[140px]">Facilitator</TableHead>
                    <TableHead className="min-w-[120px]">Quantity</TableHead>
                    <TableHead className="min-w-[90px] text-right">Unit Price</TableHead>
                    <TableHead className="min-w-[120px] text-right">Sales Value</TableHead>
                    <TableHead className="min-w-[140px]">Paying Company</TableHead>
                    <TableHead className="min-w-[110px]">Location</TableHead>
                    <TableHead className="min-w-[100px]">Bank</TableHead>
                    <TableHead className="w-[160px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(6)].map((_, idx) => (
                      <TableRow key={idx}>
                        {[...Array(12)].map((_, ci) => (
                          <TableCell key={ci}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center h-24 text-slate-500">
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
                      const { bankName: bank, acctNo: bankAcctNo } = extractBankInfo(p, bankAccounts);
                      const records = p.payment_records ?? [];
                      return (
                        <Fragment key={p.id}>
                        <TableRow className="hover:bg-slate-50/60">
                          <TableCell className="text-slate-500">{filtered.length - idx}</TableCell>
                          <TableCell>
                            <div className="text-sm">{dateStr}</div>
                            <div className="text-xs text-slate-400">{timeStr}</div>
                          </TableCell>
                          <TableCell className="text-slate-950 font-semibold">{ref}</TableCell>
                          <TableCell className="text-sm">{truckNo || '\u2014'}</TableCell>
                          <TableCell className="uppercase font-semibold max-w-[140px]" title={customerName || undefined}>
                            {customerName || '\u2014'}
                          </TableCell>
                          <TableCell className="">
                            <div className="font-semibold">{qty ? `${qty.toLocaleString()} ${unitLabel}` : '\u2014'}</div>
                            {product && <div className="text-xs text-slate-400">{product}</div>}
                          </TableCell>
                          <TableCell className="text-right">
                            {unitPrice ? `\u20A6${unitPrice.toLocaleString()}` : '\u2014'}
                          </TableCell>
                          <TableCell className="text-right font-bold text-green-800">
                            {'\u20A6'}{salesValue.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm uppercase font-semibold" title={company || undefined}>
                            {company || '\u2014'}
                          </TableCell>
                          <TableCell className="text-sm" title={location || undefined}>
                            {location || '\u2014'}
                          </TableCell>
                          <TableCell className="max-w-[140px]">
                            {bankAcctNo && <div className="text-sm font-semibold text-slate-700">{bankAcctNo}</div>}
                            <div className="font-normal text-xs" title={bank || undefined}>{bank || '\u2014'}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button className="h-8 gap-1.5 text-xs font-semibold bg-green-700 hover:bg-green-800 text-white" size="sm" onClick={() => openEditModal(p)}>
                                <Pencil size={12} />
                                Edit
                              </Button>
                              <Button className="h-8 gap-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white" size="sm" onClick={() => setOrderToDelete(p)}>
                                <Trash2 size={12} />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {records.length > 0 && (
                          <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                            <TableCell colSpan={12} className="py-2 px-4">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                                    <th className="text-left font-semibold pb-1 pl-4">Date</th>
                                    <th className="text-right font-semibold pb-1">Amount</th>
                                    <th className="text-right font-semibold pb-1">Balance</th>
                                    <th className="text-left font-semibold pb-1">Payer</th>
                                    <th className="text-left font-semibold pb-1">Bank</th>
                                    <th className="text-left font-semibold pb-1">Reference</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(() => {
                                    let cumulative = 0;
                                    return [...records]
                                      .sort((a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime())
                                      .map((r) => {
                                        cumulative += safeToNumber(r.amount);
                                        const rowBalance = salesValue - cumulative;
                                        return (
                                          <tr key={r.id} className="border-t border-slate-200/70">
                                            <td className="py-1 pl-4 text-slate-600 whitespace-nowrap">
                                              {r.payment_date ? format(new Date(r.payment_date), 'dd/MM/yy') : '—'}
                                            </td>
                                            <td className="py-1 text-right font-semibold text-emerald-700">
                                              {'₦'}{safeToNumber(r.amount).toLocaleString()}
                                            </td>
                                            <td className={`py-1 text-right font-semibold ${rowBalance > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                                              {'₦'}{rowBalance.toLocaleString()}
                                            </td>
                                            <td className="py-1 text-slate-700">{r.payer_name || '—'}</td>
                                            <td className="py-1 text-slate-700">
                                              {r.bank_name || '—'}{r.account_number ? ` (${r.account_number})` : ''}
                                            </td>
                                            <td className="py-1 font-mono text-slate-500">{r.transaction_reference || '—'}</td>
                                          </tr>
                                        );
                                      });
                                  })()}
                                </tbody>
                              </table>
                            </TableCell>
                          </TableRow>
                        )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Edit Payment Details Dialog */}
            <Dialog open={!!editOrder} onOpenChange={(v) => { if (!v) setEditOrder(null); }}>
              <DialogContent className="w-[92vw] sm:w-full sm:max-w-[440px] max-h-[90vh] border border-slate-300 shadow-xl p-0 flex flex-col gap-0">
                <div className="border-b border-slate-800 bg-black px-4 sm:px-6 py-3 sm:py-4 shrink-0">
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

                <div className="space-y-3.5 bg-white px-4 sm:px-6 py-4 sm:py-5 flex-1 overflow-y-auto min-h-0">
                  {editOrder && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                      <div>
                        <div className="text-slate-400 uppercase tracking-wider text-[10px]">Customer</div>
                        <div className="font-semibold text-slate-800 truncate">{extractCustomerName(editOrder) || '—'}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 uppercase tracking-wider text-[10px]">Company</div>
                        <div className="font-semibold text-slate-800 truncate">{extractCustomerCompany(editOrder) || '—'}</div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800">Truck Number</label>
                    <Input
                      value={editTruckNumber}
                      onChange={(e) => setEditTruckNumber(e.target.value)}
                      placeholder="e.g. ABC-123-XY"
                      className="h-10 border-slate-300 text-slate-900 font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-800">Quantity</label>
                      <div className="relative">
                        <CommaInput
                          value={editQuantity}
                          onValueChange={(v) => {
                            setEditQuantity(v);
                            const qty = parseFloat(v || '0');
                            const price = parseFloat(editUnitPrice || '0');
                            if (qty > 0 && price > 0) setEditTotalPrice(String(Math.round(qty * price * 100) / 100));
                          }}
                          placeholder="e.g. 33,000"
                          className="h-10 border-slate-300 text-slate-900 font-medium pr-14"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                          {editOrder ? extractProductInfo(editOrder).unitLabel : 'Litres'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-800">Unit Price (₦)</label>
                      <CommaInput
                        value={editUnitPrice}
                        onValueChange={(v) => {
                          setEditUnitPrice(v);
                          const qty = parseFloat(editQuantity || '0');
                          const price = parseFloat(v || '0');
                          if (qty > 0 && price > 0) setEditTotalPrice(String(Math.round(qty * price * 100) / 100));
                        }}
                        placeholder="e.g. 1,000"
                        className="h-10 border-slate-300 text-slate-900 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                      Sales Value (₦) <span className="text-[10px] font-normal text-emerald-600 normal-case">(auto-calculated)</span>
                    </label>
                    <CommaInput
                      value={editTotalPrice}
                      onValueChange={setEditTotalPrice}
                      placeholder="e.g. 33,000,000"
                      className="h-11 border-emerald-200 bg-emerald-50/50 text-slate-900 font-bold text-base"
                    />
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

                  {/* Payments — existing entries + add new split-payment lines, same UX as Confirm Payment */}
                  <div className="space-y-2.5">
                    <label className="text-sm font-semibold text-slate-800">Payments</label>

                    {existingPaymentRecords.length > 0 && (
                      <div className="rounded-md border border-slate-200 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                              <th className="text-left font-semibold py-1.5 pl-2.5">Date</th>
                              <th className="text-right font-semibold py-1.5">Amount</th>
                              <th className="text-left font-semibold py-1.5 pl-2">Payer</th>
                              <th className="text-left font-semibold py-1.5 pl-2">Bank</th>
                              <th className="text-left font-semibold py-1.5 pl-2">Reference</th>
                              <th className="w-[28px]"><span className="sr-only">Remove</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {existingPaymentRecords.map((r) => (
                              <tr key={r.id} className="border-t border-slate-100">
                                <td className="py-1.5 pl-2.5 text-slate-600 whitespace-nowrap">
                                  {r.payment_date ? format(new Date(r.payment_date), 'dd/MM/yy') : '—'}
                                </td>
                                <td className="py-1.5 text-right font-semibold text-emerald-700">
                                  ₦{safeToNumber(r.amount).toLocaleString()}
                                </td>
                                <td className="py-1.5 pl-2 text-slate-700">{r.payer_name || '—'}</td>
                                <td className="py-1.5 pl-2 text-slate-700">
                                  {r.bank_name || '—'}{r.account_number ? ` (${r.account_number})` : ''}
                                </td>
                                <td className="py-1.5 pl-2 font-mono text-slate-500">{r.transaction_reference || '—'}</td>
                                <td className="py-1.5 pr-2">
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
                        <div className="grid grid-cols-3 gap-2.5">
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-slate-600">Amount (₦)</label>
                            <CommaInput
                              value={line.amount}
                              onValueChange={(v) => updateNewPaymentLine(idx, { amount: v })}
                              placeholder="e.g. 2,500,000"
                              className="h-9 text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-slate-600">Date</label>
                            <Input
                              type="date"
                              value={line.paymentDate}
                              onChange={(e) => updateNewPaymentLine(idx, { paymentDate: e.target.value })}
                              className="h-9 text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-slate-600">Payer's Name</label>
                            <Input
                              value={line.payerName}
                              onChange={(e) => updateNewPaymentLine(idx, { payerName: e.target.value })}
                              placeholder="Who sent the money"
                              className="h-9 text-sm bg-white"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-slate-600">Bank Account</label>
                            <select
                              aria-label="Bank account"
                              className="h-9 w-full border border-slate-300 rounded-md bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              value={line.bankAccountId}
                              onChange={(e) => updateNewPaymentLine(idx, { bankAccountId: e.target.value })}
                            >
                              <option value="">{'— Select —'}</option>
                              {bankAccounts.map((b) => (
                                <option key={b.id} value={b.id}>{b.bank_name} • {b.acct_no} • {b.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-slate-600">Transaction Reference</label>
                            <Input
                              value={line.transactionReference}
                              onChange={(e) => updateNewPaymentLine(idx, { transactionReference: e.target.value.replace(/[^A-Za-z0-9]/g, '') })}
                              placeholder="Alphanumeric, unique"
                              className="h-9 text-sm font-mono bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={addNewPaymentLine}
                      className="w-full h-10 gap-2 border-2 border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-800"
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
                        <div className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 ${
                          bal === 0 ? 'border-emerald-300 bg-emerald-100' : bal > 0 ? 'border-amber-300 bg-amber-100' : 'border-blue-300 bg-blue-100'
                        }`}>
                          <span className="text-xs font-semibold text-slate-700">
                            ₦{totalPaid.toLocaleString()} <span className="text-slate-400">of</span> ₦{salesValue.toLocaleString()}
                          </span>
                          <span className={`text-xs font-bold ${bal === 0 ? 'text-emerald-800' : bal > 0 ? 'text-amber-800' : 'text-blue-800'}`}>
                            {bal === 0 ? 'Fully Matched ✓' : bal > 0 ? `₦${bal.toLocaleString()} remaining` : `₦${Math.abs(bal).toLocaleString()} overpaid`}
                          </span>
                        </div>
                      );
                    })()}
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
                </div>

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
