import { useQuery } from '@tanstack/react-query';
import { Customer } from '@/type';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/api/client';

export const CustomerList = () => {
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await apiClient.admin.adminGetAllCustomers();
      // Ensure we always return an array
      return Array.isArray(response) ? response : [];
    },
  });

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
              <Skeleton className="h-4 w-48 ml-3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex justify-between items-center p-5 border-b border-slate-200">
        <h3 className="font-semibold text-lg text-slate-800">Top Customers</h3>
        <button className="text-sm text-soroman-blue hover:text-soroman-orange font-medium transition-colors">
          View All
        </button>
      </div>

      <div className="p-5">
        {customers.length === 0 ? (
          <div className="text-center text-slate-500 py-8">
            No customers found
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {customers.map((customer) => (
              <li key={customer?.id} className="py-3 flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-soroman-blue flex items-center justify-center text-white">
                    {customer?.name?.substring(0, 2).toUpperCase() || 'NA'}
                  </div>
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-slate-900">{customer?.name || 'Unknown'}</h4>
                    <span className="text-xs text-slate-500">{customer?.company_name || 'N/A'}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500">Orders</span>
                  <p className="text-sm font-semibold text-slate-700">{customer?.total_orders || 0}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};