import { useState } from 'react';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface FuelPrice {
  depot: string;
  price: string;
  timestamp: string;
}

const initialMockData: FuelPrice[] = [
  { depot: 'Depot A', price: '150.00', timestamp: '2023-10-01T10:00:00Z' },
  { depot: 'Depot B', price: '145.50', timestamp: '2023-10-02T11:30:00Z' },
  { depot: 'Depot C', price: '148.75', timestamp: '2023-10-03T09:15:00Z' },
  // Add more mock data as needed
];

const pageSize = 10;

const Pricing = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [mockData, setMockData] = useState(initialMockData);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newDepot, setNewDepot] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const totalPages = Math.ceil(mockData.length / pageSize);

  const handlePreviousPage = () => currentPage > 1 && setCurrentPage(prev => prev - 1);
  const handleNextPage = () => currentPage < totalPages && setCurrentPage(prev => prev + 1);

  const filteredPrices = mockData.filter(price => {
    const searchLower = searchQuery.toLowerCase();
    return (
      price.depot.toLowerCase().includes(searchLower) ||
      price.price.includes(searchLower)
    );
  });

  const paginatedPrices = filteredPrices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  const handleAddPrice = () => {
    const newPriceEntry: FuelPrice = {
      depot: newDepot,
      price: newPrice,
      timestamp: new Date().toISOString(),
    };
    setMockData([...mockData, newPriceEntry]);
    setIsAddModalOpen(false);
    setNewDepot('');
    setNewPrice('');
  };

  const handleEditPrice = () => {
    if (editIndex !== null) {
      const updatedData = [...mockData];
      updatedData[editIndex] = {
        ...updatedData[editIndex],
        depot: newDepot,
        price: newPrice,
      };
      setMockData(updatedData);
      setIsEditModalOpen(false);
      setNewDepot('');
      setNewPrice('');
      setEditIndex(null);
    }
  };

  const openEditModal = (index: number) => {
    setEditIndex(index);
    setNewDepot(mockData[index].depot);
    setNewPrice(mockData[index].price);
    setIsEditModalOpen(true);
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">Pricing Dashboard</h1>
              <Button onClick={() => setIsAddModalOpen(true)}>Add Price</Button>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type="text"
                    placeholder="Search prices..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={handleSearch}
                  />
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DEPOT</TableHead>
                    <TableHead>PRICE</TableHead>
                    <TableHead>TIMESTAMP</TableHead>
                    <TableHead>ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPrices.map((price, index) => (
                    <TableRow key={price.depot}>
                      <TableCell className="font-medium">{price.depot}</TableCell>
                      <TableCell>₦{parseFloat(price.price).toLocaleString()}</TableCell>
                      <TableCell>
                        {format(new Date(price.timestamp), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" onClick={() => openEditModal(index)}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {paginatedPrices.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-500">
                    {searchQuery.trim() ? 'No prices found matching your search criteria.' : 'No prices available.'}
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
                  <div className="text-sm text-slate-600">
                    Showing {(currentPage - 1) * pageSize + 1} -{' '}
                    {Math.min(currentPage * pageSize, filteredPrices.length)} of{' '}
                    {filteredPrices.length} results
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
              )}
            </div>
          </div>
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add New Price</h2>
            <div className="mb-4">
              <Input
                type="text"
                placeholder="Depot Name"
                value={newDepot}
                onChange={(e) => setNewDepot(e.target.value)}
                className="mb-2"
              />
              <Input
                type="text"
                placeholder="Price"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
              <Button onClick={handleAddPrice}>Add</Button>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Edit Price</h2>
            <div className="mb-4">
              <Input
                type="text"
                placeholder="Depot Name"
                value={newDepot}
                onChange={(e) => setNewDepot(e.target.value)}
                className="mb-2"
              />
              <Input
                type="text"
                placeholder="Price"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
              <Button onClick={handleEditPrice}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;
