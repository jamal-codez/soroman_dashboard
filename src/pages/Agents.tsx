import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  id: string;
  name: string;
  phone: string;
  type: AgentType;
  isActive: boolean;
};

const DEFAULT_AGENT_ID = "soroman-default";

const seedAgents: Agent[] = [
  {
    id: DEFAULT_AGENT_ID,
    name: "Soroman Agent",
    phone: "+234 800 000 0000",
    type: "general",
    isActive: true
  },
  {
    id: "ag-002",
    name: "Precious Adebayo",
    phone: "+234 803 123 4567",
    type: "location",
    isActive: true
  },
  {
    id: "ag-003",
    name: "Ibrahim Musa",
    phone: "+234 806 222 3355",
    type: "location",
    isActive: true
  },
  {
    id: "ag-004",
    name: "Amaka Okolie",
    phone: "+234 809 920 1099",
    type: "location",
    isActive: false
  }
];

type LocationAgentsMap = Record<number, string[]>; 

const seedAssignments: LocationAgentsMap = {
  1: ["ag-002"],
  2: ["ag-003"],
  3: ["ag-004"]
};

function makeId() {
  return `ag-${Math.random().toString(16).slice(2, 8)}-${Date.now().toString(16).slice(-4)}`;
}

function normalizePhone(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

type ResultsResponseLike<T> = { results?: T[] };

export default function Agents() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);

  const [agents, setAgents] = useState<Agent[]>(seedAgents);
  const [locationAgents, setLocationAgents] = useState<LocationAgentsMap>(seedAssignments);

  const [query, setQuery] = useState("");

  const [openCreate, setOpenCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");

  const [openEdit, setOpenEdit] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

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

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === selectedLocationId) || null,
    [locations, selectedLocationId]
  );

  const defaultAgent = useMemo(
    () => agents.find((a) => a.id === DEFAULT_AGENT_ID) || null,
    [agents]
  );

  const selectedLocationAgentIds = useMemo(() => {
    if (!selectedLocationId) return [] as string[];
    return locationAgents[selectedLocationId] || [];
  }, [locationAgents, selectedLocationId]);

  const selectedLocationAgents = useMemo(() => {
    const local = agents.filter((a) => selectedLocationAgentIds.includes(a.id));
    return local.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [agents, selectedLocationAgentIds]);

  const combinedAgentsForSelectedLocation = useMemo(() => {
    const list: Agent[] = [];
    if (defaultAgent) list.push(defaultAgent);
    list.push(...selectedLocationAgents);

    const q = query.trim().toLowerCase();
    if (!q) return list;

    return list.filter((a) => {
      return a.name.toLowerCase().includes(q) || a.phone.toLowerCase().includes(q);
    });
  }, [defaultAgent, selectedLocationAgents, query]);

  const stats = useMemo(() => {
    const active = agents.filter((a) => a.isActive).length;
    const assignedCount = Object.values(locationAgents).reduce((acc, ids) => acc + ids.length, 0);
    return {
      locations: locations.length,
      totalAgents: agents.length,
      activeAgents: active,
      assignments: assignedCount
    };
  }, [agents, locations.length, locationAgents]);

  function resetCreate() {
    setCreateName("");
    setCreatePhone("");
  }

  function onCreate() {
    const name = createName.trim();
    const phone = normalizePhone(createPhone);
    if (!name || !phone) return;
    if (!selectedLocationId) return;

    const newAgent: Agent = {
      id: makeId(),
      name,
      phone,
      type: "location",
      isActive: true
    };

    setAgents((prev) => [newAgent, ...prev]);
    setLocationAgents((prev) => {
      const ids = prev[selectedLocationId] || [];
      return {
        ...prev,
        [selectedLocationId]: [newAgent.id, ...ids]
      };
    });

    setOpenCreate(false);
    resetCreate();
  }

  function openEditAgent(agent: Agent) {
    setEditingAgentId(agent.id);
    setEditName(agent.name);
    setEditPhone(agent.phone);
    setOpenEdit(true);
  }

  function saveEditAgent() {
    if (!editingAgentId) return;
    const name = editName.trim();
    const phone = normalizePhone(editPhone);
    if (!name || !phone) return;

    setAgents((prev) =>
      prev.map((a) => (a.id === editingAgentId ? { ...a, name, phone } : a))
    );

    setOpenEdit(false);
    setEditingAgentId(null);
  }

  function toggleActive(agentId: string) {
    setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, isActive: !a.isActive } : a)));
  }

  function unassignFromLocation(agentId: string) {
    if (!selectedLocationId) return;
    setLocationAgents((prev) => {
      const ids = prev[selectedLocationId] || [];
      return {
        ...prev,
        [selectedLocationId]: ids.filter((id) => id !== agentId)
      };
    });
  }

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
                          const count = (locationAgents[l.id] || []).length + (defaultAgent ? 1 : 0);
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
                      {defaultAgent && (
                        <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center">
                                  <ShieldCheck className="h-5 w-5 text-blue-700" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 truncate">{defaultAgent.name}</div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    Default agent
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="h-3.5 w-3.5" /> {defaultAgent.phone}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" /> All locations
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge className={cn(defaultAgent.isActive ? "bg-emerald-600" : "bg-slate-500")}>
                                {defaultAgent.isActive ? "Active" : "Disabled"}
                              </Badge>
                              <Button size="sm" variant="outline" onClick={() => toggleActive(defaultAgent.id)}>
                                {defaultAgent.isActive ? "Disable" : "Enable"}
                              </Button>
                              <Button size="sm" className="gap-2" onClick={() => openEditAgent(defaultAgent)}>
                                <Pencil className="h-4 w-4" />
                                Edit
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                          <div className="text-sm font-semibold text-slate-900">Location agents</div>
                          <div className="text-xs text-slate-500">
                            {combinedAgentsForSelectedLocation.filter((a) => a.type === "location").length} agents
                          </div>
                        </div>

                        <div className="p-2 sm:p-3">
                          {combinedAgentsForSelectedLocation.filter((a) => a.type === "location").length === 0 && !query.trim() ? (
                            <div className="p-6 text-center text-sm text-slate-500">
                              No agents assigned to this location yet.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {combinedAgentsForSelectedLocation
                                .filter((a) => a.type === "location")
                                .map((agent) => (
                                  <div
                                    key={agent.id}
                                    className={cn(
                                      "rounded-lg border bg-white px-3 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
                                      !agent.isActive && "opacity-70"
                                    )}
                                  >
                                    <div className="min-w-0">
                                      <div className="font-semibold text-slate-900 truncate">{agent.name}</div>
                                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                        <span className="inline-flex items-center gap-1">
                                          <Phone className="h-3.5 w-3.5" /> {agent.phone}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                          <MapPin className="h-3.5 w-3.5" /> {selectedLocation?.name}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <Badge className={cn(agent.isActive ? "bg-emerald-600" : "bg-slate-500")}>
                                        {agent.isActive ? "Active" : "Disabled"}
                                      </Badge>
                                      <Button size="sm" variant="outline" onClick={() => toggleActive(agent.id)}>
                                        {agent.isActive ? "Disable" : "Enable"}
                                      </Button>
                                      <Button size="sm" variant="outline" className="gap-2" onClick={() => openEditAgent(agent)}>
                                        <Pencil className="h-4 w-4" />
                                        Edit
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-red-600 hover:bg-red-50"
                                        onClick={() => unassignFromLocation(agent.id)}
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}

                          {query.trim() && combinedAgentsForSelectedLocation.filter((a) => a.type === "location").length === 0 && (
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

              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Location: <span className="font-medium">{selectedLocation?.name || "-"}</span>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setOpenCreate(false)}>
                Cancel
              </Button>
              <Button
                disabled={!createName.trim() || !createPhone.trim() || !selectedLocationId}
                onClick={onCreate}
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
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setOpenEdit(false)}>
                Cancel
              </Button>
              <Button
                disabled={!editName.trim() || !editPhone.trim()}
                onClick={saveEditAgent}
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
