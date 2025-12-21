import { Bell, Search } from 'lucide-react';

export const TopBar = () => {
  return (
    <div className="flex justify-between items-center h-16 px-4 sm:px-6 bg-white border-b border-slate-200">
      <div className="flex-1" />
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[1rem] font-medium text-slate-800">
            Welcome back!
          </span>
          <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center text-white text-sm">
            {localStorage.getItem('fullname')
              ?.split(' ')
              .map((name) => name[0])
              .join('')
              .slice(0, 2) || 'AA'}
          </div>
        </div>
      </div>
    </div>
  );
};
