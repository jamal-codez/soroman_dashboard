import { useState, useMemo, useEffect, useRef } from 'react';
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
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { format, isThisWeek, isThisMonth, isThisYear, isToday } from 'date-fns';
import { shouldAutoCancel } from '@/lib/orderTimers';
import { getOrderReference } from '@/lib/orderReference';

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
}

interface OrderResponse {
  count: number;
  results: Order[];
}

const statusDisplayMap: Record<string, string> = {
  pending: 'Awaiting Payment',
  paid: 'Paid',
  canceled: 'Unpaid',
  released: 'Released'
};

const getStatusText = (status: string) => statusDisplayMap[status.toLowerCase()] || status;

const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid': return <CheckCircle className="text-green-500" size={16} />;
    case 'pending': return <Clock className="text-orange-500" size={16} />;
    case 'canceled': return <AlertCircle className="text-red-500" size={16} />;
    case 'released': return <CheckCircle className="text-blue-600" size={16} />;
    default: return <CheckCircle className="text-blue-500" size={16} />;
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

const Orders = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today'|'week'|'month'|'year'|null>(null);
  const [productFilter, setProductFilter] = useState<string|null>(null);
  const [locationFilter, setLocationFilter] = useState<string|null>(null);
  const [statusFilter, setStatusFilter] = useState<string|null>(null);

  const { data: apiResponse, isLoading, isError, error } = useQuery<OrderResponse>({
    queryKey: ['all-orders'],
    queryFn: async () => {
      const response = await apiClient.admin.getAllAdminOrders();
      if (!response.results) throw new Error('Invalid response format');
      return { count: response.count || 0, results: response.results || [] };
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
    const cleaned = str.replace(/[^0-9.-]+/g, '');
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
      if (s !== 'released') return false;
      return matchesSummaryFilters(o);
    });
  }, [apiResponse?.results, filterType, productFilter, locationFilter, matchesSummaryFilters]);

  const canceledFilteredOrders = useMemo(() => {
    const base = apiResponse?.results || [];
    return base.filter(o => {
      const s = (o.status || '').toLowerCase();
      if (s !== 'canceled') return false;
      return matchesSummaryFilters(o);
    });
  }, [apiResponse?.results, filterType, productFilter, locationFilter, matchesSummaryFilters]);

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

  const getDriverPhone = (o: Order) =>
    o.customer_details?.driverPhone || o.customer_details?.driver_phone || o.driver_phone || '';

  const getProductsList = (o: Order) =>
    (o.products || []).map(p => p.name).filter(Boolean).join(', ');

  const getAssignedAgent = (o: Order): Record<string, unknown> | null => {
    const rec = o as unknown as Record<string, unknown>;
    const a = (rec.assigned_agent ?? rec.assignedAgent ?? rec.agent) as unknown;
    if (!a || typeof a !== 'object') return null;
    return a as Record<string, unknown>;
  };

  const getAssignedAgentName = (o: Order): string => {
    const aRec = getAssignedAgent(o);
    if (!aRec) return '';
    const fullName = [aRec.first_name, aRec.last_name]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' ')
      .trim();
    return (
      fullName ||
      (typeof aRec.name === 'string' ? aRec.name : '') ||
      (typeof aRec.full_name === 'string' ? aRec.full_name : '') ||
      (typeof aRec.username === 'string' ? aRec.username : '') ||
      ''
    );
  };

  const getAssignedAgentPhone = (o: Order): string => {
    const aRec = getAssignedAgent(o);
    if (!aRec) return '';
    return (
      (typeof aRec.phone === 'string' ? aRec.phone : '') ||
      (typeof aRec.phone_number === 'string' ? aRec.phone_number : '') ||
      ''
    );
  };

  const getAssignedAgentType = (o: Order): string => {
    const aRec = getAssignedAgent(o);
    if (!aRec) return '';
    return (typeof aRec.type === 'string' ? aRec.type : '') || '';
  };

  const getAssignedAgentLocation = (o: Order): string => {
    const aRec = getAssignedAgent(o);
    if (!aRec) return '';
    return (
      (typeof aRec.location_name === 'string' ? aRec.location_name : '') ||
      (typeof aRec.locationName === 'string' ? aRec.locationName : '') ||
      ''
    );
  };

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
      'Order Reference',
      'Location',
      'Assigned Agent',
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
      order.state || '-',
      getAssignedAgentName(order) || '-',
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

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <select
                    aria-label="Date filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={filterType ?? ''}
                    onChange={(e) => {
                      const v = e.target.value as ''|'today'|'week'|'month'|'year';
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
                    aria-label="Status filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={statusFilter ?? ''}
                    onChange={(e) => setStatusFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Awaiting Payment</option>
                    <option value="paid">Paid</option>
                    <option value="canceled">Unpaid</option>
                    <option value="released">Released</option>
                  </select>

                  <select
                    aria-label="Product filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={productFilter ?? ''}
                    onChange={(e) => setProductFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Products</option>
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
                    <option value="">All Locations</option>
                    {uniqueLocations.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
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
                  {/* <div>
                    <div className="text-sm text-slate-500">Quantity Canceled</div>
                    <div className="text-lg font-semibold text-slate-800">{canceledTotals.totalQty.toLocaleString()} Ltrs</div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Amount Canceled</div>
                    <div className="text-lg font-semibold text-slate-800">₦{canceledTotals.totalAmount.toLocaleString()}</div>
                  </div> */}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">S/N</TableHead>
                    <TableHead className="w-[110px]">Date</TableHead>
                    <TableHead className="w-[90px]">Time</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Assigned Agent</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Amount Paid</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order, idx) => {
                    const status = (order.status || '').toLowerCase();
                    const autoCanceled = status === 'canceled' && shouldAutoCancel({ status: 'pending', created_at: order.created_at });
                    const serial = filteredOrders.length - idx;
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="text-slate-600">{serial}</TableCell>
                        <TableCell className="text-slate-700">{format(new Date(order.created_at), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-slate-700">{format(new Date(order.created_at), 'HH:mm')}</TableCell>
                        <TableCell className="font-semibold text-slate-950">{getSalesRef(order) || '-'}</TableCell>
                        <TableCell className="text-slate-800">{order.state || '-'}</TableCell>
                        <TableCell className="text-slate-800">
                          {(() => {
                            const name = getAssignedAgentName(order);
                            const phone = getAssignedAgentPhone(order);

                            const parts = [
                              name,
                              phone ? `${phone}` : '',
                            ].filter(Boolean);

                            return parts.length ? parts.join(' ') : '-';
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-950 capitalize leading-tight">
                            {getCustomerFullName(order) || '-'}
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-800">{getCompanyName(order) || '-'}</TableCell>
                        <TableCell className="text-slate-700">{getPhoneNumber(order) || '-'}</TableCell>
                        <TableCell className="text-slate-800">{getProductsList(order) || '-'}</TableCell>
                        <TableCell className="text-right font-medium text-slate-950">{safeParseNumber(order.quantity).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-semibold text-slate-950">₦{safeParseNumber(order.total_price).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border rounded-full capitalize ${getStatusClass(order.status)}`}>
                              {getStatusIcon(order.status)}
                              <span>{getStatusText(order.status)}</span>
                            </span>
                            {autoCanceled ? (
                              <span className="text-xs text-slate-500">
                                12 hours expired
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredOrders.length === 0 && !isLoading && (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center text-slate-500 py-10">
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
