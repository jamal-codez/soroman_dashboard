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
  user: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    companyName?: string;
  };
  total_price: string;
  status: 'pending' | 'paid' | 'canceled' | 'completed' | string;
  created_at: string;
  products: Array<{
    name: string;
  }>;
  quantity: number;
  release_type: 'pickup' | 'delivery';
  reference: string;
  state: string;
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
    case 'paid':
      return <CheckCircle className="text-green-500" size={16} />;
    case 'pending':
      return <Clock className="text-orange-500" size={16} />;
    case 'canceled':
      return <AlertCircle className="text-red-500" size={16} />;
    case 'completed':
      return <CheckCircle className="text-blue-500" size={16} />;
    case 'released':
      return <CheckCircle className="text-blue-600" size={16} />;
    default:
      return <CheckCircle className="text-blue-500" size={16} />;
  }
};

const getStatusClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'pending':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'canceled':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'completed':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'released':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    default:
      return 'bg-gray-50 text-blue-700 border-blue-200';
  }
};

const Orders = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today' | 'week' | 'month' | 'year' | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null); // null means all statuses

  const { data: apiResponse, isLoading, isError, error } = useQuery<OrderResponse>({
    queryKey: ['all-orders'],
    queryFn: async () => {
      const response = await apiClient.admin.getAllAdminOrders();
      if (!response.results) throw new Error('Invalid response format');
      return {
        count: response.count || 0,
        results: response.results || []
      };
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
        const inId = order.id.toString().includes(q);
        const inName = `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(q);
        const inProducts = order.products.some(p => p.name.toLowerCase().includes(q));
        const inReleaseType = order.release_type.toLowerCase().includes(q);
        const inState = order.state ? order.state.toLowerCase().includes(q) : false;
        return inId || inName || inProducts || inReleaseType || inState;
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
        if (!statusFilter) return true; // null = all
        return (order.status || '').toLowerCase() === statusFilter.toLowerCase();
      });
  }, [apiResponse?.results, searchQuery, filterType, productFilter, locationFilter, statusFilter]);

  // Helper to safely parse numbers (handles strings with commas/currency and numbers)
  const safeParseNumber = (v: unknown) => {
    if (v == null) return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const str = String(v).trim();
    // remove common non-numeric characters (commas, currency symbols, spaces)
    const cleaned = str.replace(/[^0-9\.\-]+/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  // --- Summary filters helper: apply only date/product/location filters (ignore search/status) ---
  const matchesSummaryFilters = (order: Order) => {
    // Date filter
    if (filterType) {
      const date = new Date(order.created_at);
      if (filterType === 'today' && !isToday(date)) return false;
      if (filterType === 'week' && !isThisWeek(date)) return false;
      if (filterType === 'month' && !isThisMonth(date)) return false;
      if (filterType === 'year' && !isThisYear(date)) return false;
    }
    // Product filter
    if (productFilter) {
      if (!order.products.some(p => p.name === productFilter)) return false;
    }
    // Location filter
    if (locationFilter) {
      if (order.state !== locationFilter) return false;
    }
    return true;
  };

  // Compute released/canceled sets for the summary from the raw API data (ignoring search/statusFilter)
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

  // Totals derived from releasedFilteredOrders (reflects date/product/location filters but ignores search/status filter)
  const releasedTotals = useMemo(() => {
    const totalQty = releasedFilteredOrders.reduce((acc, o) => acc + safeParseNumber(o.quantity), 0);
    const totalAmount = releasedFilteredOrders.reduce((acc, o) => acc + safeParseNumber(o.total_price), 0);
    return { totalQty, totalAmount, totalOrders: releasedFilteredOrders.length };
  }, [releasedFilteredOrders]);

  // Totals derived from canceledFilteredOrders (reflects date/product/location filters but ignores search/status filter)
  const canceledTotals = useMemo(() => {
    const totalQty = canceledFilteredOrders.reduce((acc, o) => acc + safeParseNumber(o.quantity), 0);
    const totalAmount = canceledFilteredOrders.reduce((acc, o) => acc + safeParseNumber(o.total_price), 0);
    return { totalQty, totalAmount, totalOrders: canceledFilteredOrders.length };
  }, [canceledFilteredOrders]);

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
      'ID',
      'Name',
      // 'Company',
      'Product',
      'Phone Number',
      'Quantity (L)',
      'Amount (₦)',
      'Depot/State',
      'Status',
      // 'Delivery Option',
    ];

    // For export we want 1 to be first. Use reversed order of filteredOrders then index+1 for S/N.
    const exportList = [...filteredOrders].reverse();

    const rows = exportList.map((order, idx) => [
      idx + 1,
      format(new Date(order.created_at), 'dd-MM-yyyy'),
      `#${order.id}`,
      `${order.user.first_name} ${order.user.last_name}`,
      // order.user.companyName || '',
      order.products.map(p => p.name).join(', '),
      `${order.user.phone_number}`,
      safeParseNumber(order.quantity).toLocaleString(),
      safeParseNumber(order.total_price).toLocaleString(),
      order.state,
      getStatusText(order.status),
      // order.release_type === 'delivery' ? 'Delivery' : 'Pickup',
    ]);

    // Prepend a small summary block to CSV so totals are visible without manual Excel work
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
      [] // blank line before headers
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
              </div>
            </div>

            {/* Summary card: shows totals for current filtered view (released/completed orders only) */}
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
                  <select
                    className="border border-gray-300 rounded px-3 py-2"
                    value={filterType ?? ''}
                    onChange={(e) => {
                      const v = e.target.value as '' | 'today' | 'week' | 'month' | 'year';
                      setFilterType(v === '' ? null : v);
                    }}
                  >
                    <option value="">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="year">This Year</option>
                  </select>

                  <select
                    className="border border-gray-300 rounded px-3 py-2"
                    value={statusFilter ?? ''}
                    onChange={(e) => setStatusFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="canceled">Canceled</option>
                    <option value="completed">Completed</option>
                    <option value="released">Released</option>
                  </select>

                  <select
                    className="border border-gray-300 rounded px-3 py-2"
                    value={productFilter ?? ''}
                    onChange={(e) => setProductFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Products</option>
                    {uniqueProducts.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>

                  <select
                    className="border border-gray-300 rounded px-3 py-2"
                    value={locationFilter ?? ''}
                    onChange={(e) => setLocationFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Locations</option>
                    {uniqueLocations.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Totals row beneath filters - now showing released/completed-only metrics and canceled metrics */}
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
                <div className="text-sm text-slate-500">
                  Orders at a Glance
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S/N</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Depot/State</TableHead>
                    {/* <TableHead>Pickup/Delivery</TableHead> */}
                    <TableHead>Quantity</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order, idx) => {
                    const serial = filteredOrders.length - idx; // descending so 1 is at bottom
                    return (
                      <TableRow key={order.id}>
                        <TableCell>{serial}</TableCell>
                        <TableCell>{format(new Date(order.created_at), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>#{order.id}</TableCell>
                        <TableCell>
                          <span className="capitalize">
                            {order.user.first_name} {order.user.last_name}
                          </span>
                        </TableCell>
                        <TableCell>{(order.user as any).company_name}</TableCell>
                        <TableCell>{order.user.phone_number}</TableCell>
                        <TableCell>{order.products.map(p => p.name).join(', ')}</TableCell>
                        <TableCell>{order.state}</TableCell>
                        {/* <TableCell>
                          {order.release_type === 'delivery' ? 'Delivery' : 'Pickup'}
                        </TableCell> */}
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
                      <TableCell colSpan={11} className="text-center text-slate-500 py-8">
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
