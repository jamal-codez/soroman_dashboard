import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

interface SalesData {
  [product: string]: {
    [month: string]: number;
  };
}

interface ChartData {
  month: string;
  pms: number;
  ago: number;
  lpg: number;
  jet: number;
}

const transformData = (salesData: SalesData): ChartData[] => {
  if (!salesData) return [];
  
  const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
  const products = {
    'Petroleum': 'pms',
    'Diesel': 'ago',
    'Jet Fuel': 'jet'
  };
  
  return months.map(month => {
    const monthData: ChartData = {
      month: format(new Date(2023, parseInt(month) - 1, 1), 'MMM'),
      pms: 0,
      ago: 0,
      lpg: 0,
      jet: 0
    };
    
    // Map each product to its abbreviation key
    Object.entries(salesData).forEach(([product, monthlySales]) => {
      const value = monthlySales[month] || 0;
      const key = products[product];
      if (key) {
        monthData[key] = value / 1000; // Convert to thousands
      }
    });
    
    return monthData;
  });
};

export const SalesChart = ({ data }: { data?: SalesData }) => {
  // Determine the scale based on the maximum value
  const maxValue = data ? Math.max(...Object.values(data).flatMap(monthlySales => Object.values(monthlySales))) : 0;
  const scale = maxValue >= 1_000_000 ? 1_000_000 : maxValue >= 1_000 ? 1_000 : 1;

  // Transform API data into chart-compatible format
  const transformData = (salesData: SalesData): ChartData[] => {
    if (!salesData) return [];
    
    const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
    const products = ['Petrol', 'Diesel', 'Cooking Gas', 'Jet Fuel'];

    return months.map(month => {
      const monthData: ChartData = {
        month: format(new Date(2023, parseInt(month) - 1, 1), 'MMM'),
        pms: 0,
        ago: 0,
        lpg: 0,
        jet: 0
      };
      
      // Map each product to its abbreviation key
      Object.entries(salesData).forEach(([product, monthlySales]) => {
        const value = monthlySales[month] || 0;
        switch(product) {
          case 'Petrol':
            monthData.pms = value / scale; // Adjust based on scale
            break;
          case 'Diesel':
            monthData.ago = value / scale;
            break;
          case 'Cooking Gas':
            monthData.lpg = value / scale;
            break;
          case 'Jet Fuel':
            monthData.jet = value / scale;
            break;
        }
      });
      
      return monthData;
    });
  };

  const chartData = data ? transformData(data) : [];

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex justify-between items-center p-5 border-b border-slate-200">
        <h3 className="font-semibold text-lg text-slate-800">Sales Overview</h3>
        <select className="text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-soroman-orange/50">
          <option value="6-months">Last 6 Months</option>
          <option value="year">Last Year</option>
          <option value="all-time">All Time</option>
        </select>
      </div>

      <div className="p-5 h-[300px]">
        {data ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorPMS" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAGO" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorLPG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorJET" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="month" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickFormatter={(value) => {
                  if (scale === 1_000_000) return `₦${value}m`;
                  if (scale === 1_000) return `₦${value}k`;
                  return `₦${value}`;
                }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "white", 
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  border: "1px solid #e2e8f0"
                }}
                formatter={(value: number, name: string) => {
                  const productNames: Record<string, string> = {
                    pms: 'Petrol (PMS)',
                    ago: 'Diesel (AGO)',
                    lpg: 'Cooking Gas (LPG)',
                    jet: 'Jet Fuel (JET)'
                  };
                  return [`₦${(value * scale).toLocaleString()}`, productNames[name] || name];
                }}
              />
              <Legend 
                formatter={(value) => {
                  const legendMap: Record<string, string> = {
                    pms: 'PMS',
                    ago: 'AGO',
                    lpg: 'LPG',
                    jet: 'JET'
                  };
                  return legendMap[value] || value;
                }}
              />
              <Area
                type="monotone"
                dataKey="pms"
                name="pms"
                stroke="#f59e0b"
                fillOpacity={1}
                fill="url(#colorPMS)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="ago"
                name="ago"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorAGO)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="lpg"
                name="lpg"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorLPG)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="jet"
                name="jet"
                stroke="#8b5cf6"
                fillOpacity={1}
                fill="url(#colorJET)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Skeleton className="w-full h-full rounded-lg" />
        )}
      </div>
    </div>
  );
};