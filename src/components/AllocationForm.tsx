import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TruckSelector, type FleetTruck } from './TruckSelector';
import { CapacitySummary } from './CapacitySummary';
import { Search, FileText, Package, Fuel, UserPlus, CalendarDays, Plus, X } from 'lucide-react';

export interface BackendPfi {
  id: number;
  pfi_number: string;
  location_name?: string;
  product_name?: string;
  starting_qty_litres?: number;
  status?: string;
}

export interface DeliveryCustomer {
  id: number;
  customer_name: string;
}

export interface CustomerAllocation {
  uid: string;
  customerId: string;
  qty: string;
}

export interface AllocationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pfiOptions: Array<{ id: number; label: string }>;
  selectedPfi: BackendPfi | null;
  loadPfi: string;
  setLoadPfi: (value: string) => void;
  loadCode: string;
  setLoadCode: (value: string) => void;
  loadDepot: string;
  setLoadDepot: (value: string) => void;
  loadLocation: string;
  setLoadLocation: (value: string) => void;
  loadNotes: string;
  setLoadNotes: (value: string) => void;
  dateAllocated: string;
  setDateAllocated: (value: string) => void;
  customerAllocations: CustomerAllocation[];
  updateAllocation: (uid: string, field: 'customerId' | 'qty', value: string) => void;
  addAllocationRow: () => void;
  removeAllocationRow: (uid: string) => void;
  allocationTotal: number;
  customers: DeliveryCustomer[];
  totalAllocationQty: string;
  setTotalAllocationQty: (value: string) => void;
  availableTrucks: FleetTruck[];
  selectedTruckIds: Set<number>;
  truckSearch: string;
  setTruckSearch: (value: string) => void;
  toggleTruck: (truckId: number) => void;
  autoSumCapacity: number;
  capacityOverrideConfirmed: boolean;
  onToggleOverride: () => void;
  onUseCapacity: () => void;
  needsOverride: boolean;
  saving: boolean;
  handleSave: () => Promise<void>;
  deliveryCodes: string[];
}

