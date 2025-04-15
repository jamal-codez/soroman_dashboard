// app/release/page.tsx
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
  Search,
  Truck,
  ClipboardList,
  CheckCircle2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';

const releaseData = [
  {
    id: 1,
    product: 'Premium Motor Spirit (PMS)',
    quantity: 15000,
    destination: 'Lagos Depot',
    status: 'Pending',
    truckNumber: '',
    scheduledDate: 'Apr 05, 2025'
  },
  // ... other release items
];

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

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
      
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Product Release</h1>
            <Button>
              <ClipboardList className="mr-1" size={16} />
              New Release Order
            </Button>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Quantity (Liters)</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Scheduled Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Truck Number</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>{item.product}</TableCell>
                    <TableCell>{item.quantity.toLocaleString()}</TableCell>
                    <TableCell>{item.destination}</TableCell>
                    <TableCell>{item.scheduledDate}</TableCell>
                    <TableCell>
                      <Badge variant={
                        item.status === 'Released' ? 'success' : 
                        item.status === 'In Transit' ? 'warning' : 'default'
                      }>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.truckNumber || 'N/A'}</TableCell>
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