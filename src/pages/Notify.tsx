import React from 'react';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Bell, MessageSquare } from 'lucide-react';

type Notification = {
  id: number;
  title: string;
  message: string;
  time: string;
  type: string;
  read: boolean;
};

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

const NotificationsPage = () => {
  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Notifications"
              description="View, triage, and keep track of important system updates and alerts."
            />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-soroman-blue" />
                  All Notifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="w-[150px]">Time</TableHead>
                      <TableHead className="w-[100px]">Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notifications.map((notification) => (
                      <TableRow key={notification.id}>
                        <TableCell>
                          <span className={`inline-flex items-center justify-center w-2 h-2 rounded-full ${notification.read ? 'bg-slate-300' : 'bg-soroman-orange'}`} />
                        </TableCell>
                        <TableCell className="font-medium">{notification.title}</TableCell>
                        <TableCell>{notification.message}</TableCell>
                        <TableCell className="text-slate-500">{notification.time}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                            ${notification.type === 'BID_REVIEW' ? 'bg-blue-100 text-blue-700' : ''}
                            ${notification.type === 'PAYMENT' ? 'bg-green-100 text-green-700' : ''}
                            ${notification.type === 'INVENTORY' ? 'bg-red-100 text-red-700' : ''}
                            ${notification.type === 'DELIVERY' ? 'bg-purple-100 text-purple-700' : ''}
                            ${notification.type === 'CUSTOMER' ? 'bg-orange-100 text-orange-700' : ''}
                          `}>
                            {notification.type}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
