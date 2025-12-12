import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  AlertCircle
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { format, isThisWeek, isThisMonth, isThisYear, isToday } from 'date-fns';

interface Order {
  id: number;
  user: Record<string, any>;
  total_price?: string | number;
  status: string;
  created_at: string;
  products: Array<{ name?: string }>;
  quantity?: number | string;
  release_type?: 'pickup' | 'delivery';
  reference?: string;
  state?: string;
  customer_details?: Record<string, any>;
  // fallback aliases
  sales_ref?: string;
  truck_number?: string;
  driver_name?: string;
  driver_phone?: string;
  meta?: Record<string, any>;
  data?: Record<string, any>;
  payload?: Record<string, any>;
}

interface OrderResponse {
  count: number;
  results: Order[];
}

const statusDisplayMap: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  canceled: 'Canceled',
  completed: 'Completed',
  released: 'Released'
};

const getStatusText = (status: string) => statusDisplayMap[status.toLowerCase()] || status;

const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid': return <CheckCircle className="text-green-500" size={16} />;
    case 'pending': return <Clock className="text-orange-500" size={16} />;
    case 'canceled': return <AlertCircle className="text-red-500" size={16} />;
    case 'completed': return <CheckCircle className="text-blue-500" size={16} />;
    case 'released': return <CheckCircle className="text-blue-600" size={16} />;
    default: return <CheckCircle className="text-blue-500" size={16} />;
  }
};

const getStatusClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'canceled': return 'bg-red-50 text-red-700 border-red-200';
    case 'completed': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'released': return 'bg-blue-50 text-blue-700 border-blue-200';
    default: return 'bg-gray-50 text-blue-700 border-blue-200';
  }
};

