import { useQuery } from '@tanstack/react-query';
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
  Download,
  Filter,
  Search,
  Plus,
  CheckCircle,
  Clock,
  AlertCircle,
  MoreHorizontal
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { useState } from 'react';

type Customer = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  status: 'Active' | 'Inactive' | 'Pending';
  lastOrderDate?: string;
  totalSpent?: string;
};

const Customers = () => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const { data: customers = [], isLoading, isError, error, refetch } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await apiClient.admin.adminGetAllCustomers();
      return Array.isArray(response) ? response : [];
    },
    retry: 2,
    refetchOnWindowFocus: false
  });

  const filteredCustomers = customers.filter(customer => 
    customer.id.toLowerCase().includes(searchQuery) ||
    customer.name.toLowerCase().includes(searchQuery) ||
    customer.email.toLowerCase().includes(searchQuery) ||
    (customer.company && customer.company.toLowerCase().includes(searchQuery))
  );

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">Customers</h1>
              <Button className="bg-soroman-orange hover:bg-soroman-orange/90">
                <Plus className="mr-1" size={16} />
                New Customer
              </Button>
            </div>
            
            {/* Search and Filters - Always visible */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type="text"
                    placeholder="Search customers..."
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
            
            {/* Customers Table with inline loading */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CUSTOMER ID</TableHead>
                    <TableHead>NAME</TableHead>
                    <TableHead>COMPANY</TableHead>
                    <TableHead>EMAIL</TableHead>
                    <TableHead>PHONE</TableHead>
                    <TableHead>LAST ORDER</TableHead>
                    <TableHead className="text-right">TOTAL SPENT</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead className="text-center">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    // Loading skeleton
                    <TableRow>
                      <TableCell colSpan={9} className="text-center">
                        Loading customers...
                      </TableCell>
                    </TableRow>
                  ) : isError ? (
                    // Error state
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-red-500 py-8">
                        <div className="space-y-2">
                          <p>{(error as Error)?.message || 'Failed to load customers'}</p>
                          <Button 
                            onClick={() => refetch()}
                            size="sm"
                          >
                            Retry
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredCustomers.length === 0 ? (
                    // No results
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <p className="text-slate-500">
                          {searchQuery.trim() ? 
                            'No customers found matching your search criteria.' : 
                            'No customers available.'
                          }
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    // Customer data
                    filteredCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        {/* ... existing customer row cells ... */}
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

export default Customers;