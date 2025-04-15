// app/finance/page.tsx
import { useState } from 'react';
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
  ArrowDown
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';

const financialData = [
  {
    id: 1,
    product: 'Premium Motor Spirit (PMS)',
    price: 490,
    orders: 45,
    paid: 38,
    pending: 7,
    lastUpdated: 'Apr 01, 2025'
  },
  {
    id: 2,
    product: 'Automotive Gas Oil (AGO)',
    price: 575,
    orders: 32,
    paid: 28,
    pending: 4,
    lastUpdated: 'Mar 31, 2025'
  },
  {
    id: 3,
    product: 'Liquefied Petroleum Gas (LPG)',
    price: 610,
    orders: 27,
    paid: 25,
    pending: 2,
    lastUpdated: 'Mar 30, 2025'
  },
];

const paymentHistory = [
  {
    id: 1,
    orderId: 'ORD-001',
    amount: '₦245,000',
    status: 'Paid',
    date: 'Apr 01, 2025',
    method: 'Bank Transfer'
  },
  {
    id: 2,
    orderId: 'ORD-002',
    amount: '₦180,500',
    status: 'Pending',
    date: 'Mar 31, 2025',
    method: 'Online Payment'
  },
  {
    id: 3,
    orderId: 'ORD-003',
    amount: '₦320,000',
    status: 'Paid',
    date: 'Mar 30, 2025',
    method: 'Bank Transfer'
  },
];

export default function Finance() {
  const [prices, setPrices] = useState(financialData);
  const [searchQuery, setSearchQuery] = useState('');

  const handlePriceUpdate = (id: number, newPrice: number) => {
    setPrices(prices.map(item => 
      item.id === id ? {...item, price: newPrice} : item
    ));
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
      
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
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
                  <div className="text-2xl font-bold">₦12.4M</div>
                  <div className="flex items-center text-xs text-green-500">
                    <ArrowUp className="h-3 w-3 mr-1" />
                    12.5% vs last month
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
                  <div className="text-2xl font-bold">₦84.5K</div>
                  <div className="flex items-center text-xs text-red-500">
                    <ArrowDown className="h-3 w-3 mr-1" />
                    3.2% vs last month
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
                  <div className="text-2xl font-bold">98.4%</div>
                  <Progress value={98.4} className="h-2 mt-2" />
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
                  <div className="text-2xl font-bold">₦2.1M</div>
                  <div className="text-xs text-muted-foreground">
                    15 outstanding payments
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Price Management Section */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Price Management</h2>
                <Button variant="outline">
                  <Download className="mr-1" size={16} />
                  Export Price List
                </Button>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Current Price</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prices.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.product}</TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          value={item.price}
                          onChange={(e) => handlePriceUpdate(item.id, Number(e.target.value))}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>{item.orders}</TableCell>
                      <TableCell>
                        <Badge variant={item.pending === 0 ? 'default' : 'destructive'}>
                          {item.pending === 0 ? 'All Paid' : `${item.pending} Pending`}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <Receipt className="mr-1" size={16} />
                          View Invoices
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Payment Verification Section */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-4">Payment Verification</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Verify Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentHistory.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.orderId}</TableCell>
                      <TableCell>{item.amount}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'Paid' ? 'default' : 'destructive'}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.method}</TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          disabled={item.status === 'Paid'}
                        >
                          <ShieldCheck className="mr-1" size={16} />
                          Confirm Receipt
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
// commento 