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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface PaymentOrder {
  id: number;
  order_id: string;
  amount: string;
  status: 'paid' | 'pending' | 'failed';
  payment_channel: string;
  created_at: string; // Use the actual created_at from API
  reference: string;
  updated_at: string;
  acct?: {
    id: number;
    acct_no: string;
    bank_name: string;
    name: string;
  };
}

interface OrderResponse {
  count: number;
  results: PaymentOrder[];
}

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  message: string;
}

function ConfirmationModal({ isOpen, onClose, onConfirm, message }: ConfirmationModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Action</DialogTitle>
        </DialogHeader>
        <p>{message}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onConfirm}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PaymentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAllowPayment: () => void;
  created_at: string; // Use the actual created_at from API
}

function PaymentDetailsModal({
  isOpen,
  onClose,
  onAllowPayment,
  created_at,
}: PaymentDetailsModalProps) {
  const createdDate = new Date(created_at);
  const isValidDate = !isNaN(createdDate.getTime());

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payment Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block mb-1 font-medium text-slate-700">Date seen</label>
            <Input
              type="text"
              value={isValidDate ? createdDate.toLocaleDateString('en-GB') : 'Invalid Date'}
              readOnly
            />
          </div>
          <div>
            <label className="block mb-1 font-medium text-slate-700">Time seen</label>
            <Input
              type="text"
              value={isValidDate ? createdDate.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }) : 'Invalid Time'}
              readOnly
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onAllowPayment}>Allow Payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'pending':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

export default function PaymentVerification() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingPaymentId, setUpdatingPaymentId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [selectedPayment, setSelectedPayment] = useState<PaymentOrder | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const { toast } = useToast();

  const { data: apiResponse, isLoading } = useQuery({
    queryKey: ['verify-orders', searchQuery, currentPage],
    queryFn: async () => {
      const response = await apiClient.admin.getVerifyOrders({
        search: searchQuery,
        page: currentPage,
        page_size: pageSize,
      });
      return response;
    },
    keepPreviousData: true,
  });

  const payments = apiResponse?.results || [];
  const totalPages = Math.ceil((apiResponse?.count || 0) / pageSize);

  const updatePaymentMutation = useMutation({
    mutationFn: async (orderId: number) => {
      setUpdatingPaymentId(orderId);
      try {
        await apiClient.admin.updateOrderStatus({
          id: orderId,
          status: 'paid', // Update to match your API's expected status
        });
      } finally {
        setUpdatingPaymentId(null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['verify-orders']);
      toast({
        title: 'Success!',
        description: 'Payment verified successfully!',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to verify payment',
        variant: 'destructive',
      });
    },
  });

  const handleVerifyClick = (payment: PaymentOrder) => {
    setSelectedPayment(payment);
    setIsFormModalOpen(true);
  };

  const handleAllowPayment = () => {
    setIsFormModalOpen(false);
    setIsConfirmModalOpen(true);
  };

  const handleConfirm = async () => {
    if (selectedPayment?.id) {
      try {
        await updatePaymentMutation.mutateAsync(selectedPayment.id);
      } finally {
        setIsConfirmModalOpen(false);
      }
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
                    <TableHead>Reference</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(5)].map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                      </TableRow>
                    ))
                  ) : payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center h-24">
                        No payments found
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{payment.order_id}</TableCell>
                        <TableCell>₦{parseFloat(payment.amount).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge className={getStatusClass(payment.status.toLowerCase())}>
                            {payment.status.toLowerCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>{payment.payment_channel}</TableCell>
                        <TableCell>
                          {new Date(payment.created_at).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell>{payment.reference}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={payment.status.toLowerCase() !== 'pending' || updatingPaymentId === payment.id}
                            onClick={() => handleVerifyClick(payment)}
                          >
                            {updatingPaymentId === payment.id ? (
                              <Loader2 className="animate-spin mr-2" size={16} />
                            ) : (
                              <ShieldCheck className="mr-2" size={16} />
                            )}
                            {payment.status.toLowerCase() === 'pending' ? 'Verify Payment' : 'Verified'}
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
      {selectedPayment && (
        <PaymentDetailsModal
          isOpen={isFormModalOpen}
          onClose={() => setIsFormModalOpen(false)}
          onAllowPayment={handleAllowPayment}
          created_at={selectedPayment.created_at} // Use actual created_at field
        />
      )}
      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirm}
        message="Are you sure you want to verify this payment?"
      />
    </div>
  );
}