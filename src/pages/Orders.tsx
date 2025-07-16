// ... previous imports
import { saveAs } from 'file-saver';
import Papa from 'papaparse'; // Add this to handle CSV parsing

// Add this utility function to format quantity
const formatQuantity = (quantity: number): string => {
  return quantity.toLocaleString();
};

// Add this function to export CSV
const exportToCSV = (orders: Order[]) => {
  const csvData = orders.map(order => ({
    Date: format(new Date(order.created_at), 'yyyy-MM-dd'),
    'Order ID': order.id,
    "Customer's Name": `${order.user.first_name} ${order.user.last_name}`,
    Contact: `${order.user.phone_number} | ${order.user.email}`,
    'Quantity (Litres)': formatQuantity(order.quantity),
    Status: statusDisplayMap[order.status],
  }));

  const csv = Papa.unparse(csvData, {
    quotes: true,
    delimiter: ',',
    newline: '\r\n',
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `Sales_Report_${new Date().toISOString().slice(0, 10)}.csv`);
};

// Inside Orders Component
const Orders = () => {
  // ... other useStates

  // Add this function to handle export button click
  const handleExport = () => {
    if (filteredOrders.length === 0) return;
    exportToCSV(filteredOrders);
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">Orders Dashboard</h1>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type="text"
                    placeholder="Search orders..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={handleSearch}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex items-center">
                    <Filter className="mr-1" size={16} /> Filter
                  </Button>
                  <Button variant="outline" className="flex items-center" onClick={handleExport}>
                    <Download className="mr-1" size={16} /> Export
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DATE</TableHead>
                    <TableHead>ORDER ID</TableHead>
                    <TableHead>CUSTOMER'S NAME</TableHead>
                    <TableHead>CONTACT</TableHead>
                    <TableHead>QUANTITY (LITRES)</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead>ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>{format(new Date(order.created_at), 'yyyy-MM-dd')}</TableCell>
                      <TableCell>#{order.id}</TableCell>
                      <TableCell>{order.user.first_name} {order.user.last_name}</TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-700">{order.user.phone_number}</div>
                        <div className="text-xs text-slate-500">{order.user.email}</div>
                      </TableCell>
                      <TableCell>{formatQuantity(order.quantity)}</TableCell>
                      <TableCell>
                        <div className={`px-2 py-1 text-xs font-semibold border rounded ${getStatusClass(order.status)}`}> 
                          {getStatusIcon(order.status)} {statusDisplayMap[order.status]}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={order.status === 'canceled'}
                          onClick={() => handleCancelOrderClick(order.id)}
                        >
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Orders;
