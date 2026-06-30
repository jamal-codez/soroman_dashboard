import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { apiClient, resetSessionExpiredGuard } from '@/api/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

/** Map user role to their default landing page after login. */
function landingPageForRole(role: number | string): string {
  switch (Number(role)) {
    case 0: // SUPERADMIN
      return '/dashboard';
    case 1: // ADMIN
      return '/dashboard';
    case 2: // FINANCE
      return '/payment-verify';
    case 3: // SALES
      return '/delivery-sales-ledger';
    case 4: // TICKET OFFICER
      return '/pickup-processing';
    case 5: // SECURITY
      return '/security';
    case 6: // TRANSPORT
      return '/fleet-ledger';
    case 7: // RELEASE OFFICER
      return '/confirm-release';
    case 8: // AUDITOR (read-only)
      return '/dashboard';
    case 9: // MARKETING
      return '/depot-view';
    case 10: // LOCATION MANAGER
      return '/staff-daily-report';
    case 15: // COMMISSION OFFICER
      return '/commissions';
    default:
      return '/dashboard';
  }
}

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [fullName, setFullName] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    try {
      await apiClient.admin.forgotPassword(forgotEmail.trim());
      setForgotSent(true);
    } catch {
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "Error",
        description: "Please enter both email and password",
        variant: "default",
        duration: 1000,
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await apiClient.admin.loginUser({ email, password });
      
      if (response.token) {
        // Save the token to localStorage or any other storage
        localStorage.setItem('token', response.token);
        localStorage.setItem('role', response.user.role);
        localStorage.setItem('label',  response.user.label);
        localStorage.setItem('fullname', response.user.full_name);
        localStorage.setItem('locations', JSON.stringify(response.user.locations ?? []));
        localStorage.setItem('location_names', JSON.stringify(response.user.location_names ?? []));
        localStorage.setItem('pfis', JSON.stringify(response.user.pfis ?? []));
        localStorage.setItem('pfi_numbers', JSON.stringify(response.user.pfi_numbers ?? []));
        setFullName(response.user.full_name);

        resetSessionExpiredGuard();

        toast({
          title: "Success",
          description: "Login successful",
        });
        navigate(landingPageForRole(response.user.role));
      } else {
        toast({
          title: "Authentication failed",
          description: response.error || "Invalid email or password",
          variant: "default",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error.message || "An error occurred during login",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4">
              <img src="/logo.png" alt="logo" className='w-50 h-50' />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Soroman Energy</h1>
            <p className="text-slate-500 mt-2">Sign in to your account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  className="pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="remember" 
                  checked={rememberMe}
                  onCheckedChange={(checked) => {
                    setRememberMe(checked as boolean);
                  }}
                />
                <label
                  htmlFor="remember"
                  className="text-sm font-medium text-slate-700 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Remember me
                </label>
              </div>
              <button
                type="button"
                className="text-sm text-soroman-blue hover:text-soroman-orange"
                onClick={() => { setForgotOpen(true); setForgotSent(false); setForgotEmail(''); }}
              >
                Forgot password?
              </button>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-soroman-blue hover:bg-soroman-blue/90"
              disabled={isLoading}
            >
              {isLoading ? "Signing In..." : "Sign In"}
            </Button>
          </form>
        </div>
      </div>

      {/* Forgot password dialog */}
      <Dialog open={forgotOpen} onOpenChange={(open) => { setForgotOpen(open); if (!open) setForgotSent(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter your email address and we'll send you a new temporary password.
            </DialogDescription>
          </DialogHeader>
          {forgotSent ? (
            <div className="py-4 text-center space-y-2">
              <p className="text-green-700 font-semibold">Password reset sent!</p>
              <p className="text-sm text-slate-500">
                If that email is registered, a new password has been emailed to it. Check your inbox and use it to log in.
              </p>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Email address</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="Enter your email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={forgotLoading}>
                  {forgotLoading ? 'Sending…' : 'Send New Password'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;
