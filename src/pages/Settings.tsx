import { useState, useEffect } from 'react';
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  Search,
  UserPlus,
  Loader2,
  Users2,
  Ban,
  CheckCircle2,
  Shield,
  Mail,
  Phone,
  MapPin,
  Globe,
  Eye,
  EyeOff,
  FileSearch2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Flame,
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { ROLES, getCurrentUserRoles } from '@/roles';

type UserType = {
  id: number;
  full_name: string;
  email: string;
  phone_number: string;
  role: number;
  roles?: number[];
  suspended: boolean;
  last_login: string;
  last_login_ip?: string | null;
  last_login_user_agent?: string | null;
  label: string;
  location?: string;
  locations?: number[];       // scoped state IDs sent in PATCH
  location_names?: string[];  // resolved names returned by GET — use these for display
  pfis?: number[];            // scoped PFI IDs sent in PATCH
  pfi_numbers?: string[];     // resolved PFI numbers returned by GET — use these for display
  lpg_plants?: number[];      // scoped LPG plant IDs sent in PATCH
  lpg_plant_names?: string[]; // resolved LPG plant names returned by GET — use these for display
  plain_password?: string | null;
};

const roleMap: Record<number, string> = {
  0: 'Superadmin',
  1: 'Administration',
  2: 'Finance',
  3: 'Truck Sales',
  4: 'Ticketing',
  5: 'Security',
  6: 'Transport',
  7: 'Release',
  8: 'Audit',
  9: 'Sales Manager',
  10: 'Product Manager',
  11: 'LPG Admin',
  13: 'LPG Plant Manager',
  14: 'LPG Cashier',
  15: 'Commissions',
  16: 'Commission Officer',
  17: 'Dispatch',
  18: 'IT Compliance',
};

// Grouped role options for the multi-select role picker — same grouping the
// old single-select optgroups used.
const ROLE_GROUPS: { label: string; roles: number[] }[] = [
  { label: 'Administration', roles: [1, 8] },
  { label: 'Sales', roles: [9, 10, 3] },
  { label: 'Finance', roles: [2, 15, 16] },
  { label: 'Operations', roles: [4, 7, 17, 5, 6] },
  { label: 'LPG Division', roles: [11, 12, 13, 14] },
  { label: 'Other', roles: [18] },
];

const roleColorMap: Record<number, string> = {
  1: 'text-purple-600',
  2: 'text-blue-600',
  3: 'text-emerald-600',
  4: 'text-amber-600',
  5: 'text-red-600',
  6: 'text-cyan-600',
  7: 'text-orange-600',
  8: 'text-slate-500',
  9: 'text-indigo-600',
  10: 'text-teal-600',
  11: 'text-orange-600',
  12: 'text-orange-600',
  13: 'text-orange-600',
  14: 'text-orange-600',
  15: 'text-emerald-700',
  16: 'text-green-700',
  17: 'text-sky-600',
  18: 'text-slate-600',
};

