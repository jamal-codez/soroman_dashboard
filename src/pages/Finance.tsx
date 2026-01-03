import React, { useState, useEffect } from 'react';

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
  XCircle,
  Pencil
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
import { useToast } from '@/hooks/use-toast';
import { Switch } from "@/components/ui/switch";

import { PageHeader } from '@/components/PageHeader';
import { SummaryCards } from '@/components/SummaryCards';

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
  suspended: boolean;

  // New backend fields
  is_active?: boolean;
  is_primary?: boolean;
  location?: number | { id: number; name: string } | null;
}

export default function Finance() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', acct_no: '', bank_name: '', location_id: '' });
  const [submissionStatus, setSubmissionStatus] = useState<'success' | 'error' | null>(null);
  const [localState, setLocalState] = useState<{ [key: number]: StatePrice }>({});
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; productId: number | null; abbrev:string| null; updatedPrice: number | null }>({
    isOpen: false,
    productId: null,
    abbrev:null,
    updatedPrice: null,
  });
  const [isActive, setIsActive] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBank, setEditingBank] = useState(null);

  const [editFormData, setEditFormData] = useState({
    name: '',
    acct_no: '',
    bank_name: '',
    location_id: '',
  });

  const [selectedBankLocationId, setSelectedBankLocationId] = useState<string>('');
  const [showInactiveBankAccounts, setShowInactiveBankAccounts] = useState(false);

  useEffect(() => {
    if (editingBank) {
      const rec = editingBank as unknown as Record<string, any>;
      const loc = rec.location;
      const locId = typeof loc === 'number' ? loc : (loc && typeof loc.id === 'number' ? loc.id : '');

      setEditFormData({
        name: rec.name,
        acct_no: rec.acct_no,
        bank_name: rec.bank_name,
        location_id: locId ? String(locId) : '',
      });
    }
  }, [editingBank]);

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };
  
  const handleEditSubmit = async () => {
    if (!editingBank) return;

    await apiClient.admin.editBankAccount(editingBank.id, {
      ...editFormData,
      location_id: editFormData.location_id ? Number(editFormData.location_id) : null,
    });

    setShowEditModal(false);
    setEditingBank(null);
    queryClient.invalidateQueries({ queryKey: ['banks'] });
  };

  const [confirmDialogState, setConfirmDialogState] = useState<{ isOpen: boolean; stateId: number | null; statename: string | null; updatedPrice: number | null }>({
    isOpen: false,
    statename: null,
    updatedPrice: null,
    stateId: null,
  });

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
    queryKey: ['banks', selectedBankLocationId, showInactiveBankAccounts],
    queryFn: () =>
      apiClient.admin.getBankAccounts({
        location_id: selectedBankLocationId || undefined,
        active: showInactiveBankAccounts ? 'false' : 'true',
      }),
    retry: 2,
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

  const updatePriceMutation = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number }) =>
      apiClient.admin.updateProductPrice(id, { unit_price: price }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
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
      queryClient.invalidateQueries({ queryKey: ['states'] });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error',
        description: 'Failed to update state price. Please try again.',
        variant: "destructive",
      });
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error updating state price:', message);
    }
  });

  const addBankAccountMutation = useMutation({
    mutationFn: (data: { name: string; acct_no: string; bank_name: string; location_id?: number | null }) =>
      apiClient.admin.postBankAccount(data as any),
    onSuccess: () => {
      setSubmissionStatus('success');
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      setTimeout(() => {
        setIsModalOpen(false);
        setSubmissionStatus(null);
      }, 2000);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error adding bank account:', message);
      setSubmissionStatus('error');
      setTimeout(() => setSubmissionStatus(null), 2000);
    }
  });

  const handleToggle = async (id:number) => {
    // backend now toggles is_active per account (and syncs suspended)
    await toggleSuspend(id);
    queryClient.invalidateQueries({ queryKey: ['banks'] });
  };

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

    addBankAccountMutation.mutate(
      {
        name: formData.name,
        acct_no: formData.acct_no,
        bank_name: formData.bank_name,
        location_id: formData.location_id ? Number(formData.location_id) : null,
      },
      {
        onSuccess: () => setSubmissionStatus('success'),
        onError: () => setSubmissionStatus('error'),
      }
    );
  };

  const toggleSuspendMutation = useMutation({
    mutationFn: ({ id, suspend }: { id: number; suspend: boolean }) =>
      apiClient.admin.toggleBankSuspend(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] });
    },
    onError: (error) => {
      console.error('Toggle suspend failed:', error);
    }
  });

  const toggleSuspend = async (id: number, suspend?: boolean) => {
    await toggleSuspendMutation.mutateAsync({ id, suspend });
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
            toast({
              title: "Success!",
              description: "Product Price updated successfully",
            });
            queryClient.invalidateQueries({ queryKey: ['products'] });
          },
          onError: () => {
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

  const summaryItems = [
    {
      title: 'Total Revenue',
      value: financeOverviewQuery.isLoading
        ? '—'
        : `₦${(financeOverviewQuery.data?.total_revenue || 0).toLocaleString()}`,
      icon: CircleDollarSign,
      hint: financeOverviewQuery.isLoading
        ? 'Loading…'
        : `${(financeOverviewQuery.data?.revenue_change || 0) >= 0 ? '+' : '-'}${Math.abs(
            financeOverviewQuery.data?.revenue_change || 0
          )}%`,
    },
    // {
    //   title: 'Avg Transaction Value',
    //   value: financeOverviewQuery.isLoading
    //     ? '—'
    //     : `₦${Number((financeOverviewQuery.data?.avg_transaction_value || 0).toFixed(0)).toLocaleString()}`,
    //   icon: TrendingUp,
    //   hint: financeOverviewQuery.isLoading
    //     ? 'Loading…'
    //     : `${(financeOverviewQuery.data?.avg_transaction_value_change || 0) >= 0 ? '+' : '-'}${Math.abs(
    //         financeOverviewQuery.data?.avg_transaction_value_change || 0
    //       )}%`,
    // },
    {
      title: 'Pending Payments',
      value: financeOverviewQuery.isLoading
        ? '—'
        : `₦${(financeOverviewQuery.data?.pending_payments_amount || 0).toLocaleString()}`,
      icon: Wallet,
      hint: financeOverviewQuery.isLoading
        ? 'Loading…'
        : `${financeOverviewQuery.data?.pending_payments || 0} pending`,
    },
    {
      title: 'Payment Success',
      value: financeOverviewQuery.isLoading
        ? '—'
        : `${financeOverviewQuery.data?.payment_success_rate?.toFixed(1) || '0.0'}%`,
      icon: Banknote,
      hint: 'Success rate',
    },
  ] as const;

  const summaryCards = summaryItems.map((s) => {
    const tone: 'neutral' | 'green' | 'red' =
      s.title === 'Total Revenue'
        ? ((financeOverviewQuery.data?.revenue_change || 0) >= 0 ? 'green' : 'red')
        : 'neutral';

    return {
      title: s.title,
      value: s.value,
      description: s.hint,
      icon: <s.icon className="h-5 w-5" />,
      tone,
    };
  });

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
      
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Finance Dashboard"
              // description="Revenue, payments, delivery rates, and bank accounts."
            />

            <div className="pt-1 pb-1">
              <SummaryCards cards={summaryCards} />
            </div>

            {/* Bank Accounts */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h2 className="text-lg font-semibold">Bank Accounts</h2>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <select
                    aria-label="Filter bank accounts by location"
                    className="border border-gray-300 rounded px-3 py-2 h-10"
                    value={selectedBankLocationId}
                    onChange={(e) => setSelectedBankLocationId(e.target.value)}
                  >
                    <option value="">All Locations</option>
                    {stateQuery.data?.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">Show inactive</span>
                    <Switch
                      checked={showInactiveBankAccounts}
                      onCheckedChange={setShowInactiveBankAccounts}
                    />
                  </div>
                </div>
              </div>
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
                      <TableHead>Location</TableHead>
                      <TableHead>Bank Name</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Account Number</TableHead>
                      <TableHead>Date Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bankQuery.data?.map((bank) => {
                      const rec = bank as unknown as Record<string, any>;
                      const loc = rec.location;
                      const locName =
                        (loc && typeof loc === 'object' && typeof loc.name === 'string' ? loc.name : '') ||
                        '';
                      const isActive = typeof rec.is_active === 'boolean' ? rec.is_active : !rec.suspended;

                      return (
                        <TableRow key={bank.id}>
                          <TableCell className="font-medium">{locName || '—'}</TableCell>
                          <TableCell className="font-medium">{bank.bank_name}</TableCell>
                          <TableCell className="font-medium">{bank.name}</TableCell>
                          <TableCell className="font-medium">{bank.acct_no}</TableCell>
                          <TableCell className="font-medium">{new Date(bank.created_at).toISOString().slice(0, 10)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-4">
                              <Switch
                                checked={isActive}
                                onCheckedChange={() => handleToggle(bank.id)}
                                className={`data-[state=unchecked]:bg-red-500 data-[state=checked]:bg-green-500`}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingBank(bank as any);
                                  setShowEditModal(true);
                                }}
                              >
                                <Pencil size={16} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <div className="flex justify-end mt-4">
                <Button onClick={() => setIsModalOpen(true)}>
                  Add Bank Account
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <select
              aria-label="Location"
              className="border border-gray-300 rounded px-3 py-2 h-11 w-full"
              value={formData.location_id}
              onChange={(e) => setFormData((p) => ({ ...p, location_id: e.target.value }))}
            >
              <option value="">All Locations (optional)</option>
              {stateQuery.data?.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
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
            <Button onClick={handleSubmit}>
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
              onClick={handleConfirm}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bank Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <select
              aria-label="Location"
              className="border border-gray-300 rounded px-3 py-2 h-11 w-full"
              value={editFormData.location_id}
              onChange={(e) => setEditFormData((p) => ({ ...p, location_id: e.target.value }))}
            >
              <option value="">All Locations (optional)</option>
              {stateQuery.data?.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
            <Input
              name="name"
              placeholder="Account Name"
              value={editFormData.name}
              onChange={handleEditInputChange}
            />
            <Input
              name="acct_no"
              placeholder="Account Number"
              value={editFormData.acct_no}
              onChange={handleEditInputChange}
            />
            <Input
              name="bank_name"
              placeholder="Bank Name"
              value={editFormData.bank_name}
              onChange={handleEditInputChange}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
            >
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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