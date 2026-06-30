export type CargoProductType = "PMS" | "AGO" | "DPK" | "Petrol" | "Diesel" | "Kerosene";

export type CargoStatus = "active" | "inactive";

export type Cargo = {
  id: string;
  stateId: number;
  cargoName: string;
  productType: CargoProductType;
  totalQty: number;
  status: CargoStatus;
  createdAt: string;
};

const STORAGE_KEY = "soroman:cargo-inventory:v1";

export const getAllCargos = (): Cargo[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Cargo[]) : [];
  } catch {
    return [];
  }
};

export const saveAllCargos = (cargos: Cargo[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cargos));
};

export const getCargosByState = (stateId: number): Cargo[] =>
  getAllCargos().filter((c) => Number(c.stateId) === Number(stateId));

export const getActiveCargoByStateAndProduct = (
  stateId: number,
  productType: string
): Cargo | null => {
  const cargos = getCargosByState(stateId);
  const pt = String(productType || "").toLowerCase();
  const found = cargos.find(
    (c) =>
      Number(c.stateId) === Number(stateId) &&
      String(c.productType || "").toLowerCase() === pt &&
      c.status === "active"
  );
  return found || null;
};

export const getActiveCargoNameForStateAndProduct = (
  stateId: number,
  productType: string
): string => getActiveCargoByStateAndProduct(stateId, productType)?.cargoName || "";

export const toggleCargoActive = (cargoId: string) => {
  const cargos = getAllCargos();
  const target = cargos.find((c) => c.id === cargoId);
  if (!target) return;

  const isActive = target.status === "active";

  const next: Cargo[] = cargos.map((c) => {
    if (c.id === cargoId) {
      const status: CargoStatus = isActive ? "inactive" : "active";
      return { ...c, status };
    }

    // turning ON this cargo: deactivate any other active cargo for same state + product
    if (
      !isActive &&
      c.stateId === target.stateId &&
      c.productType === target.productType &&
      c.status === "active"
    ) {
      const status: CargoStatus = "inactive";
      return { ...c, status };
    }

    return c;
  });

  saveAllCargos(next);
};
