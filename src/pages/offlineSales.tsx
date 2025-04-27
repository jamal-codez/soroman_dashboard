import { useState } from 'react';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Edit,
  Trash,
  Fuel,
  ClipboardList,
  User,
  Truck,
  Plus,
  Search,
  Filter,
  Download,
  Calendar,
  Wallet,
  CheckCircle,
  Clock
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Calendar as DatePicker } from '@/components/ui/calendar';
import { format } from 'date-fns';

interface OfflineSale {
  id: string;
  date: Date;
  staff: string;
  depot: string;
  fuelTypes: string[];
  quantity: number;
  paymentStatus: 'Pending' | 'Paid';
  paymentAmount?: number;
  paymentMethod?: 'Cash' | 'Transfer' | 'Other';
  truckNumbers: string[];
  truckDestinations: string[];
  orderReference?: string;
  notes?: string;
}

const fuelOptions = [
  'Petrol (PMS)',
  'Diesel (AGO)',
  'LPG',
  'Jet Fuel (JET-A1)'
];

export default function OfflineSales() {
  const [sales, setSales] = useState<OfflineSale[]>([
    {
      id: '1',
      date: new Date(),
      staff: 'John Doe',
      depot: 'Depot A',
      fuelTypes: ['Petrol (PMS)', 'Diesel (AGO)'],
      quantity: 1000,
      paymentStatus: 'Paid',
      paymentAmount: 5000,
      paymentMethod: 'Cash',
      truckNumbers: ['ABC123'],
      truckDestinations: ['City A'],
      orderReference: 'ORD001',
      notes: 'Urgent delivery'
    },
    // Add more mock data as needed
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentSale, setCurrentSale] = useState<OfflineSale | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [formData, setFormData] = useState({
    date: new Date(),
    staff: '',
    depot: '',
    fuelTypes: [] as string[],
    quantity: '',
    paymentStatus: 'Pending' as 'Pending' | 'Paid',
    paymentAmount: '',
    paymentMethod: undefined as 'Cash' | 'Transfer' | 'Other' | undefined,
    truckNumbers: [''],
    truckDestinations: [''],
    orderReference: '',
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newSale: OfflineSale = {
      id: Date.now().toString(),
      date: formData.date,
      staff: formData.staff,
      depot: formData.depot,
      fuelTypes: formData.fuelTypes,
      quantity: Number(formData.quantity),
      paymentStatus: formData.paymentStatus,
      paymentAmount: formData.paymentStatus === 'Paid' ? Number(formData.paymentAmount) : undefined,
      paymentMethod: formData.paymentStatus === 'Paid' ? formData.paymentMethod : undefined,
      truckNumbers: formData.truckNumbers.filter(n => n.trim() !== ''),
      truckDestinations: formData.truckDestinations.filter(d => d.trim() !== ''),
      orderReference: formData.orderReference,
      notes: formData.notes
    };

    setSales(prev => currentSale ? 
      prev.map(s => s.id === currentSale.id ? newSale : s) : 
      [...prev, newSale]);
    
    resetForm();
  };

  const handleEdit = (sale: OfflineSale) => {
    setCurrentSale(sale);
    setFormData({
      date: sale.date,
      staff: sale.staff,
      depot: sale.depot,
      fuelTypes: sale.fuelTypes,
      quantity: sale.quantity.toString(),
      paymentStatus: sale.paymentStatus,
      paymentAmount: sale.paymentAmount?.toString() || '',
      paymentMethod: sale.paymentMethod,
      truckNumbers: [...sale.truckNumbers, ''],
      truckDestinations: [...sale.truckDestinations, ''],
      orderReference: sale.orderReference || '',
      notes: sale.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setSales(prev => prev.filter(sale => sale.id !== id));
  };

  const resetForm = () => {
    setFormData({
      date: new Date(),
      staff: '',
      depot: '',
      fuelTypes: [],
      quantity: '',
      paymentStatus: 'Pending',
      paymentAmount: '',
      paymentMethod: undefined,
      truckNumbers: [''],
      truckDestinations: [''],
      orderReference: '',
      notes: ''
    });
    setIsModalOpen(false);
    setCurrentSale(null);
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">Offline Sales Dashboard</h1>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type="text"
                    placeholder="Search sales..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex items-center">
                    <Filter className="mr-1" size={16} />
                    Filter
                  </Button>
                  <Button variant="outline" className="flex items-center">
                    <Download className="mr-1" size={16} />
                    Export
                  </Button>
                  <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                    <DialogTrigger asChild>
                      <Button className="gap-2">
                        <Plus size={18} />
                        New Sale
                      </Button>
                    </DialogTrigger>
                    
                    <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <ClipboardList size={20} />
                          {currentSale ? 'Edit Sale Record' : 'New Offline Sale'}
                        </DialogTitle>
                      </DialogHeader>
                      
                      <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Date</Label>
                            <DatePicker
                              selected={formData.date}
                              onSelect={(date) => date && setFormData({...formData, date})}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Staff Name</Label>
                            <Input
                              required
                              value={formData.staff}
                              onChange={(e) => setFormData({...formData, staff: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Depot</Label>
                            <Input
                              required
                              value={formData.depot}
                              onChange={(e) => setFormData({...formData, depot: e.target.value})}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Fuel Type(s)</Label>
                            <div className="grid grid-cols-2 gap-2">
                              {fuelOptions.map((fuel) => (
                                <label key={fuel} className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    checked={formData.fuelTypes.includes(fuel)}
                                    onChange={(e) => {
                                      const updated = e.target.checked
                                        ? [...formData.fuelTypes, fuel]
                                        : formData.fuelTypes.filter(f => f !== fuel);
                                      setFormData({...formData, fuelTypes: updated});
                                    }}
                                  />
                                  <span>{fuel}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Quantity (Litres)</Label>
                            <Input
                              type="number"
                              required
                              value={formData.quantity}
                              onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Payment Status</Label>
                            <Select
                              value={formData.paymentStatus}
                              onValueChange={(v) => setFormData({...formData, paymentStatus: v as 'Pending' | 'Paid'})}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Pending">Pending</SelectItem>
                                <SelectItem value="Paid">Paid</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {formData.paymentStatus === 'Paid' && (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Payment Amount</Label>
                              <Input
                                type="number"
                                required
                                value={formData.paymentAmount}
                                onChange={(e) => setFormData({...formData, paymentAmount: e.target.value})}
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Payment Method</Label>
                              <Select
                                value={formData.paymentMethod}
                                onValueChange={(v) => setFormData({...formData, paymentMethod: v as any})}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select method" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Cash">Cash</SelectItem>
                                  <SelectItem value="Transfer">Transfer</SelectItem>
                                  <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label>Truck Information</Label>
                          {formData.truckNumbers.map((_, index) => (
                            <div key={index} className="grid grid-cols-2 gap-4">
                              <Input
                                placeholder="Truck Number"
                                value={formData.truckNumbers[index]}
                                onChange={(e) => {
                                  const newTrucks = [...formData.truckNumbers];
                                  newTrucks[index] = e.target.value;
                                  setFormData({...formData, truckNumbers: newTrucks});
                                }}
                              />
                              <Input
                                placeholder="Destination"
                                value={formData.truckDestinations[index]}
                                onChange={(e) => {
                                  const newDests = [...formData.truckDestinations];
                                  newDests[index] = e.target.value;
                                  setFormData({...formData, truckDestinations: newDests});
                                }}
                              />
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setFormData({
                              ...formData,
                              truckNumbers: [...formData.truckNumbers, ''],
                              truckDestinations: [...formData.truckDestinations, '']
                            })}
                          >
                            Add Another Truck
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Order Reference</Label>
                            <Input
                              value={formData.orderReference}
                              onChange={(e) => setFormData({...formData, orderReference: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Notes</Label>
                          <Textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({...formData, notes: e.target.value})}
                          />
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                          <Button 
                            variant="outline" 
                            type="button"
                            onClick={resetForm}
                          >
                            Cancel
                          </Button>
                          <Button type="submit">
                            {currentSale ? 'Save Changes' : 'Create Sale'}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Depot</TableHead>
                    <TableHead>Fuel Types</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Trucks</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                
                <TableBody>
                  {sales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>{format(sale.date, 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{sale.staff}</TableCell>
                      <TableCell>{sale.depot}</TableCell>
                      <TableCell>{sale.fuelTypes.join(', ')}</TableCell>
                      <TableCell className="text-right">{sale.quantity.toLocaleString()} L</TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs ${
                          sale.paymentStatus === 'Paid' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {sale.paymentStatus}
                        </div>
                      </TableCell>
                      <TableCell>
                        {sale.truckNumbers.map((num, i) => (
                          <div key={i} className="text-sm">
                            {num} → {sale.truckDestinations[i]}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell>{sale.orderReference}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:bg-blue-50"
                            onClick={() => handleEdit(sale)}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(sale.id)}
                          >
                            <Trash size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {sales.length === 0 && (
                <div className="p-8 text-center text-slate-500">
                  No sales records found. Start by creating a new sale.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}