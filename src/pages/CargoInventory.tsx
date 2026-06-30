import { useEffect, useMemo, useState } from "react";
import { SidebarNav } from "@/components/SidebarNav";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/api/client";
import { MapPin, Plus } from "lucide-react";

type State = { id: number; name: string };

type ProductType = "Petrol" | "Diesel" | "Kerosene" | "AGO" | "DPK" | "PMS";

type CargoStatus = "active" | "inactive" | "finished";

type Cargo = {
  id: string;
  stateId: number;
  cargoName: string;
  productType: ProductType;
  totalQty: number;
  releasedQty: number;
  status: CargoStatus;
  createdAt: string;
};

const STORAGE_KEY = "soroman:cargo-inventory:v1";

const PRODUCT_TYPES: ProductType[] = ["PMS", "AGO", "DPK", "Petrol", "Diesel", "Kerosene"];

const formatNumber = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0";

const safeNumber = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

const getProgressPercent = (released: number, total: number) => {
  if (!total || total <= 0) return 0;
  const pct = (released / total) * 100;
  return Math.max(0, Math.min(100, pct));
};

const statusBadge = (s: CargoStatus) => {
  if (s === "active") return <Badge className="bg-green-100 text-green-800 border border-green-200">Active</Badge>;
  if (s === "finished") return <Badge className="bg-slate-100 text-slate-800 border border-slate-200">Finished</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 border border-amber-200">Inactive</Badge>;
};

