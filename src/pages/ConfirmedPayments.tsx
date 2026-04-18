import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Search, ShoppingCart, Droplets, Banknote, Coins, Pencil, CalendarDays, X, Truck, Users, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiClient, fetchAllPages } from '@/api/client';
import * as XLSX from 'xlsx';
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
  }>;

  quantity?: number | string;
  qty?: number | string;
  litres?: number | string;

  state?: string;
  location?: string;
  location_name?: string;

  // narration fallback if present
  narration?: string | null;

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

const extractProductInfo = (p: PaymentOrder): { product: string; qty: number; unitPrice: number } => {
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

  return { product: product || '', qty, unitPrice };
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

const getPaymentDate = (p: PaymentOrder): Date => {
  const raw = p.payment_confirmed_at || p.created_at;
  return new Date(raw);
};

export default function ConfirmedPayments() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'year' | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });

  // Edit modal state
  const [editOrder, setEditOrder] = useState<PaymentOrder | null>(null);
  const [editRemarks, setEditRemarks] = useState('');
  const [editAmountPaid, setEditAmountPaid] = useState('');
  const [editStatus, setEditStatus] = useState('');

  const queryClient = useQueryClient();
  const { toast } = useToast();

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
  };

  const updateNarrationMutation = useMutation({
    mutationFn: async ({ orderId, narration }: { orderId: number; narration: string }) => {
      return apiClient.admin.updateNarration(orderId, narration);
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['all-orders', 'shared'] });
      toast({ title: 'Updated', description: 'Payment details updated successfully.' });
      setEditOrder(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleSaveEdit = () => {
    if (!editOrder) return;
    const paidNum = parseFloat(editAmountPaid || '0');
    const prefix = Number.isFinite(paidNum) && paidNum > 0 ? `[PAID:${paidNum}] ` : '';
    const statusTag = editStatus ? `[STATUS:${editStatus}] ` : '';
    const fullNarration = `${prefix}${statusTag}${editRemarks}`.trim();
    updateNarrationMutation.mutate({ orderId: editOrder.id, narration: fullNarration });
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

  const hasActiveFilters = !!(locationFilter || productFilter || filterType || dateRange.from);

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterType(null);
    setLocationFilter(null);
    setProductFilter(null);
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
        if (!filterType) return true;
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
      });
  }, [confirmedPayments, filterType, locationFilter, searchQuery, productFilter, dateRange]);

  const summary = useMemo(() => {
    const totalOrders = filtered.length;
    const totalAmount = filtered.reduce((sum, p) => sum + safeToNumber(p.total_price ?? p.amount), 0);
    const totalQty = filtered.reduce((sum, p) => sum + extractProductInfo(p).qty, 0);
    let totalUnderpaid = 0;
    let totalOverpaid = 0;
    let totalPaid = 0;
    filtered.forEach((p) => {
      const salesValue = safeToNumber(p.total_price ?? p.amount);
      const paid = parseAmountPaid(p.payment_narration ?? p.narration) ?? salesValue;
      totalPaid += paid;
      const diff = salesValue - paid;
      if (diff > 0) totalUnderpaid += diff;
      else if (diff < 0) totalOverpaid += Math.abs(diff);
    });
    const avgOrderValue = totalOrders > 0 ? Math.round(totalAmount / totalOrders) : 0;
    const uniqueCustomers = new Set(filtered.map((p) => extractCustomerCompany(p) || extractCustomerName(p)).filter(Boolean)).size;

    return { totalOrders, totalAmount, totalQty, totalUnderpaid, totalOverpaid, totalPaid, avgOrderValue, uniqueCustomers };
  }, [filtered]);

  const exportToXLS = () => {
    const generatedAt = new Date().toLocaleString('en-GB');

    const locationLabel = locationFilter ? locationFilter : 'All Locations';
    const productLabel = productFilter ? productFilter : 'All Products';

    const totalQtyAll = filtered.reduce((sum, p) => sum + extractProductInfo(p).qty, 0);

    const ordersCountAll = filtered.length;

    const totalAmountAll = filtered.reduce((sum, p) => sum + safeToNumber(p.total_price ?? p.amount), 0);

    const headingBlock: Array<Array<string>> = [
      ['Date', generatedAt],
      ['Location', locationLabel],
      ['Product', productLabel],
      ['Quantity Sold', `${totalQtyAll.toLocaleString()} Litres`],
      ['Number of Trucks Sold', String(ordersCountAll)],
      ['Total Amount', `N ${totalAmountAll.toLocaleString()}`],
      [],
    ];

    const headers = ['S/N', 'Date', 'Reference', 'Truck No.', 'Customer Name', 'Product Qty (L)', 'Price/L', 'Sales Value', 'Company Name', 'Bank', 'Remarks', 'Balance', 'Status'];
    // Sort oldest to newest for the exported file
    const exportSorted = [...filtered].sort((a, b) => getPaymentDate(a).getTime() - getPaymentDate(b).getTime());
    const rows = exportSorted.map((p, idx) => {
      const d = getPaymentDate(p);
      const date = Number.isNaN(d.getTime()) ? '' : format(d, 'dd/MM/yyyy HH:mm');
      const ref = getOrderReference(p) || p.reference || p.id;
      const truckNo = extractTruckNumber(p);
      const customer = extractCustomerName(p);
      const { product, qty, unitPrice } = extractProductInfo(p);
      const salesValue = safeToNumber(p.total_price ?? p.amount);
      const company = extractCustomerCompany(p);
      const { bankName: bank, acctNo: bankAcctNo } = extractBankInfo(p, bankAccounts);
      const rawNarration = p.payment_narration ?? p.narration ?? '';
      const remarks = cleanNarration(rawNarration);
      const amountPaid = parseAmountPaid(rawNarration);
      const balance = amountPaid !== null ? salesValue - amountPaid : 0;
      const status = getPaymentStatus(salesValue, amountPaid, rawNarration);
      return [
        String(idx + 1), date, String(ref ?? ''), truckNo, customer,
        `${qty.toLocaleString()} ${product}`, unitPrice ? `N${unitPrice.toLocaleString()}` : '',
        `N${salesValue.toLocaleString()}`, company, bankAcctNo ? `${bank} (${bankAcctNo})` : bank,
        amountPaid !== null ? `${remarks} (Paid: N${amountPaid.toLocaleString()})` : remarks,
        amountPaid !== null ? `N${balance.toLocaleString()}` : '', status.label,
      ];
    });

    const sheetData = [...headingBlock, headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `Report ${format(new Date(), 'dd-MM-yy')}.xlsx`);
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
                <Button variant="default" className="gap-2" onClick={exportToXLS}>
                  <Download className="h-4 w-4" />
                  Download Report
                </Button>
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
                  icon: <Banknote className="h-4 w-4" />,
                  tone: 'neutral',
                },
                {
                  title: 'Total Amount Paid',
                  value: isLoading ? '\u2026' : `\u20A6${summary.totalPaid.toLocaleString()}`,
                  className: "text-emerald-700",
                  icon: <TrendingUp className="h-4 w-4" />,
                  tone: 'green',
                },
                {
                  title: 'Outstanding Balance',
                  value: isLoading ? '\u2026' : `\u20A6${summary.totalUnderpaid.toLocaleString()}`,
                  className: "text-red-600",
                  icon: <Coins className="h-4 w-4" />,
                  tone: summary.totalUnderpaid > 0 ? 'red' : 'neutral',
                },
                {
                  title: 'Overpaid',
                  value: isLoading ? '\u2026' : `\u20A6${summary.totalOverpaid.toLocaleString()}`,
                  className: "text-blue-600",
                  icon: <Coins className="h-4 w-4" />,
                  tone: summary.totalOverpaid > 0 ? 'amber' : 'neutral',
                },
              ]}
            />

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col gap-3">
                {/* Row 1: Search + quick timeframe buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      placeholder="Search reference, customer, company, truck…"
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {(['today', 'yesterday', 'week', 'month', 'year'] as const).map((tf) => (
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

                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Product</label>
                    <select
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
                    <TableHead className="min-w-[180px]">Remarks</TableHead>
                    <TableHead className="min-w-[110px] text-right">Balance</TableHead>
                    <TableHead className="min-w-[110px]">Status</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(6)].map((_, idx) => (
                      <TableRow key={idx}>
                        {[...Array(15)].map((_, ci) => (
                          <TableCell key={ci}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center h-24 text-slate-500">
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
                      const { product, qty, unitPrice } = extractProductInfo(p);
                      const salesValue = safeToNumber(p.total_price ?? p.amount);
                      const company = extractCustomerCompany(p);
                      const location = extractLocation(p);
                      const { bankName: bank, acctNo: bankAcctNo } = extractBankInfo(p, bankAccounts);
                      const rawNarration = String(p.payment_narration ?? p.narration ?? '');
                      const remarks = cleanNarration(rawNarration);
                      const amountPaid = parseAmountPaid(rawNarration);
                      const balance = amountPaid !== null ? salesValue - amountPaid : 0;
                      const status = getPaymentStatus(salesValue, amountPaid, rawNarration);

                      return (
                        <TableRow key={p.id} className="hover:bg-slate-50/60">
                          <TableCell className="text-slate-500">{filtered.length - idx}</TableCell>
                          <TableCell>
                            <div className="text-sm">{dateStr}</div>
                            <div className="text-xs text-slate-400">{timeStr}</div>
                          </TableCell>
                          <TableCell className="text-slate-950">{ref}</TableCell>
                          <TableCell className="text-sm">{truckNo || '\u2014'}</TableCell>
                          <TableCell className="uppercase font-semibold max-w-[140px]" title={customerName || undefined}>
                            {customerName || '\u2014'}
                          </TableCell>
                          <TableCell className="">
                            <div className="font-semibold">{qty ? `${qty.toLocaleString()} Litres` : '\u2014'}</div>
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
                          <TableCell className="max-w-[140px] text-sm">
                            <div className="font-medium" title={bank || undefined}>{bank || '\u2014'}</div>
                            {bankAcctNo && <div className="text-xs text-slate-600">{bankAcctNo}</div>}
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <div className="text-sm text-slate-600" title={remarks || undefined}>
                              {remarks || <span className="text-xs text-slate-400">No remarks</span>}
                            </div>
                            {amountPaid !== null && (
                              <div className="text-xs text-slate-400 mt-0.5">
                                Paid: {'\u20A6'}{amountPaid.toLocaleString()}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {amountPaid !== null ? (
                              <span className={balance > 0 ? 'text-red-600' : 'text-emerald-600'}>
                                {'\u20A6'}{balance.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-slate-300">{'\u2014'}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {amountPaid !== null ? (
                              <Badge variant="outline" className={`text-xs whitespace-nowrap ${status.color}`}>
                                {status.label}
                              </Badge>
                            ) : (
                              <span className="text-slate-300 text-xs">{'\u2014'}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditModal(p)} title="Edit">
                              <Pencil size={14} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Edit Payment Details Dialog */}
            <Dialog open={!!editOrder} onOpenChange={(v) => { if (!v) setEditOrder(null); }}>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Edit Payment Details</DialogTitle>
                  <DialogDescription>
                    {editOrder ? `Order ${getOrderReference(editOrder) || editOrder.id}` : ''}
                    {editOrder ? ` \u2014 Sales Value: \u20A6${safeToNumber(editOrder.total_price ?? editOrder.amount).toLocaleString()}` : ''}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  {/* Amount Paid */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Amount Paid (\u20A6)</label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={editAmountPaid}
                      onChange={(e) => setEditAmountPaid(e.target.value)}
                      placeholder="Enter amount paid"
                      className="h-10 tabular-nums"
                    />
                    {editOrder && (() => {
                      const sv = safeToNumber(editOrder.total_price ?? editOrder.amount);
                      const paid = parseFloat(editAmountPaid || '0');
                      const bal = sv - paid;
                      if (Number.isNaN(paid)) return null;
                      if (bal > 0) return (
                        <div className="mt-1.5 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm">
                          <span className="text-red-700">Outstanding Balance</span>
                          <span className="font-bold text-red-800">{'\u20A6'}{bal.toLocaleString()}</span>
                        </div>
                      );
                      if (bal === 0) return (
                        <div className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 font-medium">
                          {'\u2713'} Fully paid
                        </div>
                      );
                      return (
                        <div className="mt-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                          Overpaid by {'\u20A6'}{Math.abs(bal).toLocaleString()}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Status */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Status</label>
                    <select
                      aria-label="Payment status"
                      className="h-10 w-full border border-slate-300 rounded-md bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                    >
                      {PAYMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Remarks</label>
                    <Textarea
                      value={editRemarks}
                      onChange={(e) => setEditRemarks(e.target.value)}
                      placeholder="e.g. part payment, bank transfer details..."
                      className="min-h-[80px] resize-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setEditOrder(null)}>Cancel</Button>
                  <Button onClick={handleSaveEdit} disabled={updateNarrationMutation.isPending} className="gap-1.5">
                    {updateNarrationMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
