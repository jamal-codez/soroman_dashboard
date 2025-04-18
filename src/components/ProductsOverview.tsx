import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Product } from '@/type';
import { CircleAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';

export const ProductsOverview = () => {
  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => apiClient.admin.getProductInventory(),
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
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex justify-between items-center p-5 border-b border-slate-200">
        <h3 className="font-semibold text-lg text-slate-800">Product Inventory</h3>
        <Link to='/inventory'>
        <button className="text-sm text-soroman-blue hover:text-soroman-orange font-medium transition-colors">
          View All
        </button>
        </Link>
      </div>

      <div className="divide-y divide-slate-200">
        {products?.map((product) => (
          <div key={product.id} className="p-4 flex items-center justify-between">
            <div className="flex-1">
              <h4 className="text-sm font-medium text-slate-900">{product.name}</h4>
              <div className="flex items-center mt-1">
                <div className="text-xs text-slate-500">
                  Price: <span className="font-medium text-slate-700">₦{product.unit_price}/Liter</span>
                </div>
                <div className="w-1 h-1 bg-slate-300 rounded-full mx-2" />
                <div className={`text-xs ${product.stock_quantity < 50 ? 'text-orange-600' : 'text-green-600'} flex items-center`}>
                  {product.stock_quantity < 50 && <CircleAlert size={12} className="mr-1" />}
                  {product.stock_quantity < 50 ? 'Low Stock' : 'In Stock'}
                </div>
              </div>
            </div>
            
            <div className="w-32">
            <div className="flex justify-between mb-1">
              <span className="text-xs font-medium text-slate-700">
                {Math.min(product.stock_quantity, 100)}%
              </span>
              <span className="text-xs text-slate-500">Capacity</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  product.stock_quantity > 70 ? 'bg-green-500' : 
                  product.stock_quantity > 40 ? 'bg-orange-500' : 'bg-red-500'
                }`} 
                style={{ width: `${Math.min(product.stock_quantity, 100)}%` }}
              >
                
              </div>
            </div>
          </div>
          
          </div>
        ))}
      </div>
    </div>
  );
};