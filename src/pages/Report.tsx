import { useState } from 'react';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
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
  Search,
  Filter,
  Calendar,
  Package,
  BarChart,
  FileText
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

interface SalesReport {
  date: string;
  totalSales: number;
  totalOrders: number;
  averageOrderValue: number;
}

interface InventoryItem {
  product: string;
  category: string;
  currentStock: number;
  lowStockThreshold: number;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
}

const Reports = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [searchQuery, setSearchQuery] = useState('');

  // Mock data
  const salesData: SalesReport[] = [
    { date: '2024-03-01', totalSales: 4500, totalOrders: 23, averageOrderValue: 195.65 },
    { date: '2024-03-02', totalSales: 5200, totalOrders: 28, averageOrderValue: 185.71 },
    // Add more data...
  ];

  const inventoryData: InventoryItem[] = [
    { product: 'AGO Diesel', category: 'Fuel', currentStock: 15000, lowStockThreshold: 5000, status: 'In Stock' },
    { product: 'PMS Premium', category: 'Fuel', currentStock: 4200, lowStockThreshold: 3000, status: 'Low Stock' },
    // Add more data...
  ];

  const handleCSVExport = (reportType: string) => {
    // Implement CSV export logic
    console.log(`Exporting ${reportType} as CSV`);
    // Actual implementation would generate CSV data here
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'In Stock': return 'bg-green-100 text-green-800';
      case 'Low Stock': return 'bg-yellow-100 text-yellow-800';
      case 'Out of Stock': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Header Section */}
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Reports Dashboard</h1>
                <p className="text-slate-600 mt-1">Analytical reports and data exports</p>
              </div>
            </div>

            {/* Filters Section */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search reports..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as any)}>
                  <SelectTrigger className="w-[180px]">
                    <Calendar className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Daily</SelectItem>
                    <SelectItem value="week">Weekly</SelectItem>
                    <SelectItem value="month">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sales Report Section */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <BarChart size={20} />
                  Sales Report
                </h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total Sales</TableHead>
                    <TableHead className="text-right">Total Orders</TableHead>
                    <TableHead className="text-right">Avg. Order Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesData.map((report, index) => (
                    <TableRow key={index}>
                      <TableCell>{new Date(report.date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">₦{report.totalSales.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{report.totalOrders}</TableCell>
                      <TableCell className="text-right">₦{report.averageOrderValue.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-4 border-t">
                <Button onClick={() => handleCSVExport('sales')}>
                  <Download className="mr-2 h-4 w-4" />
                  Export Sales Report (CSV)
                </Button>
              </div>
            </div>

            {/* Inventory Report Section */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Package size={20} />
                  Inventory Report
                </h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Current Stock</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryData.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.product}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell className="text-right">{item.currentStock.toLocaleString()} L</TableCell>
                      <TableCell>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusStyle(item.status)}`}>
                          {item.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-4 border-t">
                <Button onClick={() => handleCSVExport('inventory')}>
                  <Download className="mr-2 h-4 w-4" />
                  Export Inventory Report (CSV)
                </Button>
              </div>
            </div>

            {/* CSV Export Section */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileText size={20} />
                Data Exports
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Button variant="outline" onClick={() => handleCSVExport('full')}>
                  <Download className="mr-2 h-4 w-4" />
                  Full Data Export
                </Button>
                <Button variant="outline" onClick={() => handleCSVExport('transactions')}>
                  <Download className="mr-2 h-4 w-4" />
                  Transaction History
                </Button>
                <Button variant="outline" onClick={() => handleCSVExport('customers')}>
                  <Download className="mr-2 h-4 w-4" />
                  Customer List
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;