import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { AlertTriangle, TrendingUp, Package, Building2, Receipt } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { apiClient } from '@/api/client';

interface DashboardData {
  plant_count: number;
  total_stock_kg: number;
  sales_today_amount: number;
  sales_today_kg: number;
  sales_month_amount: number;
  low_stock_plants: Array<{ id: number; name: string; closing_stock_kg: number; threshold_kg: number }>;
  daily_sales_last_7_days: Array<{ date: string; total: number; kg: number }>;
}

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtN = (n: number) => n.toLocaleString('en-NG', { maximumFractionDigits: 2 });
const fmtMoney = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return iso; }
};

export default function LPGDashboard() {
  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ['lpg-dashboard'],
    queryFn: () => apiClient.admin.getLPGDashboard(),
  });

  const lowStock = useMemo(() => dashboard?.low_stock_plants || [], [dashboard]);
  const last7 = useMemo(() => dashboard?.daily_sales_last_7_days || [], [dashboard]);

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">
            <PageHeader title="LPG Dashboard" description="Live KPIs pulled from the plant, stock, and sales registers." />

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-50"><Building2 size={18} className="text-orange-600" /></div>
                    <div><p className="text-xs text-slate-500">Active Plants</p><p className="font-bold text-slate-900 text-lg">{dashboard?.plant_count ?? 0}</p></div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50"><Package size={18} className="text-blue-600" /></div>
                    <div><p className="text-xs text-slate-500">Total Stock</p><p className="font-bold text-slate-900 text-lg">{fmtN(toNum(dashboard?.total_stock_kg))} kg</p></div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50"><TrendingUp size={18} className="text-emerald-600" /></div>
                    <div><p className="text-xs text-slate-500">Sales Today</p><p className="font-bold text-slate-900 text-lg">{fmtMoney(toNum(dashboard?.sales_today_amount))}</p><p className="text-[11px] text-slate-400">{fmtN(toNum(dashboard?.sales_today_kg))} kg</p></div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-50"><Receipt size={18} className="text-purple-600" /></div>
                    <div><p className="text-xs text-slate-500">Sales This Month</p><p className="font-bold text-slate-900 text-lg">{fmtMoney(toNum(dashboard?.sales_month_amount))}</p></div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <AlertTriangle size={15} className="text-amber-500" />
                    <p className="text-sm font-semibold text-slate-700">Low Stock Alerts</p>
                  </div>
                  {lowStock.length === 0 ? (
                    <p className="p-6 text-center text-sm text-slate-400">No plants below their low-stock threshold.</p>
                  ) : (
                    <Table className="text-sm">
                      <TableHeader>
                        <TableRow className="bg-slate-50/80">
                          <TableHead>Plant</TableHead>
                          <TableHead className="text-right">Closing Stock</TableHead>
                          <TableHead className="text-right">Threshold</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lowStock.map(p => (
                          <TableRow key={p.id} className="bg-red-50/40">
                            <TableCell className="font-medium text-slate-800">{p.name}</TableCell>
                            <TableCell className="text-right font-bold text-red-700">{fmtN(toNum(p.closing_stock_kg))} kg</TableCell>
                            <TableCell className="text-right text-slate-500">{fmtN(toNum(p.threshold_kg))} kg</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-700">Sales — Last 7 Days</p>
                  </div>
                  {last7.length === 0 ? (
                    <p className="p-6 text-center text-sm text-slate-400">No sales recorded in the last 7 days.</p>
                  ) : (
                    <Table className="text-sm">
                      <TableHeader>
                        <TableRow className="bg-slate-50/80">
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Kg Sold</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {last7.map(d => (
                          <TableRow key={d.date}>
                            <TableCell className="text-slate-700">{fmtDate(d.date)}</TableCell>
                            <TableCell className="text-right text-slate-600">{fmtN(toNum(d.kg))} kg</TableCell>
                            <TableCell className="text-right font-semibold text-slate-900">{fmtMoney(toNum(d.total))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
