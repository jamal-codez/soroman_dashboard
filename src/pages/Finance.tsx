import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from '@/components/ui/table';
import {
  Search,
  Download,
  Filter,
  CircleDollarSign,
  Receipt,
  TrendingUp,
  ShieldCheck,
  Wallet,
  Banknote,
  Clock,
  ArrowUp,
  ArrowDown,
  Plus,
  MoreVertical
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { apiClient } from '@/api/client';
import { Skeleton } from '@/components/ui/skeleton';

interface FinanceOverview {
  total_revenue: number;
  revenue_change: number;
  avg_transaction_value: number;
  avg_transaction_value_change: number;
  payment_success_rate: number;
  pending_payments: number;
}

interface Product {
  id: number;
  name: string;
  unit_price: number;
  orders_count: number;
  paid_orders: number;
  pending_orders: number;
  updated_at: string;
}

interface PaymentOrder {
  id: number;
  order_id: string;
  total_price: number;
  payment_status: 'paid' | 'pending' | 'failed';
  payment_method: string;
  created_at: string;
}

export default function Finance() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch finance overview data
  const { data: financeOverview, isLoading: overviewLoading } = useQuery<FinanceOverview>({
    queryKey: ['finance-overview'],
    queryFn: () => apiClient.admin.getFinanceOverview(),
  });

  // Fetch products data
  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => apiClient.admin.adminGetProducts(),
    select: (data) => data.map(product => ({
      ...product,
      updated_at: new Date(product.updated_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    }))
  });

  // Fetch payment orders
  const { data: paymentOrders = [], isLoading: paymentsLoading } = useQuery<PaymentOrder[]>({
    queryKey: ['payment-orders'],
    queryFn: () => apiClient.admin.getPaymentOrders(),
    select: (data) => data.map(order => ({
      ...order,
      created_at: new Date(order.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    }))
  });

  // Update product price mutation
  const updatePriceMutation = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number }) =>
      apiClient.admin.adminUpdateProduct(id, { unit_price: price }),
    onSuccess: () => {
      queryClient.invalidateQueries(['products']);
    }
  });

  // Update payment status mutation
  const updatePaymentStatusMutation = useMutation({
    mutationFn: (orderId: number) =>
      apiClient.admin.editPaymentOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries(['payment-orders']);
    }
  });

  const handlePriceUpdate = (productId: number, newPrice: number) => {
    updatePriceMutation.mutate({ id: productId, price: newPrice });
  };

  const handlePaymentConfirmation = (orderId: number) => {
    updatePaymentStatusMutation.mutate(orderId);
  };

  const filteredPayments = paymentOrders.filter(order =>
    order.order_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (overviewLoading || productsLoading || paymentsLoading) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-96 rounded-lg" />
              <Skeleton className="h-96 rounded-lg" />
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
              <h1 className="text-2xl font-bold text-slate-800">Finance</h1>
              <Button className="bg-[#169061] hover:bg-[#169061]/90">
              <Download className="mr-1" size={16} />
                  Export Price List
              </Button>

            </div>
            {/* Metric Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Revenue
                  </CardTitle>
                  <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ₦{(financeOverview?.total_revenue || 0).toLocaleString()}
                  </div>
                  <div className={`flex items-center text-xs ${
                    (financeOverview?.revenue_change || 0) >= 0 
                      ? 'text-green-500' 
                      : 'text-red-500'
                  }`}>
                    {(financeOverview?.revenue_change || 0) >= 0 ? (
                      <ArrowUp className="h-3 w-3 mr-1" />
                    ) : (
                      <ArrowDown className="h-3 w-3 mr-1" />
                    )}
                    {Math.abs(financeOverview?.revenue_change || 0)}%
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Avg. Transaction Value
                  </CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ₦{(financeOverview?.avg_transaction_value || 0).toLocaleString()}
                  </div>
                  <div className={`flex items-center text-xs ${
                    (financeOverview?.avg_transaction_value_change || 0) >= 0 
                      ? 'text-green-500' 
                      : 'text-red-500'
                  }`}>
                    {(financeOverview?.avg_transaction_value_change || 0) >= 0 ? (
                      <ArrowUp className="h-3 w-3 mr-1" />
                    ) : (
                      <ArrowDown className="h-3 w-3 mr-1" />
                    )}
                    {Math.abs(financeOverview?.avg_transaction_value_change || 0)}%
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Payment Success Rate
                  </CardTitle>
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {financeOverview?.payment_success_rate?.toFixed(1)}%
                  </div>
                  <Progress 
                    value={financeOverview?.payment_success_rate || 0} 
                    className="h-2 mt-2" 
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Pending Payments
                  </CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ₦{(financeOverview?.pending_payments || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {financeOverview?.pending_payments} outstanding payments
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Price Management Section */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              {/* <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Price Management</h2>
                <Button variant="outline">
                  <Download className="mr-1" size={16} />
                  Export Price List
                </Button>
              </div> */}
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Current Price (₦)</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          value={product.unit_price}
                          onChange={(e) => handlePriceUpdate(product.id, Number(e.target.value))}
                          className="w-32"
                          disabled={updatePriceMutation.isLoading}
                        />
                      </TableCell>
                      <TableCell>{product.updated_at}</TableCell>
                      <TableCell><MoreVertical /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Payment Verification Section */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Payment Verification</h2>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search payments..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Verify Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>{order.order_id}</TableCell>
                      <TableCell>₦{order.total_price.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={
                          order.payment_status === 'paid' ? 'default' :
                          order.payment_status === 'pending' ? 'secondary' : 'destructive'
                        }>
                          {order.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell>{order.payment_method}</TableCell>
                      <TableCell>{order.created_at}</TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          disabled={order.payment_status !== 'pending'}
                          onClick={() => handlePaymentConfirmation(order.id)}
                        >
                          <ShieldCheck className="mr-1" size={16} />
                          {order.payment_status === 'pending' ? 'Confirm Receipt' : 'Verified'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}