import { useState } from 'react';
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
  Filter,
  Search,
  CheckCircle,
  Clock,
  Truck,
  AlertCircle,
  MoreHorizontal,
  Loader2
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { format } from 'date-fns';

interface Order {
  id: number;
  user: {
    first_name: string;
    last_name: string;
    email: string;
  };
  total_price: string;
  status: 'pending' | 'paid' | 'cancelled';
  created_at: string;
  products: Array<{
    name: string;
  }>;
  quantity: number;
  release_type: 'pickup' | 'delivery'; // Added missing field
}

interface OrderResponse {
  count: number;
  results: Order[];
}

const statusDisplayMap = {
  pending: 'pending',
  paid: 'paid',
  cancelled: 'Cancelled',
};

const getStatusIcon = (status: Order['status']) => {
  switch (status) {
    case 'paid': return <CheckCircle className="text-green-500" size={16} />;
    case 'pending': return <Clock className="text-orange-500" size={16} />;
    case 'cancelled': return <AlertCircle className="text-red-500" size={16} />;
    default: return <Clock className="text-orange-500" size={16} />;
  }
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'paid': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'cancelled': return 'bg-red-50 text-red-700 border-red-200';
    case 'delivery': return 'bg-purple-50 text-purple-700 border-purple-200';
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const pageSize = 10;

const Orders = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery<OrderResponse>({
    queryKey: ['all-orders', currentPage],
    queryFn: async () => {
      try {
        const response = await apiClient.admin.getAllAdminOrders({
          page: currentPage,
          page_size: pageSize
        });
        console.log(response)
        
        if (!response.results) throw new Error('Invalid response format');
        
        return {
          count: response.count || 0,
          results: response.results || []
        };
      } catch (error) {
        throw new Error('Failed to fetch orders');
      }
    },
    retry: 2,
    refetchOnWindowFocus: false
  });

  const totalPages = Math.ceil((apiResponse?.count || 0) / pageSize);

  const handlePreviousPage = () => currentPage > 1 && setCurrentPage(prev => prev - 1);
  const handleNextPage = () => currentPage < totalPages && setCurrentPage(prev => prev + 1);

  const filteredOrders = (apiResponse?.results || []).filter(order => {
    const searchLower = searchQuery.toLowerCase();
    return (
      order.id.toString().includes(searchLower) ||
      `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(searchLower) ||
      order.products.some(product => product.name.toLowerCase().includes(searchLower))
    );
  });

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className='animate-spin' color='green' size={54} />
            </div>
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
              <Button onClick={() => refetch()} className="mt-4">
                Retry
              </Button>
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
              <h1 className="text-2xl font-bold text-slate-800">Orders Dashboard</h1>
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
                  <Button variant="outline" className="flex items-center">
                    <Filter className="mr-1" size={16} />
                    Filter
                  </Button>
                  <Button variant="outline" className="flex items-center">
                    <Download className="mr-1" size={16} />
                    Export
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">#{order.id}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {order.user.first_name} {order.user.last_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {order.user.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {order.products.map(p => p.name).join(', ')}
                      </TableCell>
                      <TableCell>{order.quantity.toLocaleString()} L</TableCell>
                      <TableCell>
                        {format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₦{parseFloat(order.total_price).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded-full ${getStatusClass(order.status)}`}>
                          {getStatusIcon(order.status)}
                          <span className="ml-1.5">
                            {statusDisplayMap[order.status]}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded-full ${getStatusClass(order.release_type)}`}>
                          {order.release_type === 'delivery' ? 'Delivery' : 'Pickup'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {filteredOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-500">
                    {searchQuery.trim() ? 'No orders found matching your search criteria.' : 'No orders available.'}
                  </p>
                </div>
              ) : (
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
    </div>
  );
};

export default Orders;