
import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

type StatCardProps = {
  title: string;
  value: string;
  change?: string;
  changeDirection?: 'up' | 'down';
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
};

export const StatCard = ({
  title,
  value,
  change,
  changeDirection = 'up',
  icon: Icon,
  iconColor = 'text-[#169061]',
  iconBgColor = 'bg-soroman-orange/10',
}: StatCardProps) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
          
          {change && (
            <div className="flex items-center mt-2">
              {/* <span
                className={cn(
                  "text-xs font-medium px-1.5 py-0.5 rounded",
                  changeDirection === 'up' ? 'text-green-800 bg-green-100' : 'text-red-800 bg-red-100'
                )}
              >
                {change}
              </span> */}
              {/* <span className="text-xs text-slate-500 ml-1.5">vs. last month</span> */}
            </div>
          )}
        </div>
        <div className={cn("p-3 rounded-lg", iconBgColor)}>
          <Icon className={iconColor} size={24} />
        </div>
      </div>
    </div>
  );
};
