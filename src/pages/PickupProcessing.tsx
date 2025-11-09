import { useState } from 'react';
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
import {
  ClipboardList,
  CheckCircle2,
  Download,
  Truck
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';

// Helper: get 2-letter initials from company name (matches your receipt reference)
const getCompanyInitials = (name: string): string => {
  const cleaned = String(name ?? '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 2).map(w => w[0].toUpperCase()).join('');
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return 'SO'; // fallback
};

// Reference format for receipt and table/csv
const formatReference = (customer: string, date: string, id: number) => {
  // Example: AL/Apr 05, 2025/1001
  return `${getCompanyInitials(customer)}/${date}/${id}`;
};

type ReleaseItem = {
  id: number;
  date: string;        // e.g., 'Apr 05, 2025'
  customer: string;    // Full company name
  product: string;
  quantity: number;
  status: 'Pending' | 'Released' | 'In Transit' | 'Delivered' | string;
  truckNumber?: string;
};

const releaseData: ReleaseItem[] = [
  {
    id: 1001,
    date: 'Apr 05, 2025',
    customer: 'Acme Logistics Ltd.',
    product: 'Premium Motor Spirit (PMS)',
    quantity: 15000,
    status: 'Pending',
    truckNumber: ''
  },
  {
    id: 1002,
    date: 'Apr 06, 2025',
    customer: 'Bravo Oil Co.',
    product: 'Automotive Gas Oil (AGO)',
    quantity: 12000,
    status: 'Released',
    truckNumber: 'TRK-8892'
  },
  // ... other release items
];

export default function Release (){
  const [releases, setReleases] = useState<ReleaseItem[]>(releaseData);
  const [selectedRelease, setSelectedRelease] = useState<ReleaseItem | null>(null);
  const [truckNumber, setTruckNumber] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleRelease = () => {
    if (!selectedRelease) return;
    setReleases(releases.map(item => 
      item.id === selectedRelease.id 
        ? {...item, status: 'Released', truckNumber}
        : item
    ));
    setIsDialogOpen(false);
    setTruckNumber('');
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Order ID', 'Reference', 'Customer', 'Product', 'Quantity', 'Status'];
    const rows = releases.map(item => [
      item.date,
      item.id,
      formatReference(item.customer, item.date, item.id),
      item.customer,
      item.product,
      item.quantity,
      item.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'release_orders.csv');
    link.style.display = 'none';
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
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold">Product Release Dashboard</h1>
              <div className="flex gap-2">
                <Button onClick={exportToCSV} variant="outline">
                  <Download className="mr-1" size={16} />
                  Export CSV
                </Button>
                <Button>
                  <ClipboardList className="mr-1" size={16} />
                  New Release Order
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {releases.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.date}</TableCell>
                      <TableCell>{item.id}</TableCell>
                      <TableCell>
                        {formatReference(item.customer, item.date, item.id)}
                      </TableCell>
                      <TableCell>{item.customer}</TableCell>
                      <TableCell>{item.product}</TableCell>
                      <TableCell>{item.quantity.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={
                          item.status === 'Released' ? 'success' : 
                          item.status === 'In Transit' ? 'warning' : 'default'
                        }>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.status === 'Pending' && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setSelectedRelease(item);
                              setIsDialogOpen(true);
                            }}
                          >
                            <Truck className="mr-1" size={16} />
                            Release
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm Product Release</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Truck/Delivery Number
                    </label>
                    <Input 
                      value={truckNumber}
                      onChange={(e) => setTruckNumber(e.target.value)}
                      placeholder="Enter truck number"
                    />
                  </div>
                  <Button onClick={handleRelease}>
                    <CheckCircle2 className="mr-1" size={16} />
                    Confirm Release
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
};
