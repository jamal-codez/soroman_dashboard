import { useEffect, useMemo, useState } from "react";
import { format, isThisMonth, isThisWeek, isThisYear, isToday } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SidebarNav } from "@/components/SidebarNav";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { apiClient } from "@/api/client";
import {
  Phone,
  MapPin,
  Plus,
  ShieldCheck,
  UserRound,
  UsersRound,
  Pencil
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SummaryCards } from "@/components/SummaryCards";

type AgentType = "location" | "general";

type Location = { id: number; name: string };

type Agent = {
  id: number;
  name: string;
  phone: string;
  type: AgentType;
  location: number | null;
  location_name?: string | null;
  is_active: boolean;
};

type OrderLike = {
  id: number;
  status?: string;
  created_at: string;
  quantity?: number | string;
  assigned_agent?: unknown;
  assignedAgent?: unknown;
  agent?: unknown;
  assigned_agent_id?: number | null;
};

function normalizePhone(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

type ResultsResponseLike<T> = { results?: T[] };
type PagedResponse<T> = { count?: number; next?: string | null; previous?: string | null; results?: T[] };

function asPagedResults<T>(raw: unknown): { count: number; results: T[] } {
  if (raw && typeof raw === 'object') {
    const rec = raw as PagedResponse<T>;
    if (Array.isArray(rec.results)) return { count: Number(rec.count ?? rec.results.length ?? 0), results: rec.results };
  }
  // fallback (non-paginated-ish, but should still be {count, results})
  return { count: 0, results: [] };
}

const getAgentDisplayName = (a: Agent) => a.name || '';
const getAgentLocationName = (a: Agent, selectedLocation?: Location | null) =>
  (a.location_name ?? '') ||
  (a.location != null && selectedLocation && a.location === selectedLocation.id ? selectedLocation.name : '') ||
  '';

export default function Agents() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);

  const [agentTypeFilter, setAgentTypeFilter] = useState<AgentType | 'all'>('location');
  const [onlyActive, setOnlyActive] = useState<'all' | 'true' | 'false'>('true');

  // Released-orders reporting timeframe filter (client-side)
  const [agentStatsFilterType, setAgentStatsFilterType] = useState<'today'|'week'|'month'|'year'|null>(null);

  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");

  const [openCreate, setOpenCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createType, setCreateType] = useState<AgentType>('location');
  const [createIsActive, setCreateIsActive] = useState(true);

  const [openEdit, setOpenEdit] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editType, setEditType] = useState<AgentType>('location');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editLocationId, setEditLocationId] = useState<number | null>(null);

  const {
    data: rawStates,
    isLoading: locationsLoading,
    isError: locationsIsError
  } = useQuery<unknown>({
    queryKey: ["state-prices"],
    queryFn: () => apiClient.admin.getStatesPricing(),
    retry: 2
  });

  const states = useMemo(() => {
    if (Array.isArray(rawStates)) return rawStates as Array<Record<string, unknown>>;
    if (rawStates && typeof rawStates === "object") {
      const maybe = rawStates as ResultsResponseLike<Record<string, unknown>>;
      if (Array.isArray(maybe.results)) return maybe.results as Array<Record<string, unknown>>;
    }
    return [] as Array<Record<string, unknown>>;
  }, [rawStates]);

  useEffect(() => {
    const list: Location[] = states
      .map((rec) => {
        const id = rec.id;
        const name = rec.name;
        if (id == null || name == null) return null;
        return { id: Number(id), name: String(name) };
      })
      .filter((x): x is Location => Boolean(x) && Number.isFinite(x.id) && x.name.length > 0);

    setLocations(list);
    if (selectedLocationId == null && list.length) setSelectedLocationId(list[0].id);
  }, [selectedLocationId, states]);

  const {
    data: agentsResponse,
    isLoading: agentsLoading,
    isError: agentsIsError,
    error: agentsError,
  } = useQuery<unknown>({
    queryKey: ["admin-agents", { selectedLocationId, query, agentTypeFilter, onlyActive }],
    queryFn: async () => {
      const params: Record<string, unknown> = {};
      if (agentTypeFilter !== 'all') params.type = agentTypeFilter;
      if (selectedLocationId && agentTypeFilter !== 'general') params.location_id = selectedLocationId;
      if (onlyActive !== 'all') params.is_active = onlyActive === 'true';
      if (query.trim()) params.search = query.trim();
      return apiClient.admin.adminListAgents(params as unknown as { type?: 'general' | 'location'; location_id?: number; is_active?: boolean; search?: string; page?: number; page_size?: number });
    },
    retry: 2,
    refetchOnWindowFocus: true,
  });

  const agentsPaged = useMemo(() => asPagedResults<Agent>(agentsResponse), [agentsResponse]);
  const agents = agentsPaged.results;

  // --- Released orders stats (best-effort; uses all-orders endpoint) ---
  const { data: ordersRaw } = useQuery<unknown>({
    queryKey: ["all-orders", "agents-stats"],
    queryFn: () => apiClient.admin.getAllAdminOrders({ page: 1, page_size: 10000 }),
    retry: 2,
    refetchOnWindowFocus: true,
  });

  const ordersPaged = useMemo(() => asPagedResults<OrderLike>(ordersRaw), [ordersRaw]);
  const releasedOrders = useMemo(() => {
    const base = ordersPaged.results || [];
    const isReleased = (s: unknown) => String(s || '').toLowerCase() === 'released';

    return base.filter((o) => {
      if (!isReleased(o.status)) return false;
      if (!agentStatsFilterType) return true;
      const d = new Date(o.created_at);
      if (agentStatsFilterType === 'today') return isToday(d);
      if (agentStatsFilterType === 'week') return isThisWeek(d);
      if (agentStatsFilterType === 'month') return isThisMonth(d);
      if (agentStatsFilterType === 'year') return isThisYear(d);
      return true;
    });
  }, [ordersPaged.results, agentStatsFilterType]);

  const safeQty = (v: unknown): number => {
    if (v == null) return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = parseFloat(String(v).replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const getOrderAgentId = (o: OrderLike): number | null => {
    if (typeof o.assigned_agent_id === 'number' && Number.isFinite(o.assigned_agent_id)) return o.assigned_agent_id;

    const rec = o as unknown as Record<string, unknown>;
    const a = (rec.assigned_agent ?? rec.assignedAgent ?? rec.agent) as unknown;
    if (!a || typeof a !== 'object') return null;

    const aRec = a as Record<string, unknown>;
    const id = aRec.id;
    if (typeof id === 'number' && Number.isFinite(id)) return id;
    if (typeof id === 'string' && id.trim() && Number.isFinite(Number(id))) return Number(id);
    return null;
  };

  const agentPerformance = useMemo(() => {
    // Map agentId -> stats
    const byId = new Map<number, { orders: number; qty: number }>();

    for (const o of releasedOrders) {
      const agentId = getOrderAgentId(o);
      if (agentId == null) continue;

      const prev = byId.get(agentId) || { orders: 0, qty: 0 };
      byId.set(agentId, {
        orders: prev.orders + 1,
        qty: prev.qty + safeQty(o.quantity),
      });
    }

    return agents.map((a) => {
      const s = byId.get(a.id) || { orders: 0, qty: 0 };
      return { agent: a, orders: s.orders, qty: s.qty };
    });
  }, [agents, releasedOrders]);

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === selectedLocationId) || null,
    [locations, selectedLocationId]
  );

  const filteredAgents = useMemo(() => {
    const list = [...agents];
    return list.sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [agents]);

  const stats = useMemo(() => {
    const active = agents.filter((a) => a.is_active).length;
    return {
      locations: locations.length,
      totalAgents: agents.length,
      activeAgents: active,
      assignments: agents.filter((a) => a.type === 'location').length,
    };
  }, [agents, locations.length]);

  function resetCreate() {
    setCreateName("");
    setCreatePhone("");
    setCreateType('location');
    setCreateIsActive(true);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const name = createName.trim();
      const phone = normalizePhone(createPhone);
      if (!name || !phone) throw new Error('Name and phone are required');

      // backend validation rules
      const location = createType === 'location' ? selectedLocationId : null;
      if (createType === 'location' && !location) throw new Error('Location is required for location agents');

      return apiClient.admin.adminCreateAgent({
        name,
        phone,
        type: createType,
        location,
        is_active: createIsActive,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-agents"] });
      setOpenCreate(false);
      resetCreate();
    }
  });

  function openEditAgent(agent: Agent) {
    setEditingAgentId(String(agent.id));
    setEditName(agent.name);
    setEditPhone(agent.phone);
    setEditType(agent.type);
    setEditIsActive(agent.is_active);
    setEditLocationId(agent.location ?? null);
    setOpenEdit(true);
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingAgentId) throw new Error('No agent selected');
      const id = Number(editingAgentId);
      if (!Number.isFinite(id)) throw new Error('Invalid agent id');

      const name = editName.trim();
      const phone = normalizePhone(editPhone);
      if (!name || !phone) throw new Error('Name and phone are required');

      const location = editType === 'location' ? (editLocationId ?? selectedLocationId) : null;
      if (editType === 'location' && !location) throw new Error('Location is required for location agents');

      return apiClient.admin.adminUpdateAgent(id, {
        name,
        phone,
        type: editType,
        location,
        is_active: editIsActive,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-agents"] });
      setOpenEdit(false);
      setEditingAgentId(null);
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: number) => apiClient.admin.adminDeactivateAgent(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-agents"] });
    }
  });

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />

        <div className="flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Marketers"
              actions={
                <Button onClick={() => setOpenCreate(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add marketer
                </Button>
              }
            />

            <SummaryCards
              cards={[
                { title: 'Locations', value: String(stats.locations), description: 'Available locations', icon: <MapPin className="h-5 w-5" />, tone: 'neutral' },
                { title: 'Total marketers', value: String(stats.totalAgents), description: 'Per location', icon: <UsersRound className="h-5 w-5" />, tone: 'neutral' },
                { title: 'Assignments', value: String(stats.assignments), description: 'Per location', icon: <UserRound className="h-5 w-5" />, tone: 'amber' },
              ]}
            />

            {/* Released orders performance */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Marketers performance</CardTitle>
                    <CardDescription>
                      Total released orders and litres sold per marketer.
                    </CardDescription>
                  </div>
                  <select
                    aria-label="Agent performance timeframe"
                    className="border border-gray-300 rounded px-3 py-2 h-11 bg-white"
                    value={agentStatsFilterType ?? ''}
                    onChange={(e) => {
                      const v = e.target.value as ''|'today'|'week'|'month'|'year';
                      setAgentStatsFilterType(v === '' ? null : v);
                    }}
                  >
                    <option value="">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="year">This Year</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left">
                        <th className="py-2 px-3 font-semibold text-slate-700">Marketers</th>
                        {/* <th className="py-2 px-3 font-semibold text-slate-700">Type</th>
                        <th className="py-2 px-3 font-semibold text-slate-700">Location</th> */}
                        <th className="py-2 px-3 font-semibold text-slate-700 text-right">Released orders</th>
                        <th className="py-2 px-3 font-semibold text-slate-700 text-right">Qty (L)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentPerformance
                        .slice()
                        .sort((a, b) => b.orders - a.orders || b.qty - a.qty || a.agent.name.localeCompare(b.agent.name))
                        .map((row) => (
                          <tr key={row.agent.id} className="border-b border-slate-100">
                            <td className="py-2 px-3 text-slate-900">{row.agent.name}</td>
                            {/* <td className="py-2 px-3 text-slate-700">{row.agent.type}</td>
                            <td className="py-2 px-3 text-slate-700">{row.agent.location_name || '—'}</td> */}
                            <td className="py-2 px-3 text-slate-900 text-right">{row.orders.toLocaleString()}</td>
                            <td className="py-2 px-3 text-slate-900 text-right">{row.qty.toLocaleString()}</td>
                          </tr>
                        ))}
                      {agentPerformance.length === 0 ? (
                        <tr>
                          <td className="py-6 px-3 text-slate-500" colSpan={5}>
                            No marketers found.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Card className="lg:col-span-4 overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Locations</CardTitle>
                  <CardDescription>Select a location to manage its marketers</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {locationsLoading ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                      Loading locations...
                    </div>
                  ) : locationsIsError ? (
                    <div className="rounded-lg border border-dashed border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
                      Failed to load locations.
                    </div>
                  ) : locations.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                      No locations found.
                    </div>
                  ) : (
                    <ScrollArea className="h-[520px] pr-2">
                      <div className="space-y-2">
                        {locations.map((l) => {
                          const isActive = l.id === selectedLocationId;
                          const count = agents.filter((a) => a.type === 'location' && a.location === l.id).length;
                          return (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => setSelectedLocationId(l.id)}
                              className={cn(
                                "w-full rounded-lg border px-3 py-3 text-left transition-colors flex items-center justify-between gap-3",
                                isActive
                                  ? "border-primary bg-primary/5"
                                  : "border-slate-200 bg-white hover:bg-slate-50"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 truncate">{l.name}</div>
                              </div>
                              {/* <Badge variant="secondary" className="shrink-0">
                                {count}
                              </Badge> */}
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-8 overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-base">
                        Manage Marketers for {selectedLocation?.name ?? '—'}
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {!selectedLocationId ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                      Select a location to start.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                          <div className="text-sm font-semibold text-slate-900">Location marketers</div>
                          <div className="text-xs text-slate-500">
                            {filteredAgents.filter((a) => a.type === "location").length} marketers
                          </div>
                        </div>

                        <div className="p-2 sm:p-3">
                          {filteredAgents.filter((a) => a.type === "location").length === 0 && !query.trim() ? (
                            <div className="p-6 text-center text-sm text-slate-500">
                              No marketers assigned to this location yet.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {filteredAgents
                                .filter((a) => a.type === "location")
                                .map((agent) => (
                                  <div
                                    key={agent.id}
                                    className={cn(
                                      "rounded-lg border bg-white px-3 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
                                      !agent.is_active && "opacity-70"
                                    )}
                                  >
                                    <div className="min-w-0">
                                      <div className="font-semibold text-slate-900 truncate">{getAgentDisplayName(agent)}</div>
                                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                        <span className="inline-flex items-center gap-1">
                                          <Phone className="h-3.5 w-3.5" /> {agent.phone}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                          <MapPin className="h-3.5 w-3.5" /> {getAgentLocationName(agent, selectedLocation)}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <Badge className={cn(agent.is_active ? "bg-emerald-600" : "bg-slate-500")}>
                                        {agent.is_active ? "Active" : "Disabled"}
                                      </Badge>
                                      <Button size="sm" variant="outline" className="gap-2" onClick={() => openEditAgent(agent)}>
                                        <Pencil className="h-4 w-4" />
                                        Edit
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-red-600 hover:bg-red-50"
                                        onClick={() => deactivateMutation.mutate(agent.id)}
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}

                          {query.trim() && filteredAgents.filter((a) => a.type === "location").length === 0 && (
                            <div className="p-6 text-center text-sm text-slate-500">
                              No marketers match your search for this location.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="h-10" />
          </div>
        </div>

        <Dialog
          open={openCreate}
          onOpenChange={(o) => {
            setOpenCreate(o);
            if (!o) resetCreate();
          }}
        >
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Add Marketers</DialogTitle>
              <DialogDescription>
                Create a new marketer for <span className="font-medium">{selectedLocation?.name || "selected location"}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="agentName">Full name</Label>
                <Input
                  id="agentName"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Precious Adebayo"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="agentPhone">Phone</Label>
                <Input
                  id="agentPhone"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  placeholder="e.g. +234 803 123 4567"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="agentCreateType">Type</Label>
                <select
                  id="agentCreateType"
                  aria-label="Agent type"
                  className="border border-gray-300 rounded px-3 py-2 h-11"
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value as any)}
                >
                  <option value="location">Location</option>
                  <option value="general">General</option>
                </select>
              </div>

              {createType === 'location' ? (
                <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Location: <span className="font-medium">{selectedLocation?.name || '-'}</span>
                </div>
              ) : (
                <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Location: <span className="font-medium">None (General agent)</span>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setOpenCreate(false)}>
                Cancel
              </Button>
              <Button
                disabled={!createName.trim() || !createPhone.trim() || (createType === 'location' && !selectedLocationId) || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                Save agent
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={openEdit}
          onOpenChange={(o) => {
            setOpenEdit(o);
            if (!o) {
              setEditingAgentId(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Edit Marketers</DialogTitle>
              <DialogDescription>Update marketers details</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="editName">Full name</Label>
                <Input
                  id="editName"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Agent name"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="editPhone">Phone</Label>
                <Input
                  id="editPhone"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="Agent phone"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="agentEditType">Type</Label>
                <select
                  id="agentEditType"
                  aria-label="Agent type"
                  className="border border-gray-300 rounded px-3 py-2 h-11"
                  value={editType}
                  onChange={(e) => {
                    const t = e.target.value as any;
                    setEditType(t);
                    if (t === 'general') setEditLocationId(null);
                    if (t === 'location' && editLocationId == null) setEditLocationId(selectedLocationId);
                  }}
                >
                  <option value="location">Location</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="agentEditActive">Status</Label>
                <select
                  id="agentEditActive"
                  aria-label="Agent active"
                  className="border border-gray-300 rounded px-3 py-2 h-11"
                  value={editIsActive ? 'true' : 'false'}
                  onChange={(e) => setEditIsActive(e.target.value === 'true')}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              {editType === 'location' ? (
                <div className="grid gap-2">
                  <Label htmlFor="agentEditLocation">Location</Label>
                  <select
                    id="agentEditLocation"
                    aria-label="Agent location"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={String(editLocationId ?? selectedLocationId ?? '')}
                    onChange={(e) => setEditLocationId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Select location</option>
                    {locations.map((l) => (
                      <option key={l.id} value={String(l.id)}>{l.name}</option>
                    ))}
                  </select>
                  <div className="text-xs text-slate-500">Required for location marketers.</div>
                </div>
              ) : (
                <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Location: <span className="font-medium">None (General agent)</span>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setOpenEdit(false)}>
                Cancel
              </Button>
              <Button
                disabled={!editName.trim() || !editPhone.trim() || updateMutation.isPending}
                onClick={() => updateMutation.mutate()}
              >
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// --- EVERYTHING BELOW IS COMMENTED OUT DUE TO REMOVAL OF AGENTS/MARKETERS FEATURE ---
/*
// ...entire file content...
*/
