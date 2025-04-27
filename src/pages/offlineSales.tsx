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
  Download
} from 'lucide-react';

interface OfflineSale {
  id: string;
  depot: string;
  staff: string;
  litres: number;
  price: number;
  truckNumber: string;
}

export default function OfflineSales(){
  const [sales, setSales] = useState<OfflineSale[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentSale, setCurrentSale] = useState<OfflineSale | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    depot: '',
    staff: '',
    litres: '',
    price: '',
    truckNumber: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newSale = {
      id: Date.now().toString(),
      depot: formData.depot,
      staff: formData.staff,
      litres: Number(formData.litres),
      price: Number(formData.price),
      truckNumber: formData.truckNumber
    };

    setSales(prev => currentSale ? 
      prev.map(s => s.id === currentSale.id ? newSale : s) : 
      [...prev, newSale]
    );
    
    setFormData({ depot: '', staff: '', litres: '', price: '', truckNumber: '' });
    setIsModalOpen(false);
    setCurrentSale(null);
  };

  const handleEdit = (sale: OfflineSale) => {
    setCurrentSale(sale);
    setFormData({
      depot: sale.depot,
      staff: sale.staff,
      litres: sale.litres.toString(),
      price: sale.price.toString(),
      truckNumber: sale.truckNumber
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setSales(prev => prev.filter(sale => sale.id !== id));
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">Offline Sales Management</h1>
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
                    
                    <DialogContent className="sm:max-w-[600px]">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <ClipboardList size={20} />
                          {currentSale ? 'Edit Sale Record' : 'New Offline Sale'}
                        </DialogTitle>
                      </DialogHeader>
                      
                      <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                              <Fuel size={16} />
                              Depot
                            </label>
                            <Input
                              required
                              value={formData.depot}
                              onChange={(e) => setFormData({...formData, depot: e.target.value})}
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                              <User size={16} />
                              Staff
                            </label>
                            <Input
                              required
                              value={formData.staff}
                              onChange={(e) => setFormData({...formData, staff: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Litres</label>
                            <Input
                              type="number"
                              required
                              value={formData.litres}
                              onChange={(e) => setFormData({...formData, litres: e.target.value})}
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Price (₦/L)</label>
                            <Input
                              type="number"
                              required
                              value={formData.price}
                              onChange={(e) => setFormData({...formData, price: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                            <Truck size={16} />
                            Truck Number
                          </label>
                          <Input
                            required
                            value={formData.truckNumber}
                            onChange={(e) => setFormData({...formData, truckNumber: e.target.value})}
                          />
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                          <Button 
                            variant="outline" 
                            type="button"
                            onClick={() => setIsModalOpen(false)}
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
                    <TableHead>DEPOT</TableHead>
                    <TableHead>STAFF</TableHead>
                    <TableHead className="text-right">LITRES</TableHead>
                    <TableHead className="text-right">PRICE (₦/L)</TableHead>
                    <TableHead>TRUCK NO.</TableHead>
                    <TableHead className="text-right">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                
                <TableBody>
                  {sales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">{sale.depot}</TableCell>
                      <TableCell>{sale.staff}</TableCell>
                      <TableCell className="text-right">{sale.litres.toLocaleString()} L</TableCell>
                      <TableCell className="text-right">₦{sale.price.toLocaleString()}</TableCell>
                      <TableCell>{sale.truckNumber}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                            onClick={() => handleEdit(sale)}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
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
};