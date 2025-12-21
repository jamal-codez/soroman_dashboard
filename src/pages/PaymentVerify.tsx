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
import { Search, ShieldCheck, Loader2, Download } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format, isThisMonth, isThisWeek, isThisYear, isToday } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { getOrderReference } from '@/lib/orderReference';

interface PaymentOrder {
  id: number;
  order_id: string | number;
  amount: string;
  status: 'paid' | 'pending' | 'failed';
  payment_channel: string;
  created_at: string;
  reference: string;
  updated_at: string;

  // Account object (as commonly returned by the API)
  acct?: {
    id: number;
    acct_no: string;
    bank_name: string;
    name: string;
  };

  // Some APIs might use different keys
  bank_account?: {
    acct_no?: string;
    account_number?: string;
    bank_name?: string;
    bank?: string;
    name?: string;
    account_name?: string;
  };
  account?: {
    acct_no?: string;
    account_number?: string;
    bank_name?: string;
    bank?: string;
    name?: string;
    account_name?: string;
  };

  // Possible top-level fallbacks
  acct_no?: string;
  bank_name?: string;
  account_name?: string;
}

interface OrderResponse {
  count: number;
  results: PaymentOrder[];
}

// Replace old PaymentDetailsModal + ConfirmationModal with a single confirm dialog
function VerifyConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  payment,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  payment: PaymentOrder | null;
}) {
  if (!payment) return null;
  const createdDate = new Date(payment.created_at);
  const { acct_no, name, bank_name } = extractAccountDetails(payment);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-500">Date</div>
              <div className="font-medium text-slate-900">
                {Number.isNaN(createdDate.getTime()) ? '—' : createdDate.toLocaleString('en-GB')}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Order Reference</div>
              <div className="font-medium text-slate-900">{getOrderReference(payment) || payment.order_id}</div>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-2">Account Details</div>
            <div className="font-medium text-slate-900">Acct No: {acct_no || '—'}</div>
            <div className="text-slate-700">Name: {name || '—'}</div>
            <div className="text-slate-700">Bank: {bank_name || '—'}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-500">Amount</div>
              <div className="font-semibold text-slate-950">₦{parseFloat(payment.amount || '0').toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Status</div>
              <div>
                <Badge className={getStatusClass(payment.status.toLowerCase())}>
                  {payment.status.toLowerCase()}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onConfirm}>Confirm</Button>
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

// Extract account details robustly from possible shapes
function extractAccountDetails(p: PaymentOrder) {
  const rec = p as unknown as Record<string, unknown>;
  const acctLike = (rec.acct || rec.bank_account || rec.account || {}) as Record<string, unknown>;

  const acct_no =
    (typeof acctLike.acct_no === 'string' ? acctLike.acct_no : undefined) ||
    (typeof acctLike.account_number === 'string' ? acctLike.account_number : undefined) ||
    (typeof rec.acct_no === 'string' ? (rec.acct_no as string) : '') ||
    '';

  const name =
    (typeof acctLike.name === 'string' ? acctLike.name : undefined) ||
    (typeof acctLike.account_name === 'string' ? acctLike.account_name : undefined) ||
    (typeof rec.account_name === 'string' ? (rec.account_name as string) : '') ||
    '';

  const bank_name =
    (typeof acctLike.bank_name === 'string' ? acctLike.bank_name : undefined) ||
    (typeof acctLike.bank === 'string' ? acctLike.bank : undefined) ||
    (typeof rec.bank_name === 'string' ? (rec.bank_name as string) : '') ||
    '';

  return { acct_no, name, bank_name };
}

export default function PaymentVerification() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today'|'week'|'month'|'year'|null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [updatingPaymentId, setUpdatingPaymentId] = useState<number | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentOrder | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const { toast } = useToast();

  const { data: apiResponse, isLoading } = useQuery<OrderResponse>({
    queryKey: ['verify-orders', 'all'],
    queryFn: async () => {
      const response = await apiClient.admin.getVerifyOrders({
        search: '',
        page: 1,
        page_size: 10000,
      });
      return response;
    },
    refetchOnWindowFocus: false,
  });

  const allPayments = useMemo(() => apiResponse?.results || [], [apiResponse?.results]);

  const uniqueLocations = useMemo(() => {
    const locs = allPayments
      .map((p) => {
        const rec = p as unknown as Record<string, unknown>;
        const pickup = (rec.pickup as Record<string, unknown> | undefined) || undefined;
        return (rec.state as string) || (rec.location as string) || (pickup?.state as string);
      })
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    return Array.from(new Set(locs)).sort();
  }, [allPayments]);

  const filteredPayments = useMemo(() => {
    return allPayments
      .filter(p => (p.status || '').toLowerCase() === 'pending')
      .filter(p => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        return (
          String(getOrderReference(p) || '').toLowerCase().includes(q)
        );
      })
      .filter(p => {
        if (!filterType) return true;
        const d = new Date(p.created_at);
        if (filterType === 'today') return isToday(d);
        if (filterType === 'week') return isThisWeek(d);
        if (filterType === 'month') return isThisMonth(d);
        if (filterType === 'year') return isThisYear(d);
        return true;
      })
      .filter(p => {
        if (!locationFilter) return true;
        const rec = p as unknown as Record<string, unknown>;
        const pickup = (rec.pickup as Record<string, unknown> | undefined) || undefined;
        const loc = (rec.state as string) || (rec.location as string) || (pickup?.state as string);
        return loc === locationFilter;
      });
  }, [allPayments, searchQuery, filterType, locationFilter]);

  const updatePaymentMutation = useMutation({
    mutationFn: async (orderId: number) => {
      setUpdatingPaymentId(orderId);
      try {
        await apiClient.admin.updateOrderStatus({
          id: orderId,
          status: 'paid',
        });
      } finally {
        setUpdatingPaymentId(null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verify-orders'] });
      queryClient.invalidateQueries({ queryKey: ['verify-orders', 'all'] });
      toast({ title: 'Success!', description: 'Payment verified successfully!' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Error',
        description: message || 'Failed to verify payment',
        variant: 'destructive',
      });
    },
  });

  const handleVerifyClick = (payment: PaymentOrder) => {
    setSelectedPayment(payment);
    setIsConfirmModalOpen(true);
  };

  const handleConfirm = async () => {
    if (!selectedPayment?.id) return;
    try {
      await updatePaymentMutation.mutateAsync(selectedPayment.id);
    } finally {
      setIsConfirmModalOpen(false);
      setSelectedPayment(null);
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Order Reference', 'Account No', 'Account Name', 'Bank', 'Amount', 'Status'];
    const rows = filteredPayments.map(p => {
      const { acct_no, name, bank_name } = extractAccountDetails(p);
      return [
        format(new Date(p.created_at), 'dd/MM/yyyy'),
        getOrderReference(p) || p.order_id,
        acct_no,
        name,
        bank_name,
        p.amount,
        p.status,
      ];
    });

    const csvContent = [headers, ...rows]
      .map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `pending_payments_${new Date().toISOString()}.csv`);
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
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Confirm Payments"
              // description="Verify pending payments and mark orders as paid."
              actions={
                <Button onClick={exportToCSV}>
                  <Download className="mr-1" size={16} /> Export
                </Button>
              }
            />

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col lg:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      placeholder="Search by order reference or ID..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <select
                    aria-label="Timeframe filter"
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
                    aria-label="Location filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={locationFilter ?? ''}
                    onChange={(e) => setLocationFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Locations</option>
                    {uniqueLocations.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>

                  <div className="text-sm text-slate-600 flex items-center">
                    Showing <span className="mx-1 font-semibold text-slate-900">{filteredPayments.length}</span> pending payments
                  </div>
                </div> */}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Order Reference</TableHead>
                    <TableHead>Account Details</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(5)].map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-4 w-40" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-24 text-slate-500">
                        No pending payments found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPayments.map((payment) => {
                      const { acct_no, name, bank_name } = extractAccountDetails(payment);
                      return (
                        <TableRow key={payment.id}>
                          <TableCell>
                            {new Date(payment.created_at).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell className="font-semibold text-slate-950">
                            {getOrderReference(payment) || payment.order_id}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">Acct No: {acct_no || '—'}</span>
                              <span className="text-slate-600">Name: {name || '—'}</span>
                              <span className="text-slate-600">Bank: {bank_name || '—'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-slate-950">
                            ₦{parseFloat(payment.amount || '0').toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusClass(payment.status.toLowerCase())}>
                              {payment.status.toLowerCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={updatingPaymentId === payment.id}
                              onClick={() => handleVerifyClick(payment)}
                            >
                              {updatingPaymentId === payment.id ? (
                                <Loader2 className="animate-spin mr-2" size={16} />
                              ) : (
                                <ShieldCheck className="mr-1" size={16} />
                              )}
                              Confirm
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <VerifyConfirmModal
          isOpen={isConfirmModalOpen}
          onClose={() => {
            setIsConfirmModalOpen(false);
            setSelectedPayment(null);
          }}
          onConfirm={handleConfirm}
          payment={selectedPayment}
        />
      </div>
    </div>
  );
}
