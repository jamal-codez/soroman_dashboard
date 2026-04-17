import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, isThisWeek, isThisMonth, isThisYear, isToday, isYesterday, addDays, isAfter, isBefore, isSameDay, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Download,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  BadgeDollarSign,
  CheckIcon,
  FuelIcon,
  HourglassIcon,
  Hourglass,
  DollarSign,
  Truck,
  CalendarDays,
  Phone,
  PhoneOutgoingIcon,
  User,
  UserCircle2,
  User2,
  X,
} from 'lucide-react';
import { apiClient, fetchAllPages } from '@/api/client';
import { shouldAutoCancel } from '@/lib/orderTimers';
import { getOrderReference } from '@/lib/orderReference';
import { PageHeader } from '@/components/PageHeader';

interface Order {
  id: number;
  user: Record<string, unknown>;
  total_price?: string | number;
  status: string;
  created_at: string;
  products: Array<{ name?: string }>;
  quantity?: number | string;
  release_type?: 'pickup' | 'delivery';
  reference?: string;
  state?: string;
  customer_details?: Record<string, unknown>;
  truck_number?: string;
  driver_name?: string;
  driver_phone?: string;
  meta?: Record<string, unknown>;
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  assigned_agent?: unknown;
  agent?: unknown;
  assignedAgent?: unknown;

  // New serializer fields
  assigned_agent_id?: number | null;

  // Backend PFI fields
  pfi_id?: number | null;
  pfi_number?: string | null;
}

interface OrderResponse {
  count: number;
  results: Order[];
}

const statusDisplayMap: Record<string, string> = {
  pending: 'Pending',
  paid: 'Released',
  canceled: 'Canceled',
  released: 'Loaded'
};

const getStatusText = (status: string) => statusDisplayMap[status.toLowerCase()] || status;

const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid': return <FuelIcon className="text-green-500" size={14} />;
    case 'pending': return <Hourglass className="text-orange-500" size={14} />;
    case 'canceled': return <AlertCircle className="text-red-600" size={14} />;
    case 'released': return <Truck className="text-blue-600" size={14} />;
    default: return <FuelIcon className="text-blue-500" size={14} />;
  }
};

const getStatusClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'canceled': return 'bg-red-50 text-red-700 border-red-200';
    case 'released': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'loaded': return 'bg-purple-50 text-purple-700 border-purple-200';
    default: return 'bg-gray-50 text-gray-700 border-gray-200';
  }
};

