import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  ShoppingCart,
  TrendingUp,
  Users,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { format, isThisWeek, isThisMonth, isThisYear, isToday } from 'date-fns';

// ---------- Types ----------
interface Order {
  id: number;
  user: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    companyName?: string; // not displayed anymore, kept for potential reuse
  };
  total_price: string;
  status: 'pending' | 'paid' | 'canceled' | 'completed';
  created_at: string;
  products: Array<{ name: string }>;
  quantity: number;
  release_type: 'pickup' | 'delivery';
  state: string;
}

interface OrderResponse {
  count: number;
  results: Order[];
}

interface AnalyticsData {
  orders?: number;
  orders_change?: number;
  sales_revenue?: number;
  sales_revenue_change?: number;
  active_customers_change?: number;
  unpaid_orders?: number;
}

interface CustomerResponse {
  count: number;
  customers: Array<{
    id: number | string;
    first_name?: string;
    last_name?: string;
    name?: string;
    email?: string;
    orders_count?: number;
  }>;
}

// ---------- Helpers ----------
const formatMillion = (num: number | undefined): string => {
  const value = Number(num || 0);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  return value.toLocaleString();
};

const statusDisplayMap: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  canceled: 'Canceled',
  completed: 'Completed'
};

const getStatusText = (status: string) => statusDisplayMap[status.toLowerCase()] || status;

const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid':
      return <CheckCircle className="text-green-500" size={14} />;
    case 'pending':
      return <Clock className="text-orange-500" size={14} />;
    case 'canceled':
      return <AlertCircle className="text-red-500" size={14} />;
    case 'completed':
      return <CheckCircle className="text-blue-500" size={14} />;
    default:
      return <CheckCircle className="text-blue-500" size={14} />;
  }
};

const getStatusClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'canceled': return 'bg-red-50 text-red-700 border-red-200';
    case 'completed': return 'bg-blue-50 text-blue-700 border-blue-200';
    default: return 'bg-gray-50 text-blue-700 border-blue-200';
  }
};

// ---------- Simple Stat Card (icon on top) ----------
interface SimpleStatProps {
  title: string;
  value: string;
  change?: string;
  icon: React.ElementType;
  iconColor?: string;
  isLoading?: boolean;
}

const SimpleStatCard: React.FC<SimpleStatProps> = ({
  title,
  value,
  change,
  icon: Icon,
  iconColor = 'text-slate-600',
  isLoading
}) => {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col items-center text-center shadow-sm">
      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2 bg-slate-100">
        <Icon size={20} className={iconColor} />
      </div>
      <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">{title}</p>
      <h3 className="mt-1 text-xl font-semibold text-slate-800 leading-tight">
        {isLoading ? '...' : value}
      </h3>
      {change && !isLoading && (
        <p className="mt-1 text-xs font-medium text-green-600">
          {change}
        </p>
      )}
    </div>
  );
};

