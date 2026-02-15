import { useEffect, useState } from 'react';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
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
  Plus, 
  Search, 
  Filter, 
  Download, 
  Calendar,
  Wallet,
  CheckCircle,
  Clock,
  MapPin,
  Package,
  FileText,
  Truck,
  Fuel,
  ClipboardList,
  Loader2
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as DatePicker } from '@/components/ui/calendar';
import { apiClient } from '@/api/client';

interface OfflineSale {
  id: string;
  date: string;
  state: number;
  trucks?: string[];
  status: 'pending' | 'paid';
  items: Array<{ product: number; quantity: number }>;
  notes?: string;
}

interface State {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
  abbreviation?: string;
  description?: string;
  unit_price?: number;
}

export default function OfflineSales() {
  const [sales, setSales] = useState<OfflineSale[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentSale, setCurrentSale] = useState<OfflineSale | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    state: 0,
    trucks: [''],
    status: 'pending' as 'pending' | 'paid',
    date: new Date().toISOString(),
    items: [{ product: 0, quantity: '' }],
    notes: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [salesRes, statesRes, productsRes] = await Promise.all([
          apiClient.admin.getOfflineSales(),
          apiClient.admin.getStates(),
          apiClient.admin.getProducts({ page_size: 100 }), // Ensure we get all products
        ]);
        
        // Handle potential paginated responses
        setSales(salesRes.results || salesRes);
        setStates(statesRes.results || statesRes);
        setProducts((productsRes.results || productsRes) as Product[]);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  // Error boundary checks
  if (isLoading) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            <Loader2 className="animate-spin" color="green" size={54} />
          </div>
        </div>
      </div>
    );
  }

  if (!sales) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-500">Failed to load sales data</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        items: formData.items
          .filter(item => item.product > 0 && item.quantity)
          .map(item => ({
            product: item.product,
            quantity: Number(item.quantity)
          })),
        trucks: formData.trucks.filter(t => t.trim() !== '')
      };

      const newSale = await apiClient.admin.createOfflineSale(payload);
      setSales(prev => [...prev, newSale]);
      resetForm();
    } catch (error) {
      console.error('Error creating sale:', error);
    }
  };

  const handleEdit = (sale: OfflineSale) => {
    setCurrentSale(sale);
    setFormData({
      state: sale.state,
      trucks: [...(sale.trucks || []), ''],
      status: sale.status,
      date: sale.date,
      items: [...sale.items.map(item => ({ ...item, quantity: item.quantity.toString() })), { product: 0, quantity: '' }],
      notes: sale.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      // You might need to update this to use the correct API endpoint for deleting offline sales
      await apiClient.admin.deleteProduct(Number(id));
      setSales(sales.filter(sale => sale.id !== id));
    } catch (error) {
      console.error('Error deleting sale:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString(),
      state: 0,
      trucks: [''],
      status: 'pending',
      items: [{ product: 0, quantity: '' }],
      notes: ''
    });
    setIsModalOpen(false);
    setCurrentSale(null);
  };

  // Filter sales based on search query with improved null handling
  const filteredSales = sales.filter(sale => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    
    // Handle possible undefined trucks array
    const truckMatch = (sale.trucks || []).some(truck => 
      truck.toLowerCase().includes(query)
    );
    
    // Handle possible undefined notes
    const noteMatch = (sale.notes || '').toLowerCase().includes(query);
    
    // Handle possible undefined items array and product names
    const productMatch = (sale.items || []).some(item => {
      const product = products.find(p => p.id === item.product);
      return product?.name?.toLowerCase().includes(query) || false;
    });

    return truckMatch || noteMatch || productMatch;
  });

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Offline Sales"
              description="Log offline transactions, manage items and trucks, and export sales history."
            />

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
                    
                    <DialogContent className="sm:max-w-[1000px] max-h-[85vh] overflow-y-auto p-0">
                      <DialogHeader className="border-b border-slate-100 px-6 py-4">
                        <DialogTitle className="flex items-center gap-3 text-slate-800">
                          <div className="bg-blue-100 p-2 rounded-lg">
                            <ClipboardList className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <h2 className="text-xl font-semibold">{currentSale ? 'Edit Sale Record' : 'New Offline Sale'}</h2>
                            <p className="text-sm font-normal text-slate-500 mt-1">
                              {currentSale ? 'Update existing sale details' : 'Create new offline sales entry'}
                            </p>
                          </div>
                        </DialogTitle>
                      </DialogHeader>

                      <form onSubmit={handleSubmit} className="flex flex-col h-[70vh]">
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                          {/* Form Sections */}
                          <div className="space-y-6">
                            {/* Header Section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Date Picker */}
                              <div className="space-y-2">
                                <Label className="block text-sm font-medium text-slate-700 mb-2">
                                  <span className="flex items-center gap-2">
                                    <Calendar className="w-5 h-5 text-slate-500" />
                                    Sale Date
                                    <span className="text-red-500 ml-1">*</span>
                                  </span>
                                </Label>
                                <DatePicker
                                  selected={new Date(formData.date)}
                                  onSelect={(date) => date && setFormData({...formData, date: date.toISOString()})}
                                  className="w-full rounded-lg border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-blue-500"
                                />
                              </div>

                              {/* Payment Status */}
                              <div className="space-y-2">
                                <Label className="block text-sm font-medium text-slate-700 mb-2">
                                  <span className="flex items-center gap-2">
                                    <Wallet className="w-5 h-5 text-slate-500" />
                                    Payment Status
                                    <span className="text-red-500 ml-1">*</span>
                                  </span>
                                </Label>
                                <Select
                                  value={formData.status}
                                  onValueChange={(v) => setFormData({...formData, status: v as 'pending' | 'paid'})}
                                >
                                  <SelectTrigger className="w-full h-11 rounded-lg border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-blue-500">
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-lg shadow-lg border border-slate-200">
                                    <SelectItem 
                                      value="pending" 
                                      className="px-4 py-2 hover:bg-slate-50 focus:bg-slate-50"
                                    >
                                      <div className="flex items-center gap-3">
                                        <Clock className="w-4 h-4 text-amber-600" />
                                        <span>Pending</span>
                                      </div>
                                    </SelectItem>
                                    <SelectItem 
                                      value="paid" 
                                      className="px-4 py-2 hover:bg-slate-50 focus:bg-slate-50"
                                    >
                                      <div className="flex items-center gap-3">
                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                        <span>Paid</span>
                                      </div>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* State and Products Section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* State Selection */}
                              <div className="space-y-2">
                                <Label className="block text-sm font-medium text-slate-700 mb-2">
                                  <span className="flex items-center gap-2">
                                    <MapPin className="w-5 h-5 text-slate-500" />
                                    State
                                    <span className="text-red-500 ml-1">*</span>
                                  </span>
                                </Label>
                                <Select
                                  value={formData.state.toString()}
                                  onValueChange={v => setFormData({...formData, state: Number(v)})}
                                >
                                  <SelectTrigger className="w-full h-11 rounded-lg border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-blue-500">
                                    <SelectValue placeholder="Select state" />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-lg shadow-lg border border-slate-200 max-h-60">
                                    {states.map(state => (
                                      <SelectItem 
                                        key={state.id} 
                                        value={state.id.toString()}
                                        className="px-4 py-2 hover:bg-slate-50"
                                      >
                                        {state.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Products Section */}
                              <div className="space-y-2">
                                <Label className="block text-sm font-medium text-slate-700 mb-2">
                                  <span className="flex items-center gap-2">
                                    <Package className="w-5 h-5 text-slate-500" />
                                    Products
                                    <span className="text-red-500 ml-1">*</span>
                                  </span>
                                </Label>
                                <div className="space-y-4">
                                  {formData.items.map((item, index) => (
                                    <div key={index} className="grid grid-cols-2 gap-4 items-center">
                                      <Select
                                        value={item.product.toString()}
                                        onValueChange={v => {
                                          const newItems = [...formData.items];
                                          newItems[index].product = Number(v);
                                          setFormData({...formData, items: newItems});
                                        }}
                                      >
                                        <SelectTrigger className="h-11 rounded-lg border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-blue-500">
                                          <SelectValue placeholder="Select product" />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-lg shadow-lg border border-slate-200 max-h-60">
                                          {products.map(product => (
                                            <SelectItem 
                                              key={product.id} 
                                              value={product.id.toString()}
                                              className="px-4 py-2 hover:bg-slate-50"
                                            >
                                              <div className="flex items-center gap-3">
                                                <Fuel className="w-4 h-4 text-slate-500" />
                                                <span>{product.name}</span>
                                              </div>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Quantity (Liters)"
                                        value={item.quantity}
                                        onChange={e => {
                                          const newItems = [...formData.items];
                                          newItems[index].quantity = e.target.value;
                                          setFormData({...formData, items: newItems});
                                        }}
                                        className="h-11 rounded-lg border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-blue-500"
                                      />
                                    </div>
                                  ))}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full h-11 rounded-lg border-dashed border-slate-300 text-slate-600 hover:text-slate-800 hover:border-solid hover:bg-slate-50"
                                    onClick={() => setFormData({
                                      ...formData,
                                      items: [...formData.items, { product: 0, quantity: '' }]
                                    })}
                                  >
                                    <Plus className="w-4 h-4 mr-2" /> Add Product Line
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Trucks Section */}
                            <div className="space-y-4">
                              <Label className="block text-sm font-medium text-slate-700 mb-2">
                                <span className="flex items-center gap-2">
                                  <Truck className="w-5 h-5 text-slate-500" />
                                  Truck Information
                                </span>
                              </Label>
                              <div className="space-y-3">
                                {formData.trucks.map((truck, index) => (
                                  <div key={index} className="flex items-center gap-4">
                                    <Input
                                      placeholder={`Truck #${index + 1} Plate Number`}
                                      value={truck}
                                      onChange={(e) => {
                                        const newTrucks = [...formData.trucks];
                                        newTrucks[index] = e.target.value;
                                        setFormData({...formData, trucks: newTrucks});
                                      }}
                                      className="h-11 rounded-lg border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-blue-500 flex-1"
                                    />
                                    {index > 0 && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-500 hover:bg-red-50"
                                        onClick={() => setFormData({
                                          ...formData,
                                          trucks: formData.trucks.filter((_, i) => i !== index)
                                        })}
                                      >
                                        <Trash className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full h-11 rounded-lg border-dashed border-slate-300 text-slate-600 hover:text-slate-800 hover:border-solid hover:bg-slate-50"
                                  onClick={() => setFormData({
                                    ...formData,
                                    trucks: [...formData.trucks, '']
                                  })}
                                >
                                  <Plus className="w-4 h-4 mr-2" /> Add Truck
                                </Button>
                              </div>
                            </div>

                            {/* Notes Section */}
                            <div className="space-y-4">
                              <Label className="block text-sm font-medium text-slate-700 mb-2">
                                <span className="flex items-center gap-2">
                                  <FileText className="w-5 h-5 text-slate-500" />
                                  Additional Notes
                                </span>
                              </Label>
                              <Textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                placeholder="Enter any special instructions or notes..."
                                className="min-h-[120px] rounded-lg border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="border-t border-slate-100 px-6 py-4 mt-auto">
                          <div className="flex justify-end gap-3">
                            <Button 
                              variant="outline" 
                              type="button"
                              onClick={resetForm}
                              className="px-6 h-11 rounded-lg border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                            >
                              Cancel
                            </Button>
                            <Button 
                              type="submit"
                              className="px-6 h-11 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-sm"
                            >
                              {currentSale ? 'Save Changes' : 'Create Sale'}
                            </Button>
                          </div>
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
                    <TableHead>State</TableHead>
                    <TableHead>Trucks</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                
                <TableBody>
                  {(sales || []).map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>{new Date(sale.date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {states.find(s => s.id === sale.state)?.name || 'Unknown State'}
                      </TableCell>
                      <TableCell>
                        {sale.trucks ? sale.trucks.join(', ') : 'No trucks'}
                      </TableCell>
                      <TableCell>
                        {(sale.items || []).map((item, i) => (
                          <div key={i}>
                            {products.find(p => p.id === item.product)?.name || 'Unknown Product'} - 
                            {item.quantity}L
                          </div>
                        ))}
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs ${
                          sale.status === 'paid' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {sale.status}
                        </div>
                      </TableCell>
                      <TableCell>{sale.notes || '-'}</TableCell>
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

              {filteredSales.length === 0 && (
                <div className="p-8 text-center text-slate-500">
                  {sales.length === 0 ? 
                    'No sales records found. Start by creating a new sale.' : 
                    'No results found for your search query.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