const extractUnitPrice = (order: Order): string => {
  const p = order.products?.[0] as Record<string, unknown> | undefined;
  const o = order as unknown as Record<string, unknown>;
  const raw =
    (p && (p.unit_price ?? p.unitPrice ?? p.price)) ||
    (o.unit_price as unknown) ||
    (o.unit_price_per_litre as unknown) ||
    (o.unit_price_per_liter as unknown) ||
    (o.price_per_litre as unknown) ||
    (o.price_per_liter as unknown);
  if (raw === undefined || raw === null || raw === '') return '';
  const n = Number(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const Orders = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today'|'yesterday'|'week'|'month'|'year'|null>(null);
  const [productFilter, setProductFilter] = useState<string|null>(null);
  const [locationFilter, setLocationFilter] = useState<string|null>(null);
  const [statusFilter, setStatusFilter] = useState<string|null>(null);
  const [pfiFilter, setPfiFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });

  const hasAnyFilter = !!(searchQuery || filterType || dateRange.from || productFilter || locationFilter || statusFilter || pfiFilter);
  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterType(null);
    setDateRange({ from: null, to: null });
    setProductFilter(null);
    setLocationFilter(null);
    setStatusFilter(null);
    setPfiFilter(null);
  };

  // Keep the Orders table fast on initial load.
  // Export still uses the full (backend-paginated) dataset.
  const PAGE_SIZE = 10000;
  const [page, setPage] = useState(1);

  const { data: apiResponse, isLoading, isError, error } = useQuery<OrderResponse>({
    queryKey: ['all-orders'],
    queryFn: async () => {
      return fetchAllPages<Order>(
        (p) => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size }),
      );
    },
    retry: 2,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // If there are pending orders, poll so backend auto-cancel is reflected quickly.
    refetchInterval: (q) => {
      const data = q.state.data as OrderResponse | undefined;
      const hasPending = Boolean((data?.results || []).some((o) => (o.status || '').toLowerCase() === 'pending'));
      return hasPending ? 60_000 : false;
    },
  });

  const autoCancelInFlight = useRef<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const runAutoCancel = async (orders: Order[]) => {
    const eligible = orders.filter((o) => {
      if (autoCancelInFlight.current.has(o.id)) return false;
      return shouldAutoCancel({ status: o.status, created_at: o.created_at });
    });

    if (!eligible.length) return;

    for (const o of eligible) {
      autoCancelInFlight.current.add(o.id);
      try {
        await apiClient.admin.cancleOrder(o.id);
      } catch {
        // ignore
      }
    }

    // Refresh list so UI shows canceled
    await queryClient.invalidateQueries({ queryKey: ['all-orders'] });
  };

  useEffect(() => {
    const list = apiResponse?.results || [];
    if (!list.length) return;
    void runAutoCancel(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiResponse?.results]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const list = apiResponse?.results || [];
      if (!list.length) return;
      void runAutoCancel(list);
    }, 5 * 60 * 1000);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiResponse?.results]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value.toLowerCase());
  };

  const uniqueProducts = useMemo(() => {
    const names = (apiResponse?.results ?? []).flatMap(o => o.products.map(p => p.name)).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [apiResponse?.results]);

  const uniqueLocations = useMemo(() => {
    const states = (apiResponse?.results ?? []).map(o => o.state).filter(Boolean);
    return Array.from(new Set(states)).sort();
  }, [apiResponse?.results]);

  const pfiLabel = (order: Order): string => {
    if (order.pfi_number === undefined || order.pfi_number === null) return '';
    return String(order.pfi_number).trim();
  };

  const uniquePfis = useMemo(() => {
    const pfis: string[] = (apiResponse?.results ?? [])
      .map((o) => pfiLabel(o))
      .filter((v): v is string => Boolean(v));
    return Array.from(new Set(pfis)).sort((a, b) => a.localeCompare(b));
  }, [apiResponse?.results]);

  const filteredOrders = useMemo(() => {
    const base = apiResponse?.results || [];
    return base
      .filter(order => {
        const query = searchQuery.trim();
        if (!query) return true;
        const q = query.toLowerCase();
        const name = `${order.user?.first_name ?? ''} ${order.user?.last_name ?? ''}`.toLowerCase();
        const ref = getOrderReference(order).toLowerCase();
        const truck = String(order.truck_number || order.customer_details?.truckNumber || order.customer_details?.truck_number || '').toLowerCase();
        const driverName = String(order.driver_name || order.customer_details?.driverName || order.customer_details?.driver_name || '').toLowerCase();
        const inId = String(order.id).includes(q);
        const inName = name.includes(q);
        const inProducts = order.products.some(p => String(p.name ?? '').toLowerCase().includes(q));
        const inReleaseType = String(order.release_type ?? '').toLowerCase().includes(q);
        const inState = order.state ? String(order.state).toLowerCase().includes(q) : false;
        const inRef = ref.includes(q);
        const inTruck = truck.includes(q);
        const inDriver = driverName.includes(q);

        return inId || inName || inProducts || inReleaseType || inState || inRef || inTruck || inDriver;
      })
      .filter(order => {
        if (dateRange.from && dateRange.to) {
          const orderDate = new Date(order.created_at);
          // Inclusive range
          return (
            (isSameDay(orderDate, dateRange.from) || isAfter(orderDate, dateRange.from)) &&
            (isSameDay(orderDate, dateRange.to) || isBefore(orderDate, addDays(dateRange.to, 1)))
          );
        }
        return true;
      })
      .filter(order => {
        if (!filterType) return true;
        const d = new Date(order.created_at);
        if (filterType === 'today') return isToday(d);
        if (filterType === 'yesterday') return isYesterday(d);
        if (filterType === 'week') return isThisWeek(d);
        if (filterType === 'month') return isThisMonth(d);
        if (filterType === 'year') return isThisYear(d);
        return true;
      })
      .filter(order => {
        if (!productFilter) return true;
        return order.products.some(p => p.name === productFilter);
      })
      .filter(order => {
        if (!locationFilter) return true;
        return order.state === locationFilter;
      })
      .filter(order => {
        if (!statusFilter) return true;
        return (order.status || '').toLowerCase() === statusFilter.toLowerCase();
      })
      .filter((order) => {
        if (!pfiFilter) return true;
        return pfiLabel(order) === pfiFilter;
      });
  }, [apiResponse?.results, searchQuery, filterType, dateRange, productFilter, locationFilter, statusFilter, pfiFilter]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  }, [filteredOrders.length]);

  const pagedOrders = useMemo(() => {
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, page, totalPages]);

  // Reset to first page whenever filters/search change (avoids landing on an out-of-range page)
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterType, dateRange, productFilter, locationFilter, statusFilter, pfiFilter]);

  // Keep page clamped when totalPages changes (e.g., after filtering)
  useEffect(() => {
    setPage((p) => Math.min(Math.max(p, 1), totalPages));
  }, [totalPages]);

  const safeParseNumber = (v: unknown) => {
    if (v == null) return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const str = String(v).trim();
    const cleaned = str.replace(/[^0-9.-]+/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  const filteredOrdersForSummary = useMemo(() => {
    // Reuse the exact same filters as the main table so totals always match what the user sees,
    // including PFI/status filters.
    return filteredOrders;
  }, [filteredOrders]);

  const releasedFilteredOrders = useMemo(() => {
    // Include PAID, RELEASED, and LOADED orders (all confirmed).
    const s = (v: unknown) => String(v || '').toLowerCase();
    return filteredOrdersForSummary.filter((o) => {
      const status = s(o.status);
      return status === 'paid' || status === 'released' || status === 'loaded';
    });
  }, [filteredOrdersForSummary]);

  const canceledFilteredOrders = useMemo(() => {
    return filteredOrdersForSummary.filter((o) => (o.status || '').toLowerCase() === 'canceled');
  }, [filteredOrdersForSummary]);

  const releasedTotals = useMemo(() => {
    const totalQty = releasedFilteredOrders.reduce((acc, o) => acc + safeParseNumber(o.quantity), 0);
    const totalAmount = releasedFilteredOrders.reduce((acc, o) => acc + safeParseNumber(o.total_price), 0);
    return { totalQty, totalAmount, totalOrders: releasedFilteredOrders.length };
  }, [releasedFilteredOrders]);

  const canceledTotals = useMemo(() => {
    const totalQty = canceledFilteredOrders.reduce((acc, o) => acc + safeParseNumber(o.quantity), 0);
    const totalAmount = canceledFilteredOrders.reduce((acc, o) => acc + safeParseNumber(o.total_price), 0);
    return { totalQty, totalAmount, totalOrders: canceledFilteredOrders.length };
  }, [canceledFilteredOrders]);

  const getSalesRef = (o: Order) => getOrderReference(o);

  const getCustomerFullName = (o: Order): string => {
    const cd = o.customer_details as Record<string, unknown> | undefined;
    const user = o.user as Record<string, unknown> | undefined;
    const cdName = cd && typeof cd.name === 'string' ? cd.name : '';
    if (cdName) return cdName;
    const first = user && typeof user.first_name === 'string' ? user.first_name : '';
    const last = user && typeof user.last_name === 'string' ? user.last_name : '';
    return [first, last].filter(Boolean).join(' ').trim();
  };

  const getCompanyName = (o: Order): string => {
    const cd = o.customer_details as Record<string, unknown> | undefined;
    const user = o.user as Record<string, unknown> | undefined;
    return (
      (cd && typeof cd.companyName === 'string' ? cd.companyName : '') ||
      (user && typeof user.companyName === 'string' ? user.companyName : '') ||
      (user && typeof user.company_name === 'string' ? user.company_name : '') ||
      ''
    );
  };

  const getPhoneNumber = (o: Order): string => {
    const cd = o.customer_details as Record<string, unknown> | undefined;
    const user = o.user as Record<string, unknown> | undefined;
    return (
      (cd && typeof cd.phone === 'string' ? cd.phone : '') ||
      (user && typeof user.phone_number === 'string' ? user.phone_number : '') ||
      (user && typeof user.phone === 'string' ? user.phone : '') ||
      ''
    );
  };

  const getEmail = (o: Order): string => {
    const cd = o.customer_details as Record<string, unknown> | undefined;
    const user = o.user as Record<string, unknown> | undefined;
    return (
      (cd && typeof cd.email === 'string' ? cd.email : '') ||
      (user && typeof user.email === 'string' ? user.email : '') ||
      ''
    );
  };

  const getTruckNumber = (o: Order) =>
    o.customer_details?.truckNumber || o.customer_details?.truck_number || o.truck_number || '';

  const getDriverName = (o: Order) =>
    o.customer_details?.driverName || o.customer_details?.driver_name || o.driver_name || '';

  const getDriverPhone = (o: Order) => {
    const rec = o as unknown as Record<string, unknown>;
    const direct = rec.driver_phone;
    return (
      o.customer_details?.driverPhone ||
      o.customer_details?.driver_phone ||
      (typeof direct === 'string' ? direct : '') ||
      ''
    );
  };

  const getProductsList = (o: Order) =>
    (o.products || []).map(p => p.name).filter(Boolean).join(', ');

  const getFilterLabelForFile = () => {
    switch (filterType) {
      case 'today': return 'today';
      case 'week': return 'this-week';
      case 'month': return 'this-month';
      case 'year': return 'this-year';
      default: return 'all';
    };
  };

  const getStatusLabelForFile = () => {
    if (!statusFilter) return 'all-statuses';
    return String(statusFilter).toLowerCase().replace(/\s+/g, '-');
  };

  const exportToExcel = () => {
    if (!apiResponse?.results) return;

    const headers = [
      'S/N',
      'Date',
      'Order Reference',
      'Customer',
      'Customer\'s Contact',
      'Location',
      'PFI',
      'Product',
      'Unit Price',
      'Quantity (L)',
      'Amount Paid (N)',
      'Status',
    ];

    const exportList = [...filteredOrders].reverse();

    const rows = exportList.map((order, idx) => [
      idx + 1,
      format(new Date(order.created_at), 'dd-MM-yyyy'),
      getSalesRef(order),
      getCompanyName(order),
      getPhoneNumber(order),
      order.state || '-',
      pfiLabel(order) || '-',
      getProductsList(order),
      extractUnitPrice(order),
      safeParseNumber(order.quantity).toLocaleString(),
      safeParseNumber(order.total_price).toLocaleString(),
      getStatusText(order.status),
    ]);

    const generatedAt = format(new Date(), 'dd-MM-yyyy');

    const locationLabel = locationFilter ? String(locationFilter) : 'All';
    const pfiLabelForExport = pfiFilter ? String(pfiFilter) : 'All';
    const productLabel = productFilter ? String(productFilter) : 'All';

    const totalQtyAll = exportList.reduce((acc, o) => acc + safeParseNumber(o.quantity), 0);
    const totalAmountAll = exportList.reduce((acc, o) => acc + safeParseNumber(o.total_price), 0);
    const ordersCountAll = exportList.length;

    // Summary block at the top of the sheet
    const summaryBlock: (string | number)[][] = [
      ['Date', generatedAt],
      ['Location', locationLabel],
      ['PFI', pfiLabelForExport],
      ['Product', productLabel],
      ['Total Orders', ordersCountAll],
      ['Quantity Sold', `${totalQtyAll.toLocaleString()} Litres`],
      ['Total Amount', `N${totalAmountAll.toLocaleString()}`],
      [], // empty row separator
    ];

    const sheetData = [...summaryBlock, headers, ...rows];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');

    // Build filename: ORDERS_REPORT or ORDERS_REPORT_PFI-XXXXX
    let fileName = 'SALES-REPORT';
    if (pfiFilter) {
      const sanitized = String(pfiFilter).replace(/[^A-Za-z0-9_-]/g, '-').toUpperCase();
      fileName = `REPORT-${sanitized}`;
    }

    XLSX.writeFile(wb, `${fileName}.xlsx`);
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
              title="All Orders"
              description="Search, filter and manage all customer orders from creation to release."
              actions={
                <Button onClick={exportToExcel}>
                  <Download className="mr-1" size={16} /> Download Report
                </Button>
              }
            />

            {/* Summary and Filters */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6 space-y-3">
              {/* Row 1: Search */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type="text"
                    placeholder="Search orders by name, reference, product, location…"
                    className="pl-10"
                    value={searchQuery}
                    onChange={handleSearch}
                  />
                </div>
              </div>

              {/* Row 2: Filter dropdowns */}
              <div className="flex flex-row gap-3 flex-wrap items-end pt-2 border-t border-slate-100">
                {/* Timeframe */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Timeframe</label>
                  <select
                    aria-label="Timeframe filter"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={filterType ?? ''}
                    onChange={(e) => {
                      const v = e.target.value as ''|'today'|'yesterday'|'week'|'month'|'year';
                      setFilterType(v === '' ? null : v);
                      if (v !== '') setDateRange({ from: null, to: null });
                    }}
                  >
                    <option value="">All Time</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="year">This Year</option>
                  </select>
                </div>

                {/* Date Range */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Date Range</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-9 justify-start text-left font-normal text-sm min-w-[200px]">
                        <CalendarDays size={14} className="mr-2 text-slate-400" />
                        {dateRange.from && dateRange.to
                          ? `${format(dateRange.from, 'dd MMM')} – ${format(dateRange.to, 'dd MMM yyyy')}`
                          : 'Pick date range'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={(range) => {
                          setDateRange(range as { from: Date | null; to: Date | null });
                          if (range?.from) setFilterType(null);
                        }}
                        numberOfMonths={2}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Status */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Status</label>
                  <select
                    aria-label="Status filter"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={statusFilter ?? ''}
                    onChange={(e) => setStatusFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="released">Released</option>
                    <option value="loaded">Loaded</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </div>

                {/* Product */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Product</label>
                  <select
                    aria-label="Product filter"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={productFilter ?? ''}
                    onChange={(e) => setProductFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Products</option>
                    {uniqueProducts.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Location</label>
                  <select
                    aria-label="Location filter"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={locationFilter ?? ''}
                    onChange={(e) => setLocationFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Locations</option>
                    {uniqueLocations.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* PFI */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">PFI</label>
                  <select
                    aria-label="PFI filter"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={pfiFilter ?? ''}
                    onChange={(e) => setPfiFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All PFIs</option>
                    {uniquePfis.length === 0 ? (
                      <option value="" disabled>No PFI data yet</option>
                    ) : (
                      uniquePfis.map((pfi) => (
                        <option key={pfi} value={pfi}>{pfi}</option>
                      ))
                    )}
                  </select>
                </div>

                {/* Clear all */}
                {hasAnyFilter && (
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs text-slate-500 hover:text-slate-700 h-9"
                      onClick={clearAllFilters}
                    >
                      <X size={13} /> Clear all
                    </Button>
                  </div>
                )}
              </div>

              {/* Totals (unchanged) */}
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-1">
                {/* Released */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-100">
                        <Truck className="text-blue-700" size={16} />
                      </span>
                      Order Summary
                    </div>
                    {/* <div className="text-xs text-slate-500">Summary</div> */}
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div className="rounded-md bg-white p-3 border border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-500">Orders</div>
                        <CheckCircle className="text-blue-600" size={16} />
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">{releasedTotals.totalOrders}</div>
                    </div>
                    <div className="rounded-md bg-white p-3 border border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-500">Quantity</div>
                        <FuelIcon className="text-blue-600" size={16} />
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        {releasedTotals.totalQty.toLocaleString()}{' '}
                        <span className="text-sm font-medium text-slate-600">Ltrs</span>
                      </div>
                    </div>
                    <div className="rounded-md bg-white p-3 border border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-500">Amount</div>
                        <BadgeDollarSign className="text-blue-600" size={16} />
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">₦{releasedTotals.totalAmount.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
              <Table className="text-sm min-w-[1200px]">
                <TableHeader>
                  <TableRow className="bg-slate-50/80 [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-sm [&>th]:font-semibold [&>th]:text-slate-600">
                    <TableHead className="text-center w-[40px]">#</TableHead>
                    <TableHead className="w-[75px]">Date</TableHead>
                    <TableHead className="w-[110px]">Reference</TableHead>
                    <TableHead className="w-[180px]">Customer</TableHead>
                    <TableHead className="w-[120px]">Contact</TableHead>
                    <TableHead className="w-[100px]">Location</TableHead>
                    <TableHead className="w-[110px]">Product</TableHead>
                    <TableHead className="w-[85px]">Unit Price</TableHead>
                    <TableHead className="w-[75px]">Quantity</TableHead>
                    <TableHead className="w-[100px]">Amount</TableHead>
                    <TableHead className="w-[90px]">PFI</TableHead>
                    <TableHead className="w-[90px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedOrders.map((order, idx) => {
                    const status = (order.status || '').toLowerCase();
                    const autoCanceled =
                      status === 'canceled' &&
                      shouldAutoCancel({ status: 'pending', created_at: order.created_at });
                    const serial = filteredOrders.length - ((page - 1) * PAGE_SIZE + idx);
                    const isEven = idx % 2 === 0;

                    return (
                      <TableRow key={order.id} className={`hover:bg-blue-50/40 transition-colors ${isEven ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <TableCell className="px-3 text-slate-400 text-center text-sm">{serial}</TableCell>

                        <TableCell className="px-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-slate-900">
                            {format(new Date(order.created_at), 'dd/MM/yy')}
                          </div>
                          <div className="text-xs text-slate-400">
                            {format(new Date(order.created_at), 'HH:mm')}
                          </div>
                        </TableCell>

                        <TableCell className="px-3 text-black whitespace-nowrap" title={getSalesRef(order)}>
                          {getSalesRef(order) || '-'}
                        </TableCell>

                        <TableCell className="px-3 max-w-[180px]">
                          <div className="leading-snug">
                            <div className="font-semibold text-sm text-slate-900 truncate">
                              {getCompanyName(order) || '-'}
                            </div>
                            <div className="inline-flex items-center gap-1 text-xs uppercase text-slate-500">
                              <User2 size={10} className="text-emerald-500 shrink-0" />
                              <span>{getCustomerFullName(order) || '-'}</span>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="px-3">
                          <div>
                            {getPhoneNumber(order) ? (
                              <a
                                href={`tel:${getPhoneNumber(order)}`}
                                className="inline-flex items-center gap-1 text-sm font-medium text-slate-800 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <PhoneOutgoingIcon size={10} className="text-emerald-500 shrink-0" />
                                <span>{getPhoneNumber(order)}</span>
                              </a>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                            {getEmail(order) ? (
                              <a
                                href={`mailto:${getEmail(order)}`}
                                className="block text-xs text-blue-600 hover:underline truncate max-w-[110px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {getEmail(order).toLowerCase()}
                              </a>
                            ) : null}
                          </div>
                        </TableCell>

                        <TableCell className="px-3 text-sm text-slate-600">
                          {order.state || '-'}
                        </TableCell>

                        <TableCell className="px-3 text-sm text-slate-600">
                          {getProductsList(order) || '-'}
                        </TableCell>

                        <TableCell className="px-3 font-medium text-slate-800 whitespace-nowrap">
                          ₦{extractUnitPrice(order)}
                        </TableCell>

                        <TableCell className="px-3 font-medium text-slate-800 whitespace-nowrap">
                          {safeParseNumber(order.quantity).toLocaleString()} Litres
                        </TableCell>

                        <TableCell className="px-3 font-bold text-slate-900 whitespace-nowrap">
                          ₦{safeParseNumber(order.total_price).toLocaleString()}
                        </TableCell>

                        <TableCell className="px-3 text-sm text-slate-600 truncate" title={pfiLabel(order) || ''}>
                          {pfiLabel(order) || '-'}
                        </TableCell>

                        <TableCell className="px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-sm font-medium border rounded-md whitespace-nowrap ${getStatusClass(order.status)}`}
                          >
                            {getStatusIcon(order.status)}
                            {getStatusText(order.status)}
                          </span>
                          {autoCanceled && (
                            <div className="text-xs text-slate-400 mt-0.5">12h expired</div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredOrders.length === 0 && !isLoading && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-slate-500 py-10">
                        No orders found for the selected filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 bg-white px-4 py-3">
                <div className="text-sm text-slate-600">
                  Showing{' '}
                  <span className="font-medium text-slate-900">
                    {filteredOrders.length === 0
                      ? 0
                      : (page - 1) * PAGE_SIZE + 1}
                  </span>
                  {' '}–{' '}
                  <span className="font-medium text-slate-900">
                    {Math.min(page * PAGE_SIZE, filteredOrders.length)}
                  </span>
                  {' '}of <span className="font-medium text-slate-900">{filteredOrders.length}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <div className="text-sm text-slate-700 whitespace-nowrap">
                    Page <span className="font-medium text-slate-900">{page}</span> of{' '}
                    <span className="font-medium text-slate-900">{totalPages}</span>
                  </div>
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>

            {isError && (
              <div className="mt-4 text-red-600">
                {(error as Error)?.message || 'Failed to load orders.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Orders;
