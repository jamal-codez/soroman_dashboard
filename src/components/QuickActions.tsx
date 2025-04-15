
import React from 'react';
import { 
  PlusCircle, 
  FileText, 
  UserPlus, 
  Pencil, 
  BarChart3, 
  Truck 
} from 'lucide-react';

const quickActions = [
  {
    title: 'New Order',
    description: 'Create a new customer order',
    icon: PlusCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-100'
  },
  {
    title: 'Price Update',
    description: 'Modify product pricing',
    icon: Pencil,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100'
  },
  {
    title: 'Create Invoice',
    description: 'Generate a new invoice',
    icon: FileText,
    color: 'text-purple-500',
    bgColor: 'bg-purple-100'
  },
  {
    title: 'Add Customer',
    description: 'Register a new customer',
    icon: UserPlus,
    color: 'text-orange-500',
    bgColor: 'bg-orange-100'
  },
  {
    title: 'Sales Report',
    description: 'View latest reports',
    icon: BarChart3,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-100'
  },
  {
    title: 'Manage Delivery',
    description: 'Track or assign deliveries',
    icon: Truck,
    color: 'text-teal-500',
    bgColor: 'bg-teal-100'
  }
];

export const QuickActions = () => {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-200">
        <h3 className="font-semibold text-lg text-slate-800">Quick Actions</h3>
      </div>
      
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {quickActions.map((action, index) => (
          <button
            key={index}
            className="flex items-center p-4 rounded-lg border border-slate-200 hover:border-soroman-orange/50 hover:bg-orange-50/30 transition-colors group"
          >
            <div className={`${action.bgColor} p-3 rounded-lg mr-4 group-hover:bg-soroman-orange/20`}>
              <action.icon className={`${action.color} group-hover:text-soroman-orange`} size={20} />
            </div>
            <div className="text-left">
              <h4 className="text-sm font-medium text-slate-900">{action.title}</h4>
              <p className="text-xs text-slate-500 mt-0.5">{action.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