const Orders = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today'|'week'|'month'|'year'|null>(null);
  const [productFilter, setProductFilter] = useState<string|null>(null);
  const [locationFilter, setLocationFilter] = useState<string|null>(null);
  const [statusFilter, setStatusFilter] = useState<string|null>(null);
  const [showRaw, setShowRaw] = useState(false); // debug toggle

  const { data: apiResponse, isLoading, isError, error } = useQuery<OrderResponse>({
    queryKey: ['all-orders'],
    queryFn: async () => {
      const response = await apiClient.admin.getAllAdminOrders();
      if (!response.results) throw new Error('Invalid response format');
      return { count: response.count || 0, results: response.results || [] };
    },
    retry: 2,
    refetchOnWindowFocus: false
  });

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

  const filteredOrders = useMemo(() => {
    const base = apiResponse?.results || [];
    return base
      .filter(order => {
        const query = searchQuery.trim();
        if (!query) return true;
        const q = query.toLowerCase();
        const name = `${order.user?.first_name ?? ''} ${order.user?.last_name ?? ''}`.toLowerCase();
        const salesRef = String(
          order.reference ||
          order.sales_ref ||
          order.customer_details?.salesRef ||
          order.customer_details?.sales_reference ||
          order.meta?.salesRef ||
          order.data?.salesRef ||
          order.payload?.salesRef ||
          ''
        ).toLowerCase();
        const truck = String(order.truck_number || order.customer_details?.truckNumber || order.customer_details?.truck_number || '').toLowerCase();
        const driverName = String(order.driver_name || order.customer_details?.driverName || order.customer_details?.driver_name || '').toLowerCase();
        const inId = String(order.id).includes(q);
        const inName = name.includes(q);
        const inProducts = order.products.some(p => String(p.name ?? '').toLowerCase().includes(q));
        const inReleaseType = String(order.release_type ?? '').toLowerCase().includes(q);
        const inState = order.state ? String(order.state).toLowerCase().includes(q) : false;
        const inSalesRef = salesRef.includes(q);
        const inTruck = truck.includes(q);
        const inDriver = driverName.includes(q);

        return inId || inName || inProducts || inReleaseType || inState || inSalesRef || inTruck || inDriver;
      })
      .filter(order => {
        if (!filterType) return true;
        const date = new Date(order.created_at);
        if (filterType === 'today') return isToday(date);
        if (filterType === 'week') return isThisWeek(date);
        if (filterType === 'month') return isThisMonth(date);
        if (filterType === 'year') return isThisYear(date);
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
      });
  }, [apiResponse?.results, searchQuery, filterType, productFilter, locationFilter, statusFilter]);

  const safeParseNumber = (v: unknown) => {
    if (v == null) return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const str = String(v).trim();
    const cleaned = str.replace(/[^0-9\.\-]+/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  const matchesSummaryFilters = (order: Order) => {
    if (filterType) {
      const date = new Date(order.created_at);
      if (filterType === 'today' && !isToday(date)) return false;
      if (filterType === 'week' && !isThisWeek(date)) return false;
      if (filterType === 'month' && !isThisMonth(date)) return false;
      if (filterType === 'year' && !isThisYear(date)) return false;
    }
    if (productFilter) {
      if (!order.products.some(p => p.name === productFilter)) return false;
    }
    if (locationFilter) {
      if (order.state !== locationFilter) return false;
    }
    return true;
  };

  const releasedFilteredOrders = useMemo(() => {
    const base = apiResponse?.results || [];
    return base.filter(o => {
      const s = (o.status || '').toLowerCase();
      if (!(s === 'completed' || s === 'released')) return false;
      return matchesSummaryFilters(o);
    });
  }, [apiResponse?.results, filterType, productFilter, locationFilter]);

  const canceledFilteredOrders = useMemo(() => {
    const base = apiResponse?.results || [];
    return base.filter(o => {
      const s = (o.status || '').toLowerCase();
      if (s !== 'canceled') return false;
      return matchesSummaryFilters(o);
    });
  }, [apiResponse?.results, filterType, productFilter, locationFilter]);

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

  // Robust helpers: try many places where customer-entered fields could live
  const getSalesRef = (o: Order) => {
    return (
      o.customer_details?.salesRef ||
      o.customer_details?.sales_reference ||
      o.reference ||
      o.sales_ref ||
      o.meta?.salesRef ||
      o.data?.salesRef ||
      o.payload?.customer?.salesRef ||
      ''
    );
  };

  const getCustomerFullName = (o: Order) =>
    o.customer_details?.name ||
    [o.user?.first_name, o.user?.last_name].filter(Boolean).join(' ').trim();

  const getCompanyName = (o: Order) =>
    o.customer_details?.companyName || o.user?.companyName || o.user?.company_name || '';

  const getPhoneNumber = (o: Order) =>
    o.customer_details?.phone || o.user?.phone_number || o.user?.phone || '';

  const getTruckNumber = (o: Order) =>
    o.customer_details?.truckNumber || o.customer_details?.truck_number || o.truck_number || '';

  const getDriverName = (o: Order) =>
    o.customer_details?.driverName || o.customer_details?.driver_name || o.driver_name || '';

  const getDriverPhone = (o: Order) =>
    o.customer_details?.driverPhone || o.customer_details?.driver_phone || o.driver_phone || '';

  const getProductsList = (o: Order) =>
    (o.products || []).map(p => p.name).filter(Boolean).join(', ');

  // CSV export and the rest kept same (omitted here for brevity in this snippet)

  const getFilterLabelForFile = () => {
    switch (filterType) {
      case 'today': return 'today';
      case 'week': return 'this-week';
      case 'month': return 'this-month';
      case 'year': return 'this-year';
      default: return 'all';
    }
  };

  const getStatusLabelForFile = () => {
    if (!statusFilter) return 'all-statuses';
    return String(statusFilter).toLowerCase().replace(/\s+/g, '-');
  };

  const exportToCSV = () => {
    if (!apiResponse?.results) return;

    const headers = [
      'S/N',
      'Date',
      'Sales Reference Number',
      'Customer Name',
      'Company Name',
      'Phone Number',
      'Truck Number',
      "Driver's Name",
      "Driver's Phone Number",
      'Product',
      'Quantity (L)',
      'Amount Paid (₦)',
      'Status',
    ];

    const exportList = [...filteredOrders].reverse();

    const rows = exportList.map((order, idx) => [
      idx + 1,
      format(new Date(order.created_at), 'dd-MM-yyyy'),
      getSalesRef(order),
      getCustomerFullName(order),
      getCompanyName(order),
      getPhoneNumber(order),
      getTruckNumber(order),
      getDriverName(order),
      getDriverPhone(order),
      getProductsList(order),
      safeParseNumber(order.quantity).toLocaleString(),
      safeParseNumber(order.total_price).toLocaleString(),
      getStatusText(order.status),
    ]);

    const summaryBlock = [
      ['Report Summary'],
      ['Filter', getFilterLabelForFile()],
      ['Status', statusFilter ? getStatusText(statusFilter) : 'All'],
      ['Total Released Orders', releasedTotals.totalOrders.toString()],
      ['Quantity Released (Litres)', releasedTotals.totalQty.toLocaleString()],
      ['Total Amount Released (N)', releasedTotals.totalAmount.toLocaleString()],
      ['Total Canceled Orders', canceledTotals.totalOrders.toString()],
      ['Quantity Canceled (Litres)', canceledTotals.totalQty.toLocaleString()],
      ['Total Amount Canceled (N)', canceledTotals.totalAmount.toLocaleString()],
      []
    ];

    const csvRows = [
      ...summaryBlock,
      headers,
      ...rows
    ];

    const csvContent = csvRows
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `orders_export_${getFilterLabelForFile()}_${getStatusLabelForFile()}_${new Date().toISOString()}.csv`);
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
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">All Orders</h1>
              <div className="flex gap-2">
                <Button variant="outline" onClick={exportToCSV}>
                  <Download className="mr-1" size={16} /> Download Report
                </Button>
                {/* Debug toggle to inspect the raw JSON of the first filtered order */}
                <Button variant="ghost" onClick={() => {
                  setShowRaw(s => !s);
                  if (filteredOrders && filteredOrders[0]) console.log('First filtered order:', filteredOrders[0]);
                }}>
                  {showRaw ? 'Hide JSON' : 'Show Order JSON'}
                </Button>
              </div>
            </div>

            {/* Summary and Filters (unchanged) */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col lg:flex-row gap-4">
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
                <div className="flex flex-col sm:flex-row gap-3">
                  <select className="border border-gray-300 rounded px-3 py-2" value={filterType ?? ''} onChange={(e) => {
                    const v = e.target.value as ''|'today'|'week'|'month'|'year';
                    setFilterType(v === '' ? null : v);
                  }}>
                    <option value="">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="year">This Year</option>
                  </select>

                  <select className="border border-gray-300 rounded px-3 py-2" value={statusFilter ?? ''} onChange={(e) => setStatusFilter(e.target.value === '' ? null : e.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="canceled">Canceled</option>
                    <option value="completed">Completed</option>
                    <option value="released">Released</option>
                  </select>

                  <select className="border border-gray-300 rounded px-3 py-2" value={productFilter ?? ''} onChange={(e) => setProductFilter(e.target.value === '' ? null : e.target.value)}>
                    <option value="">All Products</option>
                    {uniqueProducts.map((p) => (<option key={p} value={p}>{p}</option>))}
                  </select>

                  <select className="border border-gray-300 rounded px-3 py-2" value={locationFilter ?? ''} onChange={(e) => setLocationFilter(e.target.value === '' ? null : e.target.value)}>
                    <option value="">All Locations</option>
                    {uniqueLocations.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
              </div>

              {/* Totals (unchanged) */}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-sm text-slate-500">Released Orders</div>
                    <div className="text-lg font-semibold text-slate-800">{releasedTotals.totalOrders}</div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Quantity Released</div>
                    <div className="text-lg font-semibold text-slate-800">{releasedTotals.totalQty.toLocaleString()} Ltrs</div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Total Amount</div>
                    <div className="text-lg font-semibold text-slate-800">₦{releasedTotals.totalAmount.toLocaleString()}</div>
                  </div>

                  <div>
                    <div className="text-sm text-slate-500">Canceled Orders</div>
                    <div className="text-lg font-semibold text-slate-800">{canceledTotals.totalOrders}</div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Quantity Canceled</div>
                    <div className="text-lg font-semibold text-slate-800">{canceledTotals.totalQty.toLocaleString()} Ltrs</div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Amount Canceled</div>
                    <div className="text-lg font-semibold text-slate-800">₦{canceledTotals.totalAmount.toLocaleString()}</div>
                  </div>
                </div>
                <div className="text-sm text-slate-500">Orders at a Glance</div>
              </div>
            </div>

            {/* Raw JSON debug view */}
            {showRaw && filteredOrders && filteredOrders[0] && (
              <div className="bg-white p-4 rounded mb-4 border border-slate-200">
                <div className="text-sm text-slate-600 mb-2">Raw JSON for first filtered order (useful for mapping fields):</div>
                <pre className="text-xs max-h-64 overflow-auto">{JSON.stringify(filteredOrders[0], null, 2)}</pre>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S/N</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Sales Reference</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Truck Number</TableHead>
                    <TableHead>Driver's Name</TableHead>
                    <TableHead>Driver's Phone</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Amount Paid</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order, idx) => {
                    const serial = filteredOrders.length - idx;
                    return (
                      <TableRow key={order.id}>
                        <TableCell>{serial}</TableCell>
                        <TableCell>{format(new Date(order.created_at), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="font-semibold">{getSalesRef(order) || '-'}</TableCell>
                        <TableCell><span className="capitalize">{getCustomerFullName(order) || '-'}</span></TableCell>
                        <TableCell>{getCompanyName(order) || '-'}</TableCell>
                        <TableCell>{getPhoneNumber(order) || '-'}</TableCell>
                        <TableCell>{getTruckNumber(order) || '-'}</TableCell>
                        <TableCell>{getDriverName(order) || '-'}</TableCell>
                        <TableCell>{getDriverPhone(order) || '-'}</TableCell>
                        <TableCell>{getProductsList(order) || '-'}</TableCell>
                        <TableCell>{safeParseNumber(order.quantity).toLocaleString()}</TableCell>
                        <TableCell>₦{safeParseNumber(order.total_price).toLocaleString()}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 text-sm font-medium border rounded capitalize ${getStatusClass(order.status)}`}>
                            {getStatusIcon(order.status)} <span className="ml-1">{getStatusText(order.status)}</span>
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredOrders.length === 0 && !isLoading && (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center text-slate-500 py-8">
                        No orders found for the selected filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
