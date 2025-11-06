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
  Truck,
  ClipboardList,
  CheckCircle2,
  Download
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';

// Your existing sample shape (kept intact so mapping works)
const releaseData = [
  {
    id: 1,
    product: 'Premium Motor Spirit (PMS)',
    quantity: 15000,
    destination: 'Lagos Depot',
    status: 'Pending',
    truckNumber: '',
    scheduledDate: 'Apr 05, 2025',
    // Optional fields if available in your real data:
    // date: 'Apr 05, 2025',
    // created_at: '2025-04-05T09:00:00Z',
    // customerName: 'Acme Energy Ltd.',
    // customer: { name: 'Acme Energy Ltd.' },
    // user: { first_name: 'John', last_name: 'Doe' },
    // fuelType: 'PMS',
    // qty: 15000,
  },
];

// Helpers to safely derive columns from different possible shapes
function getDate(item: any): string {
  const raw = item?.date || item?.created_at || item?.scheduledDate || '';
  if (!raw) return '—';
  // If it looks like an ISO date, format it, else pass through string (e.g., "Apr 05, 2025")
  const d = new Date(raw);
  return isNaN(d.getTime())
    ? String(raw)
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getCustomerName(item: any): string {
  if (item?.customerName) return item.customerName;
  if (item?.customer?.name) return item.customer.name;
  const fn = item?.user?.first_name;
  const ln = item?.user?.last_name;
  const full = [fn, ln].filter(Boolean).join(' ').trim();
  return full || '—';
}

function getFuelType(item: any): string {
  return item?.fuelType || item?.product || '—';
}

function getQty(item: any): number {
  return typeof item?.qty !== 'undefined' ? Number(item.qty)
       : typeof item?.quantity !== 'undefined' ? Number(item.quantity)
       : 0;
}

export default function Release (){
  const [releases, setReleases] = useState(releaseData);
  const [selectedRelease, setSelectedRelease] = useState<any>(null);
  const [truckNumber, setTruckNumber] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleRelease = () => {
    setReleases(releases.map(item => 
      item.id === selectedRelease.id 
        ? {...item, status: 'Released', truckNumber}
        : item
    ));
    setIsDialogOpen(false);
    setTruckNumber('');
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Order ID', 'Customer Name', 'Fuel Type', 'Quantity (Liters)', 'Status'];
    const rows = releases.map(item => [
      getDate(item),
      `#${item.id}`,
      getCustomerName(item),
      getFuelType(item),
      getQty(item),
      item.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
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
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Fuel Type</TableHead>
                    <TableHead>Qty (Liters)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {releases.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{getDate(item)}</TableCell>
                      <TableCell>#{item.id}</TableCell>
                      <TableCell>{getCustomerName(item)}</TableCell>
                      <TableCell>{getFuelType(item)}</TableCell>
                      <TableCell>{getQty(item).toLocaleString()}</TableCell>
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
