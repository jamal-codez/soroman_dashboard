import { Bell, Search } from 'lucide-react';

export const TopBar = () => {
  const fullName = (localStorage.getItem('fullname') || '').trim();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('fullname');
    localStorage.removeItem('label');
    window.location.href = '/login';
  };

  return (
    <div className="hidden sm:flex items-center h-16 px-4 sm:px-6 bg-white border-b border-slate-200">
      <div className="min-w-0">
        <div className="text-[1rem] font-normal text-slate-900">
          {greeting}
          <span className="font-bold">{fullName ? `, ${fullName}` : ''}</span>
        </div>
      </div>

      <div className="ml-auto">
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center rounded-md border border-slate-200 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Logout
        </button>
      </div>
    </div>
  );
};
