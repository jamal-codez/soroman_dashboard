import { useEffect, useState } from 'react';
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
  Search,
  Plus,
  Download,
  Filter,
  CircleAlert,
  Edit,
  RefreshCw,
  Trash
} from 'lucide-react';
import { apiClient } from '@/api/client';
import AddProductModal from '@/components/AddProductModal';
import DeleteConfirmationModal from '@/components/DeleteConfirmationModal';
import { useToast } from '@/hooks/use-toast';
import EditProductModal from '@/components/EditProductModal';

interface Product {
  id: number;
  name: string;
  abbreviation: string;
  stock_quantity: number;
  unit_price: number;
  status: 'In Stock' | 'Low Stock' | 'Critical Stock';
  location: string;
  updated_at: string;
  description: string;
}

const Inventory = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    unit_price: '',
    stock_quantity: '',
    abbreviation: '',
    description: ''
  });
  
  const { data: inventory, isLoading, isError, refetch } = useQuery<Product[]>({
    queryKey: ['inventory'],
    queryFn: async () => {
      const response = await apiClient.admin.getProductInventory();
      return response;
    },
    staleTime: 0,
    cacheTime: 0
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateProductMutation = useMutation({
    mutationFn: (updatedProduct: Product) =>
      apiClient.admin.adminUpdateProduct(updatedProduct.id, updatedProduct),
    onSuccess: () => {
      queryClient.invalidateQueries(['inventory']);
      setEditingProduct(null);
      toast({
        title: "Success!",
        description: "Product updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update product",
        variant: "destructive"
      });
    }
  });

  const handleProductAdded = () => refetch();

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  const handleAddProductClick = () => setIsModalOpen(true);

  const handleDeleteClick = (productId: number) => {
    setProductToDelete(productId);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (productToDelete !== null) {
      setIsDeleting(true);
      try {
        await apiClient.admin.adminDeleteProduct(productToDelete);
        refetch();
        toast({
          title: "Success!",
          description: "Product deleted successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: error.message || "Failed to delete product",
          variant: "destructive"
        });
      } finally {
        setIsDeleting(false);
        setIsDeleteModalOpen(false);
        setProductToDelete(null);
      }
    }
  };

  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setEditFormData({
      name: product.name,
      unit_price: product.unit_price.toString(),
      stock_quantity: product.stock_quantity.toString(),
      abbreviation: product.abbreviation,
      description: product.description
    });
  };
  
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleEditSubmit = () => {
    if (editingProduct) {
      const updatedProduct = {
        ...editingProduct,
        ...editFormData,
        unit_price: parseFloat(editFormData.unit_price),
        stock_quantity: parseInt(editFormData.stock_quantity, 10),
        description: editFormData.description
      };
      updateProductMutation.mutate(updatedProduct);
    }
  };

  const determineStatus = (stockQuantity: number): 'In Stock' | 'Low Stock' | 'Critical Stock' => {
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

  const getStockBadge = (status: string) => {
    switch (status) {
      case 'In Stock':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200">{status}</Badge>;
      case 'Low Stock':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200">{status}</Badge>;
      case 'Critical Stock':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-red-200">{status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
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
                  className="bg-[#169061] hover:bg-[#169061]/90"
                  onClick={handleAddProductClick}
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
                    <TableHead>ABBREVIATION</TableHead>
                    <TableHead>PRICE</TableHead>
                    <TableHead>STOCK QUANTITY</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead>LAST UPDATED</TableHead>
                    <TableHead className="text-center">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        Loading inventory...
                      </TableCell>
                    </TableRow>
                  ) : filteredInventory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        No inventory items found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInventory.map((item) => {
                      const stockPercentage = item.stock_quantity;

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.abbreviation}</TableCell>
                          <TableCell>₦{item.unit_price}/Liter</TableCell>
                          <TableCell>
                            <div>
                              <div className="flex justify-between mb-1">
                                <span className="text-xs font-medium">
                                  {item.stock_quantity} Litres
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full ${
                                    stockPercentage > 70 ? 'bg-green-500' : 
                                    stockPercentage > 40 ? 'bg-orange-500' : 'bg-red-500'
                                  }`} 
                                  style={{ width: `${100}%` }}
                                ></div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{getStockBadge(item.status)}</TableCell>
                          <TableCell>
                            {new Date(item.updated_at).toLocaleDateString()}
                          </TableCell>
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
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <EditProductModal
              isOpen={!!editingProduct}
              onClose={() => setEditingProduct(null)}
              formData={editFormData}
              onChange={handleEditChange}
              onSubmit={handleEditSubmit}
              isLoading={updateProductMutation.isLoading}
            />

            <AddProductModal 
              isOpen={isModalOpen} 
              onClose={() => setIsModalOpen(false)} 
              onProductAdded={handleProductAdded} 
            />

            <DeleteConfirmationModal
              isOpen={isDeleteModalOpen}
              onClose={() => setIsDeleteModalOpen(false)}
              onConfirm={handleDeleteConfirm}
              isLoading={isDeleting}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;