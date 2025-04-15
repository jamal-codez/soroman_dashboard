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
import { SalesData } from '@/type';

export const SalesChart = ({ data }: { data?: SalesData[] }) => {
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
            <AreaChart data={data}>
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
                tickFormatter={(value) => `₦${value}K`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "white", 
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  border: "1px solid #e2e8f0"
                }}
                formatter={(value) => [`₦${value}K`, ""]}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="pms"
                name="PMS"
                stroke="#f59e0b"
                fillOpacity={1}
                fill="url(#colorPMS)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="ago"
                name="AGO"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorAGO)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="lpg"
                name="LPG"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorLPG)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="jet"
                name="JET"
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