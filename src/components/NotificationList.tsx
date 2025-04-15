
import React from 'react';
import { Bell, Package, ShoppingCart, AlertCircle, User, Truck } from 'lucide-react';

const notifications = [
  {
    id: 1,
    title: 'New order received',
    message: 'Order #71205 from Dangote Industries has been placed',
    time: '10 minutes ago',
    type: 'order',
    read: false,
  },
  {
    id: 2,
    title: 'Payment confirmed',
    message: 'Payment of ₦4,720,000 for order #71204 has been received',
    time: '1 hour ago',
    type: 'payment',
    read: false,
  },
  {
    id: 3,
    title: 'Low inventory alert',
    message: 'LPG stock is below 50% at Lagos depot',
    time: '2 hours ago',
    type: 'inventory',
    read: true,
  },
  {
    id: 4,
    title: 'Delivery completed',
    message: 'Order #71198 has been successfully delivered to ABC Transport',
    time: '5 hours ago',
    type: 'delivery',
    read: true,
  },
  {
    id: 5,
    title: 'New customer registration',
    message: 'Green Energy Ltd has created a new account',
    time: 'Yesterday',
    type: 'customer',
    read: true,
  },
];

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'order':
      return <ShoppingCart className="text-blue-500" size={16} />;
    case 'payment':
      return <Package className="text-green-500" size={16} />;
    case 'inventory':
      return <AlertCircle className="text-red-500" size={16} />;
    case 'customer':
      return <User className="text-purple-500" size={16} />;
    case 'delivery':
      return <Truck className="text-orange-500" size={16} />;
    default:
      return <Bell className="text-slate-500" size={16} />;
  }
};

export const NotificationList = () => {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex justify-between items-center p-5 border-b border-slate-200">
        <h3 className="font-semibold text-lg text-slate-800">Recent Notifications</h3>
        <button className="text-sm text-soroman-blue hover:text-soroman-orange font-medium transition-colors">
          Mark all as read
        </button>
      </div>

      <div className="divide-y divide-slate-200 max-h-[400px] overflow-y-auto">
        {notifications.map((notification) => (
          <div 
            key={notification.id} 
            className={`p-4 flex ${notification.read ? 'bg-white' : 'bg-blue-50'}`}
          >
            <div className="mr-4 mt-1">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                {getNotificationIcon(notification.type)}
              </div>
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <h4 className="text-sm font-medium text-slate-900">{notification.title}</h4>
                <span className="text-xs text-slate-500">{notification.time}</span>
              </div>
              <p className="text-sm text-slate-600 mt-1">{notification.message}</p>
            </div>
            {!notification.read && (
              <div className="ml-2 mt-1">
                <div className="w-2 h-2 rounded-full bg-soroman-orange"></div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="p-4 border-t border-slate-200 text-center">
        <button className="text-soroman-blue hover:text-soroman-orange transition-colors text-sm font-medium">
          View All Notifications
        </button>
      </div>
    </div>
  );
};
