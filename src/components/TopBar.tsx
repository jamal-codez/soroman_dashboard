import React from 'react';
import { MapPin } from 'lucide-react';
import { ROLES } from '@/roles';

export const TopBar = React.memo(function TopBar() {
  const fullName = (localStorage.getItem('fullname') || '').trim();
  const role = Number(localStorage.getItem('role') ?? '-1');

  // location_names stored at login — pre-resolved names, no API call needed
  const scopeNames: string[] = (() => {
    try { return JSON.parse(localStorage.getItem('location_names') || '[]'); } catch { return []; }
  })();

  const isSuperAdmin = role === ROLES.SUPERADMIN;

  const handleLogout = async () => {
    try {
      const { apiClient } = await import('@/api/client');
      await apiClient.admin.logoutUser();
    } catch { /* ignore */ }
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('fullname');
    localStorage.removeItem('label');
    localStorage.removeItem('locations');
    localStorage.removeItem('location_names');
    window.location.href = '/login';
  };

  return (
    <div className="hidden sm:flex items-center h-16 px-4 sm:px-6 bg-white border-b border-slate-200 gap-3">
      <div className="min-w-0">
        <div className="text-[1rem] font-normal text-slate-900">
          Hello
          <span className="font-bold">{fullName ? ` ${fullName}` : ''} 👋🏽</span>
        </div>
      </div>

      {/* Active scope badge — hidden for SUPERADMIN (they always see everything) */}
      {!isSuperAdmin && (
        <div className="flex items-center gap-1.5 ml-1 flex-wrap">
          {scopeNames.length === 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <MapPin size={10} /> Full Access
            </span>
          ) : (
            scopeNames.map(name => (
              <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <MapPin size={10} /> {name}
              </span>
            ))
          )}
        </div>
      )}

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
});
