import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, X, RotateCcw, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { apiClient, fetchAllPages } from '@/api/client';
import { getOrderReference } from '@/lib/orderReference';

interface PaymentOrder {
  id: number;
  reference?: string;
  status: string;
  created_at: string;
  payment_confirmed_at?: string | null;
  payment_narration?: string | null;
  narration?: string | null;
  total_price?: string | number;
  amount?: string | number;
  overpayment_status?: string | null;
  overpayment_flagged?: boolean;
  user?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    phone?: string;
    company_name?: string;
  };
  products?: Array<{ name?: string }>;
  payment_records?: Array<{ id: number; amount: string; payment_date: string }>;
  location?: string;
  location_name?: string;
  state?: string;
}

const safeNum = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number) =>
  `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const extractName = (p: PaymentOrder) => {
  const u = p.user;
  if (!u) return '—';
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || '—';
};

const extractCompany = (p: PaymentOrder) =>
  p.user?.company_name?.trim() || '—';

const extractPhone = (p: PaymentOrder) =>
  p.user?.phone_number?.trim() || p.user?.phone?.trim() || '—';

const extractLocation = (p: PaymentOrder) =>
  (p as Record<string, unknown>).location_name as string
  || p.location || p.state || '—';

const extractProduct = (p: PaymentOrder) =>
  (p.products ?? []).map(x => x.name).filter(Boolean).join(', ') || '—';

const getOverpaidAmount = (p: PaymentOrder): number => {
  const salesValue = safeNum(p.total_price ?? p.amount);
  const records = p.payment_records ?? [];
  if (records.length === 0) return 0;
  const paid = records.reduce((s, r) => s + safeNum(r.amount), 0);
  return Math.max(0, paid - salesValue);
};

const parseOvpStatus = (narration: string | null | undefined): string | null => {
  if (!narration) return null;
  const m = narration.match(/\[OVP:([^\]]+)\]/);
  return m ? m[1] : null;
};

const isRefunded = (p: PaymentOrder): boolean => {
  if (p.overpayment_status === 'refunded') return true;
  const narStatus = parseOvpStatus(p.payment_narration ?? p.narration);
  return narStatus === 'refunded';
};

export default function OverpaymentRefunds() {
  const [search, setSearch] = useState('');

  const listQuery = useQuery({
    queryKey: ['overpayment-refunds-list'],
    queryFn: async () => {
      return fetchAllPages<PaymentOrder>(
        (p) => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size }),
      );
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const allOrders: PaymentOrder[] = useMemo(
    () => listQuery.data?.results ?? [],
    [listQuery.data],
  );

  const refundedOrders = useMemo(
    () => allOrders.filter(isRefunded),
    [allOrders],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return refundedOrders;
    return refundedOrders.filter(p => {
      const ref = String(getOrderReference(p) || p.reference || p.id).toLowerCase();
      const name = extractName(p).toLowerCase();
      const company = extractCompany(p).toLowerCase();
      const phone = extractPhone(p).toLowerCase();
      return ref.includes(q) || name.includes(q) || company.includes(q) || phone.includes(q);
    });
  }, [refundedOrders, search]);

  const totalOverpaid = useMemo(
    () => refundedOrders.reduce((s, p) => s + getOverpaidAmount(p), 0),
    [refundedOrders],
  );

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1400px] mx-auto space-y-5">

            <PageHeader
              title="Overpayment Refunds"
              description="Orders where excess payments were refunded to customers. Contact customers to arrange offline refunds."
            />

            {/* Summary */}
            <div className="flex flex-wrap gap-3">
              <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">
                <RotateCcw size={15} />
                Total Refunds: <span className="text-lg font-bold">{refundedOrders.length}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
                Total Overpaid: <span className="text-lg font-bold">{fmt(totalOverpaid)}</span>
              </div>
            </div>

            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <Input
                  placeholder="Search by order ref, customer, phone…"
                  className="pl-9 h-9 text-sm bg-slate-50 border-slate-200"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">#</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Order Ref</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Customer</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Company</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                        <span className="flex items-center gap-1.5"><Phone size={12} /> Phone</span>
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Product</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Location</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap text-right">Sales Value</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap text-right">Overpaid</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Payment Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listQuery.isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={10}><Skeleton className="h-9 w-full" /></TableCell>
                        </TableRow>
                      ))
                    ) : listQuery.isError ? (
                      <TableRow>
                        <TableCell colSpan={10} className="py-10 text-center text-red-600 text-sm">
                          Failed to load data.
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="py-14 text-center">
                          <RotateCcw className="mx-auto text-slate-300 mb-3" size={36} />
                          <p className="text-slate-500 font-medium">
                            {search ? 'No matching refunded orders.' : 'No overpayment refunds recorded yet.'}
                          </p>
                          {!search && (
                            <p className="text-xs text-slate-400 mt-1">
                              When a customer's overpayment is refunded on the Finance Report page, it will appear here.
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((p, idx) => {
                        const salesValue = safeNum(p.total_price ?? p.amount);
                        const overpaid = getOverpaidAmount(p);
                        return (
                          <TableRow key={p.id} className="hover:bg-emerald-50/30 transition-colors">
                            <TableCell className="text-slate-400 text-xs">{idx + 1}</TableCell>
                            <TableCell className="font-semibold font-mono text-slate-800 whitespace-nowrap text-sm">
                              {getOrderReference(p) || p.reference || `#${p.id}`}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm font-medium text-slate-800">
                              {extractName(p)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-slate-600">
                              {extractCompany(p)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {extractPhone(p) !== '—' ? (
                                <a
                                  href={`tel:${extractPhone(p)}`}
                                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
                                >
                                  <Phone size={12} /> {extractPhone(p)}
                                </a>
                              ) : (
                                <span className="text-slate-400 text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-slate-700">
                              {extractProduct(p)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-slate-600">
                              {extractLocation(p)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-slate-700 whitespace-nowrap">
                              {fmt(salesValue)}
                            </TableCell>
                            <TableCell className="text-right font-bold text-emerald-700 whitespace-nowrap">
                              {fmt(overpaid)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-slate-500">
                              {p.payment_confirmed_at
                                ? format(new Date(p.payment_confirmed_at), 'dd MMM yyyy, HH:mm')
                                : format(new Date(p.created_at), 'dd MMM yyyy')}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
