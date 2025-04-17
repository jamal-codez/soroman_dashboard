
import React from 'react';
import { 
  CheckCircle, 
  Clock, 
  Truck, 
  AlertCircle, 
  MoreHorizontal, 
  Download
} from 'lucide-react';

import { Order } from '@/type';

// Mock data for recent orders
const recentOrders: Order[] = [
  {
    id: 'ORD-71205',
    customer: {
      name: 'Dangote Industries',
      email: 'orders@dangoteind.com',
    },
    product: 'PMS',
    quantity: '5,000 L',
    date: 'Apr 01, 2025',
    amount: '₦2,450,000',
    status: 'Completed',
  },
  {
    id: 'ORD-71204',
    customer: {
      name: 'Nigeria Airways',
      email: 'supply@ngairways.com',
    },
    product: 'Jet Fuel',
    quantity: '8,000 L',
    date: 'Mar 31, 2025',
    amount: '₦4,720,000',
    status: 'Shipping',
  },
  {
    id: 'ORD-71203',
    customer: {
      name: 'ABC Transport',
      email: 'purchases@abctransport.com',
    },
    product: 'AGO',
    quantity: '3,000 L',
    date: 'Mar 31, 2025',
    amount: '₦1,725,000',
    status: 'Processing',
  },
  {
    id: 'ORD-71202',
    customer: {
      name: 'Green Energy Ltd',
      email: 'contact@greenenergy.com',
    },
    product: 'LPG',
    quantity: '1,500 kg',
    date: 'Mar 30, 2025',
    amount: '₦915,000',
    status: 'Completed',
  },
  {
    id: 'ORD-71201',
    customer: {
      name: 'EasyRide Logistics',
      email: 'fuel@easyride.com',
    },
    product: 'PMS',
    quantity: '2,000 L',
    date: 'Mar 30, 2025',
    amount: '₦980,000',
    status: 'Cancelled',
  },
];

const getStatusIcon = (status: Order['status']) => {
  switch (status) {
    case 'Completed':
      return <CheckCircle className="text-green-500" size={16} />;
    case 'Processing':
      return <Clock className="text-blue-500" size={16} />;
    case 'Shipping':
      return <Truck className="text-orange-500" size={16} />;
    case 'Cancelled':
      return <AlertCircle className="text-red-500" size={16} />;
    default:
      return null;
  }
};

const getStatusClass = (status: Order['status']) => {
  switch (status) {
    case 'Completed':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'Processing':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Shipping':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'Cancelled':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return '';
  }
};

export const OrdersTable = () => {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex justify-between items-center p-5 border-b border-slate-200">
        <h3 className="font-semibold text-lg text-slate-800">Recent Orders</h3>
        <div className="flex items-center">
          <button className="text-[#169061] hover:text-[#169061] transition-colors flex items-center text-sm font-medium">
            <Download size={16} className="mr-1" /> Export
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-left text-xs font-semibold text-slate-500 p-4">ORDER ID</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">CUSTOMER</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">PRODUCT</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">QUANTITY</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">DATE</th>
              <th className="text-right text-xs font-semibold text-slate-500 p-4">AMOUNT</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">STATUS</th>
              <th className="text-center text-xs font-semibold text-slate-500 p-4">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((order) => (
              <tr key={order.id} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="p-4 text-sm font-medium text-slate-900">{order.id}</td>
                <td className="p-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{order.customer.name}</div>
                    <div className="text-xs text-slate-500">{order.customer.email}</div>
                  </div>
                </td>
                <td className="p-4 text-sm text-slate-700">{order.product}</td>
                <td className="p-4 text-sm text-slate-700">{order.quantity}</td>
                <td className="p-4 text-sm text-slate-700">{order.date}</td>
                <td className="p-4 text-sm font-medium text-slate-900 text-right">{order.amount}</td>
                <td className="p-4">
                  <div className={`inline-flex items-center px-2 py-1 text-xs font-medium border rounded-full ${getStatusClass(order.status)}`}>
                    {getStatusIcon(order.status)}
                    <span className="ml-1.5">{order.status}</span>
                  </div>
                </td>
                <td className="p-4 text-center">
                  <button className="text-slate-400 hover:text-slate-600">
                    <MoreHorizontal size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="p-4 border-t border-slate-200 text-center">
        <button className="text-[#169061] hover:text-[#169061] transition-colors text-sm font-medium">
          View All Orders
        </button>
      </div>
    </div>
  );
};