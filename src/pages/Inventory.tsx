import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
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
  Plus,
  Download,
  Filter,
  CircleAlert,
  Edit,
  RefreshCw,
  Trash,
  MapPin
} from 'lucide-react';
import { apiClient } from '@/api/client';
import AddProductModal from '@/components/AddProductModal';
import { useToast } from '@/hooks/use-toast';
import {
  getCargosByState,
  getActiveCargoNameForStateAndProduct,
} from '@/lib/cargoInventory';
import {
  addInventoryCargoHistoryEntry,
  clearActiveCargoFor,
  getActiveCargoFor,
  getInventoryCargoHistoryFor,
  msToDurationShort,
  setActiveCargoFor,
} from '@/lib/inventoryCargoHistory';

interface Product {
  id: number;
  name: string;
  abbreviation: string;
  stock_quantity: number;
  status: 'In Stock' | 'Low Stock' | 'Critical Stock';
  location: string;
  updated_at: string;
  description: string;
}

type UpdateProductPayload = {
  name: string;
  abbreviation: string;
  description: string;
  unit_price: number;
  stock_quantity: number;
  initial_stock_quantity: number;
};

interface State {
  id: number;
  name: string;
}

const Inventory = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [states, setStates] = useState<State[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    stock_quantity: '',
    abbreviation: '',
    description: ''
  });
  const [editCargoName, setEditCargoName] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editChangeType, setEditChangeType] = useState<'set' | 'increment' | 'decrement'>('set');
  const [editHistoryRefreshKey, setEditHistoryRefreshKey] = useState(0);
  const [formData, setFormData] = useState({ state: 0 });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statesRes] = await Promise.all([
          apiClient.admin.getStates()
        ]);
        const statesData = statesRes.results || statesRes;
        setStates(statesData);
      
      // ✅ Set default state to first item
        if (statesData.length > 0) {
          setFormData(prev => ({ ...prev, state: statesData[0].id }));
        }
        // setStates(statesRes.results || statesRes);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    fetchData();
  }, []);

  const { data: inventory, isLoading, isError, refetch } = useQuery<Product[]>({
    queryKey: ['inventory', formData.state],
    queryFn: async () => {
      return await apiClient.admin.getProductsInventory({ state_id: formData.state });
    },
    enabled: !!formData.state,
    staleTime: 0,
    gcTime: 0,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const adminUpdateProduct = useMutation({
    mutationFn: (updatedProduct: Product) => {
      const payload: UpdateProductPayload = {
        name: updatedProduct.name,
        abbreviation: updatedProduct.abbreviation,
        description: updatedProduct.description,
        // Inventory UI doesn't edit price; keep backend compatible by sending 0 and letting API ignore/validate as needed.
        unit_price: 0,
        stock_quantity: updatedProduct.stock_quantity,
        // Preserve current quantity as initial if the API requires it.
        initial_stock_quantity: updatedProduct.stock_quantity,
      };

      return apiClient.admin.updateProduct(updatedProduct.id, payload, formData.state);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setEditingProduct(null);
      toast({ title: 'Success!', description: 'Product updated successfully', duration: 1000 });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update product',
        variant: 'destructive',
        duration: 1000
      });
    }
  });

  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setEditFormData({
      name: product.name,
      stock_quantity: product.stock_quantity.toString(),
      abbreviation: product.abbreviation,
      description: product.description
    });

    // Prefill cargo name from active cargo selection, then fall back to Cargo Inventory active cargo by state+product.
    const activeSelection = getActiveCargoFor(formData.state, product.id);
    const fallbackCargo = getActiveCargoNameForStateAndProduct(formData.state, product.abbreviation || product.name);
    setEditCargoName(activeSelection?.cargoName || fallbackCargo || '');
    setEditNote('');
    setEditChangeType('set');
    setEditHistoryRefreshKey((k) => k + 1);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleEditSubmit = async () => {
    if (!editingProduct) return;

    const cargoName = String(editCargoName || '').trim();
    if (!cargoName) {
      toast({
        title: 'Cargo name required',
        description: 'Please enter or select a cargo name before updating quantity.',
        variant: 'destructive',
        duration: 1200,
      });
      return;
    }

    const rawQty = Number(editFormData.stock_quantity);
    if (!Number.isFinite(rawQty)) {
      toast({
        title: 'Invalid quantity',
        description: 'Please enter a valid stock quantity.',
        variant: 'destructive',
        duration: 1200,
      });
      return;
    }

    const previousQty = Number(editingProduct.stock_quantity) || 0;
    let nextQty = previousQty;

    if (editChangeType === 'set') nextQty = rawQty;
    if (editChangeType === 'increment') nextQty = previousQty + rawQty;
    if (editChangeType === 'decrement') nextQty = Math.max(0, previousQty - rawQty);

    const updatedProduct = {
      ...editingProduct,
      ...editFormData,
      stock_quantity: nextQty,
      description: editFormData.description
    };

    // Local (frontend-first) cargo tracking.
    setActiveCargoFor(formData.state, editingProduct.id, cargoName);
    addInventoryCargoHistoryEntry({
      stateId: formData.state,
      productId: editingProduct.id,
      productName: editingProduct.name,
      cargoName,
      previousQty,
      nextQty,
      deltaQty: nextQty - previousQty,
      changeType: editChangeType,
      note: String(editNote || '').trim() || undefined,
    });

    await adminUpdateProduct.mutate(updatedProduct);
    setEditHistoryRefreshKey((k) => k + 1);
  };

  const handleDeleteClick = (productId: number) => {
    setProductToDelete(productId);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (productToDelete !== null) {
      setIsDeleting(true);
      try {
        await apiClient.admin.deleteProduct(productToDelete);
        refetch();
        toast({ title: 'Success!', description: 'Product deleted successfully', duration: 1000 });
      } catch (error) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to delete product',
          variant: 'destructive',
          duration: 1000
        });
      } finally {
        setIsDeleting(false);
        setIsDeleteModalOpen(false);
        setProductToDelete(null);
      }
    }
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  const determineStatus = (stockQuantity: number): Product['status'] => {
    if (stockQuantity > 70) return 'In Stock';
    if (stockQuantity > 40) return 'Low Stock';
    return 'Critical Stock';
  };

  const filteredInventory = inventory?.map(item => ({
    ...item,
    status: determineStatus(item.stock_quantity)
  })).filter(item =>
    item.name.toLowerCase().includes(searchQuery) ||
    item.abbreviation.toLowerCase().includes(searchQuery) ||
    item.location.toLowerCase().includes(searchQuery)
  ) || [];

  const getStockBadge = (status: Product['status']) => {
    const styles: Record<Product['status'], string> = {
      'In Stock': 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200',
      'Low Stock': 'bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200',
      'Critical Stock': 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200'
    };
    return <Badge className={styles[status]}>{status}</Badge>;
  };

  const widthClass = (qty: number) => {
    const normalized = Math.max(0, Math.min(100, qty));
    // Bucket into increments of 10 to avoid inline styles.
    const bucket = Math.round(normalized / 10) * 10;
    return `w-[${bucket}%]`;
  };

  if (isError) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 grid place-items-center">
            <div className="text-center space-y-4">
              <CircleAlert className="mx-auto text-red-500" size={40} />
              <h2 className="text-xl font-semibold">Failed to load inventory</h2>
              <Button onClick={() => refetch()}>Retry</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
