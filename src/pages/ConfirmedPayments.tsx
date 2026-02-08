import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { PageHeader } from '@/components/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Download, SearchIcon } from 'lucide-react';
import { apiClient } from '@/api/client';
import { format, isThisMonth, isThisWeek, isThisYear, isToday } from 'date-fns';
import { getOrderReference } from '@/lib/orderReference';
import { SummaryCards } from '@/components/SummaryCards';
import { ShoppingCart, Droplets, Banknote, Coins } from 'lucide-react';

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
    toNumber(products?.[0]?.quantity) ??
    toNumber(products?.[0]?.qty) ??
    toNumber(products?.[0]?.litres);

  const qty = qtyNum !== undefined ? qtyNum.toLocaleString() : '';

  const rawUnit = products?.[0]?.unit_price ?? products?.[0]?.unitPrice ?? products?.[0]?.price;
  const unitPrice = rawUnit === undefined || rawUnit === null || rawUnit === '' ? '' : Number(String(rawUnit).replace(/,/g, '')).toLocaleString();

  return { product: product || '', qty, unitPrice: unitPrice || '' };
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
  const cd = (p.customer_details || {}) as Record<string, unknown>;
  return String(
    (p.truck_number as string | undefined) ||
      (cd.truckNumber as string | undefined) ||
      (cd.truck_number as string | undefined) ||
      ''
  ).trim();
};

const getPaymentDate = (p: PaymentOrder): Date => {
  const raw = p.payment_confirmed_at || p.created_at;
  return new Date(raw);
};

const extractPaidQtyNumber = (p: PaymentOrder): number => {
  const toNumber = (v: unknown): number | undefined => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    const s = String(v).trim();
    if (!s) return undefined;
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : undefined;
  };

  const products = Array.isArray(p.products) ? p.products : [];

  return (
    toNumber(p.quantity) ??
    toNumber(p.qty) ??
    toNumber(p.litres) ??
    toNumber(products?.[0]?.quantity) ??
    toNumber(products?.[0]?.qty) ??
    toNumber(products?.[0]?.litres) ??
    0
  );
};

