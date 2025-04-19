import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { apiClient } from '@/api/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ShieldCheck, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface PaymentOrder {
  id: number;
  order_id: string;
  total_price: number;
  payment_status: 'paid' | 'pending' | 'failed';
  payment_method: string;
  created_at: string;
}

export default function PaymentVerification() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingPaymentId, setUpdatingPaymentId] = useState<number | null>(null);

  const { data: payments = [], isLoading } = useQuery<PaymentOrder[]>({
    queryKey: ['payment-orders'],
    queryFn: () => apiClient.admin.getPaymentOrders(),
  });

  const updatePaymentMutation = useMutation({
    mutationFn: async (orderId: number) => {
      setUpdatingPaymentId(orderId);
      try {
        await apiClient.admin.editPaymentOrder(orderId);
      } finally {
        setUpdatingPaymentId(null);
      }
    },
    onSuccess: () => queryClient.invalidateQueries(['payment-orders'])
  });

  const filteredPayments = payments.filter(payment =>
    payment.order_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">Payment Verification Dashboard</h1>
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

            <div className="bg-white rounded-lg shadow-sm border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    // Loading state
                    [...Array(5)].map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredPayments.length === 0 ? (
                    // Empty state
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-24">
                        No payments found
                      </TableCell>
                    </TableRow>
                  ) : (
                    // Data state
                    filteredPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{payment.order_id}</TableCell>
                        <TableCell>₦{payment.total_price.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={
                            payment.payment_status === 'paid' ? 'default' :
                            payment.payment_status === 'pending' ? 'secondary' : 'destructive'
                          }>
                            {payment.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell>{payment.payment_method}</TableCell>
                        <TableCell>{new Date(payment.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled={payment.payment_status !== 'pending' || updatingPaymentId === payment.id}
                            onClick={() => updatePaymentMutation.mutate(payment.id)}
                          >
                            {updatingPaymentId === payment.id ? (
                              <Loader2 className="animate-spin mr-2" size={16} />
                            ) : (
                              <ShieldCheck className="mr-2" size={16} />
                            )}
                            {payment.payment_status === 'pending' ? 'Verify Payment' : 'Verified'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}