<style>{`
  [data-state="checked"] > [data-radix-select-item-indicator] {
    display: none !important;
  }
`}</style>

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">All Inventory</h1>
              <div className="flex gap-2">
              </div>
            </div>

            {/* Row 1: Search */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col lg:flex-row gap-3">
                  {/* <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      type="text"
                      placeholder="Search inventory..."
                      className="pl-10 h-11"
                      value={searchQuery}
                      onChange={handleSearch}
                    />
                  </div> */}
                </div>

                {/* Row 2: Filters */}
                <div>
                  <Label className="text-sm font-medium text-slate-700">
                    <span className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-slate-500" />
                      Depot/State<span className="text-red-900 ml-1">*</span>
                    </span>
                  </Label>
                  <div className="mt-2 flex flex-col sm:flex-row gap-4">
                    <Select
                      value={formData.state.toString()}
                      onValueChange={v => setFormData({ ...formData, state: Number(v) })}
                    >
                      <SelectTrigger className="w-full h-11 rounded-lg border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-blue-500">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent className="rounded-lg shadow-lg border border-slate-200 max-h-60">
                        {states.map(state => (
                          <SelectItem
                            key={state.id}
                            value={state.id.toString()}
                            className={`px-4 py-2 relative ${
                              formData.state === state.id ? 'bg-green-100 text-green-900' : 'hover:bg-slate-50'
                            }`}
                          >
                            <span className="pointer-events-none select-none">{state.name}</span>
                            <span className="hidden" data-radix-select-item-indicator />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S/N</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Abbreviation</TableHead>
                    <TableHead>Stock Quantity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">Loading inventory...</TableCell>
                    </TableRow>
                  ) : filteredInventory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">No inventory items found</TableCell>
                    </TableRow>
                  ) : (
                    filteredInventory.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.abbreviation}</TableCell>
                        <TableCell>
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-xs font-medium">
                                {item.stock_quantity.toLocaleString()} Litres
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  item.stock_quantity > 70 ? 'bg-green-500' : item.stock_quantity > 40 ? 'bg-orange-500' : 'bg-red-500'
                                } ${widthClass(item.stock_quantity)}`}
                              ></div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getStockBadge(item.status)}</TableCell>
                        <TableCell>{new Date(item.updated_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditClick(item)}>
                              <Edit size={16} />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(item.id)}>
                              <Trash size={16} className="text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {editingProduct && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">Edit Product</h2>
                      <p className="text-sm text-slate-600">
                        Track updates by cargo name (saved locally until backend support is added).
                      </p>
                    </div>
                    <Button variant="ghost" onClick={() => setEditingProduct(null)}>
                      Close
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                    <div>
                      <div className="space-y-4">
                        <Input name="name" placeholder="Product Name" value={editFormData.name} onChange={handleEditChange} />

                        <div className="space-y-2">
                          <Label>Quantity update mode</Label>
                          <Select value={editChangeType} onValueChange={(v) => setEditChangeType(v as any)}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select update mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="set">Set stock to (absolute)</SelectItem>
                              <SelectItem value="increment">Add quantity</SelectItem>
                              <SelectItem value="decrement">Subtract quantity</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-slate-500">
                            Current stock: <span className="font-medium">{editingProduct.stock_quantity.toLocaleString()}</span>
                          </p>
                        </div>

                        <Input
                          name="stock_quantity"
                          placeholder={editChangeType === 'set' ? 'New Stock Quantity' : 'Quantity'}
                          type="number"
                          value={editFormData.stock_quantity}
                          onChange={handleEditChange}
                        />

                        <Input name="abbreviation" placeholder="Abbreviation" value={editFormData.abbreviation} onChange={handleEditChange} />
                        <Input name="description" placeholder="Description" value={editFormData.description} onChange={handleEditChange} />

                        <div className="space-y-2">
                          <Label>Cargo name</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="e.g. Cargo 12 - Jan 2026"
                              value={editCargoName}
                              onChange={(e) => setEditCargoName(e.target.value)}
                            />
                            <Select
                              value={editCargoName || '__none__'}
                              onValueChange={(v) => setEditCargoName(v === '__none__' ? '' : v)}
                            >
                              <SelectTrigger className="w-[220px]">
                                <SelectValue placeholder="Pick cargo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">(none)</SelectItem>
                                {getCargosByState(formData.state)
                                  .map((c) => c.cargoName)
                                  .filter((v, i, arr) => v && arr.indexOf(v) === i)
                                  .map((name) => (
                                    <SelectItem key={name} value={name}>
                                      {name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {(() => {
                            const active = getActiveCargoFor(formData.state, editingProduct.id);
                            if (!active) return null;
                            const ms = Date.now() - new Date(active.activatedAt).getTime();
                            return (
                              <div className="text-xs text-slate-600 flex items-center justify-between">
                                <span>
                                  Active cargo: <span className="font-medium">{active.cargoName}</span>
                                  <span className="text-slate-400"> · </span>
                                  <span>Active for {msToDurationShort(ms)}</span>
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    clearActiveCargoFor(formData.state, editingProduct.id);
                                    setEditHistoryRefreshKey((k) => k + 1);
                                  }}
                                >
                                  Clear
                                </Button>
                              </div>
                            );
                          })()}
                        </div>

                        <div className="space-y-2">
                          <Label>Note (optional)</Label>
                          <Input placeholder="Reason / comment" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-6">
                        <Button variant="outline" onClick={() => setEditingProduct(null)}>
                          Cancel
                        </Button>
                        <Button onClick={handleEditSubmit} disabled={adminUpdateProduct.isPending}>
                          {adminUpdateProduct.isPending ? 'Updating...' : 'Update'}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Cargo History</h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditHistoryRefreshKey((k) => k + 1)}
                        >
                          Refresh
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Date, cargo, quantity change log for this product in this depot.
                      </p>

                      <div className="mt-3 rounded-lg border border-slate-200 overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Cargo</TableHead>
                              <TableHead className="text-right">Δ Qty</TableHead>
                              <TableHead className="text-right">Prev</TableHead>
                              <TableHead className="text-right">Next</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(() => {
                              // force recompute when user hits refresh
                              void editHistoryRefreshKey;
                              const rows = getInventoryCargoHistoryFor(formData.state, editingProduct.id);
                              if (rows.length === 0) {
                                return (
                                  <TableRow>
                                    <TableCell colSpan={5} className="h-20 text-center text-slate-500">
                                      No history yet.
                                    </TableCell>
                                  </TableRow>
                                );
                              }

                              return rows.slice(0, 25).map((r) => (
                                <TableRow key={r.id}>
                                  <TableCell className="whitespace-nowrap">
                                    {new Date(r.createdAt).toLocaleString()}
                                  </TableCell>
                                  <TableCell className="max-w-[220px] truncate" title={r.cargoName}>
                                    {r.cargoName}
                                  </TableCell>
                                  <TableCell className={`text-right ${r.deltaQty >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    {r.deltaQty >= 0 ? '+' : ''}
                                    {Number(r.deltaQty).toLocaleString()}
                                  </TableCell>
                                  <TableCell className="text-right text-slate-600">
                                    {Number(r.previousQty).toLocaleString()}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {Number(r.nextQty).toLocaleString()}
                                  </TableCell>
                                </TableRow>
                              ));
                            })()}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isDeleteModalOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg max-w-md w-full">
                  <h2 className="text-2xl font-bold">Confirm Deletion</h2>
                  <p className="text-slate-600">Are you sure you want to delete this product? This action cannot be undone.</p>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)} disabled={isDeleting}>Cancel</Button>
                    <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
                      {isDeleting ? (
                        <div className="flex items-center">
                          <RefreshCw className="animate-spin mr-2 h-4 w-4" /> Deleting...
                        </div>
                      ) : 'Delete'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <AddProductModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onProductAdded={refetch} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;
