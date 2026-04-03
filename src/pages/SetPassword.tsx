import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';
import { AppLogo } from '@/components/ui/AppLogo';
import { validatePassword, PASSWORD_REQUIREMENTS } from '@/lib/passwordValidation';

export default function SetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const verifyToken = () => {
      try {
        // Check URL for invitation token (custom JWT system uses query params or hash)
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));

        const token =
          params.get('token') || hashParams.get('token') || hashParams.get('access_token');
        const type = params.get('type') || hashParams.get('type');

        if (token && (type === 'invite' || type === 'invitation' || !type)) {
          // Clear the hash from URL
          if (window.location.hash) {
            window.history.replaceState(
              null,
              '',
              window.location.pathname + window.location.search
            );
          }

          setInviteToken(token);
          setTokenValid(true);
          setVerifying(false);
          return;
        }

        // If no token found, the link is invalid
        setTokenValid(false);
        toast.error('Invalid invitation', {
          description: 'This invitation link is invalid or has expired.',
        });
        setTimeout(() => navigate('/auth'), 3000);
      } catch (error) {
        console.error('Error verifying token:', error);
        setTokenValid(false);
        toast.error('Error', { description: 'Failed to verify invitation link.' });
        setTimeout(() => navigate('/auth'), 3000);
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords don't match", {
        description: 'Please ensure both passwords are the same.',
      });
      return;
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      toast.error('Password too weak', { description: passwordCheck.error! });
      return;
    }

    setLoading(true);

    try {
      // Set password via Node backend using the invitation token
      await invokeNodeApi('/api/v1/auth/set-password', {
        method: 'POST',
        body: { token: inviteToken, password },
        headers: { Authorization: `Bearer ${inviteToken}` },
      });

      toast.success('Password set successfully!', { description: 'Welcome to Kourti AI!' });

      // Clear password from state
      setPassword('');
      setConfirmPassword('');

      // Redirect to dashboard immediately after successful password set
      navigate('/dashboard');
    } catch (error: unknown) {
      // Clear password from state on error too
      setPassword('');
      setConfirmPassword('');
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to set password. Please try again.';
      toast.error('Error', { description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-card">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-muted-foreground">Verifying invitation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-card border-destructive/20">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <Lock className="h-10 w-10 text-destructive" />
              </div>
              <div className="space-y-3">
                <h3 className="font-semibold text-xl">Invalid Invitation</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>This invitation link is invalid or has expired.</p>
                  <p className="text-xs">
                    <strong>Common reasons:</strong>
                  </p>
                  <ul className="text-xs text-left list-disc list-inside space-y-1 bg-muted/50 p-3 rounded-md">
                    <li>The link has already been used to set up your account</li>
                    <li>The link has expired (invitation links expire after 24 hours)</li>
                    <li>The link was clicked more than once</li>
                  </ul>
                  <p className="mt-4 text-sm">
                    If you've already set your password, please{' '}
                    <Button variant="link" className="p-0 h-auto" onClick={() => navigate('/auth')}>
                      sign in here
                    </Button>
                    .
                  </p>
                  <p className="text-xs">
                    If you need a new invitation, please contact your administrator.
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => navigate('/auth')} className="w-full">
                Go to Sign In
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <AppLogo size="md" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Set Your Password</CardTitle>
            <p className="text-muted-foreground mt-2">
              Welcome to Kourti AI! Please set your password to complete your account setup.
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 mt-2">
                <ul className="list-disc list-inside space-y-0.5">
                  {PASSWORD_REQUIREMENTS.map((req) => (
                    <li key={req.label} className={req.test(password) ? 'text-green-600' : ''}>
                      {req.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  className="pl-10 pr-10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {password && confirmPassword && password === confirmPassword && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>Passwords match</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !password || !confirmPassword || password !== confirmPassword}
            >
              {loading ? 'Setting password...' : 'Set Password & Continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