export default function CargoInventory() {
  const { toast } = useToast();

  const [states, setStates] = useState<State[]>([]);
  const [selectedStateId, setSelectedStateId] = useState<number | null>(null);

  const [addOpen, setAddOpen] = useState(false);

  const [cargoName, setCargoName] = useState("");
  const [productType, setProductType] = useState<ProductType>("PMS");
  const [totalQty, setTotalQty] = useState("");

  const [cargos, setCargos] = useState<Cargo[]>([]);

  useEffect(() => {
    // load states for location selector
    (async () => {
      try {
        const res = await apiClient.admin.getStates();
        const list = (res as any)?.results || res;
        const normalized: State[] = Array.isArray(list)
          ? list
              .map((s: any) => ({ id: Number(s.id), name: String(s.name ?? "") }))
              .filter((s: State) => Number.isFinite(s.id) && s.name)
          : [];
        setStates(normalized);
        if (!selectedStateId && normalized.length) setSelectedStateId(normalized[0].id);
      } catch {
        setStates([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // load local cargos
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Cargo[];
      if (Array.isArray(parsed)) setCargos(parsed);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // persist local cargos
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cargos));
    } catch {
      // ignore
    }
  }, [cargos]);

  const cargosInState = useMemo(() => {
    if (!selectedStateId) return [];
    return cargos
      .filter((c) => c.stateId === selectedStateId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [cargos, selectedStateId]);

  const activeByProduct = useMemo(() => {
    const map = new Map<ProductType, Cargo>();
    cargosInState.forEach((c) => {
      if (c.status === "active" && !map.has(c.productType)) map.set(c.productType, c);
    });
    return map;
  }, [cargosInState]);

  const canAddCargo = Boolean(selectedStateId);

  const addCargo = () => {
    if (!selectedStateId) return;

    const name = cargoName.trim();
    const total = safeNumber(totalQty);

    if (!name) {
      toast({ title: "Missing cargo name", variant: "destructive" });
      return;
    }
    if (!total || total <= 0) {
      toast({ title: "Enter a valid quantity", variant: "destructive" });
      return;
    }

    // Only one active cargo per product per location.
    const hasActiveSameProduct = cargos.some(
      (c) => c.stateId === selectedStateId && c.productType === productType && c.status === "active"
    );

    const newCargo: Cargo = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      stateId: selectedStateId,
      cargoName: name,
      productType,
      totalQty: total,
      releasedQty: 0,
      status: hasActiveSameProduct ? "inactive" : "active",
      createdAt: new Date().toISOString(),
    };

    setCargos((prev) => [newCargo, ...prev]);

    setCargoName("");
    setProductType("PMS");
    setTotalQty("");
    setAddOpen(false);

    toast({
      title: "Cargo added",
      description: hasActiveSameProduct
        ? `Saved as Inactive because an Active ${productType} cargo already exists for this location.`
        : "Saved as Active.",
    });
  };

  const toggleActive = (cargoId: string) => {
    setCargos((prev) => {
      const target = prev.find((c) => c.id === cargoId);
      if (!target) return prev;

      const isActive = target.status === "active";
      return prev.map((c) => {
        // toggle target
        if (c.id === cargoId) return { ...c, status: isActive ? "inactive" : "active" };

        // if turning ON target, deactivate any other active cargo for same state + product
        if (
          !isActive &&
          c.stateId === target.stateId &&
          c.productType === target.productType &&
          c.status === "active"
        ) {
          return { ...c, status: "inactive" };
        }

        return c;
      });
    });

    toast({ title: "Cargo status updated" });
  };

  const stateName = useMemo(() => {
    const s = states.find((x) => x.id === selectedStateId);
    return s?.name || "";
  }, [states, selectedStateId]);

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Cargo Inventory</h1>
                <div className="text-sm text-slate-600">
                  Track cargo batches per location. Quantity is locked after creation; releases update progress.
                </div>
              </div>

              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" disabled={!canAddCargo}>
                    <Plus className="h-4 w-4" /> Add Cargo
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add Cargo</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div>
                      <Label>Location</Label>
                      <div className="mt-1 text-sm text-slate-700 font-medium flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-slate-500" />
                        <span>{stateName || "Select a location"}</span>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="cargoName">Cargo Name</Label>
                      <Input
                        id="cargoName"
                        value={cargoName}
                        onChange={(e) => setCargoName(e.target.value)}
                        placeholder='e.g. "Vessel Alpha - Jan 2026"'
                      />
                    </div>

                    <div>
                      <Label>Product Type</Label>
                      <Select value={productType} onValueChange={(v) => setProductType(v as ProductType)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {PRODUCT_TYPES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {activeByProduct.has(productType) ? (
                        <div className="mt-1 text-xs text-amber-700">
                          Note: there is already an Active {productType} cargo for this location; this one will be saved as Inactive.
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <Label htmlFor="totalQty">Quantity (Litres)</Label>
                      <Input
                        id="totalQty"
                        inputMode="numeric"
                        value={totalQty}
                        onChange={(e) => setTotalQty(e.target.value)}
                        placeholder="e.g. 500000"
                      />
                    </div>
                  </div>

                  <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setAddOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={addCargo}>Save Cargo</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  <span className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-slate-500" />
                    Depot/State<span className="text-red-900 ml-1">*</span>
                  </span>
                </Label>
                <div className="mt-2 max-w-md">
                  <Select
                    value={selectedStateId ? String(selectedStateId) : ""}
                    onValueChange={(v) => setSelectedStateId(Number(v))}
                  >
                    <SelectTrigger className="w-full h-11 rounded-lg border-slate-200 hover:border-slate-300">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg shadow-lg border border-slate-200 max-h-60">
                      {states.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {!selectedStateId ? (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
                Select a location to view cargos.
              </div>
            ) : cargosInState.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
                No cargos yet for this location.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cargosInState.map((c) => {
                  const percent = getProgressPercent(c.releasedQty, c.totalQty);
                  const isActive = c.status === "active";
                  const otherActive = activeByProduct.get(c.productType);

                  const canToggleOn = !isActive ? !otherActive || otherActive.id === c.id : true;
                  const canToggle = isActive || canToggleOn;

                  return (
                    <Card key={c.id} className="border-slate-200">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-base text-slate-900">{c.cargoName}</CardTitle>
                            <div className="mt-1 text-xs text-slate-500">
                              {c.productType} • Total: {formatNumber(c.totalQty)} L
                            </div>
                          </div>
                          <div className="shrink-0">{statusBadge(c.status)}</div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between text-xs text-slate-600">
                            <span>
                              {formatNumber(c.releasedQty)} released of {formatNumber(c.totalQty)}
                            </span>
                            <span className="font-semibold text-slate-800">{Math.round(percent)}%</span>
                          </div>
                          <div className="mt-1">
                            <Progress value={percent} />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-500">Created: {new Date(c.createdAt).toLocaleString()}</div>
                          <Button
                            size="sm"
                            variant={isActive ? "default" : "outline"}
                            className="h-8"
                            onClick={() => toggleActive(c.id)}
                            disabled={!canToggle}
                            title={
                              !canToggle
                                ? `Another ${c.productType} cargo is active. Deactivate it first.`
                                : undefined
                            }
                          >
                            {isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="text-xs text-slate-500">
              Note: This page is frontend-only for now and stores data in your browser (localStorage). Backend will be added later.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