function getCodeTheme(code: string) {
  if (!code) return null;
  const CODE_PALETTE = [
    { row: 'bg-sky-50/60 border-l-sky-300', badge: 'bg-sky-100 text-sky-800 border-sky-200' },
    { row: 'bg-emerald-50/60 border-l-emerald-300', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    { row: 'bg-orange-50/60 border-l-orange-300', badge: 'bg-orange-100 text-orange-800 border-orange-200' },
    { row: 'bg-violet-50/60 border-l-violet-300', badge: 'bg-violet-100 text-violet-800 border-violet-200' },
    { row: 'bg-pink-50/60 border-l-pink-300', badge: 'bg-pink-100 text-pink-800 border-pink-200' },
    { row: 'bg-amber-50/60 border-l-amber-300', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
    { row: 'bg-teal-50/60 border-l-teal-300', badge: 'bg-teal-100 text-teal-800 border-teal-200' },
    { row: 'bg-indigo-50/60 border-l-indigo-300', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  ];
  let hash = 0;
  for (let index = 0; index < code.length; index += 1) {
    hash = (hash * 31 + code.charCodeAt(index)) >>> 0;
  }
  return CODE_PALETTE[hash % CODE_PALETTE.length];
}

export function AllocationForm({
  open,
  onOpenChange,
  pfiOptions,
  selectedPfi,
  loadPfi,
  setLoadPfi,
  loadCode,
  setLoadCode,
  loadDepot,
  setLoadDepot,
  loadLocation,
  setLoadLocation,
  loadNotes,
  setLoadNotes,
  dateAllocated,
  setDateAllocated,
  customerAllocations,
  updateAllocation,
  addAllocationRow,
  removeAllocationRow,
  allocationTotal,
  customers,
  totalAllocationQty,
  setTotalAllocationQty,
  availableTrucks,
  selectedTruckIds,
  truckSearch,
  setTruckSearch,
  toggleTruck,
  autoSumCapacity,
  capacityOverrideConfirmed,
  onToggleOverride,
  onUseCapacity,
  needsOverride,
  saving,
  handleSave,
  deliveryCodes,
}: AllocationFormProps) {
  const loadCodeTheme = getCodeTheme(loadCode);

  const suggestedCodes = useMemo(() => {
    return deliveryCodes.slice(0, 8);
  }, [deliveryCodes]);
  return (
    <div className="space-y-6 py-3">
      <div className="space-y-3">
        <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
          <FileText size={15} className="text-slate-500" />
          PFI Source <span className="text-red-500">*</span>
        </Label>
        <select
          aria-label="Select PFI"
          value={loadPfi}
          onChange={e => {
            const pfiId = e.target.value;
            setLoadPfi(pfiId);
            const pfi = pfiId ? pfiOptions.find(p => String(p.id) === pfiId) : null;
            if (pfi?.label) {
              const candidate = pfi.label.split(' — ')[0].replace(/\s+/g, '').toUpperCase();
              if (!loadCode) setLoadCode(`${candidate}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
            }
          }}
          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Select PFI…</option>
          {pfiOptions.map(o => (
            <option key={o.id} value={String(o.id)}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
          <Package size={15} className="text-slate-500" />
          Allocation Code
        </Label>
        <Input
          placeholder="e.g. PFI14B-A1-XX12"
          value={loadCode}
          onChange={e => setLoadCode(e.target.value.toUpperCase())}
          className="h-10"
        />
        {suggestedCodes.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {suggestedCodes.map(code => (
              <button
                key={code}
                type="button"
                onClick={() => setLoadCode(code)}
                className={`px-2 py-1 rounded text-xs font-semibold border ${loadCodeTheme ? loadCodeTheme.badge : 'bg-slate-100 text-slate-700 border-slate-200'} ${loadCode === code ? 'ring-2 ring-slate-300' : ''}`}
              >
                {code}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Fuel size={15} className="text-slate-500" />
                Total Allocation (Litres) <span className="text-red-500">*</span>
              </Label>
              {autoSumCapacity > 0 && (
                <button
                  type="button"
                  onClick={onUseCapacity}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2"
                >
                  Use trucks' capacity ({autoSumCapacity.toLocaleString()} L)
                </button>
              )}
            </div>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 66,000"
              value={totalAllocationQty}
              onChange={e => setTotalAllocationQty(e.target.value.replace(/[^0-9.,]/g, ''))}
              className="h-10 text-base font-semibold"
            />
            {selectedTruckIds.size > 1 && totalAllocationQty && autoSumCapacity > 0 && (
              <p className="text-xs text-slate-500">
                ≈ <strong>{Math.round(Number(totalAllocationQty.replace(/,/g, '')) / selectedTruckIds.size).toLocaleString()} L</strong> per truck
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Select Trucks <span className="text-red-500">*</span></Label>
            <TruckSelector
              trucks={availableTrucks}
              selectedTruckIds={selectedTruckIds}
              search={truckSearch}
              onSearchChange={setTruckSearch}
              onToggleTruck={toggleTruck}
            />
          </div>
        </div>

        <CapacitySummary
          totalAllocationQty={Number(totalAllocationQty.replace(/,/g, '')) || 0}
          selectedTruckCount={selectedTruckIds.size}
          autoSumCapacity={autoSumCapacity}
          needsOverride={needsOverride}
          overrideConfirmed={capacityOverrideConfirmed}
          onUseCapacity={onUseCapacity}
          onToggleOverride={onToggleOverride}
        />
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          className="gap-2"
          onClick={handleSave}
          disabled={saving || selectedTruckIds.size === 0 || needsOverride && !capacityOverrideConfirmed}
        >
          {saving ? 'Saving…' : 'Save Allocation'}
        </Button>
      </div>
    </div>
  );
}
