import React, { useState } from 'react';
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

const transformData = (salesData: SalesData, selectedFuel: string, dateRange: string): ChartData[] => {
  if (!salesData) return [];
  
  const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
  const products = {
    'Petrol': 'pms',
    'Diesel': 'ago',
    'Cooking Gas': 'lpg',
    'Jet Fuel': 'jet'
  };

  // Filter months based on dateRange
  const filteredMonths = months.filter(month => {
    // Implement logic to filter months based on dateRange
    return true; // Placeholder, implement actual logic
  });

  return filteredMonths.map(month => {
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
      if (key && (selectedFuel === 'all' || key === selectedFuel)) {
        monthData[key] = value / 1000; // Convert to thousands
      }
    });
    
    return monthData;
  });
};

export const SalesChart = ({ data }: { data?: SalesData }) => {
  const [selectedFuel, setSelectedFuel] = useState('all');
  const [dateRange, setDateRange] = useState('year');

  // Transform API data into chart-compatible format
  const chartData = data ? transformData(data, selectedFuel, dateRange) : [];

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex justify-between items-center p-5 border-b border-slate-200">
        <h3 className="font-semibold text-lg text-slate-800">Sales Overview</h3>
        <div className="flex space-x-4">
          <select 
            className="text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-soroman-orange/50"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="6-months">Last 6 Months</option>
            <option value="year">Last Year</option>
            <option value="all-time">All Time</option>
          </select>
          <select 
            className="text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-soroman-orange/50"
            value={selectedFuel}
            onChange={(e) => setSelectedFuel(e.target.value)}
          >
            <option value="all">All Fuels</option>
            <option value="pms">Petrol (PMS)</option>
            <option value="ago">Diesel (AGO)</option>
            <option value="lpg">Cooking Gas (LPG)</option>
            <option value="jet">Jet Fuel (JET)</option>
          </select>
        </div>
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
                tickFormatter={(value) => `₦${value}k`}
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
                  return [`₦${(value * 1000).toLocaleString()}`, productNames[name] || name];
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
              {selectedFuel === 'all' || selectedFuel === 'pms' ? (
                <Area
                  type="monotone"
                  dataKey="pms"
                  name="pms"
                  stroke="#f59e0b"
                  fillOpacity={1}
                  fill="url(#colorPMS)"
                  strokeWidth={2}
                />
              ) : null}
              {selectedFuel === 'all' || selectedFuel === 'ago' ? (
                <Area
                  type="monotone"
                  dataKey="ago"
                  name="ago"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorAGO)"
                  strokeWidth={2}
                />
              ) : null}
              {selectedFuel === 'all' || selectedFuel === 'lpg' ? (
                <Area
                  type="monotone"
                  dataKey="lpg"
                  name="lpg"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorLPG)"
                  strokeWidth={2}
                />
              ) : null}
              {selectedFuel === 'all' || selectedFuel === 'jet' ? (
                <Area
                  type="monotone"
                  dataKey="jet"
                  name="jet"
                  stroke="#8b5cf6"
                  fillOpacity={1}
                  fill="url(#colorJET)"
                  strokeWidth={2}
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Skeleton className="w-full h-full rounded-lg" />
        )}
      </div>
    </div>
  );
};