import { useState, useMemo } from 'react';
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
  Truck,
  Search
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { format, isThisMonth, isThisWeek, isThisYear, isToday } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';

type ReleaseItem = {
  id: number;
  date: string;
  customer: string;
  product: string;
  quantity: number;
  status: 'Pending' | 'Released' | 'In Transit' | 'Delivered' | string;
  truckNumber?: string;
  reference?: string;
  state?: string;
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

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today'|'week'|'month'|'year'|null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const uniqueLocations = useMemo(() => {
    const locs = releases.map(r => r.state).filter(Boolean) as string[];
    return Array.from(new Set(locs)).sort();
  }, [releases]);

  const filteredReleases = useMemo(() => {
    return releases
      .filter(r => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        return (
          String(r.id).toLowerCase().includes(q) ||
          String(r.reference || '').toLowerCase().includes(q) ||
          String(r.customer || '').toLowerCase().includes(q)
        );
      })
      .filter(r => {
        if (!filterType) return true;
        const d = new Date(r.date);
        if (filterType === 'today') return isToday(d);
        if (filterType === 'week') return isThisWeek(d);
        if (filterType === 'month') return isThisMonth(d);
        if (filterType === 'year') return isThisYear(d);
        return true;
      })
      .filter(r => {
        if (!locationFilter) return true;
        return r.state === locationFilter;
      })
      .filter(r => {
        if (!statusFilter) return true;
        return String(r.status).toLowerCase() === statusFilter.toLowerCase();
      });
  }, [releases, searchQuery, filterType, locationFilter, statusFilter]);

  const exportToCSV = () => {
    const headers = ['Date', 'Order ID', 'Reference', 'Customer', 'Product', 'Quantity', 'Status', 'Location'];
    const rows = filteredReleases.map(item => [
      item.date,
      item.id,
      item.reference || '',
      item.customer,
      item.product,
      item.quantity,
      item.status,
      item.state || '',
    ]);

    const csvContent = [headers, ...rows]
      .map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

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

  const handleRelease = () => {
    if (!selectedRelease) return;
    setReleases(releases.map(item =>
      item.id === selectedRelease.id
        ? { ...item, status: 'Released', truckNumber }
        : item
    ));
    setIsDialogOpen(false);
    setTruckNumber('');
  };

  const getStatusBadgeClass = (status: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'released') return 'bg-green-50 text-green-700 border-green-200';
    if (s === 'in transit') return 'bg-orange-50 text-orange-700 border-orange-200';
    if (s === 'delivered') return 'bg-blue-50 text-blue-700 border-blue-200';
    return 'bg-slate-50 text-slate-700 border-slate-200';
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Product Release"
              description="Release orders, filter by location/status/timeframe, and export reports."
              actions={
                <Button onClick={exportToCSV}>
                  <Download className="mr-1" size={16} /> Export CSV
                </Button>
              }
            />

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col lg:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      placeholder="Search by reference, customer, or ID..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Timeframe"
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <select
                    aria-label="Location"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={locationFilter ?? ''}
                    onChange={(e) => setLocationFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Locations</option>
                    {uniqueLocations.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>

                  <select
                    aria-label="Status"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={statusFilter ?? ''}
                    onChange={(e) => setStatusFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Released">Released</option>
                    <option value="In Transit">In Transit</option>
                    <option value="Delivered">Delivered</option>
                  </select>
                </div>
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
                  {filteredReleases.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.date}</TableCell>
                      <TableCell>{item.id}</TableCell>
                      <TableCell>{item.reference || ''}</TableCell>
                      <TableCell>{item.customer}</TableCell>
                      <TableCell>{item.product}</TableCell>
                      <TableCell>{item.quantity.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusBadgeClass(item.status)}>
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

                  {filteredReleases.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                        No release orders found
                      </TableCell>
                    </TableRow>
                  )}
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
