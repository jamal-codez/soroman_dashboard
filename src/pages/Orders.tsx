import React, { useEffect, useState, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import { format, isThisMonth, isThisWeek, isThisYear } from "date-fns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator"; // This is imported but not used, can be removed if not needed.

// --- MISSING IMPORTS ADDED ---
import { useQuery, useMutation } from '@tanstack/react-query';
import { CheckCircle, Clock, AlertCircle, Loader2, Search, Download } from 'lucide-react'; // Icons
import { Input } from "@/components/ui/input"; // UI Input component
import { SidebarNav } from "@/components/sidebar-nav"; // Sidebar navigation component
import { TopBar } from "@/components/top-bar"; // Top bar component
import apiClient from '@/lib/api'; // Your custom API client instance
// --- END OF MISSING IMPORTS ---

interface Product {
  name: string;
}

interface User {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
}

interface Order {
  id: number;
  created_at: string;
  status: 'pending' | 'paid' | 'canceled';
  reference: string;
  user: User;
  quantity: number;
  total_price: string;
  release_type: 'pickup' | 'delivery';
  products: Product[];
}

// Define OrderResponse interface for useQuery
interface OrderResponse {
  count: number;
  results: Order[];
}

// Define Timeframe type explicitly
type Timeframe = 'all' | 'week' | 'month' | 'year';

const statusDisplayMap: Record<Order['status'], string> = {
  pending: "Pending",
  paid: "Paid",
  canceled: "Canceled",
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'paid': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'canceled': return 'bg-red-50 text-red-700 border-red-200';
    case 'delivery': return 'bg-purple-50 text-purple-700 border-purple-200';
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const getStatusIcon = (status: Order['status']) => {
  switch (status) {
    case 'paid': return <CheckCircle className="text-green-500" size={16} />;
    case 'pending': return <Clock className="text-orange-500" size={16} />;
    case 'canceled': return <AlertCircle className="text-red-500" size={16} />;
    default: return <Clock className="text-orange-500" size={16} />;
  }
};

const pageSize = 10;

const Orders = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [filterTimeframe, setFilterTimeframe] = useState<Timeframe>('all');

  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery<OrderResponse>({
    queryKey: ['all-orders', currentPage, filterTimeframe],
    queryFn: async () => {
      const response = await apiClient.admin.getAllAdminOrders({
        page: currentPage,
        page_size: pageSize
      });
      if (!response.results) throw new Error('Invalid response format');
      return {
        count: response.count || 0,
        results: response.results || []
      };
    },
    retry: 2,
    refetchOnWindowFocus: false
  });

  const totalPages = Math.ceil((apiResponse?.count || 0) / pageSize);

  const handlePreviousPage = () => currentPage > 1 && setCurrentPage(prev => prev - 1);
  const handleNextPage = () => currentPage < totalPages && setCurrentPage(prev => prev + 1);

  const isInTimeframe = useCallback((date: string) => {
    const d = new Date(date);
    switch (filterTimeframe) {
      case 'week': return isThisWeek(d);
      case 'month': return isThisMonth(d);
      case 'year': return isThisYear(d);
      default: return true;
    }
  }, [filterTimeframe]);


  const filteredOrders = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    const ordersToFilter = apiResponse?.results || [];

    return ordersToFilter.filter(order => {
      return (
        isInTimeframe(order.created_at) &&
        (
          order.id.toString().includes(searchLower) ||
          `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(searchLower) ||
          order.products.some(product => product.name.toLowerCase().includes(searchLower))
        )
      );
    });
  }, [apiResponse, searchQuery, isInTimeframe]);

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: number) => apiClient.admin.cancleOrder(orderId),
    onSuccess: () => {
      toast.success("Order cancelled successfully! ✨");
      refetch();
    },
    onError: (error: any) => {
      console.error('Cancel failed:', error);
      const errorMessage = error.response?.data?.message || "Failed to cancel order. Please try again.";
      toast.error(errorMessage);
    },
    onSettled: () => {
      setShowCancelModal(false);
      setSelectedOrderId(null);
    },
  });

  const handleCancelOrderClick = (orderId: number) => {
    setSelectedOrderId(orderId);
    setShowCancelModal(true);
  };

  const confirmCancelOrder = () => {
    if (selectedOrderId) {
      cancelOrderMutation.mutate(selectedOrderId);
    }
  };

  const closeModal = () => {
    setShowCancelModal(false);
    setSelectedOrderId(null);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            <Loader2 className="animate-spin" color="green" size={54} />
            <p className="text-lg text-gray-500 ml-4">Loading orders... 🔄</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            <div className="text-center text-red-500">
              <p>Error: {(error as Error)?.message || 'Failed to load orders'}</p>
              <Button onClick={() => refetch()} className="mt-4 bg-red-500 hover:bg-red-600 text-white">Retry</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">Orders Dashboard 📊</h1>
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
                <div className="flex gap-2">
                  <select
                    value={filterTimeframe}
                    onChange={(e) => setFilterTimeframe(e.target.value as Timeframe)}
                    className="border border-slate-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                  >
                    <option value="all">All Time</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="year">This Year</option>
                  </select>

                  <Button variant="outline" className="flex items-center">
                    <Download className="mr-1" size={16} /> Export
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ORDER ID</TableHead>
                    <TableHead>CUSTOMER</TableHead>
                    <TableHead>PRODUCTS</TableHead>
                    <TableHead>QUANTITY</TableHead>
                    <TableHead>DATE</TableHead>
                    <TableHead className="text-right">AMOUNT</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead>DELIVERY METHOD</TableHead>
                    <TableHead>REFERENCE</TableHead>
                    <TableHead>ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.length > 0 ? (
                    filteredOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">#{order.id}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {order.user.first_name} {order.user.last_name}
                            </div>
                            <div className="text-xs text-slate-500">{order.user.email}</div>
                            <div className="text-xs text-slate-500">{order.user.phone_number}</div>
                          </div>
                        </TableCell>
                        <TableCell>{order.products.map(p => p.name).join(', ')}</TableCell>
                        <TableCell>{order.quantity.toLocaleString()} L</TableCell>
                        <TableCell>{format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                        <TableCell className="text-right font-medium">
                          ₦{parseFloat(order.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <div className={`inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded-full ${getStatusClass(order.status)}`}>
                            {getStatusIcon(order.status)}
                            <span className="ml-1.5">{statusDisplayMap[order.status]}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={`inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded-full ${getStatusClass(order.release_type)}`}>
                            {order.release_type === 'delivery' ? 'Delivery' : 'Pickup'}
                          </div>
                        </TableCell>
                        <TableCell>{order.reference}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => handleCancelOrderClick(order.id)}
                              disabled={order.status !== 'pending' || cancelOrderMutation.isLoading}
                              className={`${
                                order.status !== 'pending'
                                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                  : 'bg-red-500 text-white hover:bg-red-600'
                              }`}
                            >
                              {cancelOrderMutation.isLoading && selectedOrderId === order.id ? (
                                <Loader2 className="animate-spin mr-2 h-4 w-4" />
                              ) : null}
                              Cancel Order
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-slate-500">
                        <p className="text-lg font-medium mb-2">
                          {searchQuery.trim() || filterTimeframe !== 'all' ? 'No orders found matching your criteria. 😔' : 'No orders available. 😔'}
                        </p>
                        <p>Try adjusting your search query or timeframe filter.</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {filteredOrders.length === 0 && !searchQuery.trim() && filterTimeframe === 'all' && (
                <div className="p-8 text-center text-slate-500">
                  <p className="text-lg font-medium mb-2">No orders available. 😔</p>
                  <p>Check your backend connection or add new orders.</p>
                </div>
              )}

              {filteredOrders.length > 0 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
                  <div className="text-sm text-slate-600">
                    Showing {(currentPage - 1) * pageSize + 1} -{' '}
                    {Math.min(currentPage * pageSize, apiResponse?.count || 0)} of{' '}
                    {apiResponse?.count || 0} results
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-4">Confirm Cancellation</h3>
            <p className="text-slate-600 mb-4">
              Are you sure you want to cancel order #{selectedOrderId}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={closeModal}
                disabled={cancelOrderMutation.isLoading}
              >
                No, Keep It
              </Button>
              <Button
                variant="destructive"
                onClick={confirmCancelOrder}
                disabled={cancelOrderMutation.isLoading}
              >
                {cancelOrderMutation.isLoading && (
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                )}
                Yes, Cancel Order
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
