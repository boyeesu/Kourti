import { useEffect, useMemo, useState } from "react";
import { useAllRoles } from '@/hooks/useAllRoles';
import { Link, useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Lock, Eye, EyeOff, User, Building, Globe2, LogIn } from "lucide-react";
import { AppLogo } from "@/components/ui/AppLogo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type ProviderName = "google" | "microsoft";

export default function Register() {
  const navigate = useNavigate();
  const { signUp, signInWithProvider } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [ssoLoading, setSsoLoading] = useState<ProviderName | null>(null);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    organization: "",
    role: "",
  });
  const [debouncedEmail, setDebouncedEmail] = useState("");
  const [providerState, setProviderState] = useState<Record<ProviderName, { available: boolean; enforceSso?: boolean; checking?: boolean }>>({
    google: { available: false },
    microsoft: { available: false },
  });

  // Fetch all roles but only display those appropriate for user sign up
  const { data: allRoles = [] } = useAllRoles();

  const enforceSso = useMemo(() => {
    return (providerState.google.enforceSso && providerState.google.available)
      || (providerState.microsoft.enforceSso && providerState.microsoft.available);
  }, [providerState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSsoError(null);

    if (enforceSso) {
      alert("Your organization has SSO-only onboarding. Please continue with the SSO options above.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    const { error } = await signUp(formData.email, formData.password, {
      email: formData.email,
      first_name: formData.firstName,
      last_name: formData.lastName,
      organization: formData.organization,
      role: formData.role,
    });
    if (error) {
      alert(`Registration failed: ${error.message}`);
      return;
    }
    alert("Registration successful. Please check your email to confirm your account.");
    navigate("/auth");
  };

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

    const fetchConfigs = async () => {
      const nextState: Record<ProviderName, { available: boolean; enforceSso?: boolean; checking?: boolean }> = {
        google: { available: false, checking: true },
        microsoft: { available: false, checking: true },
      };

      setProviderState((prev) => ({
        google: { ...prev.google, checking: true },
        microsoft: { ...prev.microsoft, checking: true },
      }));

      for (const provider of ["google", "microsoft"] as ProviderName[]) {
        try {
          const { data, error } = await supabase.functions.invoke('sso-authorize', {
            body: {
              provider,
              email: debouncedEmail || undefined,
              dry_run: true,
            },
          });

          if (!active) return;

          if (error) {
            nextState[provider] = { available: false, checking: false };
          } else {
            nextState[provider] = {
              available: Boolean(data?.available),
              enforceSso: Boolean(data?.enforce_sso),
              checking: false,
            };
          }
        } catch (err) {
          console.warn('Failed to check SSO config', provider, err);
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

    if (debouncedEmail) {
      fetchConfigs();
    } else {
      setProviderState({
        google: { available: false },
        microsoft: { available: false },
      });
    }

    return () => {
      active = false;
    };
  }, [debouncedEmail]);

  const handleProvider = async (provider: ProviderName) => {
    setSsoError(null);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-4xl shadow-card border border-border/50">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <AppLogo size="md" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Create Account</CardTitle>
            <p className="text-muted-foreground mt-2">
              Join Kourti Legal to manage your cases
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

            {(providerState.google.available || providerState.google.checking || providerState.microsoft.available || providerState.microsoft.checking) && (
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/40 p-4">
                <p className="text-sm font-medium text-muted-foreground">
                  {enforceSso
                    ? 'Your organization requires SSO to finish onboarding. Continue with the provider configured by your admin.'
                    : 'Prefer single sign-on? Continue with your organization provider.'}
                </p>
                {(["google", "microsoft"] as ProviderName[]).map((provider) => {
                  const state = providerState[provider];
                  if (!state.available && !state.checking) return null;
                  const disabled = !state.available || Boolean(ssoLoading && ssoLoading !== provider);
                  return (
                    <Button
                      key={provider}
                      type="button"
                      variant="outline"
                      className="w-full justify-start gap-2 bg-background"
                      disabled={disabled}
                      onClick={() => handleProvider(provider)}
                    >
                      {state.checking && ssoLoading !== provider ? (
                        <LogIn className="h-4 w-4 animate-spin" />
                      ) : (
                        renderProviderIcon(provider)
                      )}
                      <span>{renderProviderLabel(provider)}</span>
                    </Button>
                  );
                })}
              </div>
            )}

            {enforceSso && (
              <div className="rounded-md border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
                <p className="font-medium text-primary">Single sign-on required</p>
                <p className="text-muted-foreground">
                  The organization you&apos;re joining only allows access through their configured SSO provider. Use the button above to continue.
                </p>
              </div>
            )}
          </div>

          {!enforceSso && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="firstName"
                    name="firstName"
                    autoComplete="given-name"
                    placeholder="John"
                    className="pl-10"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  autoComplete="family-name"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Work Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="john@example.com"
                    className="pl-10"
                    autoComplete="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization">Organization</Label>
                <div className="relative">
                  <Building className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="organization"
                    name="organization"
                    autoComplete="organization"
                    placeholder="Your law firm"
                    className="pl-10"
                    value={formData.organization}
                    onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select name="role" value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  {allRoles
                    .filter(r => r.role && r.role !== 'superadmin') // Remove superadmin from public signup
                    .map(r => (
                      <SelectItem
                        key={r.role || r.role_name}
                        value={r.role || r.role_name}
                      >
                        {r.display_name || r.role_name || r.role}
                        {r.source === 'custom' && ' (Custom)'}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a password"
                    className="pl-10 pr-10"
                    autoComplete="new-password"
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

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    className="pl-10 pr-10"
                    autoComplete="new-password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    title={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">What happens next?</p>
              <ul className="mt-2 space-y-1">
                <li>• Verify your email to activate the account.</li>
                <li>• Complete onboarding to set up your organization.</li>
                <li>• Invite teammates when you&apos;re ready.</li>
              </ul>
            </div>

            <Button type="submit" className="w-full">
              Create Account
            </Button>
            {ssoError && !enforceSso && (
              <p className="text-sm text-destructive">{ssoError}</p>
            )}
          </form>
          )}

          {enforceSso && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Need access with a different email domain? Contact your administrator to request an invitation with the correct SSO provider.
            </div>
          )}

          <div className="mt-8">
            <Separator className="my-4" />
            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/auth" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
