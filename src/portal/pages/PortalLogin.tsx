import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, type Location } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';
import { AppLogo } from '@/components/ui/AppLogo';
import { usePortalAuth } from '../PortalAuthContext';

const RESEND_COOLDOWN_SECONDS = 30;

interface OtpStep {
  otpToken: string;
  emailHint: string;
}

export default function PortalLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, verifyOtp, resendOtp } = usePortalAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });

  // OTP second step
  const [otpStep, setOtpStep] = useState<OtpStep | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/portal';

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err, success, otpRequired } = await login(form.email, form.password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    if (otpRequired) {
      setOtpStep({ otpToken: otpRequired.otpToken, emailHint: otpRequired.emailHint });
      setCode('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      return;
    }
    if (success) navigate(from, { replace: true });
  };

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!otpStep || code.length !== 6) return;
    setError(null);
    setVerifying(true);
    const { error: err, success } = await verifyOtp(otpStep.otpToken, code);
    setVerifying(false);
    if (err) {
      setError(err);
      setCode('');
      return;
    }
    if (success) navigate(from, { replace: true });
  };

  const handleResend = async () => {
    if (!otpStep || cooldown > 0) return;
    setError(null);
    try {
      const res = await resendOtp(otpStep.otpToken);
      setOtpStep({ otpToken: otpStep.otpToken, emailHint: res.emailHint });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code. Please try again.');
    }
  };

  const handleBackToLogin = () => {
    setOtpStep(null);
    setCode('');
    setError(null);
    setForm((f) => ({ ...f, password: '' }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <AppLogo size="md" />
          </div>
          <div>
            {otpStep ? (
              <>
                <CardTitle className="text-2xl font-semibold">Enter your sign-in code</CardTitle>
                <p className="text-muted-foreground mt-2">
                  We sent a 6-digit code to <span className="font-medium">{otpStep.emailHint}</span>
                  .
                </p>
              </>
            ) : (
              <>
                <CardTitle className="text-2xl font-semibold">Welcome to your portal</CardTitle>
                <p className="text-muted-foreground mt-2">
                  Sign in to follow your matters and stay updated.
                </p>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {otpStep ? (
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="flex flex-col items-center space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={(value) => setCode(value)}
                  disabled={verifying}
                  autoFocus
                  containerClassName="justify-center"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button type="submit" className="w-full" disabled={verifying || code.length !== 6}>
                {verifying ? 'Verifying…' : 'Verify & continue'}
              </Button>

              {error && <p className="text-center text-sm text-destructive">{error}</p>}

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0}
                  className="text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                >
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="Enter your email"
                    className="pl-10"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    className="pl-10 pr-10"
                    autoComplete="current-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <Link to="/portal/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
