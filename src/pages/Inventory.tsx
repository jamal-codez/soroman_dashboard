import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  MoreHorizontal,
  RefreshCw
} from 'lucide-react';
import { apiClient } from '@/api/client';

interface Product {
  id: number;
  name: string;
  code: string;
  stock_quantity: number;
  unit_price: number;
  status: 'In Stock' | 'Low Stock' | 'Critical Stock';
  location: string;
  updated_at: string;
}

const Inventory = () => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const { data: inventory, isLoading, isError, refetch } = useQuery<Product[]>({
    queryKey: ['inventory'],
    queryFn: () => apiClient.admin.getProductInventory(),
  });

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

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

  const filteredInventory = inventory?.filter(item => 
    item.name.toLowerCase().includes(searchQuery) ||
    item.code.toLowerCase().includes(searchQuery) ||
    item.location.toLowerCase().includes(searchQuery)
  ) || [];

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
                {/* <Button 
                  variant="outline" 
                  onClick={() => refetch()}
                  disabled={isLoading}
                >
                  <RefreshCw className={`mr-1 ${isLoading ? 'animate-spin' : ''}`} size={16} />
                  {isLoading ? 'Refreshing...' : 'Refresh'}
                </Button> */}
                <Button className="bg-[#169061] hover:bg-[#169061]/90">
                  <Plus className="mr-1" size={16} />
                  Add Product
                </Button>
              </div>
            </div>
            
            {/* Search and Filters */}
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
            
            {/* Inventory Table */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PRODUCT NAME</TableHead>
                    <TableHead>PRICE/LITER</TableHead>
                    <TableHead>LOCATION</TableHead>
                    <TableHead>STOCK LEVEL</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead>LAST UPDATED</TableHead>
                    <TableHead className="text-center">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center">
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
                        <TableCell>₦{item.unit_price}/Liter</TableCell>
                        <TableCell>{item.location}</TableCell>
                        <TableCell>
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-xs font-medium">{item.stock_quantity}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  item.stock_quantity > 70 ? 'bg-green-500' : 
                                  item.stock_quantity > 40 ? 'bg-orange-500' : 'bg-red-500'
                                }`} 
                                style={{ width: `${item.stock_quantity}%` }}
                              ></div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStockBadge(item.status)}
                        </TableCell>
                        <TableCell>
                          {new Date(item.updated_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button variant="ghost" size="icon">
                              <Edit size={16} />
                            </Button>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal size={16} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;