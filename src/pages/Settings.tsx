import { useState, useEffect, useMemo } from 'react';
import { useCallback } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import {
  Search,
  UserPlus,
  Edit,
  User,
  Shield,
  Loader2,
  Users2,
  Ban,
  CheckCircle2,
  MapPin,
  Globe,
  X,
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards } from '@/components/SummaryCards';

type LocationInfo = {
  id: number;
  name: string;
  abbreviation?: string;
};

type UserType = {
  id: number;
  full_name: string;
  email: string;
  phone_number: string;
  role: number;
  suspended: boolean;
  last_login: string;
  last_login_ip?: string | null;
  last_login_user_agent?: string | null;
  label: string;
  can_view_all_locations?: boolean;
  locations?: LocationInfo[];
};

const roleMap: Record<number, string> = {
  1: 'ADMIN',
  2: 'ACCOUNTS',
  3: 'SALES',
  4: 'TICKETING',
  5: 'SECURITY',
  6: 'TRANSPORT',
};

const Settings = () => {
  const [users, setUsers] = useState<UserType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    phone_number: '',
    role: '1',
    suspended: false,
    location_ids: [] as number[],
    can_view_all_locations: false,
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

  // Fetch available locations (states) for the location picker
  const [allLocations, setAllLocations] = useState<LocationInfo[]>([]);
  useEffect(() => {
    apiClient.admin.getStates()
      .then((res) => {
        const list = (res?.results ?? res) as Array<{ id: number; name: string; abbreviation?: string }>;
        setAllLocations(Array.isArray(list) ? list : []);
      })
      .catch(() => {/* silently fail — locations picker will just be empty */});
  }, []);

  // Location search within the dropdown
  const [locationSearch, setLocationSearch] = useState('');
  const filteredLocations = useMemo(() => {
    if (!locationSearch.trim()) return allLocations;
    const q = locationSearch.toLowerCase();
    return allLocations.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.abbreviation || '').toLowerCase().includes(q)
    );
  }, [allLocations, locationSearch]);

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

  const filteredUsers = users.filter(user =>
    user.full_name.toLowerCase().includes(searchQuery) ||
    user.email.toLowerCase().includes(searchQuery)
  );

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
        password: '********',
        phone_number: user.phone_number,
        role: String(user.role),
        suspended: user.suspended,
        location_ids: (user.locations || []).map((l) => l.id),
        can_view_all_locations: user.can_view_all_locations ?? false,
      });
    } else {
      setEditingUser(null);
      setFormData({
        full_name: '',
        email: '',
        password: '',
        phone_number: '',
        role: '1',
        suspended: false,
        location_ids: [],
        can_view_all_locations: false,
      });
    }
    setLocationSearch('');
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
      role: '1',
      suspended: false,
      location_ids: [],
      can_view_all_locations: false,
    });
    setLocationSearch('');
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

    setIsLoading(true);
    try {
      if (editingUser) {
        const updatedUser: Record<string, unknown> = {
          email: formData.email,
          full_name: formData.full_name,
          phone_number: formData.phone_number,
          role: parseInt(formData.role),
          suspended: formData.suspended,
          location_ids: formData.location_ids,
          can_view_all_locations: formData.can_view_all_locations,
        };

        if (formData.password && formData.password !== "********") {
          updatedUser.password = formData.password;
        }

        const response = await apiClient.admin.updateUser(editingUser.id, updatedUser);

        // Don't optimistically patch local state — the server response from
        // fetchUsers() includes the full `locations` array that the table needs.
        // Spreading `updatedUser` (which has `location_ids` not `locations`)
        // would leave stale/missing location data in the table.

        toast({
          title: "User Updated",
          description: (() => {
            const rec = response as unknown as Record<string, unknown>;
            return (typeof rec.message === 'string' ? rec.message : undefined) || "User updated successfully.";
          })(),
          duration: 2000,
        });
      } else {
        const response = await apiClient.admin.registerUser({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          phone_number: formData.phone_number,
          role: parseInt(formData.role),
          location_ids: formData.location_ids,
          can_view_all_locations: formData.can_view_all_locations,
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
      // Handle both paginated { results: [...] } and flat array responses
      const list: UserType[] = Array.isArray(response)
        ? response
        : Array.isArray(response?.results)
          ? response.results
          : [];
      setUsers(list);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch users',
        variant: 'destructive',
        duration: 1000,
      });
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const summary = {
    total: users.length,
    active: users.filter(u => !u.suspended).length,
    suspended: users.filter(u => u.suspended).length,
    admins: users.filter(u => u.role === 1).length
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

            <div className="mb-6">
              <SummaryCards
                cards={[
                  { title: 'Total staff', value: String(summary.total), description: 'All staff accounts', icon: <Users2 className="h-5 w-5" />, tone: 'neutral' },
                  { title: 'Active', value: String(summary.active), description: 'Can login', icon: <CheckCircle2 className="h-5 w-5" />, tone: 'green' },
                  // { title: 'Suspended', value: String(summary.suspended), description: 'Blocked access', icon: <Ban className="h-5 w-5" />, tone: 'red' },
                  { title: 'Admins', value: String(summary.admins), description: 'Admin role', icon: <Shield className="h-5 w-5" />, tone: 'neutral' }
                ]}
              />
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      type="text"
                      placeholder="Search users..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={handleSearch}
                    />
                  </div>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Locations</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center mr-3">
                            <User className="text-slate-500" size={16} />
                          </div>
                          <div>
                            <div className="font-medium">{user.full_name}</div>
                            <div className="text-sm text-slate-500">{user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Shield className={`mr-2 ${user.role === 1 ? 'text-amber-600' : 'text-slate-400'}`} size={16} />
                          {user.label}
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.can_view_all_locations || user.role === 0 ? (
                          <Badge variant="secondary" className="gap-1 bg-blue-50 text-blue-700 border-blue-200">
                            <Globe size={12} />
                            All Locations
                          </Badge>
                        ) : (user.locations && user.locations.length > 0) ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {user.locations.slice(0, 3).map((loc) => (
                              <Badge key={loc.id} variant="outline" className="text-xs font-normal">
                                {loc.abbreviation || loc.name}
                              </Badge>
                            ))}
                            {user.locations.length > 3 && (
                              <Badge variant="outline" className="text-xs font-normal text-slate-500">
                                +{user.locations.length - 3}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          !user.suspended ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {!user.suspended ? 'Active' : 'Suspended'}
                        </span>
                      </TableCell>
                      <TableCell>{formatLastLogin(user.last_login)}</TableCell>
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
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit Staff' : 'Add New Staff'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Update staff details and permissions.' : 'Fill in the information for the new staff.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
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
              <div className="space-y-2">
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
                <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="flex items-center">
                  <Input
                  id="password"
                  type={showPassword ? "text" : "password"} // Toggle between text and password
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={errors.password ? "border-red-500" : ""}
                  />
                  <Button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)} // Toggle visibility
                  className="ml-2"
                  >
                  {showPassword ? "Hide" : "Show"}
                  </Button>
                </div>
                <p className="text-sm text-gray-500">Password must be alphanumeric and at least 8 characters long</p>
                {errors.password && <p className="text-red-500 text-xs">{errors.password}</p>}
                </div>
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a role</option>
                  <optgroup label="Available Roles">
                    <option value="1">General Admin</option>
                    <option value="2">Accounts</option>
                    <option value="3">Sales</option>
                    <option value="4">Ticketing Officer</option>
                    <option value="5">Security</option>
                    <option value="6">Transport Officer</option>
                  </optgroup>
                </select>
              </div>

              {/* ── Location Access ──────────────────────────── */}
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold">Location Access</Label>
                    <p className="text-xs text-slate-500 mt-0.5">Control which depot locations this staff can access.</p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Globe size={16} className="text-blue-600" />
                    <div>
                      <Label htmlFor="can_view_all" className="text-sm font-medium cursor-pointer">Can view all locations</Label>
                      <p className="text-xs text-slate-500">Grant access to every location</p>
                    </div>
                  </div>
                  <Switch
                    id="can_view_all"
                    checked={formData.can_view_all_locations}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, can_view_all_locations: checked })
                    }
                  />
                </div>

                {!formData.can_view_all_locations && (
                  <div className="space-y-2">
                    <Label className="text-sm">Assigned Locations</Label>

                    {/* Selected locations as removable badges */}
                    {formData.location_ids.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {formData.location_ids.map((id) => {
                          const loc = allLocations.find((l) => l.id === id);
                          return (
                            <Badge
                              key={id}
                              variant="secondary"
                              className="gap-1 pr-1 cursor-pointer hover:bg-red-50 hover:text-red-700 transition-colors"
                              onClick={() =>
                                setFormData({
                                  ...formData,
                                  location_ids: formData.location_ids.filter((lid) => lid !== id),
                                })
                              }
                            >
                              {loc?.name || `ID ${id}`}
                              <X size={12} />
                            </Badge>
                          );
                        })}
                      </div>
                    )}

                    {/* Location search */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <Input
                        placeholder="Search locations…"
                        value={locationSearch}
                        onChange={(e) => setLocationSearch(e.target.value)}
                        className="pl-8 h-9 text-sm"
                      />
                    </div>

                    {/* Scrollable checkbox list */}
                    <div className="max-h-[180px] overflow-y-auto rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
                      {filteredLocations.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-slate-400">No locations found</div>
                      ) : (
                        filteredLocations.map((loc) => {
                          const isSelected = formData.location_ids.includes(loc.id);
                          return (
                            <label
                              key={loc.id}
                              className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors"
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  setFormData({
                                    ...formData,
                                    location_ids: checked
                                      ? [...formData.location_ids, loc.id]
                                      : formData.location_ids.filter((lid) => lid !== loc.id),
                                  });
                                }}
                              />
                              <div className="flex items-center gap-1.5 min-w-0">
                                <MapPin size={13} className="text-slate-400 shrink-0" />
                                <span className="text-sm truncate">{loc.name}</span>
                                {loc.abbreviation && (
                                  <span className="text-xs text-slate-400">({loc.abbreviation})</span>
                                )}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>

                    {formData.location_ids.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⚠ No locations selected — this user won't see any location-specific data.
                      </p>
                    )}
                  </div>
                )}
              </div>
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
