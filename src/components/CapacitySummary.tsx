import { AlertTriangle } from 'lucide-react';

export interface CapacitySummaryProps {
  totalAllocationQty: number;
  selectedTruckCount: number;
  autoSumCapacity: number;
  needsOverride: boolean;
  overrideConfirmed: boolean;
  onUseCapacity: () => void;
  onToggleOverride: () => void;
}

export function CapacitySummary({
  totalAllocationQty,
  selectedTruckCount,
  autoSumCapacity,
  needsOverride,
  overrideConfirmed,
  onUseCapacity,
  onToggleOverride,
}: CapacitySummaryProps) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Capacity Summary</p>
          <p className="mt-1 text-sm text-slate-700">
            {selectedTruckCount} truck{selectedTruckCount !== 1 ? 's' : ''} selected
            {autoSumCapacity > 0 && (` · ${autoSumCapacity.toLocaleString()} L combined capacity`)}
          </p>
        </div>
        {autoSumCapacity > 0 && (
          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2"
            onClick={onUseCapacity}
          >
            Use capacity
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm text-slate-700">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Allocation quantity</div>
          <div className="mt-1 font-semibold">{totalAllocationQty.toLocaleString()} L</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Total trucks</div>
          <div className="mt-1 font-semibold">{selectedTruckCount}</div>
        </div>
      </div>

      {needsOverride && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} />
            <div>
              <p className="font-semibold">Allocation exceeds selected truck capacity.</p>
              <p className="text-xs text-amber-900/90">Please confirm override to continue saving.</p>
            </div>
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={overrideConfirmed}
              onChange={onToggleOverride}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Confirm override and save anyway
          </label>
        </div>
      )}
    </div>
  );
}
