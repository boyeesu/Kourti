import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Mail, Lock, Eye, EyeOff, FileCheck, Briefcase, Bot, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { AppLogo } from '@/components/ui/AppLogo';

const FEATURES = [
  {
    icon: Bot,
    title: 'AI-Powered Contracts',
    description: 'Generate, review, and compare contracts with intelligent AI assistance.',
  },
  {
    icon: Briefcase,
    title: 'Smart Case Management',
    description: 'Organize matters, track deadlines, and manage your caseload effortlessly.',
  },
  {
    icon: FileCheck,
    title: 'Document Analysis',
    description: 'Extract clauses, surface risks, and generate redlines automatically.',
  },
  {
    icon: ShieldCheck,
    title: 'Enterprise-Grade Security',
    description: 'Role-based access, SSO integration, and end-to-end data protection.',
  },
];

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
    <main id="main-content" className="min-h-screen flex flex-col lg:flex-row">
      {/* ───────── Left Panel: Branding & Features ───────── */}
      <section className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col justify-between bg-gradient-to-br from-[#1a2744] via-[#1e3a5f] to-[#243b6a] text-white p-12 xl:p-16">
        {/* Decorative elements */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Radial glow */}
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(121,165,234,0.15)_0%,transparent_70%)]" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(175,200,240,0.1)_0%,transparent_70%)]" />
          {/* Grid pattern overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        {/* Top: Logo & tagline */}
        <div className="relative z-10">
          <img src={'/kourti-dark-full.png'} alt="Kourti AI" className="h-10 xl:h-12 w-auto mb-4" />
          <p className="text-white/60 text-sm font-medium tracking-wide uppercase">
            Next-Gen Legal Operations Platform
          </p>
        </div>

        {/* Middle: Feature highlights */}
        <div className="relative z-10 space-y-6 xl:space-y-8 my-auto py-8">
          <h2 className="text-2xl xl:text-3xl font-semibold leading-snug max-w-md">
            Everything your legal team needs, powered by AI.
          </h2>

          <div className="space-y-5">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex items-start gap-4 group">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10 group-hover:bg-white/15 transition-colors">
                  <feature.icon className="w-5 h-5 text-[#afc8f0]" />
                </div>
                <div>
                  <h3 className="font-medium text-white/95 text-[15px]">{feature.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed mt-0.5">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: Trust badge */}
        <div className="relative z-10 flex items-center gap-3 pt-4 border-t border-white/10">
          <div className="flex -space-x-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full border-2 border-[#1e3a5f] bg-gradient-to-br from-[#afc8f0] to-[#79a5ea] flex items-center justify-center text-[10px] font-bold text-[#1a2744]"
              >
                {['JK', 'AL', 'MR', 'TS'][i]}
              </div>
            ))}
          </div>
          <p className="text-white/50 text-sm">
            Trusted by <span className="text-white/80 font-medium">500+</span> legal professionals
          </p>
        </div>
      </section>

      {/* ───────── Right Panel: Auth Form ───────── */}
      <section className="flex-1 flex items-center justify-center bg-background p-6 sm:p-8 lg:p-12">
        <div className="w-full max-w-[420px] space-y-8">
          {/* Mobile logo (hidden on desktop since left panel shows it) */}
          <div className="flex flex-col items-center lg:items-start gap-3 lg:hidden">
            <AppLogo size="lg" />
          </div>

          {/* Heading */}
          <div className="space-y-2 text-center lg:text-left">
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
              {isInvited ? 'Accept Invitation' : 'Welcome back'}
            </h1>
            <p className="text-muted-foreground text-[15px]">
              {isInvited
                ? 'Set your password to complete your account setup.'
                : 'Sign in to your Kourti AI account to continue.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">
                Email address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  className="pl-10 h-11"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={isInvited}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                {!isInvited && (
                  <Link
                    to="/forgot-password"
                    className="text-xs text-primary hover:text-primary/80 hover:underline font-medium"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="pl-10 pr-10 h-11"
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

            {isLockedOut && (
              <p className="text-sm text-destructive text-center bg-destructive/10 rounded-lg py-2.5 px-3">
                Too many failed attempts. Please wait {lockoutRemaining} second
                {lockoutRemaining !== 1 ? 's' : ''} before trying again.
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-11 text-[15px]"
              disabled={loading || isLockedOut}
            >
              {loading
                ? 'Signing in...'
                : isLockedOut
                  ? `Locked (${lockoutRemaining}s)`
                  : 'Sign In'}
            </Button>
          </form>

          {!isInvited && (
            <>
              <Separator />
              <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{' '}
                <Link to="/onboarding" className="text-primary hover:underline font-medium">
                  Create account
                </Link>
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
