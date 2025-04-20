import { useState, useEffect } from 'react';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { 
  Search, 
  UserPlus, 
  Edit, 
  Trash2,
  User,
  Shield,
  Settings as SettingsIcon,
  Ban
} from 'lucide-react';
import { apiClient } from '@/api/client';

type User = {
  id: number;
  full_name: string;
  email: string;
  phone_number: string;
  role: number;
  suspended: boolean;
  last_login: string;
};

const Settings = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    phone_number: '',
    role: 'User',
    suspended: false,
  });
  const [errors, setErrors] = useState({
    full_name: '',
    email: '',
    password: '',
    phone_number: '',
  });
  
  const { toast } = useToast();

  const generatePassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let password = "";
    for (let i = 0; i < 12; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }
    setFormData({ ...formData, password });
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value.toLowerCase();
    setSearchQuery(query);
  };

  const filteredUsers = users.filter(user => 
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const validateForm = () => {
    const newErrors = {
      full_name: formData.full_name ? '' : 'Full name is required',
      email: formData.email ? '' : 'Email is required',
      password: formData.password ? '' : 'Password is required',
      phone_number: formData.phone_number ? '' : 'Phone number is required',
    };
    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error);
  };

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        full_name: user.full_name,
        email: user.email,
        password: '', // Password should not be pre-filled for security reasons
        phone_number: user.phone_number,
        role: user.role === 1 ? 'Admin' : 'User',
        suspended: user.suspended,
      });
    } else {
      setEditingUser(null);
      setFormData({
        full_name: '',
        email: '',
        password: '',
        phone_number: '',
        role: 'User',
        suspended: false,
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
      role: 'User',
      suspended: false,
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

    try {
      if (editingUser) {
        // Update existing user
        const updatedUser = {
          email: formData.email,
          full_name: formData.full_name,
          phone_number: formData.phone_number,
          role: formData.role === 'Admin' ? 1 : 2,
          suspended: formData.suspended,
          password: formData.password, // Include password in the update
        };

        await apiClient.admin.updateUser(editingUser.id, updatedUser);

        // Update the local state
        setUsers(users.map(user => user.id === editingUser.id ? { ...user, ...updatedUser } : user));

        toast({
          title: 'Success',
          description: 'User updated successfully',
        });
      } else {
        // Create new user
        await apiClient.admin.registerUser({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          phone_number: formData.phone_number,
        });
        toast({
          title: 'Success',
          description: 'User created successfully',
        });
      }
      handleCloseDialog();
      fetchUsers(); // Refresh user list
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save user',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = async (userId: number) => {
    try {
      await apiClient.admin.deleteUser(userId);
      toast({
        title: 'Success',
        description: 'User deleted successfully',
      });
      fetchUsers(); // Refresh user list
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete user',
        variant: 'destructive',
      });
    }
  };

  const handleSuspendToggle = async () => {
    if (!editingUser) return;

    try {
      const updatedUser = {
        ...editingUser,
        suspended: !editingUser.suspended,
      };

      // Update the suspension status via API
      await apiClient.admin.updateUser(editingUser.id, {
        suspended: updatedUser.suspended,
      });

      // Update the local state
      setUsers(users.map(user => user.id === editingUser.id ? updatedUser : user));
      toast({
        title: 'Success',
        description: `User ${updatedUser.suspended ? 'suspended' : 'unsuspended'} successfully`,
      });
      handleCloseDialog();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user status',
        variant: 'destructive',
      });
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await apiClient.admin.getUsers();
      setUsers(response);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch users',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
                <p className="text-slate-500">Manage your users and system settings</p>
              </div>
              <Button 
                onClick={() => handleOpenDialog()}
                className="bg-soroman-orange hover:bg-soroman-orange/90"
              >
                <UserPlus className="mr-2" size={16} />
                Add User
              </Button>
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
                    <TableHead>USER</TableHead>
                    <TableHead>ROLE</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead>LAST LOGIN</TableHead>
                    <TableHead className="text-right">ACTIONS</TableHead>
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
                          <Shield className={`mr-2 ${
                            user.role === 1 
                              ? 'text-soroman-orange' 
                              : 'text-slate-400'
                          }`} size={16} />
                          {user.role === 1 ? 'Admin' : 'User'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          !user.suspended 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-slate-100 text-slate-800'
                        }`}>
                          {!user.suspended ? 'Active' : 'Suspended'}
                        </span>
                      </TableCell>
                      <TableCell>{user.last_login || 'N/A'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(user)}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingUser(user);
                              handleSuspendToggle();
                            }}
                          >
                            {user.suspended ? 'Unsuspend' : 'Suspend'}
                          </Button>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
            <DialogDescription>
              {editingUser 
                ? 'Update user details and permissions.'
                : 'Fill in the information for the new user.'}
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
                  required
                />
                {errors.email && <p className="text-red-500 text-xs">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="flex items-center">
                  <Input
                    id="password"
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                  />
                  <Button type="button" onClick={generatePassword} className="ml-2">
                    Generate
                  </Button>
                </div>
                {errors.password && <p className="text-red-500 text-xs">{errors.password}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone_number">Phone Number</Label>
                <Input
                  id="phone_number"
                  type="tel"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  required
                />
                {errors.phone_number && <p className="text-red-500 text-xs">{errors.phone_number}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Available Roles</SelectLabel>
                      <SelectItem value="1">Admin</SelectItem>
                      <SelectItem value="2">User</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit">
                {editingUser ? 'Update User' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;