export type InventoryChangeType = "set" | "increment" | "decrement";

export type InventoryCargoHistoryEntry = {
  id: string;
  productId: number;
  stateId: number;
  productName?: string;
  cargoName: string;
  previousQty: number;
  nextQty: number;
  deltaQty: number;
  changeType: InventoryChangeType;
  note?: string;
  createdAt: string; // ISO
};

export type ActiveCargoSelection = {
  productId: number;
  stateId: number;
  cargoName: string;
  activatedAt: string; // ISO
};

const HISTORY_KEY = "soroman:inventory-cargo-history:v1";
const ACTIVE_KEY = "soroman:inventory-active-cargo:v1";

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const getInventoryCargoHistory = (): InventoryCargoHistoryEntry[] =>
  safeParse<InventoryCargoHistoryEntry[]>(localStorage.getItem(HISTORY_KEY), []);

export const saveInventoryCargoHistory = (rows: InventoryCargoHistoryEntry[]) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(rows));
};

export const addInventoryCargoHistoryEntry = (
  entry: Omit<InventoryCargoHistoryEntry, "id" | "createdAt">
) => {
  const next: InventoryCargoHistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  const rows = getInventoryCargoHistory();
  saveInventoryCargoHistory([next, ...rows]);
};

export const getInventoryCargoHistoryFor = (stateId: number, productId: number) =>
  getInventoryCargoHistory().filter(
    (r) => Number(r.stateId) === Number(stateId) && Number(r.productId) === Number(productId)
  );

export const getActiveCargoSelections = (): ActiveCargoSelection[] =>
  safeParse<ActiveCargoSelection[]>(localStorage.getItem(ACTIVE_KEY), []);

export const saveActiveCargoSelections = (rows: ActiveCargoSelection[]) => {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(rows));
};

export const getActiveCargoFor = (stateId: number, productId: number): ActiveCargoSelection | null => {
  const rows = getActiveCargoSelections();
  return (
    rows.find(
      (r) => Number(r.stateId) === Number(stateId) && Number(r.productId) === Number(productId)
    ) || null
  );
};

export const setActiveCargoFor = (stateId: number, productId: number, cargoName: string) => {
  const rows = getActiveCargoSelections();
  const filtered = rows.filter(
    (r) => !(Number(r.stateId) === Number(stateId) && Number(r.productId) === Number(productId))
  );
  const next: ActiveCargoSelection = {
    stateId,
    productId,
    cargoName: cargoName.trim(),
    activatedAt: new Date().toISOString(),
  };
  saveActiveCargoSelections([next, ...filtered]);
};

export const clearActiveCargoFor = (stateId: number, productId: number) => {
  const rows = getActiveCargoSelections();
  saveActiveCargoSelections(
    rows.filter(
      (r) => !(Number(r.stateId) === Number(stateId) && Number(r.productId) === Number(productId))
    )
  );
};

export const msToDurationShort = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
};
