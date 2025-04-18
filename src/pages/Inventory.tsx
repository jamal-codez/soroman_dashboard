import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Search,
  Plus,
  Download,
  Filter,
  CircleAlert,
  Edit,
  Trash,
  MoreHorizontal,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { apiClient } from '@/api/client';

interface Product {
  id: number;
  name: string;
  abbreviation: string;
  description: string;
  unit_price: number;
  stock_quantity: number;
  created_at: string;
  status?: 'In Stock' | 'Low Stock' | 'Critical Stock';
}

const pageSize = 10; // Page size constant

const Inventory = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    abbreviation: '',
    description: '',
    unit_price: 0,
    stock_quantity: 0,
  });

  const { data: apiResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ['inventory', currentPage],
    queryFn: () => apiClient.admin.adminGetProducts({
      page: currentPage,
      page_size: pageSize
    }),
  });

  const totalPages = Math.ceil((apiResponse?.count || 0) / pageSize);

  const handlePreviousPage = () => {
    if (currentPage > 1) setCurrentPage(prev => prev - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(prev => prev + 1);
  };

  const calculateStockStatus = (quantity: number): 'In Stock' | 'Low Stock' | 'Critical Stock' => {
    if (quantity > 50) return 'In Stock';
    if (quantity > 20) return 'Low Stock';
    return 'Critical Stock';
  };

  const createMutation = useMutation({
    mutationFn: (newProduct: Omit<Product, 'id' | 'created_at' | 'status'>) =>
      apiClient.admin.adminCreateProduct(newProduct),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setIsModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (updatedProduct: Product) =>
      apiClient.admin.adminUpdateProduct(updatedProduct.id, updatedProduct),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setIsModalOpen(false);
      setSelectedProduct(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: number) =>
      apiClient.admin.adminDeleteProduct(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setIsDeleteModalOpen(false);
      setSelectedProduct(null);
    },
  });

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  const openModal = (product?: Product) => {
    if (product) {
      setFormData({
        name: product.name,
        abbreviation: product.abbreviation,
        description: product.description,
        unit_price: product.unit_price,
        stock_quantity: product.stock_quantity,
      });
      setSelectedProduct(product);
    } else {
      setFormData({
        name: '',
        abbreviation: '',
        description: '',
        unit_price: 0,
        stock_quantity: 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProduct) {
      updateMutation.mutate({ ...formData, id: selectedProduct.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = () => {
    if (selectedProduct) {
      deleteMutation.mutate(selectedProduct.id);
    }
  };

  const getStockBadge = (quantity: number) => {
    const status = calculateStockStatus(quantity);
    switch (status) {
      case 'In Stock':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200">In Stock</Badge>;
      case 'Low Stock':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200">Low Stock</Badge>;
      case 'Critical Stock':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-red-200">Critical Stock</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const filteredInventory = (apiResponse?.results || []).filter(item => 
    item.name.toLowerCase().includes(searchQuery) ||
    item.abbreviation.toLowerCase().includes(searchQuery) ||
    item.description.toLowerCase().includes(searchQuery)
  );

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

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">Inventory Dashboard</h1>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => refetch()}
                  disabled={isLoading}
                >
                  <RefreshCw className={`mr-1 ${isLoading ? 'animate-spin' : ''}`} size={16} />
                  {isLoading ? 'Refreshing...' : 'Refresh'}
                </Button>
                <Button 
                  className="bg-soroman-orange hover:bg-soroman-orange/90"
                  onClick={() => openModal()}
                >
                  <Plus className="mr-1" size={16} />
                  Add Product
                </Button>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type="text"
                    placeholder="Search inventory..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={handleSearch}
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
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PRODUCT NAME</TableHead>
                    <TableHead>CODE</TableHead>
                    <TableHead>DESCRIPTION</TableHead>
                    <TableHead>PRICE</TableHead>
                    <TableHead>STOCK QTY</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead>LAST UPDATED</TableHead>
                    <TableHead className="text-center">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center">
                        <Loader2 className="inline animate-spin mr-2" />
                        Loading inventory...
                      </TableCell>
                    </TableRow>
                  ) : filteredInventory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center">
                        No inventory items found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInventory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.abbreviation}</TableCell>
                        <TableCell className="truncate max-w-[200px]">{item.description}</TableCell>
                        <TableCell>₦{item.unit_price.toFixed(2)}</TableCell>
                        <TableCell>{item.stock_quantity}</TableCell>
                        <TableCell>
                          {getStockBadge(item.stock_quantity)}
                        </TableCell>
                        <TableCell>
                          {new Date(item.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => openModal(item)}
                            >
                              <Edit size={16} />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => {
                                setSelectedProduct(item);
                                setIsDeleteModalOpen(true);
                              }}
                            >
                              <Trash size={16} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              
              {/* Pagination Controls */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
                <div className="text-sm text-slate-600">
                  Showing {(currentPage - 1) * pageSize + 1} -{' '}
                  {Math.min(currentPage * pageSize, apiResponse?.count || 0)} of{' '}
                  {apiResponse?.count || 0} results
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {selectedProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Product Name
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="col-span-3"
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="abbreviation" className="text-right">
                Abbreviation
              </Label>
              <Input
                id="abbreviation"
                value={formData.abbreviation}
                onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                className="col-span-3"
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Description
              </Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="col-span-3"
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="unit_price" className="text-right">
                Unit Price (₦)
              </Label>
              <Input
                type="number"
                id="unit_price"
                value={formData.unit_price}
                onChange={(e) => setFormData({ ...formData, unit_price: Number(e.target.value) })}
                className="col-span-3"
                required
                min="0"
                step="0.01"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="stock_quantity" className="text-right">
                Stock Quantity
              </Label>
              <Input
                type="number"
                id="stock_quantity"
                value={formData.stock_quantity}
                onChange={(e) => setFormData({ ...formData, stock_quantity: Number(e.target.value) })}
                className="col-span-3"
                required
                min="0"
              />
            </div>

            <DialogFooter>
              <Button 
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {selectedProduct ? 'Save Changes' : 'Create Product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Are you sure you want to delete this product?</p>
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setIsDeleteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inventory;