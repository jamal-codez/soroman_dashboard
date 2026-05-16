import React, { useState, useEffect } from 'react';
import { MapPin, Clock } from 'lucide-react';
import { ROLES } from '@/roles';

export const TopBar = React.memo(function TopBar() {
  const fullName = (localStorage.getItem('fullname') || '').trim();
  const role = Number(localStorage.getItem('role') ?? '-1');

  // location_names stored at login — pre-resolved names, no API call needed
  const scopeNames: string[] = (() => {
    try { return JSON.parse(localStorage.getItem('location_names') || '[]'); } catch { return []; }
  })();

  const isSuperAdmin = role === ROLES.SUPERADMIN;

  // Live clock — ticks every second
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="hidden sm:flex items-center h-16 px-4 sm:px-6 bg-white border-b border-slate-200 gap-4">
      {/* Greeting */}
      <div className="min-w-0">
        <div className="text-[1rem] font-normal text-slate-900">
          Hello
          <span className="font-bold">{fullName ? ` ${fullName}` : ''} 👋🏽</span>
        </div>
      </div>

      {/* Live date + time */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 border-l border-slate-200 pl-4">
        <Clock size={13} className="shrink-0" />
        <span>{dateStr}</span>
        <span className="font-mono tracking-tight">{timeStr}</span>
      </div>

      {/* Active scope — far right, hidden for SUPERADMIN */}
      {!isSuperAdmin && (
        <div className="ml-auto flex items-center gap-1 text-xs text-slate-400">
          <MapPin size={13} className="shrink-0" />
          <span>{scopeNames.length === 0 ? 'Full Access' : scopeNames.join(', ')}</span>
        </div>
      )}

      {isSuperAdmin && <div className="ml-auto" />}
    </div>
  );
});
