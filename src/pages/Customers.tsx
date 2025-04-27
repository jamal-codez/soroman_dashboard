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
import { Skeleton } from '@/components/ui/skeleton';

type Customer = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
  company_name?: string;
  created_at: string;
};

interface ApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Customer[];
}

const pageSize = 10; // Add page size constant

const Customers = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1); // Add pagination state
  
  const { data: response, isLoading, isError, error, refetch } = useQuery<ApiResponse>({
    queryKey: ['customers', currentPage], // Include current page in query key
    queryFn: async () => {
      const response = await apiClient.admin.adminGetAllCustomers({
        page: currentPage,
        page_size: pageSize
      });
      return {
        count: response.count || 0,
        next: response.next || null,
        previous: response.previous || null,
        results: Array.isArray(response.results) ? response.results : []
      };
    },
    retry: 2,
    refetchOnWindowFocus: false
  });

  const totalPages = Math.ceil((response?.count || 0) / pageSize); // Calculate total pages

  const handlePreviousPage = () => {
    if (currentPage > 1) setCurrentPage(prev => prev - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(prev => prev + 1);
  };

  const customers = response?.results || [];
  const filteredCustomers = customers.filter(customer => {
    const searchLower = searchQuery.toLowerCase();
    return (
      customer.id.toString().includes(searchLower) ||
      `${customer.first_name} ${customer.last_name}`.toLowerCase().includes(searchLower) ||
      customer.email.toLowerCase().includes(searchLower) ||
      (customer.company_name && customer.company_name.toLowerCase().includes(searchLower))
    );
  });

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
              <h1 className="text-2xl font-bold text-slate-800">Customers Dashboard</h1>
            </div>
            
            {/* Search and Filters */}
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
            
            {/* Customers Table */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>NAME</TableHead>
                    <TableHead>COMPANY</TableHead>
                    <TableHead>EMAIL</TableHead>
                    <TableHead>PHONE</TableHead>
                    <TableHead>JOINED</TableHead>
                    {/* <TableHead className="text-right">ACTIONS</TableHead> */}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    // Loading state
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        {/* <TableCell className="text-right">
                          <Skeleton className="h-8 w-8 mx-auto" />
                        </TableCell> */}
                      </TableRow>
                    ))
                  ) : isError ? (
                    // Error state
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <div className="text-red-500 space-y-2">
                          <p>{(error as Error)?.message || 'Failed to load customers'}</p>
                          <Button 
                            onClick={() => refetch()}
                            size="sm"
                            variant="outline"
                          >
                            Retry
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredCustomers.length === 0 ? (
                    // Empty state
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <p className="text-slate-500">
                          {searchQuery.trim() ? 
                            'No customers found matching your search' : 
                            'No customers available'
                          }
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    // Customer data
                    filteredCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">#{customer.id}</TableCell>
                        <TableCell>
                          {customer.first_name} {customer.last_name}
                        </TableCell>
                        <TableCell>
                          {customer.company_name || 'N/A'}
                        </TableCell>
                        <TableCell>{customer.email}</TableCell>
                        <TableCell>{customer.phone_number || 'N/A'}</TableCell>
                        <TableCell>
                          {new Date(customer.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal size={16} />
                          </Button>
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
                  {Math.min(currentPage * pageSize, response?.count || 0)} of{' '}
                  {response?.count || 0} results
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
    </div>
  );
};

export default Customers;