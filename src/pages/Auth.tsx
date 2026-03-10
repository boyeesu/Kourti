import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { AppLogo } from '@/components/ui/AppLogo';

export default function Auth() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  // Rate limiting state
  const MAX_FAILED_ATTEMPTS = 5;
  const LOCKOUT_DURATION = 30; // seconds
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLockedOut = lockoutRemaining > 0;

  const startLockout = useCallback(() => {
    setLockoutRemaining(LOCKOUT_DURATION);
    if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
    lockoutTimerRef.current = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
          lockoutTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
    };
  }, []);

  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Check if this is an invited user
  const searchParams = new URLSearchParams(location.search);
  const invitedEmail = searchParams.get('email');
  const isInvited = searchParams.get('invited') === 'true';

  const from = location.state?.from?.pathname || '/dashboard';

  // Pre-fill email for invited users
  useEffect(() => {
    if (isInvited && invitedEmail) {
      setFormData((prev) => ({ ...prev, email: decodeURIComponent(invitedEmail) }));
    }
  }, [isInvited, invitedEmail]);

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLockedOut) {
      toast.error('Too many failed attempts', {
        description: `Please wait ${lockoutRemaining} seconds before trying again.`,
      });
      return;
    }

    setLoading(true);

    try {
      const result = await signIn(formData.email, formData.password);

      // Clear password from state regardless of outcome
      setFormData((prev) => ({ ...prev, password: '' }));

      if (!result.error) {
        // Reset failed attempts on successful login
        setFailedAttempts(0);
        setLockoutRemaining(0);
        if (lockoutTimerRef.current) {
          clearInterval(lockoutTimerRef.current);
          lockoutTimerRef.current = null;
        }

        toast.success('Welcome back!', { description: 'You have successfully signed in.' });
        navigate('/dashboard', { replace: true });
      } else {
        const newFailedAttempts = failedAttempts + 1;
        setFailedAttempts(newFailedAttempts);

        if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
          startLockout();
          setFailedAttempts(0);
          toast.error('Too many failed attempts', {
            description: `Account temporarily locked. Please wait ${LOCKOUT_DURATION} seconds before trying again.`,
          });
        } else if (
          result.error.message?.includes('timeout') ||
          result.error.message?.includes('504')
        ) {
          toast.error('Server busy', {
            description: 'The server is taking too long to respond. Please try again in a moment.',
          });
        } else {
          toast.error('Authentication Error', { description: result.error.message });
        }
      }
    } catch {
      const newFailedAttempts = failedAttempts + 1;
      setFailedAttempts(newFailedAttempts);

      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        startLockout();
        setFailedAttempts(0);
      }

      toast.error('Error', { description: 'An unexpected error occurred. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4"
    >
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <AppLogo size="md" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">
              {isInvited ? 'Accept Invitation' : 'Welcome Back'}
            </CardTitle>
            <p className="text-muted-foreground mt-2">
              {isInvited
                ? 'Set your password to complete your account setup'
                : 'Sign in to your Kourti AI account'}
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  className="pl-10"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={isInvited}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="pl-10 pr-10"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  autoComplete="current-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {!isInvited && (
              <div className="flex items-center justify-end">
                <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
            )}

            {isLockedOut && (
              <p className="text-sm text-destructive text-center">
                Too many failed attempts. Please wait {lockoutRemaining} second
                {lockoutRemaining !== 1 ? 's' : ''} before trying again.
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading || isLockedOut}>
              {loading ? 'Loading...' : isLockedOut ? `Locked (${lockoutRemaining}s)` : 'Sign In'}
            </Button>
          </form>

          {!isInvited && (
            <div className="mt-6">
              <Separator className="my-4" />
              <div className="text-center text-sm text-muted-foreground">
                Don't have an account?{' '}
                <Link to="/onboarding" className="text-primary hover:underline font-medium">
                  Sign up
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
