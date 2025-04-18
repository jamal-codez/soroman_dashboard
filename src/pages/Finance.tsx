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
  Loader2
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
  updated_at: string;
}

interface StatePrice {
  id: number;
  name: string;
  price: number;
}

interface BankAccount {
  id: number;
  bank_name: string;
  account_number: string;
  account_name: string;
}

export default function Finance() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');

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

  const bankAccountsQuery = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.consumer.getBankAccounts(),
    retry: 2
  });

  // Mutations
  const updatePriceMutation = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number }) =>
      apiClient.admin.adminUpdateProduct(id, { unit_price: price }),
    onSuccess: () => queryClient.invalidateQueries(['products'])
  });

  const updateStatePriceMutation = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number }) =>
      apiClient.admin.updateStatePrice(id, price),
    onSuccess: () => queryClient.invalidateQueries(['state-prices'])
  });

  const updateBankAccountMutation = useMutation({
    mutationFn: (account: BankAccount) =>
      apiClient.admin.updateBankAccount(account),
    onSuccess: () => queryClient.invalidateQueries(['bank-accounts'])
  });

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

              {/* State Prices Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">State Prices</CardTitle>
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-2">
                  {statePricesQuery.isLoading ? (
                    [...Array(3)].map((_, i) => (
                      <div key={i} className="flex justify-between items-center">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-8 w-24" />
                      </div>
                    ))
                  ) : (
                    statePricesQuery.data?.map((state) => (
                      <div key={state.id} className="flex justify-between items-center">
                        <span className="text-sm">{state.name}</span>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={state.price}
                            onChange={(e) => updateStatePriceMutation.mutate({
                              id: state.id,
                              price: Number(e.target.value)
                            })}
                            className="w-24 h-8"
                          />
                          {updateStatePriceMutation.isLoading && <Loader2 className="animate-spin" />}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Bank Accounts Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Bank Accounts</CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-2">
                  {bankAccountsQuery.isLoading ? (
                    [...Array(2)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))
                  ) : (
                    bankAccountsQuery.data?.map((account) => (
                      <div key={account.id} className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium">{account.bank_name}</p>
                          <p className="text-xs text-muted-foreground">{account.account_number}</p>
                        </div>
                        <Button variant="ghost" size="sm">
                          <MoreVertical size={16} />
                        </Button>
                      </div>
                    ))
                  )}
                  <Button variant="outline" className="w-full mt-2">
                    <Plus size={16} className="mr-2" />
                    Add Account
                  </Button>
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
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={product.unit_price}
                            onChange={(e) => updatePriceMutation.mutate({
                              id: product.id,
                              price: Number(e.target.value)
                            })}
                            className="w-32"
                          />
                        </TableCell>
                        <TableCell>{product.updated_at}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <MoreVertical size={16} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}