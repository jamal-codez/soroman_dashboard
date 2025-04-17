import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/api/client';
import { Link } from 'react-router-dom';

interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  created_at: string; // Make sure this field exists in your API response
}

interface ApiResponse {
  count: number;
  results: Customer[];
}

export const CustomerList = () => {
  const { data: response, isLoading } = useQuery<ApiResponse>({
    queryKey: ['recent-customers'],
    queryFn: async () => {
      const response = await apiClient.admin.adminGetAllCustomers();
      return {
        count: response.count || 0,
        // Sort by creation date and take first 5
        results: Array.isArray(response.results) 
          ? response.results
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 5)
          : []
      };
    },
  });

  const recentCustomers = response?.results || [];

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="p-4 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between items-center">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="ml-3 flex-1">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex justify-between items-center p-5 border-b border-slate-200">
        <h3 className="font-semibold text-lg text-slate-800">Recent Customers</h3>
        <Link to='/customers'>
          <button className="text-sm text-[#169061] hover:text-[#169061]/80 font-medium transition-colors">
            View All ({response?.count || 0})
          </button>
        </Link>
      </div>

      <div className="p-5">
        {recentCustomers.length === 0 ? (
          <div className="text-center text-slate-500 py-8">
            No recent customers found
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {recentCustomers.map((customer) => (
              <li key={customer.id} className="py-3 flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-[#169061] flex items-center justify-center text-white">
                    {`${customer.first_name[0]}${customer.last_name[0]}`.toUpperCase()}
                  </div>
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-slate-900">
                      {`${customer.first_name} ${customer.last_name}`}
                    </h4>
                    <span className="text-xs text-slate-500">
                      Joined: {new Date(customer.created_at).toLocaleDateString()}
                    </span>

                    <span className="text-xs text-slate-500">
                      Joined: {new Date(customer.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500">                    {customer.phone_number || 'N/A'}
                  </span>
                  <p className="text-sm font-semibold text-slate-700">
                    {customer.email || 'N/A'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};