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
  AlertCircle
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { format } from 'date-fns'; // date-fns filtering will now be handled by backend
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Define the Order interface, now including next and previous for pagination links
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

// Update OrderResponse to match Django REST Framework's default pagination structure
interface OrderResponse {
  count: number;
  next: string | null; // URL to the next page, or null if last page
  previous: string | null; // URL to the previous page, or null if first page
  results: Order[];
}

// Mapping for order status display
const statusDisplayMap = {
  pending: 'Pending',
  paid: 'Paid',
  canceled: 'Canceled',
};

// Function to get status icon based on order status
const getStatusIcon = (status: Order['status']) => {
  switch (status) {
    case 'paid': return <CheckCircle className="text-green-500" size={16} />;
    case 'pending': return <Clock className="text-orange-500" size={16} />;
    case 'canceled': return <AlertCircle className="text-red-500" size={16} />;
    default: return <Clock className="text-orange-500" size={16} />;
  }
};

// Function to get CSS class for status badge
const getStatusClass = (status: string) => {
  switch (status) {
    case 'paid': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'canceled': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const Orders = () => {
  // State for search query
  const [searchQuery, setSearchQuery] = useState('');
  // State for filter type (week, month, year, or null for all time)
  const [filterType, setFilterType] = useState<'week' | 'month' | 'year' | null>(null);
  // State for cancel order modal visibility
  const [showCancelModal, setShowCancelModal] = useState(false);
  // State to store the ID of the order selected for cancellation
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  // State for current page number, initialized to 1
  const [page, setPage] = useState(1);
  // Desired page size for the API requests
  const pageSize = 100; // As requested, 100 orders per page

  // useQuery hook to fetch orders with pagination, search, and filter parameters
  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery<OrderResponse>({
    // queryKey includes all dependencies that should trigger a re-fetch
    queryKey: ['all-orders', page, filterType, searchQuery],
    queryFn: async () => {
      // Construct URLSearchParams to send pagination, filter, and search parameters to the backend
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('page_size', String(pageSize)); // Request 100 items per page

      // Append filter type if selected
      if (filterType) {
        params.append('filter', filterType);
      }
      // Append search query if present (assuming backend handles search)
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      // Make the API call using apiClient.admin.getAllAdminOrders
      // This assumes apiClient.admin.getAllAdminOrders can accept a query string
      // Example: apiClient.admin.getAllAdminOrders(`/api/orders/?page=1&page_size=100&filter=week`)
      const response = await apiClient.admin.getAllAdminOrders(`?${params.toString()}`);
      
      // Basic validation for the response structure
      if (!response.results) throw new Error('Invalid response format');
      
      // Return the full response including count, next, previous, and results
      return {
        count: response.count || 0,
        results: response.results || [],
        next: response.next || null,
        previous: response.previous || null,
      };
    },
    retry: 2, // Retry failed queries twice
    refetchOnWindowFocus: false, // Do not refetch automatically on window focus
    keepPreviousData: true, // Keep the old data visible while new data is loading
  });

  // Mutation hook for canceling an order
  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: number) => apiClient.admin.cancleOrder(orderId),
    onSuccess: () => refetch(), // Refetch orders after successful cancellation
    onSettled: () => {
      // Close modal and clear selected order ID after mutation settles (success or error)
      setShowCancelModal(false);
      setSelectedOrderId(null);
    }
  });

  // Handler for clicking the cancel order button
  const handleCancelOrderClick = (orderId: number) => {
    setSelectedOrderId(orderId);
    setShowCancelModal(true);
  };

  // Handler for confirming order cancellation in the modal
  const confirmCancelOrder = () => {
    if (selectedOrderId) cancelOrderMutation.mutate(selectedOrderId);
  };

  // Handler for search input changes
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value); // Set search query
    setPage(1); // Reset to the first page when search query changes
  };

  // Function to handle filter type changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterType(e.target.value as 'week' | 'month' | 'year' | null); // Set filter type
    setPage(1); // Reset to the first page when filter changes
  };

  // Function to export all filtered orders to CSV
  const exportToCSV = async () => {
    // Construct URLSearchParams to send filter and search parameters to the backend
    // This call should go to an *unpaginated* endpoint on your Django backend
    const params = new URLSearchParams();
    if (filterType) {
      params.append('filter', filterType);
    }
    if (searchQuery) {
      params.append('search', searchQuery);
    }

    try {
      // Make a fetch request to the dedicated CSV export endpoint
      // Ensure your backend has an endpoint like /api/admin/orders/export-csv/
      // that handles these filters and returns all matching data without pagination.
      const response = await fetch(`/api/admin/orders/export-csv/?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get the response as a Blob (binary large object)
      const blob = await response.blob();
      
      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob);
      
      // Create a link element to trigger the download
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `orders_export_${new Date().toISOString()}.csv`); // Set download filename
      
      // Append link to body, click it, and then remove it
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Revoke the object URL to free up memory
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting orders:', error);
      // You might want to display a user-friendly error message here
      // e.g., using a toast notification or an in-app message.
    }
  };

  // Handler for navigating to the next page
  const handleNextPage = () => {
    // Only navigate if there's a 'next' URL from the API response
    if (apiResponse?.next) {
      setPage(prevPage => prevPage + 1);
    }
  };

  // Handler for navigating to the previous page
  const handlePreviousPage = () => {
    // Only navigate if there's a 'previous' URL from the API response and current page is not 1
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
                  onChange={handleFilterChange}
                  value={filterType || ""} // Controlled component for the select input
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
                  ) : apiResponse?.results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-4">No orders found.</TableCell>
                    </TableRow>
                  ) : (
                    apiResponse?.results.map((order) => (
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
              <span>Page {page} of {Math.ceil((apiResponse?.count || 0) / pageSize)}</span>
              <Button onClick={handleNextPage} disabled={!apiResponse?.next || isLoading}>
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Order Confirmation Dialog */}
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
