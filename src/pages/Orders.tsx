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
  Plus,
  CheckCircle,
  Clock,
  Truck,
  AlertCircle,
  MoreHorizontal
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { useState } from 'react';
import { format } from 'date-fns';

interface Order {
  id: number;
  user: {
    first_name: string;
    last_name: string;
    email: string;
  };
  total_price: string;
  status: 'pending' | 'completed' | 'shipping' | 'cancelled';
  created_at: string;
  products: Array<{
    name: string;
  }>;
  quantity: number;
}

const statusDisplayMap = {
  pending: 'Processing',
  completed: 'Completed',
  shipping: 'Shipping',
  cancelled: 'Cancelled',
};

const getStatusIcon = (status: Order['status']) => {
  switch (status) {
    case 'completed': return <CheckCircle className="text-green-500" size={16} />;
    case 'pending': return <Clock className="text-blue-500" size={16} />;
    case 'shipping': return <Truck className="text-orange-500" size={16} />;
    case 'cancelled': return <AlertCircle className="text-red-500" size={16} />;
    default: return <Clock className="text-blue-500" size={16} />;
  }
};

const getStatusClass = (status: Order['status']) => {
  switch (status) {
    case 'completed': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'shipping': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'cancelled': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const Orders = () => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['all-orders'],
    queryFn: async () => {
      const response = await apiClient.admin.getAllAdminOrders();
      return response.results || [];
    },
    retry: 2,
    refetchOnWindowFocus: false
  });

  const filteredOrders = (apiResponse || []).filter(order => {
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
              <p>Loading orders...</p>
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
              <Button 
                onClick={() => refetch()} 
                className="mt-4"
              >
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
              <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
              <Button className="bg-soroman-orange hover:bg-[#169061]/90">
                <Plus className="mr-1" size={16} />
                New Order
              </Button>
            </div>
            
            {/* Search and Filters */}
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
            
            {/* Orders Table */}
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
                    <TableHead className="text-center">ACTIONS</TableHead>
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
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {filteredOrders.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-slate-500">
                    {searchQuery.trim() ? 'No orders found matching your search criteria.' : 'No orders available.'}
                  </p>
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