import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Mail, Lock, Eye, EyeOff, Globe2, LogIn } from "lucide-react";
import logo from "@/assets/kourti-legal-logo-new.svg";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type ProviderName = "google" | "microsoft";

interface ProviderState {
  available: boolean;
  mode?: "supabase_managed" | "federated" | null;
  enforceSso?: boolean;
  buttonText?: string | null;
  checking?: boolean;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signInWithProvider } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [ssoLoading, setSsoLoading] = useState<ProviderName | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [providerState, setProviderState] = useState<Record<ProviderName, ProviderState>>({
    google: { available: false },
    microsoft: { available: false },
  });
  const [debouncedEmail, setDebouncedEmail] = useState("");

  const enforceSso = useMemo(() => {
    return (providerState.google.enforceSso && providerState.google.available)
      || (providerState.microsoft.enforceSso && providerState.microsoft.available);
  }, [providerState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSsoError(null);

    if (enforceSso) {
      setError('Your organization requires single sign-on. Please continue with one of the SSO options above.');
      return;
    }

    const { error } = await signIn(formData.email, formData.password);
    if (error) {
      setError(error.message);
      alert(`Login failed: ${error.message}`);
      return;
    }
    navigate("/dashboard");
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const provider = params.get('sso');
    const errorCode = params.get('sso_error');
    const emailParam = params.get('email');

    if (provider) {
      setSsoError(null);
      setError(null);
    }

    if (errorCode) {
      const messageMap: Record<string, string> = {
        config_not_found: 'We could not find an SSO configuration for your account. Please contact your administrator.',
        missing_client_credentials: 'The SSO provider is misconfigured. Please use password login or contact support.',
        sso_callback_error: 'Something went wrong while completing SSO. Please try again.',
      };
      setSsoError(messageMap[errorCode] ?? 'Single sign-on could not be completed. Please try again or contact support.');
    }

    if (emailParam && !formData.email) {
      setFormData((prev) => ({ ...prev, email: emailParam }));
    }
  }, [location.search]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedEmail(formData.email.trim());
    }, 400);

    return () => {
      window.clearTimeout(handle);
    };
  }, [formData.email]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    const checkProviders = async () => {
      const nextState: Record<ProviderName, ProviderState> = {
        google: { available: false, checking: true },
        microsoft: { available: false, checking: true },
      };
      setProviderState((prev) => ({
        google: { ...prev.google, checking: true },
        microsoft: { ...prev.microsoft, checking: true },
      }));

      const organizationId = typeof window !== 'undefined'
        ? window.sessionStorage.getItem('auth:selected_organization_id') ?? undefined
        : undefined;

      for (const provider of ["google", "microsoft"] as ProviderName[]) {
        try {
          const { data, error } = await supabase.functions.invoke('sso-authorize', {
            body: {
              provider,
              email: debouncedEmail || undefined,
              organization_id: organizationId,
              dry_run: true,
            },
          });

          if (!active) {
            return;
          }

          if (error) {
            nextState[provider] = { available: false, checking: false };
          } else {
            nextState[provider] = {
              available: Boolean(data?.available),
              mode: data?.mode ?? null,
              enforceSso: Boolean(data?.enforce_sso),
              buttonText: data?.button_text ?? null,
              checking: false,
            };
          }
        } catch (err) {
          console.warn('Unable to load SSO configuration for provider', provider, err);
          nextState[provider] = { available: false, checking: false };
        }
      }

      if (active) {
        setProviderState((prev) => ({
          google: { ...prev.google, ...nextState.google },
          microsoft: { ...prev.microsoft, ...nextState.microsoft },
        }));
      }
    };

    checkProviders();

    return () => {
      active = false;
    };
  }, [debouncedEmail]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (debouncedEmail.includes('@')) {
      const domain = debouncedEmail.split('@')[1]?.toLowerCase();
      if (domain) {
        window.sessionStorage.setItem('auth:last_email_domain', domain);
      }
    }
  }, [debouncedEmail]);

  const handleProvider = async (provider: ProviderName) => {
    setSsoError(null);
    setError(null);
    setSsoLoading(provider);
    const result = await signInWithProvider(provider, formData.email || undefined);
    if (result.error) {
      setSsoError(result.error.message);
      setSsoLoading(null);
    }
  };

  const renderProviderLabel = (provider: ProviderName) => {
    if (provider === 'google') return 'Continue with Google';
    if (provider === 'microsoft') return 'Continue with Microsoft';
    return 'Continue';
  };

  const renderProviderIcon = (provider: ProviderName) => {
    if (ssoLoading === provider) {
      return <LogIn className="h-4 w-4 animate-spin" />;
    }
    return <Globe2 className="h-4 w-4" />;
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const providerParam = params.get('provider') as ProviderName | null;
    if (!providerParam) return;
    const state = providerState[providerParam];
    if (!state || state.checking || ssoLoading === providerParam) return;
    if (!state.available) return;
    handleProvider(providerParam);
  }, [location.search, providerState, ssoLoading]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={logo} alt="Kourti Legal" className="h-16 w-16 rounded-lg" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Welcome Back</CardTitle>
            <p className="text-muted-foreground mt-2">
              Sign in to your Kourti Legal account
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            {ssoError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {ssoError}
              </div>
            )}

            {enforceSso && (
              <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm text-primary">
                <Globe2 className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-medium text-primary">Single sign-on required</p>
                  <p className="text-muted-foreground">
                    Your firm administrator has restricted access to SSO. Use one of the options below to continue.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {(["google", "microsoft"] as ProviderName[]).map((provider) => {
                const state = providerState[provider];
                const disabled = !state.available || Boolean(ssoLoading && ssoLoading !== provider);

                if (!state.available && !state.checking) {
                  return null;
                }

                return (
                  <Button
                    key={provider}
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    disabled={disabled}
                    onClick={() => handleProvider(provider)}
                  >
                    {state.checking && ssoLoading !== provider ? (
                      <LogIn className="h-4 w-4 animate-spin" />
                    ) : (
                      renderProviderIcon(provider)
                    )}
                    <span>{state.buttonText ?? renderProviderLabel(provider)}</span>
                  </Button>
                );
              })}
            </div>

            {!enforceSso && (
              <>
                <Separator className="my-4" />
                <p className="text-center text-xs uppercase tracking-wide text-muted-foreground">
                  Or continue with email
                </p>
              </>
            )}
          </div>

          {!enforceSso && (
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
  value={formData.email}
  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
  type={showPassword ? "text" : "password"}
  placeholder="Enter your password"
  className="pl-10 pr-10"
  autoComplete="current-password"
  value={formData.password}
  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
  required
/>
<Button
  type="button"
  variant="ghost"
  size="sm"
  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
  onClick={() => setShowPassword(!showPassword)}
  aria-label={showPassword ? "Hide password" : "Show password"}
  title={showPassword ? "Hide password" : "Show password"}
>
  {showPassword ? (
    <EyeOff className="h-4 w-4 text-muted-foreground" />
  ) : (
    <Eye className="h-4 w-4 text-muted-foreground" />
  )}
</Button>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <Link 
                to="/forgot-password" 
                className="text-sm text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            
            <Button type="submit" className="w-full">
              Sign In
            </Button>
            {error && (
              <p className="mt-2 text-sm text-destructive">{error}</p>
            )}
          </form>
          )}

          <div className="mt-6">
            <Separator className="my-4" />
            <div className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/register" className="text-primary hover:underline font-medium">
                Sign up
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}