import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Search, Truck } from 'lucide-react';

export interface FleetTruck {
  id: number;
  plate_number: string;
  driver_name?: string;
  max_capacity?: number;
  truck_status?: string;
  is_active?: boolean;
}

export interface TruckSelectorProps {
  trucks: FleetTruck[];
  selectedTruckIds: Set<number>;
  search: string;
  onSearchChange: (value: string) => void;
  onToggleTruck: (truckId: number) => void;
}

export function TruckSelector({
  trucks,
  selectedTruckIds,
  search,
  onSearchChange,
  onToggleTruck,
}: TruckSelectorProps) {
  const visibleTrucks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trucks.filter(truck => {
      if (!q) return true;
      return (
        truck.plate_number.toLowerCase().includes(q) ||
        (truck.driver_name || '').toLowerCase().includes(q)
      );
    });
  }, [search, trucks]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
          <Truck size={15} className="text-slate-500" />
          Select Trucks <span className="text-red-500">*</span>
        </Label>
        <span className="text-xs text-slate-500">
          {selectedTruckIds.size} selected
        </span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
        <Input
          placeholder="Search trucks by plate or driver…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-10 h-9"
        />
      </div>

      <div className="max-h-[220px] overflow-y-auto border border-slate-200 rounded-lg p-2">
        {visibleTrucks.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No trucks match your search.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleTrucks.map(truck => {
              const isSelected = selectedTruckIds.has(truck.id);
              return (
                <Button
                  key={truck.id}
                  type="button"
                  variant={isSelected ? 'secondary' : 'outline'}
                  onClick={() => onToggleTruck(truck.id)}
                  className={`gap-2 rounded-lg py-2 px-3 text-sm ${isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  <Truck size={14} />
                  <span>{truck.plate_number}</span>
                  <span className="text-xs text-slate-400">{truck.max_capacity ? `${truck.max_capacity.toLocaleString()}L` : 'No cap'}</span>
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