export default function ConfirmedPayments() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today' | 'week' | 'month' | 'year' | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [pfiFilter, setPfiFilter] = useState<string | null>(null);

  const PAGE_SIZE = 500;

  const listQuery = useQuery<OrderResponse>({
    queryKey: ['all-orders', 'confirmed-payments', { searchQuery }],
    queryFn: async () => {
      let page = 1;
      const results: PaymentOrder[] = [];
      let count = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const response = (await apiClient.admin.getAllAdminOrders({
          page,
          page_size: PAGE_SIZE,
        })) as OrderResponse;

        const pageResults = Array.isArray(response.results) ? response.results : [];
        results.push(...pageResults);

        count = typeof response.count === 'number' ? response.count : results.length;
        if (results.length >= count || pageResults.length === 0) break;
        page += 1;
      }

      return { count, results };
    },
    refetchOnWindowFocus: true,
  });

  const isLoading = listQuery.isLoading;

  const allPayments = useMemo(() => listQuery.data?.results ?? [], [listQuery.data?.results]);

  const confirmedPayments = useMemo(() => {
    const s = (v: unknown) => String(v || '').toLowerCase();
    return allPayments.filter((p) => {
      const st = s(p.status);
      return st === 'paid' || st === 'released';
    });
  }, [allPayments]);

  const uniqueLocations = useMemo(() => {
    const locs = confirmedPayments
      .map((p) => extractLocation(p))
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    return Array.from(new Set(locs)).sort();
  }, [confirmedPayments]);

  const uniquePfis = useMemo(() => {
    const pfis = confirmedPayments
      .map((p) => extractPfi(p))
      .map((s) => String(s || '').trim())
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    return Array.from(new Set(pfis)).sort();
  }, [confirmedPayments]);

  // If the currently selected PFI is no longer present (data changed), clear it.
  useMemo(() => {
    if (pfiFilter && !uniquePfis.includes(String(pfiFilter).trim())) {
      setPfiFilter(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniquePfis]);

  const filtered = useMemo(() => {
    return confirmedPayments
      .filter((p) => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        const ref = String(getOrderReference(p) || p.reference || p.id || '').toLowerCase();
        const company = extractCustomerCompany(p).toLowerCase();
        const location = extractLocation(p).toLowerCase();
        const pfi = extractPfi(p).toLowerCase();
        return ref.includes(q) || company.includes(q) || location.includes(q) || pfi.includes(q);
      })
      .filter((p) => {
        if (!filterType) return true;
        const d = getPaymentDate(p);
        if (filterType === 'today') return isToday(d);
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
        if (!pfiFilter) return true;
        return extractPfi(p) === String(pfiFilter).trim();
      });
  }, [confirmedPayments, filterType, locationFilter, searchQuery, pfiFilter]);

  const summary = useMemo(() => {
    const totalOrders = filtered.length;
    const totalAmount = filtered.reduce((sum, p) => sum + safeToNumber(p.total_price ?? p.amount), 0);
    const totalQty = filtered.reduce((sum, p) => sum + extractPaidQtyNumber(p), 0);

    const avgAmount = totalOrders > 0 ? totalAmount / totalOrders : 0;
    const avgPricePerLitre = totalQty > 0 ? totalAmount / totalQty : 0;

    return { totalOrders, totalAmount, totalQty, avgAmount, avgPricePerLitre };
  }, [filtered]);

  const exportToCSV = () => {
    const generatedAt = new Date().toLocaleString('en-GB');

    const locationLabel = locationFilter ? locationFilter : 'All Locations';
    const pfiLabelForExport = pfiFilter ? pfiFilter : 'All PFIs';

    const uniqueProductsInExport = Array.from(
      new Set(
        filtered
          .map((p) => extractProductInfo(p).product)
          .map((s) => String(s || '').trim())
          .filter(Boolean)
      )
    );
    const productLabel =
      uniqueProductsInExport.length === 0
        ? '—'
        : uniqueProductsInExport.length === 1
          ? uniqueProductsInExport[0]
          : 'Multiple';

    const totalQtyAll = filtered.reduce((sum, p) => sum + extractPaidQtyNumber(p), 0);

    const ordersCountAll = filtered.length;

    const totalAmountAll = filtered.reduce((sum, p) => sum + safeToNumber(p.total_price ?? p.amount), 0);

    const headingBlock: Array<Array<string>> = [
      ['Date', generatedAt],
      ['Location', locationLabel],
      ['PFI', pfiLabelForExport],
      ['Product', productLabel],
      ['Quantity Sold', `${totalQtyAll.toLocaleString()} Litres`],
      ['Number of Trucks Sold', String(ordersCountAll)],
      ['Total Amount', `N ${totalAmountAll.toLocaleString()}`],
      [],
    ];

    const headers = ['S/N', 'Date', 'Reference', 'Company', 'Truck No.', 'Location', 'Product', 'Qty (L)', 'Price', 'Amount', 'Remarks'];
    const rows = filtered.map((p, idx) => {
      const d = getPaymentDate(p);
      const date = Number.isNaN(d.getTime()) ? '' : format(d, 'dd/MM/yyyy HH:mm');
      const ref = getOrderReference(p) || p.reference || p.id;
      const company = extractCustomerCompany(p);
      const truckNo = extractTruckNumber(p);
      const location = extractLocation(p);
      const { product, qty, unitPrice } = extractProductInfo(p);
      const amount = safeToNumber(p.total_price ?? p.amount).toLocaleString();
      const narration = (p.payment_narration ?? p.narration ?? '') as string;
      return [String(idx + 1), date, String(ref ?? ''), company, truckNo, location, product, qty, unitPrice, amount, String(narration || '')];
    });

    const csvLines = [...headingBlock, headers, ...rows]
      .map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvLines], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `confirmed_payments_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Payments Report"
              actions={
                <Button variant="default" className="gap-2" onClick={exportToCSV}>
                  <Download className="h-4 w-4" />
                  Download Report
                </Button>
              }
            />

            <SummaryCards
              cards={[
                {
                  title: 'Total Orders',
                  value: isLoading ? '…' : summary.totalOrders.toLocaleString(),
                  // description: 'According to filters',
                  icon: <ShoppingCart className="h-4 w-4" />,
                  tone: 'neutral',
                },
                {
                  title: 'Total Quantity',
                  value: isLoading ? '…' : `${summary.totalQty.toLocaleString()} L`,
                  // description: 'According to filters',
                  icon: <Droplets className="h-4 w-4" />,
                  tone: 'neutral',
                },
                {
                  title: 'Total Amount',
                  value: isLoading ? '…' : `₦${summary.totalAmount.toLocaleString()}`,
                  // description: 'According to filters',
                  icon: <Banknote className="h-4 w-4" />,
                  tone: 'neutral',
                },
              ]}
            />

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 items-center">
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      placeholder="Search by company, location, PFI…"
                      className="pl-10 h-11"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <select
                    aria-label="PFI filter"
                    className="h-11 w-full border border-slate-300 rounded-md bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    value={pfiFilter ?? ''}
                    onChange={(e) => setPfiFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">Select PFI</option>
                    {uniquePfis.map((pfi) => (
                      <option key={pfi} value={pfi}>
                        {pfi}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S/N</TableHead>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Truck No.</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(6)].map((_, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Skeleton className="h-4 w-10" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="h-4 w-24 ml-auto" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-44" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center h-24 text-slate-500">
                        No confirmed payments found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((p, idx) => {
                      const d = getPaymentDate(p);
                      const createdText = Number.isNaN(d.getTime())
                        ? '—'
                        : `${d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
                      const ref = getOrderReference(p) || p.reference || p.id;
                      const pfi = extractPfi(p);
                      const company = extractCustomerCompany(p);
                      const truckNo = extractTruckNumber(p);
                      const location = extractLocation(p);
                      const { product, qty, unitPrice } = extractProductInfo(p);

                      return (
                        <TableRow key={p.id}>
                          <TableCell className="text-slate-700">{idx + 1}</TableCell>
                          <TableCell>{createdText}</TableCell>
                          <TableCell className="font-semibold text-slate-950">{ref}</TableCell>
                          <TableCell className="max-w-[240px] truncate" title={company || undefined}>
                            {company || '—'}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate" title={truckNo || undefined}>
                            {truckNo || '—'}
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate" title={location || undefined}>
                            {location || '—'}
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate" title={product || undefined}>
                            {product || '—'}
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate" title={String(qty) || undefined}>
                            {qty ? `${qty} Litres` : '—'}
                          </TableCell>
                          <TableCell>{unitPrice ? `₦${unitPrice}` : '—'}</TableCell>
                          <TableCell className="text-right font-semibold text-slate-950">
                            ₦{safeToNumber(p.total_price ?? p.amount).toLocaleString()}
                          </TableCell>
                          <TableCell className="max-w-[320px] truncate" title={String(p.payment_narration || '') || undefined}>
                            {p.payment_narration ? String(p.payment_narration) : 'No remarks'}
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
  );
}