// ---------- Dashboard Component ----------
const Dashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today' | 'week' | 'month' | 'year' | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);

  // Analytics
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => apiClient.admin.getAnalytics()
  });

  // Orders
  const {
    data: ordersResponse,
    isLoading: isOrdersLoading,
    isError: isOrdersError,
    error: ordersError
  } = useQuery<OrderResponse>({
    queryKey: ['all-orders-dashboard'],
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

  // Customers
  const { data: customerData } = useQuery<CustomerResponse>({
    queryKey: ['customers'],
    queryFn: () => apiClient.admin.adminGetAllCustomers()
  });

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value.toLowerCase());
  };

  const uniqueProducts = useMemo(() => {
    const names = (ordersResponse?.results ?? []).flatMap(o => o.products.map(p => p.name)).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [ordersResponse?.results]);

  const uniqueLocations = useMemo(() => {
    const states = (ordersResponse?.results ?? []).map(o => o.state).filter(Boolean);
    return Array.from(new Set(states)).sort();
  }, [ordersResponse?.results]);

  const filteredOrders = useMemo(() => {
    const base = ordersResponse?.results || [];
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
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [ordersResponse?.results, searchQuery, filterType, productFilter, locationFilter]);

  const limitRecentOrders = 15;
  const recentOrders = filteredOrders.slice(0, limitRecentOrders);

  const exportToCSV = () => {
    if (!recentOrders.length) return;
    const headers = [
      'Date',
      'Order ID',
      'Customer',
      'Phone Number',
      'Product(s)',
      'Depot/State',
      'Pickup/Delivery',
      'Quantity (Litres)',
      'Amount Paid (₦)',
      'Status'
    ];

    const rows = recentOrders.map(order => [
      format(new Date(order.created_at), 'dd-MM-yyyy'),
      `#${order.id}`,
      `${order.user.first_name} ${order.user.last_name}`,
      order.user.phone_number,
      order.products.map(p => p.name).join(', '),
      order.state,
      order.release_type === 'delivery' ? 'Delivery' : 'Pickup',
      order.quantity.toLocaleString(),
      parseFloat(order.total_price).toLocaleString(),
      getStatusText(order.status)
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `recent_orders_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-4 sm:mb-6">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Dashboard</h1>
              <p className="text-slate-500 text-sm sm:text-base">
                Welcome back, monitor your business at a glance.
              </p>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <SimpleStatCard
                title="Total Orders"
                value={(analytics?.orders ?? 0).toLocaleString()}
                change={Number.isFinite(analytics?.orders_change) ? `+${analytics!.orders_change}%` : undefined}
                icon={ShoppingCart}
                iconColor="text-blue-600"
                isLoading={analyticsLoading}
              />
              <SimpleStatCard
                title="Sales Revenue"
                value={`₦${formatMillion(analytics?.sales_revenue)}`}
                change={Number.isFinite(analytics?.sales_revenue_change) ? `+${analytics!.sales_revenue_change}%` : undefined}
                icon={TrendingUp}
                iconColor="text-green-600"
                isLoading={analyticsLoading}
              />
              <SimpleStatCard
                title="Total Customers"
                value={(customerData?.count ?? 0).toLocaleString()}
                change={Number.isFinite(analytics?.active_customers_change) ? `+${analytics!.active_customers_change}%` : undefined}
                icon={Users}
                iconColor="text-purple-600"
                isLoading={analyticsLoading}
              />
              <SimpleStatCard
                title="Unpaid Orders"
                value={(analytics?.unpaid_orders ?? 0).toLocaleString()}
                icon={ShoppingCart}
                iconColor="text-amber-600"
                isLoading={analyticsLoading}
              />
            </div>

            {/* Filters + Export */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
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
                    className="border border-gray-300 rounded px-3 py-2 text-sm"
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
                      className="border border-gray-300 rounded px-3 py-2 text-sm"
                      value={productFilter ?? ''}
                      onChange={(e) => setProductFilter(e.target.value === '' ? null : e.target.value)}
                    >
                      <option value="">All Products</option>
                      {uniqueProducts.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>

                    <select
                      className="border border-gray-300 rounded px-3 py-2 text-sm"
                      value={locationFilter ?? ''}
                      onChange={(e) => setLocationFilter(e.target.value === '' ? null : e.target.value)}
                    >
                      <option value="">All Locations</option>
                      {uniqueLocations.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>

                  <Button
                    variant="outline"
                    onClick={exportToCSV}
                    className="text-sm"
                    disabled={!recentOrders.length}
                  >
                    <Download size={16} className="mr-1" />
                    Export Recent
                  </Button>
                </div>
              </div>
            </div>

            {/* Recent Orders Table */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm sm:text-base font-semibold text-slate-800">Recent Orders</h2>
                <span className="text-xs text-slate-500">
                  Showing {recentOrders.length} of {filteredOrders.length} filtered
                </span>
              </div>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead className="whitespace-nowrap">Order ID</TableHead>
                      <TableHead className="whitespace-nowrap">Customer</TableHead>
                      <TableHead className="whitespace-nowrap">Phone Number</TableHead>
                      <TableHead className="whitespace-nowrap">Product(s)</TableHead>
                      <TableHead className="whitespace-nowrap">Depot/State</TableHead>
                      <TableHead className="whitespace-nowrap">Pickup/Delivery</TableHead>
                      <TableHead className="whitespace-nowrap">Quantity</TableHead>
                      <TableHead className="whitespace-nowrap">Amount Paid</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isOrdersLoading && (
                      <TableRow>
                        <TableCell colSpan={10} className="py-8 text-center text-slate-500 text-sm">
                          Loading orders...
                        </TableCell>
                      </TableRow>
                    )}
                    {!isOrdersLoading && recentOrders.map(order => (
                      <TableRow key={order.id}>
                        <TableCell>{format(new Date(order.created_at), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>#{order.id}</TableCell>
                        <TableCell>{order.user.first_name} {order.user.last_name}</TableCell>
                        <TableCell>{order.user.phone_number}</TableCell>
                        <TableCell>{order.products.map(p => p.name).join(', ')}</TableCell>
                        <TableCell>{order.state}</TableCell>
                        <TableCell>{order.release_type === 'delivery' ? 'Delivery' : 'Pickup'}</TableCell>
                        <TableCell>{order.quantity.toLocaleString()}</TableCell>
                        <TableCell>₦{parseFloat(order.total_price).toLocaleString()}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium border rounded capitalize ${getStatusClass(order.status)}`}>
                            {getStatusIcon(order.status)} <span className="ml-1">{getStatusText(order.status)}</span>
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!isOrdersLoading && recentOrders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-slate-500 py-8 text-sm">
                          No recent orders match your filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {isOrdersError && (
                <div className="px-4 py-3 text-sm text-red-600 border-t border-slate-100">
                  {(ordersError as Error)?.message || 'Failed to load orders.'}
                </div>
              )}
            </div>

            {/* Customers (Optional) */}
            <div className="mt-8">
              <h2 className="text-sm sm:text-base font-semibold text-slate-800 mb-3">Customers</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {(customerData?.customers || []).slice(0, 6).map(c => {
                  const displayName = c.name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Unnamed';
                  return (
                    <div
                      key={c.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {displayName}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-1">{c.email || 'No email'}</p>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        Orders: <span className="font-medium">{c.orders_count ?? 0}</span>
                      </p>
                    </div>
                  );
                })}
                {(!customerData?.customers || customerData.customers.length === 0) && (
                  <div className="text-sm text-slate-500">
                    No customers available.
                  </div>
                )}
              </div>
            </div>

            <div className="h-12" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
