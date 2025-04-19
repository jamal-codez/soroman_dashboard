import React from 'react';
import { Bell, Package, AlertCircle, User, Send } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Notification, NotificationType } from '@/types/notification';

const notifications: Notification[] = [
  {
    id: 1,
    title: 'New bid review required',
    message: 'Project A requires your review for a new bid submission',
    time: '10 minutes ago',
    type: 'BID_REVIEW',
    read: false,
  },
  {
    id: 2,
    title: 'Payment confirmed',
    message: 'Payment of ₦4,720,000 has been received',
    time: '1 hour ago',
    type: 'PAYMENT',
    read: false,
  },
  {
    id: 3,
    title: 'Low inventory alert',
    message: 'LPG stock is below 50% at Lagos depot',
    time: '2 hours ago',
    type: 'INVENTORY',
    read: true,
  },
  {
    id: 4,
    title: 'Delivery completed',
    message: 'Order #71198 has been successfully delivered to ABC Transport',
    time: '5 hours ago',
    type: 'DELIVERY',
    read: true,
  },
  {
    id: 5,
    title: 'New customer registration',
    message: 'Green Energy Ltd has created a new account',
    time: 'Yesterday',
    type: 'CUSTOMER',
    read: true,
  },
];

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'BID_REVIEW':
      return <Send className="text-blue-500" size={16} />;
    case 'PAYMENT':
      return <Package className="text-green-500" size={16} />;
    case 'INVENTORY':
      return <AlertCircle className="text-red-500" size={16} />;
    case 'CUSTOMER':
      return <User className="text-purple-500" size={16} />;
    default:
      return <Bell className="text-slate-500" size={16} />;
  }
};

export const NotificationList = () => {
  const { toast } = useToast();

  const handleMarkAllAsRead = () => {
    toast({
      title: "Marked all as read",
      description: "All notifications have been marked as read"
    });
  };

  const handleViewAll = () => {
    toast({
      title: "View all notifications",
      description: "Redirecting to notifications page..."
    });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex justify-between items-center p-5 border-b border-slate-200">
        <h3 className="font-semibold text-lg text-slate-800">Recent Notifications</h3>
        <Button 
          variant="ghost" 
          onClick={handleMarkAllAsRead}
          className="text-sm text-soroman-blue hover:text-soroman-orange font-medium"
        >
          Mark all as read
        </Button>
      </div>

      <div className="divide-y divide-slate-200 max-h-[400px] overflow-y-auto">
        {notifications.map((notification) => (
          <div 
            key={notification.id} 
            className={`p-4 flex cursor-pointer hover:bg-slate-50 ${notification.read ? 'bg-white' : 'bg-blue-50'}`}
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
        <Button 
          variant="ghost" 
          onClick={handleViewAll}
          className="text-soroman-blue hover:text-soroman-orange text-sm font-medium"
        >
          View All Notifications
        </Button>
      </div>
    </div>
  );
};