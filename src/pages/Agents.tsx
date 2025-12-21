import { useEffect, useMemo, useState } from "react";
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
      const params: any = {};
      if (agentTypeFilter !== 'all') params.type = agentTypeFilter;
      if (selectedLocationId && agentTypeFilter !== 'general') params.location_id = selectedLocationId;
      if (onlyActive !== 'all') params.is_active = onlyActive === 'true';
      if (query.trim()) params.search = query.trim();
      return apiClient.admin.adminListAgents(params);
    },
    retry: 2,
    refetchOnWindowFocus: true,
  });

  const agentsPaged = useMemo(() => asPagedResults<Agent>(agentsResponse), [agentsResponse]);
  const agents = agentsPaged.results;

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
              title="Agents"
              actions={
                <Button onClick={() => setOpenCreate(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add agent
                </Button>
              }
            />

            <SummaryCards
              cards={[
                { title: 'Locations', value: String(stats.locations), description: 'Available states', icon: <MapPin className="h-5 w-5" />, tone: 'neutral' },
                { title: 'Total agents', value: String(stats.totalAgents), description: 'Including default', icon: <UsersRound className="h-5 w-5" />, tone: 'neutral' },
                { title: 'Assignments', value: String(stats.assignments), description: 'Across locations', icon: <UserRound className="h-5 w-5" />, tone: 'amber' },
              ]}
            />

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <Label htmlFor="agentSearch" className="text-xs text-slate-600">Search</Label>
                  <Input
                    id="agentSearch"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or phone"
                  />
                </div>

                <div>
                  <Label htmlFor="agentActive" className="text-xs text-slate-600">Active</Label>
                  <select
                    id="agentActive"
                    aria-label="Active filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11 w-full"
                    value={onlyActive}
                    onChange={(e) => setOnlyActive(e.target.value as any)}
                  >
                    <option value="all">All</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="agentType" className="text-xs text-slate-600">Type</Label>
                  <select
                    id="agentType"
                    aria-label="Type filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11 w-full"
                    value={agentTypeFilter}
                    onChange={(e) => setAgentTypeFilter(e.target.value as any)}
                  >
                    <option value="all">All</option>
                    <option value="location">Location</option>
                    <option value="general">General</option>
                  </select>
                </div>

                <div className="md:col-span-2 flex items-end">
                  {agentsLoading ? (
                    <div className="text-sm text-slate-500">Loading agents…</div>
                  ) : agentsIsError ? (
                    <div className="text-sm text-red-600">{(agentsError as Error)?.message || 'Failed to load agents.'}</div>
                  ) : (
                    <div className="text-sm text-slate-500">Showing {agentsPaged.count} agent(s)</div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Card className="lg:col-span-4 overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Locations</CardTitle>
                  <CardDescription>Select a location to manage its agents</CardDescription>
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
                              <Badge variant="secondary" className="shrink-0">
                                {count}
                              </Badge>
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
                        Manage Agents for {selectedLocation?.name ?? '—'}
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
                          <div className="text-sm font-semibold text-slate-900">Location agents</div>
                          <div className="text-xs text-slate-500">
                            {filteredAgents.filter((a) => a.type === "location").length} agents
                          </div>
                        </div>

                        <div className="p-2 sm:p-3">
                          {filteredAgents.filter((a) => a.type === "location").length === 0 && !query.trim() ? (
                            <div className="p-6 text-center text-sm text-slate-500">
                              No agents assigned to this location yet.
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
                                        Deactivate
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}

                          {query.trim() && filteredAgents.filter((a) => a.type === "location").length === 0 && (
                            <div className="p-6 text-center text-sm text-slate-500">
                              No agents match your search for this location.
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
              <DialogTitle>Add Agent</DialogTitle>
              <DialogDescription>
                Create a new agent for <span className="font-medium">{selectedLocation?.name || "selected location"}</span>.
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
              <DialogTitle>Edit Agent</DialogTitle>
              <DialogDescription>Update agent details (UI only for now).</DialogDescription>
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
                  <div className="text-xs text-slate-500">Required for location agents.</div>
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
