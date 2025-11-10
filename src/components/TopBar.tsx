
import { Bell, Search } from 'lucide-react';

export const TopBar = () => {
  return (
    <div className="flex justify-between items-center h-16 px-6 bg-white border-b border-slate-200">
      <div className="flex-1">
        {/* <div className="relative w-[300px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search for orders, customers..."
            className="pl-10 pr-4 py-2 w-full border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-soroman-orange/50"
          />
        </div> */}
      </div>
      <div className="flex items-center gap-4">
       
        {/* <button className="relative p-2 rounded-full hover:bg-slate-100">
          <Bell size={20} className="text-slate-600" />
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
            3
          </span>
        </button> */}
        
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">Welcome, {localStorage.getItem('fullname')?.split(' ')[0] || 'Guest'}</span>
          <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-white">
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
