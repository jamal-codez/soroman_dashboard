import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, isThisWeek, isThisMonth, isThisYear, isToday, addDays, isAfter, isBefore, isSameDay, parseISO } from 'date-fns';
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
  CalendarDays
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { shouldAutoCancel } from '@/lib/orderTimers';
import { getOrderReference } from '@/lib/orderReference';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

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
    default: return 'bg-gray-50 text-blue-700 border-blue-200';
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
  const [filterType, setFilterType] = useState<'today'|'week'|'month'|'year'|null>(null);
  const [productFilter, setProductFilter] = useState<string|null>(null);
  const [locationFilter, setLocationFilter] = useState<string|null>(null);
  const [statusFilter, setStatusFilter] = useState<string|null>(null);
  const [pfiFilter, setPfiFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  // const [agentFilter, setAgentFilter] = useState<string|null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPfiId, setAssignPfiId] = useState<number | ''>('');
  const [assignBusy, setAssignBusy] = useState(false);

  const PAGE_SIZE = 500;
  const [page, setPage] = useState(1);

  const { data: apiResponse, isLoading, isError, error } = useQuery<OrderResponse>({
    queryKey: ['all-orders'],
    queryFn: async () => {
      // Backend is paginated; default responses cap the number of records returned.
      // Pull all pages so the UI can show/export the complete dataset.
      const page_size = 200;
      let page = 1;
      let count = 0;
      const all: Order[] = [];

      // Safety limit to prevent accidental infinite loops if API shape changes.
      const MAX_PAGES = 5000;

      while (page <= MAX_PAGES) {
        const response = await apiClient.admin.getAllAdminOrders({ page, page_size });

        const results = (response?.results ?? []) as Order[];
        count = Number(response?.count ?? count ?? 0);

        all.push(...results);

        // Stop when API returns fewer than page_size (last page)
        // or when we've reached/exceeded total count.
        if (results.length < page_size) break;
        if (count && all.length >= count) break;

        page += 1;
      }

      return { count: count || all.length, results: all };
    },
    retry: 2,
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
  }, [apiResponse?.results, searchQuery, dateRange, productFilter, locationFilter, statusFilter, pfiFilter]);

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
  }, [searchQuery, dateRange, productFilter, locationFilter, statusFilter, pfiFilter]);

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
    return filteredOrdersForSummary.filter((o) => (o.status || '').toLowerCase() === 'released');
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

  const exportToCSV = () => {
    if (!apiResponse?.results) return;

    const headers = [
      'S/N',
      'Date & Time',
      'Order Reference',
      'Customer Name',
      'Phone Number',
      'Company Name',
      'Location',
      'Product',
      'Unit Price',
      'Quantity (L)',
      'Amount Paid (N)',
      'Status',
    ];

    const exportList = [...filteredOrders].reverse();

    const rows = exportList.map((order, idx) => [
      idx + 1,
      format(new Date(order.created_at), 'dd-MM-yyyy HH:mm'),
      getSalesRef(order),
      getCustomerFullName(order),
      getPhoneNumber(order),
      getCompanyName(order),
      order.state || '-',
      getProductsList(order),
      extractUnitPrice(order),
      safeParseNumber(order.quantity).toLocaleString(),
      safeParseNumber(order.total_price).toLocaleString(),
      getStatusText(order.status),
    ]);

    const generatedAt = format(new Date(), 'dd-MM-yyyy HH:mm');

    const locationLabel = locationFilter ? String(locationFilter) : 'All';
    const pfiLabelForExport = pfiFilter ? String(pfiFilter) : 'All';
    const productLabel = productFilter ? String(productFilter) : 'All';

    const totalQtyAll = exportList.reduce((acc, o) => acc + safeParseNumber(o.quantity), 0);
    const totalAmountAll = exportList.reduce((acc, o) => acc + safeParseNumber(o.total_price), 0);
    const ordersCountAll = exportList.length;

    // Headings block (must start the CSV)
    const headingBlock = [
      ['Date Generated', generatedAt],
      ['Location', locationLabel],
      ['PFI', pfiLabelForExport],
      ['Product', productLabel],
      ['Quantity Sold', `${totalQtyAll.toLocaleString()} Litres`],
      ['Number of Trucks Sold', String(ordersCountAll)],
      ['Total Amount', `${totalAmountAll.toLocaleString()} Naira`],
      [],
    ];

    const csvRows = [...headingBlock, headers, ...rows];

    const csvContent = csvRows
      .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Orders_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const pfiQuery = useQuery<{ results?: Array<{ id: number; pfi_number: string }> } & Record<string, unknown>>({
    queryKey: ['pfis', 'active'],
    queryFn: async () => apiClient.admin.getPfis({ status: 'active', page: 1, page_size: 500 }),
    staleTime: 60_000,
    retry: 1,
  });

  const pfiOptions = useMemo(() => {
    const raw = (pfiQuery.data as any)?.results ?? (Array.isArray(pfiQuery.data) ? pfiQuery.data : []);
    const list = (raw || []) as Array<{ id: number; pfi_number: string }>;
    return list
      .filter((p) => p && typeof p.id === 'number' && typeof p.pfi_number === 'string')
      .map((p) => ({ id: p.id, label: p.pfi_number }));
  }, [pfiQuery.data]);

  const visibleOrderIds = useMemo(() => pagedOrders.map((o) => o.id), [pagedOrders]);
  const allVisibleSelected = useMemo(() => {
    if (visibleOrderIds.length === 0) return false;
    return visibleOrderIds.every((id) => selectedOrderIds.has(id));
  }, [visibleOrderIds, selectedOrderIds]);

  const someVisibleSelected = useMemo(() => {
    return visibleOrderIds.some((id) => selectedOrderIds.has(id));
  }, [visibleOrderIds, selectedOrderIds]);

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        visibleOrderIds.forEach((id) => next.add(id));
      } else {
        visibleOrderIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  const toggleSelectOne = (orderId: number, checked: boolean) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  };

  const handleBulkAssign = async () => {
    if (assignPfiId === '' || typeof assignPfiId !== 'number') return;
    const order_ids = Array.from(selectedOrderIds);
    if (order_ids.length === 0) return;

    setAssignBusy(true);
    try {
      await apiClient.admin.assignOrdersToPfi({ order_ids, pfi_id: assignPfiId });
      setAssignOpen(false);
      setAssignPfiId('');
      setSelectedOrderIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ['all-orders'] });
    } finally {
      setAssignBusy(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">All Orders</h1>
              <div className="flex gap-2">
                <Button onClick={exportToCSV}>
                  <Download className="mr-1" size={16} /> Download Report
                </Button>
              </div>
            </div>

            {/* Summary and Filters */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col gap-3">

                <div className="flex flex-col lg:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      type="text"
                      placeholder="Search orders..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={handleSearch}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between h-11">
                        <span className="inline-flex items-center gap-2">
                          <CalendarDays size={16} className="text-slate-500" />
                          <span>
                            {dateRange.from && dateRange.to
                              ? `${format(dateRange.from, "dd MMM yyyy")} - ${format(dateRange.to, "dd MMM yyyy")}`
                              : "Select date range"}
                          </span>
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={(range) => setDateRange(range as { from: Date | null; to: Date | null })}
                        numberOfMonths={2}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  {/* <select
                    aria-label="Status filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={statusFilter ?? ''}
                    onChange={(e) => setStatusFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Released</option>
                    <option value="canceled">Canceled</option>
                    <option value="released">Loaded</option>
                  </select> */}

                  <select
                    aria-label="Product filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={productFilter ?? ''}
                    onChange={(e) => setProductFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">Select Product</option>
                    {uniqueProducts.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>

                  <select
                    aria-label="Location filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={locationFilter ?? ''}
                    onChange={(e) => setLocationFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">Select Location</option>
                    {uniqueLocations.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>

                  <select
                    aria-label="PFI filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={pfiFilter ?? ''}
                    onChange={(e) => setPfiFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">Select PFI</option>
                    {uniquePfis.length === 0 ? (
                      <option value="" disabled>
                        No PFI data yet
                      </option>
                    ) : (
                      uniquePfis.map((pfi) => (
                        <option key={pfi} value={pfi}>
                          {pfi}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-slate-600">
                  Selected: <span className="font-medium text-slate-900">{selectedOrderIds.size}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => setSelectedOrderIds(new Set())}
                    disabled={selectedOrderIds.size === 0}
                  >
                    Clear selection
                  </Button>

                  <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                    <DialogTrigger asChild>
                      <Button
                        className="h-10"
                        disabled={selectedOrderIds.size === 0}
                        onClick={() => setAssignOpen(true)}
                      >
                        Assign to PFI
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Assign orders to PFI</DialogTitle>
                        <DialogDescription>
                          Assign <span className="font-medium">{selectedOrderIds.size}</span> selected order(s) to an active PFI.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">PFI</label>
                        <select
                          aria-label="Select PFI"
                          className="w-full border border-gray-300 rounded px-3 py-2 h-11"
                          value={assignPfiId === '' ? '' : String(assignPfiId)}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAssignPfiId(v === '' ? '' : Number(v));
                          }}
                        >
                          <option value="">Select PFI</option>
                          {pfiOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        {pfiQuery.isError ? (
                          <div className="text-sm text-red-600">Failed to load PFIs</div>
                        ) : null}
                      </div>

                      <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assignBusy}>
                          Cancel
                        </Button>
                        <Button
                          onClick={handleBulkAssign}
                          disabled={assignBusy || assignPfiId === '' || selectedOrderIds.size === 0}
                        >
                          {assignBusy ? 'Assigning…' : 'Assign'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div> */}

              {/* Totals (unchanged) */}
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-1">
                {/* Loaded */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-100">
                        <Truck className="text-blue-700" size={16} />
                      </span>
                      Loaded Orders
                    </div>
                    <div className="text-xs text-slate-500">Summary</div>
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
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        ₦{releasedTotals.totalAmount.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="[&>th]:py-2 [&>th]:px-2">
                    <TableHead className="w-[44px]">
                      {/* <div className="flex items-center justify-center">
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={(v) => toggleSelectAllVisible(Boolean(v))}
                          aria-label="Select all visible orders"
                        />
                      </div> */}
                    </TableHead>
                    <TableHead className="w-[52px]">S/N</TableHead>
                    <TableHead className="w-[120px]">Date &amp; Time</TableHead>
                    <TableHead className="w-[120px]">Order Reference</TableHead>
                    <TableHead className="w-[170px]">Customer</TableHead>
                    <TableHead className="w-[140px]">Company</TableHead>
                    <TableHead className="w-[105px]">Location</TableHead>
                    <TableHead className="w-[150px]">Product</TableHead>
                    <TableHead className="w-[105px]">Unit Price</TableHead>
                    <TableHead className="w-[80px]">Qty (L)</TableHead>
                    <TableHead className="w-[105px]">Amount</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&>tr>td]:py-2 [&>tr>td]:px-2">
                  {pagedOrders.map((order, idx) => {
                    const status = (order.status || '').toLowerCase();
                    const autoCanceled =
                      status === 'canceled' &&
                      shouldAutoCancel({ status: 'pending', created_at: order.created_at });
                    const serial = filteredOrders.length - ((page - 1) * PAGE_SIZE + idx);

                    return (
                      <TableRow key={order.id}>
                        <TableCell>
                          {/* <div className="flex items-center justify-center">
                            <Checkbox
                              checked={selectedOrderIds.has(order.id)}
                              onCheckedChange={(v) => toggleSelectOne(order.id, Boolean(v))}
                              aria-label={`Select order ${order.id}`}
                            />
                          </div> */}
                        </TableCell>
                        <TableCell className="text-slate-600">{serial}</TableCell>

                        <TableCell className="text-slate-700 whitespace-nowrap">
                          <div className="leading-tight">
                            <div className="font-medium text-slate-900">
                              {format(new Date(order.created_at), 'dd/MM/yyyy')}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {format(new Date(order.created_at), 'HH:mm')}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="font-semibold text-slate-950 whitespace-nowrap">
                          {getSalesRef(order) || '-'}
                        </TableCell>

                        <TableCell>
                          <div className="leading-tight">
                            <div className="font-medium text-slate-950 capitalize max-w-[170px]">
                              {getCustomerFullName(order) || '-'}
                            </div>
                            <div className="text-[11px] text-slate-600 whitespace-nowrap">
                              {getPhoneNumber(order) || '-'}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="text-slate-800 max-w-[140px]">
                          {getCompanyName(order) || '-'}
                        </TableCell>

                        <TableCell className="text-slate-800 truncate whitespace-nowrap max-w-[105px]">
                          {order.state || '-'}
                        </TableCell>

                        <TableCell className="text-slate-800 truncate max-w-[150px]">
                          {getProductsList(order) || '-'}
                        </TableCell>

                        <TableCell className="text-left font-medium text-slate-950 whitespace-nowrap">
                          ₦{extractUnitPrice(order)}
                        </TableCell>

                        <TableCell className="text-left font-medium text-slate-950 whitespace-nowrap">
                          {safeParseNumber(order.quantity).toLocaleString()}
                        </TableCell>

                        <TableCell className="text-left font-semibold text-slate-950 whitespace-nowrap">
                          ₦{safeParseNumber(order.total_price).toLocaleString()}
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded-full ${getStatusClass(
                                order.status
                              )}`}
                            >
                              {getStatusIcon(order.status)}
                              <span className="ml-1.5">{getStatusText(order.status)}</span>
                            </span>
                            {autoCanceled ? (
                              <span className="text-[11px] text-slate-500">12 hours expired</span>
                            ) : null}
                          </div>
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
