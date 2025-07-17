import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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
  AlertCircle,
  ChevronLeft, // Added for pagination
  ChevronRight  // Added for pagination
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { format, isThisWeek, isThisMonth, isThisYear } from 'date-fns';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Define the Order interface
interface Order {
  id: number;
  user: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
  };
  total_price: string;
  status: 'pending' | 'paid' | 'canceled';
  created_at: string;
  products: Array<{
    name: string;
  }>;
  quantity: number;
  release_type: 'pickup' | 'delivery';
  reference: string;
  state: string;
}

// Define the OrderResponse interface for paginated results
interface OrderResponse {
  count: number; // Total count of orders (for pagination)
  results: Order[]; // Orders for the current page
  next: string | null; // URL for the next page
  previous: string | null; // URL for the previous page
}

// Define parameters for the API call to get all orders
interface GetAllOrdersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  filter?: 'week' | 'month' | 'year' | null;
}

// Mock apiClient. This should be replaced with your actual apiClient implementation
// Ensure your actual apiClient.admin.getAllAdminOrders can accept the parameters
// { page, pageSize, search, filter } and return data in the OrderResponse format.
// Also, ensure apiClient.admin.cancleOrder accepts an orderId.
const mockApiClient = {
  admin: {
    getAllAdminOrders: async (params: GetAllOrdersParams): Promise<OrderResponse> => {
      console.log('Fetching orders with params:', params);
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // Mock data (replace with actual API call)
      const allMockOrders: Order[] = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        user: {
          first_name: `John${i % 10}`,
          last_name: `Doe${i % 5}`,
          email: `john.doe${i}@example.com`,
          phone_number: `123-456-789${i % 10}`,
        },
        total_price: (1000 + i * 10).toFixed(2),
        status: ['paid', 'pending', 'canceled'][i % 3] as 'pending' | 'paid' | 'canceled',
        created_at: new Date(Date.now() - i * 86400000).toISOString(), // Orders from recent to older
        products: [{ name: `Product A${i % 2}` }, { name: `Product B${i % 3}` }],
        quantity: 10 + i % 5,
        release_type: ['pickup', 'delivery'][i % 2] as 'pickup' | 'delivery',
        reference: `REF-${1000 + i}`,
        state: `State ${i % 5}`,
      }));

      // Apply client-side filtering for mock data (your backend should do this)
      let filteredMockOrders = allMockOrders.filter(order => {
        const query = (params.search || '').toLowerCase();
        const matchesSearch = (
          order.id.toString().includes(query) ||
          `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(query) ||
          order.products.some(product => product.name.toLowerCase().includes(query))
        );

        if (!params.filter) return matchesSearch;
        const date = new Date(order.created_at);
        if (params.filter === 'week') return matchesSearch && isThisWeek(date);
        if (params.filter === 'month') return matchesSearch && isThisMonth(date);
        if (params.filter === 'year') return matchesSearch && isThisYear(date);
        return matchesSearch;
      });

      // Apply client-side pagination for mock data (your backend should do this)
      const page = params.page || 1;
      const pageSize = params.pageSize || 10;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedResults = filteredMockOrders.slice(startIndex, endIndex);

      return {
        count: filteredMockOrders.length,
        results: paginatedResults,
        next: endIndex < filteredMockOrders.length ? `/api/orders?page=${page + 1}` : null,
        previous: startIndex > 0 ? `/api/orders?page=${page - 1}` : null,
      };
    },
    cancleOrder: async (orderId: number) => {
      console.log(`Cancelling order: ${orderId}`);
      await new Promise(resolve => setTimeout(resolve, 300));
      // In a real app, you'd send a request to your backend to update the order status
      return { success: true };
    }
  }
};

// Use the mockApiClient for demonstration purposes.
// In your actual application, replace `mockApiClient` with `apiClient`.
const actualApiClient = typeof apiClient !== 'undefined' ? apiClient : mockApiClient;


const statusDisplayMap = {
  pending: 'Pending',
  paid: 'Paid',
  canceled: 'Canceled',
};

const getStatusIcon = (status: Order['status']) => {
  switch (status) {
    case 'paid': return <CheckCircle className="text-green-500" size={16} />;
    case 'pending': return <Clock className="text-orange-500" size={16} />;
    case 'canceled': return <AlertCircle className="text-red-500" size={16} />;
    default: return <Clock className="text-orange-500" size={16} />;
  }
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'paid': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'canceled': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const Orders = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'week' | 'month' | 'year' | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // Pagination states
  const [page, setPage] = useState(1);
  const pageSize = 10; // Number of orders per page

  // Fetch orders with pagination, search, and filter parameters
  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery<OrderResponse>({
    queryKey: ['all-orders', page, searchQuery, filterType], // Key includes pagination and filter states
    queryFn: async () => {
      // Pass pagination, search, and filter parameters to the API client
      const response = await actualApiClient.admin.getAllAdminOrders({
        page,
        pageSize,
        search: searchQuery,
        filter: filterType,
      });
      if (!response.results) throw new Error('Invalid response format');
      return {
        count: response.count || 0,
        results: response.results || [],
        next: response.next || null,
        previous: response.previous || null,
      };
    },
    retry: 2,
    refetchOnWindowFocus: false,
    keepPreviousData: true, // Keep previous data while fetching new page
  });

  // Mutation for cancelling an order
  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: number) => actualApiClient.admin.cancleOrder(orderId),
    onSuccess: () => refetch(), // Refetch orders after successful cancellation
    onSettled: () => {
      setShowCancelModal(false);
      setSelectedOrderId(null);
    }
  });

  // Mutation for exporting all filtered orders
  const exportOrdersMutation = useMutation({
    mutationFn: async ({ search, filter }: { search: string; filter: 'week' | 'month' | 'year' | null }) => {
      // This call should fetch ALL orders matching the filter, without pagination.
      // We use a very large pageSize to simulate fetching all records.
      const response = await actualApiClient.admin.getAllAdminOrders({
        search,
        filter,
        pageSize: 999999, // Request a very large page size to get all records
        page: 1, // Ensure we start from page 1 for export
      });
      if (!response.results) throw new Error('Invalid response format for export');
      return response.results;
    },
    onSuccess: (allFilteredOrders) => {
      // Generate CSV from all fetched filtered orders
      const headers = [
        'Date',
        'Order ID',
        'Customer',
        'Product(s)',
        'Contact',
        'Quantity (Litres)',
        'Amount Paid (₦)',
        'Status',
        'State'
      ];

      // Reverse the orders to show the latest first in the CSV, consistent with display
      const rows = [...allFilteredOrders].reverse().map((order) => [
        format(new Date(order.created_at), 'dd-MM-yyyy'),
        `#${order.id}`,
        `${order.user.first_name} ${order.user.last_name}`,
        order.products.map(p => p.name).join(', '),
        `${order.user.phone_number} / ${order.user.email}`,
        order.quantity.toLocaleString(),
        parseFloat(order.total_price).toLocaleString(),
        statusDisplayMap[order.status],
        order.state
      ]);

      const csvContent = [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `orders_export_${new Date().toISOString()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    onError: (exportError) => {
      console.error('Error exporting orders:', exportError);
      // You might want to show a toast or alert to the user here
    }
  });

  const handleCancelOrderClick = (orderId: number) => {
    setSelectedOrderId(orderId);
    setShowCancelModal(true);
  };

  const confirmCancelOrder = () => {
    if (selectedOrderId) cancelOrderMutation.mutate(selectedOrderId);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value); // Update search query
    setPage(1); // Reset to first page on search
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterType(e.target.value as 'week' | 'month' | 'year' | null); // Update filter type
    setPage(1); // Reset to first page on filter change
  };

  const ordersToDisplay = apiResponse?.results || [];
  const totalOrdersCount = apiResponse?.count || 0;
  const totalPages = Math.ceil(totalOrdersCount / pageSize);

  // Function to generate page numbers for pagination control
  const getPageNumbers = () => {
    const pages = [];
    const maxPagesToShow = 5; // Max number of page buttons to display
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="flex h-screen bg-slate-100 font-inter"> {/* Added font-inter */}
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">All Orders</h1>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => exportOrdersMutation.mutate({ search: searchQuery, filter: filterType })}
                  disabled={exportOrdersMutation.isLoading}
                  className="rounded-md shadow-sm" // Added rounded corners and shadow
                >
                  {exportOrdersMutation.isLoading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Exporting...
                    </span>
                  ) : (
                    <>
                      <Download className="mr-1" size={16} /> Export
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type="text"
                    placeholder="Search orders..."
                    className="pl-10 rounded-md" // Added rounded corners
                    value={searchQuery}
                    onChange={handleSearch}
                  />
                </div>
                <select
                  className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500" // Added rounded corners and focus styles
                  onChange={handleFilterChange}
                  value={filterType || ''}
                >
                  <option value="">All Time</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="year">This Year</option>
                </select>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product(s)</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Quantity (L)</TableHead>
                    <TableHead>Amount Paid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        <div className="flex items-center justify-center">
                          <svg className="animate-spin h-5 w-5 mr-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Loading orders...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : isError ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-red-500">
                        Error: {error?.message || 'Failed to fetch orders.'}
                      </TableCell>
                    </TableRow>
                  ) : ordersToDisplay.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                        No orders found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ordersToDisplay.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>{format(new Date(order.created_at), 'dd-MM-yyyy')}</TableCell>
                        <TableCell>#{order.id}</TableCell>
                        <TableCell>{order.user.first_name} {order.user.last_name}</TableCell>
                        <TableCell>{order.products.map(p => p.name).join(', ')}</TableCell>
                        <TableCell>{order.user.phone_number} / {order.user.email}</TableCell>
                        <TableCell>{order.quantity.toLocaleString()}</TableCell>
                        <TableCell>₦{parseFloat(order.total_price).toLocaleString()}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 text-sm font-medium border rounded-full ${getStatusClass(order.status)}`}> {/* Added rounded-full */}
                            {getStatusIcon(order.status)} <span className="ml-1">{statusDisplayMap[order.status]}</span>
                          </span>
                        </TableCell>
                        <TableCell>{order.state}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={order.status === 'canceled' || cancelOrderMutation.isLoading}
                            onClick={() => handleCancelOrderClick(order.id)}
                            className="rounded-md" // Added rounded corners
                          >
                            Cancel
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center p-4 border-t border-slate-200">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(prev => Math.max(1, prev - 1))}
                    disabled={page === 1 || isLoading}
                    className="rounded-md" // Added rounded corners
                  >
                    <ChevronLeft className="mr-1" size={16} /> Previous
                  </Button>
                  <div className="flex gap-1">
                    {getPageNumbers().map((pageNumber) => (
                      <Button
                        key={pageNumber}
                        variant={pageNumber === page ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPage(pageNumber)}
                        disabled={isLoading}
                        className="rounded-md" // Added rounded corners
                      >
                        {pageNumber}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={page === totalPages || isLoading}
                    className="rounded-md" // Added rounded corners
                  >
                    Next <ChevronRight className="ml-1" size={16} />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Order Confirmation Dialog */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent className="sm:max-w-[425px] rounded-lg"> {/* Added rounded corners */}
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-slate-800">Cancel Order</DialogTitle>
          </DialogHeader>
          <p className="text-slate-700">Are you sure you want to cancel this order?</p>
          <DialogFooter className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowCancelModal(false)}
              className="rounded-md" // Added rounded corners
            >
              No, go back
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancelOrder}
              disabled={cancelOrderMutation.isLoading}
              className="rounded-md" // Added rounded corners
            >
              {cancelOrderMutation.isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Cancelling...
                </span>
              ) : (
                'Yes, cancel it'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orders;
