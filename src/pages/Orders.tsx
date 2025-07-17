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
  Filter,
  Search,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { format, isThisWeek, isThisMonth, isThisYear } from 'date-fns';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

interface OrderResponse {
  count: number;
  results: Order[];
  next: string | null; // Add next for pagination
  previous: string | null; // Add previous for pagination
}

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
  const [page, setPage] = useState(1); // State for current page
  const pageSize = 100; // Define desired page size

  // Modify useQuery to include pagination parameters
  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery<OrderResponse>({
    queryKey: ['all-orders', page, filterType, searchQuery], // Add page, filterType, searchQuery to queryKey for re-fetching
    queryFn: async () => {
      // Build query parameters for pagination and filtering
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('page_size', String(pageSize)); // Request desired page size

      // Add filter type to parameters for backend
      if (filterType) {
        params.append('filter', filterType);
      }
      // Consider adding search query as a parameter if your backend handles it
      // if (searchQuery) {
      //   params.append('search', searchQuery);
      // }

      // Assuming your apiClient can handle query parameters
      // You might need to adjust apiClient.admin.getAllAdminOrders to accept params
      const response = await apiClient.admin.getAllAdminOrders(`?${params.toString()}`);
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
    // Keep data fresh for a longer period if data doesn't change often
    staleTime: 5 * 60 * 1000, // 5 minutes
    keepPreviousData: true, // Keep old data while new data is fetching
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: number) => apiClient.admin.cancleOrder(orderId),
    onSuccess: () => refetch(),
    onSettled: () => {
      setShowCancelModal(false);
      setSelectedOrderId(null);
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
    setSearchQuery(e.target.value.toLowerCase());
    setPage(1); // Reset to first page on new search
  };

  // Frontend filtering for search (if backend doesn't handle it)
  // Or, if backend handles search, remove this filter and rely on API data
  const displayedOrders = (apiResponse?.results || [])
    .filter(order => {
      const query = searchQuery.toLowerCase();
      return (
        order.id.toString().includes(query) ||
        `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(query) ||
        order.products.some(product => product.name.toLowerCase().includes(query))
      );
    });

  // Export to CSV function now fetches ALL data based on current filters
  const exportToCSV = async () => {
    // This will hit the new Django export endpoint
    const params = new URLSearchParams();
    if (filterType) {
      params.append('filter', filterType);
    }
    // If your backend export endpoint also supports search
    // if (searchQuery) {
    //   params.append('search', searchQuery);
    // }

    // Assuming apiClient.admin.exportAllAdminOrders exists and hits the new Django export endpoint
    // It should be a direct download, so fetch as blob or raw response
    try {
      // You might need a new API client method for this if the export endpoint
      // returns a raw CSV file directly
      const response = await fetch(`/api/admin/orders/export-csv/?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to export orders');
      }
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `orders_export_${new Date().toISOString()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting orders:', error);
      // Handle error, e.g., show a toast notification
    }
  };

  // Pagination controls
  const handleNextPage = () => {
    if (apiResponse?.next) {
      setPage(prevPage => prevPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (apiResponse?.previous && page > 1) {
      setPage(prevPage => prevPage - 1);
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
                <Button variant="outline" onClick={exportToCSV}>
                  <Download className="mr-1" size={16} /> Export CSV
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
                    className="pl-10"
                    value={searchQuery}
                    onChange={handleSearch}
                  />
                </div>
                <select
                  className="border border-gray-300 rounded px-3 py-2"
                  onChange={(e) => {
                    setFilterType(e.target.value as 'week' | 'month' | 'year' | null);
                    setPage(1); // Reset to first page on filter change
                  }}
                  value={filterType || ""} // Controlled component
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
                      <TableCell colSpan={10} className="text-center py-4">Loading orders...</TableCell>
                    </TableRow>
                  ) : isError ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-4 text-red-500">Error loading orders: {error?.message}</TableCell>
                    </TableRow>
                  ) : displayedOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-4">No orders found.</TableCell>
                    </TableRow>
                  ) : (
                    displayedOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>{format(new Date(order.created_at), 'dd-MM-yyyy')}</TableCell>
                        <TableCell>#{order.id}</TableCell>
                        <TableCell>{order.user.first_name} {order.user.last_name}</TableCell>
                        <TableCell>{order.products.map(p => p.name).join(', ')}</TableCell>
                        <TableCell>{order.user.phone_number} / {order.user.email}</TableCell>
                        <TableCell>{order.quantity.toLocaleString()}</TableCell>
                        <TableCell>₦{parseFloat(order.total_price).toLocaleString()}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 text-sm font-medium border rounded ${getStatusClass(order.status)}`}>
                            {getStatusIcon(order.status)} <span className="ml-1">{statusDisplayMap[order.status]}</span>
                          </span>
                        </TableCell>
                        <TableCell>{order.state}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={order.status === 'canceled'}
                            onClick={() => handleCancelOrderClick(order.id)}
                          >
                            Cancel
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            <div className="flex justify-between items-center mt-4">
              <Button onClick={handlePreviousPage} disabled={!apiResponse?.previous || isLoading}>
                Previous
              </Button>
              <span>Page {page}</span>
              <Button onClick={handleNextPage} disabled={!apiResponse?.next || isLoading}>
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to cancel this order?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelModal(false)}>
              No, go back
            </Button>
            <Button variant="destructive" onClick={confirmCancelOrder} disabled={cancelOrderMutation.isLoading}>
              Yes, cancel it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orders;
