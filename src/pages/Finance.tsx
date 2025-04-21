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
  TrendingUp,
  Wallet,
  Banknote,
  Clock,
  ArrowUp,
  ArrowDown,
  Plus,
  MoreVertical,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
// import { useToast } from '@/components/ui/toast'; // Import toast hook
import { useToast } from '@/hooks/use-toast';

interface FinanceOverview {
  total_revenue: number;
  revenue_change: number;
  avg_transaction_value: number;
  avg_transaction_value_change: number;
  payment_success_rate: number;
  pending_payments: number;
  pending_payments_amount: number;
}

interface Product {
  id: number;
  name: string;
  abbreviation: string;
  unit_price: number;
  updated_at: string;
}

interface StatePrice {
  id: number;
  name: string;
  abbreviation: string;
  price: number;
  updated_at: string;
}

interface BankAccount {
  id: number;
  bank_name: string;
  acct_no: string;
  name: string;
  created_at: string;
}

export default function Finance() {
  const queryClient = useQueryClient();
  const { toast } = useToast(); // Initialize toast
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', acct_no: '', bank_name: '' });
  const [submissionStatus, setSubmissionStatus] = useState<'success' | 'error' | null>(null);
  const [localState, setLocalState] = useState<{ [key: number]: StatePrice }>({});
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; productId: number | null; abbrev:string| null; updatedPrice: number | null }>({
    isOpen: false,
    productId: null,
    abbrev:null,
    updatedPrice: null,
  });

  const [confirmDialogState, setConfirmDialogState] = useState<{ isOpen: boolean; stateId: number | null; statename: string | null; updatedPrice: number | null }>({
    isOpen: false,
    statename: null,
    updatedPrice: null,
    stateId: null,
  });

  // Separate queries for each data source
  const financeOverviewQuery = useQuery<FinanceOverview>({
    queryKey: ['finance-overview'],
    queryFn: () => apiClient.admin.getFinanceOverview(),
    retry: 2
  });

  const productsQuery = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => apiClient.admin.adminGetProducts(),
    select: (data) => data.map(product => ({
      ...product,
      updated_at: new Date(product.updated_at).toLocaleDateString('en-US')
    })),
    retry: 2
  });

  const statePricesQuery = useQuery<StatePrice[]>({
    queryKey: ['state-prices'],
    queryFn: () => apiClient.admin.getStates(),
    retry: 2
  });

  const bankQuery = useQuery<BankAccount[]>({
    queryKey: ['banks'],
    queryFn: () => apiClient.admin.getBanks(),
    retry: 2
  });

  const stateQuery = useQuery<StatePrice[]>({
    queryKey: ['states'],
    queryFn: () => apiClient.admin.getStates(),
    retry: 2
  });

  const bankAccountsQuery = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.admin.getBankAccounts(),
    retry: 2
  });

  // Mutations
  const updatePriceMutation = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number }) =>
      apiClient.admin.updateProductPrice(id, { unit_price: price }),
    onSuccess: () => {
      queryClient.invalidateQueries(['products']);
    },
    onError: () => {
    },
  });

  const updateStatePriceMutation = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number }) =>
      apiClient.admin.patchStatePrice(id, { price }),
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "State Price updated successfully",
      });
      queryClient.invalidateQueries(['states']);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: 'Failed to update state price. Please try again.',
        variant: "destructive",
      });
      console.error('Error updating state price:', error.message);
    }
  });

  // const updateBankAccountMutation = useMutation({
  //   mutationFn: (account: BankAccount) =>
  //     apiClient.admin.updateBankAccount(account),
  //   onSuccess: () => queryClient.invalidateQueries(['bank-accounts'])
  // });

  const addBankAccountMutation = useMutation({
    mutationFn: (data: { name: string; acct_no: string; bank_name: string }) =>
      apiClient.admin.postBankAccount(data),
    onSuccess: () => {
      setSubmissionStatus('success');
      queryClient.invalidateQueries(['bank-accounts']);
      setTimeout(() => {
        setIsModalOpen(false);
        setSubmissionStatus(null);
      }, 2000);
    },
    onError: (error: any) => {
      console.error('Error adding bank account:', error.message);
      setSubmissionStatus('error');
      setTimeout(() => setSubmissionStatus(null), 2000);
    }
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.acct_no || !formData.bank_name) {
      setSubmissionStatus('error');
      setTimeout(() => setSubmissionStatus(null), 2000);
      return;
    }
    addBankAccountMutation.mutate(formData, {
      onSuccess: () => {
        setSubmissionStatus('success');
      },
      onError: () => {
        setSubmissionStatus('error');
      },
    });
  };

  const handleConfirm = () => {
    if (confirmDialog.productId !== null && confirmDialog.updatedPrice !== null) {
      updatePriceMutation.mutate(
        {
          id: confirmDialog.productId,
          price: confirmDialog.updatedPrice,
        },
        {
          onSuccess: () => {
            // alert('Product price updated successfully!');
            toast({
              title: "Success!",
              description: "Product Price updated successfully",
            });
            queryClient.invalidateQueries(['products']);
            // toast({
            //   title: 'Success',
            //   description: 'Product price updated successfully!',
            //   variant: 'success',
            // });
          },
          onError: () => {
            // alert('Failed to update product price. Please try again.');
            toast({
              title: 'Error',
              description: 'Failed to update product price. Please try again.',
              variant: "destructive",
            });
          },
        }
      );
    }
    setConfirmDialog({ isOpen: false, productId: null,abbrev:null, updatedPrice: null });
  };

  const paginatedStates = stateQuery.data?.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil((stateQuery.data?.length || 0) / itemsPerPage);

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
      
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">Finance Dashboard</h1>
              <Button className="bg-[#169061] hover:bg-[#169061]/90">
                <Download className="mr-1" size={16} />
                Export Report
              </Button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {/* Total Revenue Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {financeOverviewQuery.isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-7 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  ) : (
                    <>
                      <div className="text-2xl font-bold">
                        ₦{(financeOverviewQuery.data?.total_revenue || 0).toLocaleString()}
                      </div>
                      <div className={`flex items-center text-xs ${
                        (financeOverviewQuery.data?.revenue_change || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {(financeOverviewQuery.data?.revenue_change || 0) >= 0 ? (
                          <ArrowUp className="h-3 w-3 mr-1" />
                        ) : (
                          <ArrowDown className="h-3 w-3 mr-1" />
                        )}
                        {Math.abs(financeOverviewQuery.data?.revenue_change || 0)}%
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Transaction Value</CardTitle>
                  <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {financeOverviewQuery.isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-7 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  ) : (
                    <>
                      <div className="text-2xl font-bold">
                      ₦{Number((financeOverviewQuery.data?.avg_transaction_value || 0).toFixed(0)).toLocaleString()}
                        {/* ₦{((financeOverviewQuery.data?.avg_transaction_value || 0)?.toFixed(0)).toLocaleString()} */}
                      </div>
                      <div className={`flex items-center text-xs ${
                        (financeOverviewQuery.data?.avg_transaction_value_change || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {(financeOverviewQuery.data?.avg_transaction_value_change || 0) >= 0 ? (
                          <ArrowUp className="h-3 w-3 mr-1" />
                        ) : (
                          <ArrowDown className="h-3 w-3 mr-1" />
                        )}
                        {Math.abs(financeOverviewQuery.data?.avg_transaction_value_change || 0)}%
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Bank Accounts Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-2">
                <div className="text-2xl font-bold">
                ₦{(financeOverviewQuery.data?.pending_payments_amount|| 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {financeOverviewQuery.data?.pending_payments} pending payments
                  </div>
                </CardContent>
              </Card>

              {/* Payment Success Rate Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Payment Success</CardTitle>
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {financeOverviewQuery.isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-7 w-24" />
                      <Skeleton className="h-2 w-full" />
                    </div>
                  ) : (
                    <>
                      <div className="text-2xl font-bold">
                        {financeOverviewQuery.data?.payment_success_rate?.toFixed(1)}%
                      </div>
                      <Progress 
                        value={financeOverviewQuery.data?.payment_success_rate || 0} 
                        className="h-2 mt-2" 
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Product Price Management */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <h2 className="text-lg font-semibold mb-4">Product Price Management</h2>
              {productsQuery.isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-8 w-24" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Price (₦)</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsQuery.data?.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name} - {product.abbreviation}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={localState[product.id]?.unit_price ?? product.unit_price}
                            onChange={(e) => {
                              const updatedPrice = Number(e.target.value);
                              setLocalState((prev) => ({
                                ...prev,
                                [product.id]: { ...product, unit_price: updatedPrice },
                              }));
                            }}
                            className="w-32"
                          />
                        </TableCell>
                        <TableCell>{product.updated_at}</TableCell>
                        <TableCell>
                          <Button
                            className="bg-[#169061] hover:bg-[#169061]/90 flex items-center"
                            onClick={() => {
                              const updatedPrice = localState[product.id]?.unit_price ?? product.unit_price;
                              if (updatedPrice !== product.unit_price) {
                                setConfirmDialog({ isOpen: true, productId: product.id, abbrev:product.abbreviation, updatedPrice });
                              }
                            }}
                            disabled={updatePriceMutation.isLoading}
                          >
                            {updatePriceMutation.isLoading ? (
                              <Loader2 className="animate-spin mr-2" size={16} />
                            ) : (
                              'Edit'
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Product Price Management */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <h2 className="text-lg font-semibold mb-4">States Settings</h2>
              {stateQuery.isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-8 w-24" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>State</TableHead>
                        <TableHead>Abbreviation</TableHead>
                        <TableHead>Price (₦)</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedStates?.map((state) => (
                        <TableRow key={state.id}>
                          <TableCell className="font-medium">{state.name}</TableCell>
                          <TableCell className="font-medium">{state.abbreviation}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={localState[state.id]?.price ?? state.price}
                              onChange={(e) => {
                                const updatedPrice = Number(e.target.value);
                                setLocalState((prev) => ({
                                  ...prev,
                                  [state.id]: { ...state, price: updatedPrice },
                                }));
                              }}
                              className="w-32"
                            />
                          </TableCell>
                          <TableCell>{new Date(state.updated_at).toISOString().slice(0, 10)}</TableCell>
                          <TableCell>
                            <Button
                              className="bg-[#169061] hover:bg-[#169061]/90 flex items-center"
                              onClick={() => {
                                const updatedPrice = localState[state.id]?.price ?? state.price;
                                if (updatedPrice !== state.price) {
                                  setConfirmDialogState({ isOpen: true, stateId: state.id, statename: state.name, updatedPrice });
                                }
                              }}
                              disabled={updateStatePriceMutation.isLoading}
                            >
                              {updateStatePriceMutation.isLoading ? (
                                <Loader2 className="animate-spin mr-2" size={16} />
                              ) : (
                                'Edit'
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-between items-center mt-4">
                    <Button
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span>
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </>
              )}
            </div>
            {/* Product Price Management */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <h2 className="text-lg font-semibold mb-4">Bank Accounts</h2>
              {bankQuery.isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-8 w-24" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bank Name</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Account Number</TableHead>
                      <TableHead>Date Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bankQuery.data?.map((bank) => (
                      <TableRow key={bank.id}>
                        <TableCell className="font-medium">{bank.bank_name}</TableCell>
                        {/* <TableCell>
                          <Input
                            type="number"
                            value={product.unit_price}
                            onChange={(e) => updatePriceMutation.mutate({
                              id: product.id,
                              price: Number(e.target.value)
                            })}
                            className="w-32"
                          />
                        </TableCell> */}
                        <TableCell className="font-medium">{bank.name}</TableCell>
                        <TableCell className="font-medium">{bank.acct_no}</TableCell>
                        <TableCell className="font-medium">{new Date(bank.created_at).toISOString().slice(0, 10)}</TableCell>
                        {/* <TableCell>
                          <Button variant="ghost" size="sm">
                            <MoreVertical size={16} />
                          </Button>
                        </TableCell> */}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="flex justify-end mt-4">
                <Button className="bg-[#169061] hover:bg-[#169061]/90" onClick={() => setIsModalOpen(true)}>
                  Add Bank Account
                </Button>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              name="name"
              placeholder="Account Name"
              value={formData.name}
              onChange={handleInputChange}
            />
            <Input
              name="acct_no"
              placeholder="Account Number"
              value={formData.acct_no}
              onChange={handleInputChange}
            />
            <Input
              name="bank_name"
              placeholder="Bank Name"
              value={formData.bank_name}
              onChange={handleInputChange}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-[#169061] hover:bg-[#169061]/90" onClick={handleSubmit}>
              {submissionStatus === 'success' ? (
                <CheckCircle className="mr-2" size={16} />
              ) : submissionStatus === 'error' ? (
                <XCircle className="mr-2" size={16} />
              ) : (
                'Submit'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog for Products */}
      <Dialog open={confirmDialog.isOpen} onOpenChange={() => setConfirmDialog({ isOpen: false, productId: null, abbrev:null, updatedPrice: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Update</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to update {confirmDialog.abbrev} to ₦{confirmDialog.updatedPrice}?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ isOpen: false, productId: null,abbrev:null, updatedPrice: null })}>
              Cancel
            </Button>
            <Button
              className="bg-[#169061] hover:bg-[#169061]/90"
              onClick={handleConfirm} // Ensure this calls the correct handler for products
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for States */}
      <Dialog open={confirmDialogState.isOpen} onOpenChange={() => setConfirmDialogState({ isOpen: false, stateId: null, statename:null, updatedPrice: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Update</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to update the {confirmDialogState.statename} state to ₦{confirmDialogState.updatedPrice} ?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogState({ isOpen: false, stateId: null, statename:null, updatedPrice: null })}>
              Cancel
            </Button>
            <Button
              className="bg-[#169061] hover:bg-[#169061]/90"
              onClick={() => {
                if (confirmDialogState.stateId !== null && confirmDialogState.updatedPrice !== null) {
                  updateStatePriceMutation.mutate({
                    id: confirmDialogState.stateId,
                    price: confirmDialogState.updatedPrice,
                  });
                }
                setConfirmDialogState({ isOpen: false, stateId: null, statename:null, updatedPrice: null });
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}