const Settings = () => {
  const [users, setUsers] = useState<UserType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<'name' | 'location' | 'role'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Set<number>>(new Set());
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    phone_number: '',
    roles: [1] as number[],  // all assigned roles
    primaryRole: '1',        // which of `roles` drives login redirect / report panel
    suspended: false,
    location: '',
    locations: [] as number[], // scoped state IDs
    pfis: [] as number[], // scoped PFI IDs
    lpg_plants: [] as number[], // scoped LPG plant IDs
  });
  const [errors, setErrors] = useState({
    full_name: '',
    email: '',
    password: '',
    phone_number: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { toast } = useToast();

  // Current logged-in user's roles — only SUPERADMIN can manage location scopes
  const isSuperAdmin = getCurrentUserRoles().includes(ROLES.SUPERADMIN);

  // Fetch states from API
  const { data: statesRaw } = useQuery({
    queryKey: ['states-settings'],
    queryFn: () => apiClient.admin.getStates(),
    staleTime: 5 * 60_000,
  });
  const statesList: { id: number; name: string }[] = Array.isArray(statesRaw)
    ? statesRaw
    : ((statesRaw as { results?: { id: number; name: string }[] })?.results ?? []);

  // Fetch PFIs from API (for PFI scope assignment)
  const { data: pfisRaw } = useQuery({
    queryKey: ['pfis-settings'],
    queryFn: () => apiClient.admin.getPfis({}),
    staleTime: 5 * 60_000,
  });
  type PfiOption = { id: number; pfi_number: string; location_name?: string; product_name?: string };
  const pfisList: PfiOption[] = Array.isArray(pfisRaw)
    ? pfisRaw
    : ((pfisRaw as { results?: PfiOption[] })?.results ?? []);

  // Fetch LPG plants from API (for LPG plant scope assignment) — only shown
  // when the user being edited has an LPG role, so this stays out of the
  // way for everyone else.
  const { data: lpgPlantsRaw } = useQuery({
    queryKey: ['lpg-plants-settings'],
    queryFn: () => apiClient.admin.getLPGPlants({}),
    staleTime: 5 * 60_000,
  });
  type LPGPlantOption = { id: number; name: string; code: string; location_name?: string };
  const lpgPlantsList: LPGPlantOption[] = Array.isArray(lpgPlantsRaw)
    ? lpgPlantsRaw
    : ((lpgPlantsRaw as { results?: LPGPlantOption[] })?.results ?? []);
  const LPG_ROLE_NUMBERS = [ROLES.LPG_ADMIN, ROLES.LPG_PLANT_MANAGER, ROLES.LPG_CASHIER];

  const formatLastLogin = (value?: string | null) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value; // fallback to raw string if it's not a valid date

    // Example output: "Feb 6, 2026, 1:05 PM"
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const generatePassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const randomValues = crypto.getRandomValues(new Uint32Array(12));
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += charset[randomValues[i] % charset.length];
    }
    setFormData({ ...formData, password });
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  const LOCATIONS = ['Headquarters', 'Lagos', 'Calabar', 'Port Harcourt', 'Warri'];

  // A user's full role set — falls back to the single primary role for
  // accounts that predate multi-role support (empty/missing `roles`).
  const userRoleList = (user: UserType): number[] =>
    user.roles && user.roles.length > 0 ? user.roles : [user.role];

  // Sortable text values — mirror what's actually shown in each column.
  const getLocationSortLabel = (user: UserType): string => {
    if (userRoleList(user).includes(ROLES.SUPERADMIN)) return '';
    const names = user.location_names?.length
      ? user.location_names
      : (user.locations ?? []).map(id => statesList.find(s => s.id === id)?.name).filter(Boolean) as string[];
    return names.length ? names.join(', ') : 'Full Access';
  };
  const getRoleSortLabel = (user: UserType): string => roleMap[user.role] || user.label || '';

  const toggleSort = (key: 'name' | 'location' | 'role') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: 'name' | 'location' | 'role' }) => {
    if (sortKey !== col) return <ArrowUpDown size={13} className="text-slate-400" />;
    return sortDir === 'asc' ? <ArrowUp size={13} className="text-slate-700" /> : <ArrowDown size={13} className="text-slate-700" />;
  };

  const filteredUsers = users
    .filter(user => {
      const matchesSearch =
        user.full_name.toLowerCase().includes(searchQuery) ||
        user.email.toLowerCase().includes(searchQuery);
      const matchesRole = roleFilter === 'all' || userRoleList(user).includes(Number(roleFilter));
      const matchesLocation =
        locationFilter === 'all' ||
        (locationFilter === 'none'
          ? !user.location?.trim()
          : user.location?.trim().toLowerCase() === locationFilter.toLowerCase());
      return matchesSearch && matchesRole && matchesLocation;
    })
    .sort((a, b) => {
      const cmp = sortKey === 'location'
        ? getLocationSortLabel(a).localeCompare(getLocationSortLabel(b))
        : sortKey === 'role'
          ? getRoleSortLabel(a).localeCompare(getRoleSortLabel(b))
          : a.full_name.localeCompare(b.full_name);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const validateForm = () => {
    const newErrors = {
      full_name: formData.full_name ? '' : 'Full name is required',
      email: formData.email ? '' : 'Email is required',
      password: (!editingUser && !formData.password) ? 'Password is required' : '',
      phone_number: formData.phone_number ? '' : 'Phone number is required',
    };
    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error);
  };

  const handleOpenDialog = (user?: UserType) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        full_name: user.full_name,
        email: user.email,
        password: user.plain_password || '',
        phone_number: user.phone_number,
        roles: userRoleList(user),
        primaryRole: String(user.role),
        suspended: user.suspended,
        location: user.location || '',
        locations: user.locations ?? [],
        pfis: user.pfis ?? [],
        lpg_plants: user.lpg_plants ?? [],
      });
    } else {
      setEditingUser(null);
      setFormData({
        full_name: '',
        email: '',
        password: '',
        phone_number: '',
        roles: [1],
        primaryRole: '1',
        suspended: false,
        location: '',
        locations: [],
        pfis: [],
        lpg_plants: [],
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingUser(null);
    setFormData({
      full_name: '',
      email: '',
      password: '',
      phone_number: '',
      roles: [1],
      primaryRole: '1',
      suspended: false,
      location: '',
      locations: [],
      pfis: [],
      lpg_plants: [],
    });
    setErrors({
      full_name: '',
      email: '',
      password: '',
      phone_number: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    // The primary role must always be one of the assigned roles — fall back to
    // the first checked role if the picked primary somehow isn't among them.
    const primaryRoleNum = formData.roles.includes(Number(formData.primaryRole))
      ? Number(formData.primaryRole)
      : formData.roles[0];
    const hasSuperAdminRole = formData.roles.includes(ROLES.SUPERADMIN);

    setIsLoading(true);
    try {
      if (editingUser) {
        const updatedUser: Record<string, unknown> = {
          email: formData.email,
          full_name: formData.full_name,
          phone_number: formData.phone_number,
          role: primaryRoleNum,
          roles: formData.roles,
          suspended: formData.suspended,
          location: formData.location.trim() || undefined,
          // Only SUPERADMIN can change location/PFI/LPG plant scope; only send if the user isn't a SUPERADMIN
          ...(isSuperAdmin && !hasSuperAdminRole
            ? { locations: formData.locations, pfis: formData.pfis, lpg_plants: formData.lpg_plants }
            : {}),
        };

        if (formData.password) {
          updatedUser.password = formData.password;
        }

        const response = await apiClient.admin.updateUser(editingUser.id, updatedUser);

        // Resolve location_names/pfi_numbers/lpg_plant_names for optimistic display
        const newLocationNames = isSuperAdmin && !hasSuperAdminRole
          ? formData.locations.map(id => statesList.find(s => s.id === id)?.name).filter(Boolean) as string[]
          : undefined;
        const newPfiNumbers = isSuperAdmin && !hasSuperAdminRole
          ? formData.pfis.map(id => pfisList.find(p => p.id === id)?.pfi_number).filter(Boolean) as string[]
          : undefined;
        const newLpgPlantNames = isSuperAdmin && !hasSuperAdminRole
          ? formData.lpg_plants.map(id => lpgPlantsList.find(p => p.id === id)?.name).filter(Boolean) as string[]
          : undefined;

        setUsers(prev => prev.map(user =>
          user.id === editingUser.id
            ? {
                ...user,
                email: formData.email,
                full_name: formData.full_name,
                phone_number: formData.phone_number,
                role: primaryRoleNum,
                roles: formData.roles,
                suspended: formData.suspended,
                location: formData.location.trim() || user.location,
                locations: newLocationNames !== undefined ? formData.locations : user.locations,
                location_names: newLocationNames !== undefined ? newLocationNames : user.location_names,
                pfis: newPfiNumbers !== undefined ? formData.pfis : user.pfis,
                pfi_numbers: newPfiNumbers !== undefined ? newPfiNumbers : user.pfi_numbers,
                lpg_plants: newLpgPlantNames !== undefined ? formData.lpg_plants : user.lpg_plants,
                lpg_plant_names: newLpgPlantNames !== undefined ? newLpgPlantNames : user.lpg_plant_names,
              }
            : user
        ));

        toast({
          title: "User Updated",
          description: (() => {
            const rec = response as unknown as Record<string, unknown>;
            return (typeof rec.message === 'string' ? rec.message : undefined) || "User updated successfully.";
          })(),
          duration: 2000,
        });

        handleCloseDialog();
        return; // ← don't fall through to fetchUsers() below
      } else {
        const response = await apiClient.admin.registerUser({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          phone_number: formData.phone_number,
          role: primaryRoleNum,
          roles: formData.roles,
          location: formData.location.trim() || undefined,
          ...(isSuperAdmin && !hasSuperAdminRole
            ? { locations: formData.locations, pfis: formData.pfis, lpg_plants: formData.lpg_plants }
            : {}),
        });

        toast({
          title: "User Created",
          description: response?.message || "User created successfully.",
          duration: 2000,
        });
      }

      handleCloseDialog();
      fetchUsers();
    } catch (error: unknown) {
      let errorMessage = "An error occurred. Please try again.";
      const fieldErrors: Partial<typeof errors> = {};

      const errRec = error as Record<string, unknown>;
      const response = (errRec.response as Record<string, unknown> | undefined) || undefined;
      const data = (response?.data as Record<string, unknown> | undefined) || undefined;
      if (data) {
        const apiErrors = data;

        // General API message
        if (apiErrors.message || apiErrors.detail) {
          const msg =
            (typeof apiErrors.message === 'string' && apiErrors.message) ||
            (typeof apiErrors.detail === 'string' && apiErrors.detail) ||
            '';
          if (msg) errorMessage = msg;
        }

        // Field-specific messages
        if (apiErrors.email) {
          fieldErrors.email = apiErrors.email[0] || "Invalid email";
        }

        if (apiErrors.phone_number) {
          fieldErrors.phone_number = apiErrors.phone_number[0] || "Invalid phone number";
        }

        if (apiErrors.password) {
          fieldErrors.password = apiErrors.password[0] || "Password too weak";
        }

        if (apiErrors.full_name) {
          fieldErrors.full_name = apiErrors.full_name[0] || "Name error";
        }
      }

      setErrors(prev => ({ ...prev, ...fieldErrors }));

      toast({
        title: "User Creation Failed check for duplicate credentials or invalid password",
        description: errorMessage,
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuspendToggle = async () => {
    if (!editingUser) return;

    setIsLoading(true);
    try {
      const updatedUser = { ...editingUser, suspended: !editingUser.suspended };
      await apiClient.admin.updateUser(editingUser.id, {
        suspended: updatedUser.suspended,
      });
      setUsers(users.map(user => user.id === editingUser.id ? updatedUser : user));
      toast({
        title: 'Success',
        description: `User ${updatedUser.suspended ? 'suspended' : 'unsuspended'} successfully`,
        duration: 1000, // Set toast duration to 1 second
      });
      handleCloseDialog();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user status',
        variant: 'destructive',
        duration: 1000, // Set toast duration to 1 second
      });
    } finally {
      setIsLoading(false);
      setConfirmSuspend(false);
    }
  };

  const fetchUsers = useCallback(async () => {
    try {
      const response = await apiClient.admin.getUsers();
      const fresh: UserType[] = Array.isArray(response) ? response : (response?.results ?? []);
      // API now returns `locations` + `location_names` — use them directly.
      // Fallback: preserve any locally-known locations if the field is still absent.
      setUsers(prev => {
        const prevMap = new Map(prev.map(u => [u.id, u]));
        return fresh.map(u => ({
          ...u,
          locations: u.locations ?? prevMap.get(u.id)?.locations ?? [],
          location_names: u.location_names ?? prevMap.get(u.id)?.location_names ?? [],
          pfis: u.pfis ?? prevMap.get(u.id)?.pfis ?? [],
          pfi_numbers: u.pfi_numbers ?? prevMap.get(u.id)?.pfi_numbers ?? [],
          lpg_plants: u.lpg_plants ?? prevMap.get(u.id)?.lpg_plants ?? [],
          lpg_plant_names: u.lpg_plant_names ?? prevMap.get(u.id)?.lpg_plant_names ?? [],
        }));
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to fetch users', variant: 'destructive', duration: 1000 });
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const summary = {
    total: users.length,
    active: users.filter(u => !u.suspended).length,
    suspended: users.filter(u => u.suspended).length,
    admins: users.filter(u => userRoleList(u).includes(1)).length
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-5">
              <PageHeader
                title="Staff Management"
                description="Create, edit and manage staff access across the dashboard."
                actions={
                  <Button className="gap-2" onClick={() => handleOpenDialog()}>
                    <UserPlus className="h-4 w-4" />
                    Add staff
                  </Button>
                }
              />
            </div>

            {/* <div className="mb-6">
              <SummaryCards
                cards={[
                  { title: 'Total staff', value: String(summary.total), description: 'All staff accounts', icon: <Users2 className="h-5 w-5" />, tone: 'neutral' },
                  { title: 'Active', value: String(summary.active), description: 'Can login', icon: <CheckCircle2 className="h-5 w-5" />, tone: 'green' },
                  // { title: 'Suspended', value: String(summary.suspended), description: 'Blocked access', icon: <Ban className="h-5 w-5" />, tone: 'red' },
                  { title: 'Admins', value: String(summary.admins), description: 'Admin role', icon: <Shield className="h-5 w-5" />, tone: 'neutral' }
                ]}
              />
            </div> */}

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      type="text"
                      placeholder="Search by name or email…"
                      className="pl-10"
                      value={searchQuery}
                      onChange={handleSearch}
                    />
                  </div>
                  <select
                    aria-label="Filter by role"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="h-10 w-full sm:w-[170px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">All Roles</option>
                    {Object.entries(roleMap).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter by location"
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="h-10 w-full sm:w-[170px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">All Locations</option>
                    <option value="none">No Location</option>
                    {statesList.map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 [&>th]:px-4 [&>th]:py-3 [&>th]:text-xs [&>th]:font-semibold [&>th]:text-slate-600 [&>th]:uppercase [&>th]:tracking-wider">
                    <TableHead className="w-[48px]">#</TableHead>
                    <TableHead className="min-w-[180px]">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('name')}>
                        Name <SortIcon col="name" />
                      </button>
                    </TableHead>
                    <TableHead className="min-w-[180px]">Contact</TableHead>
                    <TableHead className="min-w-[220px]">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('location')}>
                        Location <SortIcon col="location" />
                      </button>
                    </TableHead>
                    <TableHead className="min-w-[160px]">PFI Scope</TableHead>
                    <TableHead>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('role')}>
                        Role <SortIcon col="role" />
                      </button>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    {/* <TableHead className="min-w-[160px]">Password</TableHead> */}
                    {/* <TableHead className="min-w-[160px]">Last Login</TableHead> */}
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user, idx) => {
                    const userRoles = userRoleList(user);
                    const isSuperAdminUser = userRoles.includes(ROLES.SUPERADMIN);
                    // Prefer location_names (pre-resolved by backend) over local ID lookup
                    const scopeNames: string[] = user.location_names?.length
                      ? user.location_names
                      : (user.locations ?? []).map(id => statesList.find(s => s.id === id)?.name).filter(Boolean) as string[];
                    const scopePfiNumbers: string[] = user.pfi_numbers?.length
                      ? user.pfi_numbers
                      : (user.pfis ?? []).map(id => pfisList.find(p => p.id === id)?.pfi_number).filter(Boolean) as string[];
                    return (
                    <TableRow key={user.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <TableCell className="px-4 text-slate-400 text-center text-xs">{idx + 1}</TableCell>
                      <TableCell className="px-4 font-semibold text-slate-800 whitespace-nowrap">
                        {user.full_name}
                      </TableCell>
                      <TableCell className="px-4">
                        <a href={`mailto:${user.email}`} className="flex items-center gap-1.5 text-sm text-black hover:text-blue-800 hover:underline" title={user.email}>
                          <Mail size={14} className="shrink-0 text-green-600" />
                          {user.email}
                        </a>
                        <a href={`tel:${user.phone_number}`} className="flex items-center gap-1.5 text-sm text-black hover:text-slate-800 hover:underline mt-0.5">
                          <Phone size={13} className="shrink-0 text-green-600" />
                          {user.phone_number}
                        </a>
                      </TableCell>
                      <TableCell className="px-4 text-sm text-slate-700">
                        {isSuperAdminUser
                          ? <span className="text-slate-400">—</span>
                          : scopeNames.length === 0
                            ? <span className="text-slate-400">Full Access</span>
                            : <span>{scopeNames.join(', ')}</span>
                        }
                      </TableCell>
                      <TableCell className="px-4 text-sm text-slate-700">
                        {isSuperAdminUser
                          ? <span className="text-slate-400">—</span>
                          : scopePfiNumbers.length === 0
                            ? <span className="text-slate-400">Full Access</span>
                            : <span>{scopePfiNumbers.join(', ')}</span>
                        }
                      </TableCell>
                      <TableCell className="px-4 text-sm">
                        {userRoles.map((r, i) => (
                          <span key={r}>
                            <span
                              title={r === user.role ? 'Primary role' : undefined}
                              className={`${roleColorMap[r] || 'text-slate-700'} ${r === user.role ? 'font-semibold' : ''}`}
                            >
                              {roleMap[r] || user.label || r}
                            </span>
                            {i < userRoles.length - 1 && <span className="text-slate-400">, </span>}
                          </span>
                        ))}
                      </TableCell>
                      <TableCell className="px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                          !user.suspended ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                        }`}>
                          {!user.suspended ? 'Active' : 'Suspended'}
                        </span>
                      </TableCell>
                      {/* <TableCell className="px-4">
                        {user.plain_password ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono text-slate-700 tracking-wide">
                              {revealedPasswords.has(user.id) ? user.plain_password : '••••••••'}
                            </span>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-slate-700 transition-colors"
                              onClick={() => setRevealedPasswords(prev => {
                                const next = new Set(prev);
                                next.has(user.id) ? next.delete(user.id) : next.add(user.id);
                                return next;
                              })}
                            >
                              {revealedPasswords.has(user.id)
                                ? <EyeOff size={13} />
                                : <Eye size={13} />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell> */}
                      {/* <TableCell className="px-4 text-sm text-slate-500 whitespace-nowrap">{formatLastLogin(user.last_login)}</TableCell> */}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleOpenDialog(user)}>
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">
                                {user.suspended ? 'Unsuspend' : 'Suspend'}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  You are about to {user.suspended ? 'unsuspend' : 'suspend'} this user.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => {
                                  setEditingUser(user);
                                  handleSuspendToggle();
                                }}>
                                  Continue
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit Staff' : 'Add New Staff'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Update staff details and permissions.' : 'Fill in the information for the new staff.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-1">
            <div className="grid gap-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className={errors.full_name ? 'border-red-500' : ''}
                  required
                />
                {errors.full_name && <p className="text-red-500 text-xs">{errors.full_name}</p>}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={errors.email ? 'border-red-500' : ''}
                  required
                />
                {errors.email && <p className="text-red-500 text-xs">{errors.email}</p>}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password">
                  Password{editingUser ? ' (leave blank to keep current)' : ''}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={errors.password ? 'border-red-500' : ''}
                    placeholder={editingUser ? 'Enter new password to change' : ''}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={generatePassword}>
                    Generate
                  </Button>
                </div>
                <p className="text-xs text-slate-500">Alphanumeric, at least 8 characters</p>
                {errors.password && <p className="text-red-500 text-xs">{errors.password}</p>}
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label htmlFor="phone_number">Phone Number</Label>
                <Input
                  id="phone_number"
                  type="tel"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  className={errors.phone_number ? 'border-red-500' : ''}
                  required
                />
                {errors.phone_number && <p className="text-red-500 text-xs">{errors.phone_number}</p>}
              </div>

              {/* Location (text label) */}
              {/* <div className="space-y-1.5">
                <Label htmlFor="location">Location Label</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. Calabar"
                  className="h-10"
                />
                <p className="text-xs text-slate-400">Display-only label shown in the Location column.</p>
              </div> */}

              {/* Roles — a user can hold more than one */}
              <div className="space-y-1.5">
                <Label>Roles</Label>
                <p className="text-xs text-slate-500">
                  Select every role this user should have. Pick one as the <strong>primary role</strong> below —
                  it drives their default landing page after login.
                </p>

                {/* Selected role chips */}
                <div className="flex flex-wrap gap-1 min-h-[24px]">
                  {formData.roles.map(r => (
                    <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
                      {roleMap[r] || r}
                      {formData.roles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setFormData(f => {
                            const roles = f.roles.filter(x => x !== r);
                            const primaryRole = roles.includes(Number(f.primaryRole)) ? f.primaryRole : String(roles[0]);
                            return { ...f, roles, primaryRole };
                          })}
                          className="ml-0.5 hover:text-red-600"
                        >×</button>
                      )}
                    </span>
                  ))}
                </div>

                {/* Checkboxes grouped the same way the old single-select was */}
                <div className="grid gap-2 mt-2 max-h-52 overflow-y-auto pr-1">
                  {ROLE_GROUPS.map(group => (
                    <div key={group.label}>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{group.label}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.roles.map(r => {
                          const checked = formData.roles.includes(r);
                          return (
                            <label key={r} className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer border transition-colors ${
                              checked ? 'bg-indigo-100 border-indigo-300 text-indigo-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setFormData(f => {
                                    if (checked) {
                                      // Don't allow unchecking the last remaining role.
                                      if (f.roles.length === 1) return f;
                                      const roles = f.roles.filter(x => x !== r);
                                      const primaryRole = roles.includes(Number(f.primaryRole)) ? f.primaryRole : String(roles[0]);
                                      return { ...f, roles, primaryRole };
                                    }
                                    return { ...f, roles: [...f.roles, r] };
                                  });
                                }}
                                className="w-3.5 h-3.5 accent-indigo-600"
                              />
                              {roleMap[r]}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Primary role — must be one of the selected roles above */}
              <div className="space-y-1.5">
                <Label htmlFor="primaryRole">Primary Role</Label>
                <select
                  id="primaryRole"
                  aria-label="Primary Role"
                  value={formData.primaryRole}
                  onChange={(e) => setFormData({ ...formData, primaryRole: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {formData.roles.map(r => (
                    <option key={r} value={r}>{roleMap[r] || r}</option>
                  ))}
                </select>
              </div>

              {/* ── Location Scope (SUPERADMIN only, hidden for SUPERADMIN targets) ── */}
              {isSuperAdmin && !formData.roles.includes(ROLES.SUPERADMIN) && (
                <div className="space-y-1.5 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Label className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
                    <MapPin size={13} /> Location Scope
                  </Label>
                  <p className="text-xs text-blue-600">
                    Select which locations this user can see data for.
                    Leave all unchecked for <strong>Full Access</strong> (sees all locations).
                  </p>

                  {/* Current scope chips */}
                  <div className="flex flex-wrap gap-1 min-h-[24px]">
                    {formData.locations.length === 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <Globe size={10} /> Full Access
                      </span>
                    ) : (
                      formData.locations.map(id => {
                        const state = statesList.find(s => s.id === id);
                        return state ? (
                          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                            <MapPin size={10} /> {state.name}
                            <button
                              type="button"
                              onClick={() => setFormData(f => ({ ...f, locations: f.locations.filter(l => l !== id) }))}
                              className="ml-0.5 hover:text-red-600"
                            >×</button>
                          </span>
                        ) : null;
                      })
                    )}
                  </div>

                  {/* Checkboxes for each state */}
                  <div className="grid grid-cols-2 gap-1.5 mt-2 max-h-40 overflow-y-auto pr-1">
                    {statesList.map(state => {
                      const checked = formData.locations.includes(state.id);
                      return (
                        <label key={state.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer border transition-colors ${
                          checked ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setFormData(f => ({
                                ...f,
                                locations: checked
                                  ? f.locations.filter(l => l !== state.id)
                                  : [...f.locations, state.id],
                              }));
                            }}
                            className="w-3.5 h-3.5 accent-blue-600"
                          />
                          {state.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── PFI Scope (SUPERADMIN only, hidden for SUPERADMIN targets) ── */}
              {isSuperAdmin && !formData.roles.includes(ROLES.SUPERADMIN) && (
                <div className="space-y-1.5 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <Label className="text-sm font-semibold text-purple-800 flex items-center gap-1.5">
                    <FileSearch2 size={13} /> PFI Scope
                  </Label>
                  <p className="text-xs text-purple-600">
                    Select which PFIs this user can see data for.
                    Leave all unchecked for <strong>Full Access</strong> (sees all PFIs, within their location scope above if any).
                  </p>

                  {/* Current scope chips */}
                  <div className="flex flex-wrap gap-1 min-h-[24px]">
                    {formData.pfis.length === 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <Globe size={10} /> Full Access
                      </span>
                    ) : (
                      formData.pfis.map(id => {
                        const pfi = pfisList.find(p => p.id === id);
                        return pfi ? (
                          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
                            <FileSearch2 size={10} /> {pfi.pfi_number}
                            <button
                              type="button"
                              onClick={() => setFormData(f => ({ ...f, pfis: f.pfis.filter(l => l !== id) }))}
                              className="ml-0.5 hover:text-red-600"
                            >×</button>
                          </span>
                        ) : null;
                      })
                    )}
                  </div>

                  {/* Checkboxes for each PFI */}
                  <div className="grid grid-cols-2 gap-1.5 mt-2 max-h-40 overflow-y-auto pr-1">
                    {pfisList.map(pfi => {
                      const checked = formData.pfis.includes(pfi.id);
                      return (
                        <label key={pfi.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer border transition-colors ${
                          checked ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setFormData(f => ({
                                ...f,
                                pfis: checked
                                  ? f.pfis.filter(l => l !== pfi.id)
                                  : [...f.pfis, pfi.id],
                              }));
                            }}
                            className="w-3.5 h-3.5 accent-purple-600"
                          />
                          <span className="truncate" title={`${pfi.pfi_number}${pfi.location_name ? ` — ${pfi.location_name}` : ''}${pfi.product_name ? ` (${pfi.product_name})` : ''}`}>
                            {pfi.pfi_number}
                            {pfi.location_name && <span className="text-slate-400"> — {pfi.location_name}</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── LPG Plant Scope (SUPERADMIN only, only relevant once an LPG role is picked) ── */}
              {isSuperAdmin && !formData.roles.includes(ROLES.SUPERADMIN) && formData.roles.some(r => LPG_ROLE_NUMBERS.includes(r)) && (
                <div className="space-y-1.5 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <Label className="text-sm font-semibold text-orange-800 flex items-center gap-1.5">
                    <Flame size={13} /> LPG Plant Scope
                  </Label>
                  <p className="text-xs text-orange-700">
                    Select which LPG plant(s) this user can operate. Unlike location/PFI scope above,
                    leaving this <strong>empty means no access yet</strong> — LPG Plant Manager and
                    LPG Cashier are always locked to specific plants, they don't default to Full Access.
                  </p>

                  {/* Current scope chips */}
                  <div className="flex flex-wrap gap-1 min-h-[24px]">
                    {formData.lpg_plants.length === 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                        No plants assigned yet
                      </span>
                    ) : (
                      formData.lpg_plants.map(id => {
                        const plant = lpgPlantsList.find(p => p.id === id);
                        return plant ? (
                          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                            <Flame size={10} /> {plant.name}
                            <button
                              type="button"
                              onClick={() => setFormData(f => ({ ...f, lpg_plants: f.lpg_plants.filter(l => l !== id) }))}
                              className="ml-0.5 hover:text-red-600"
                            >×</button>
                          </span>
                        ) : null;
                      })
                    )}
                  </div>

                  {/* Checkboxes for each LPG plant */}
                  <div className="grid grid-cols-2 gap-1.5 mt-2 max-h-40 overflow-y-auto pr-1">
                    {lpgPlantsList.map(plant => {
                      const checked = formData.lpg_plants.includes(plant.id);
                      return (
                        <label key={plant.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer border transition-colors ${
                          checked ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setFormData(f => ({
                                ...f,
                                lpg_plants: checked
                                  ? f.lpg_plants.filter(l => l !== plant.id)
                                  : [...f.lpg_plants, plant.id],
                              }));
                            }}
                            className="w-3.5 h-3.5 accent-orange-600"
                          />
                          <span className="truncate" title={`${plant.code} — ${plant.name}${plant.location_name ? ` (${plant.location_name})` : ''}`}>
                            {plant.name}
                            <span className="text-slate-400"> · {plant.code}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={handleCloseDialog}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                ) : editingUser ? (
                  'Update User'
                ) : (
                  'Create User'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
