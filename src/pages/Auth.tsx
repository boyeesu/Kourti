import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Globe2, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/kourti-legal-logo.png";

type ProviderName = "google" | "microsoft";

interface ProviderState {
  available: boolean;
  mode?: "supabase_managed" | "federated" | null;
  enforceSso?: boolean;
  buttonText?: string | null;
  checking?: boolean;
}

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    organization: {
      name: "",
      type: "",
      size: "",
      description: "",
      address: "",
      state: "",
      country: "",
      phone: "",
      email: "",
    },
  });

  const countries = [
    { value: 'US', label: 'United States' },
    { value: 'CA', label: 'Canada' },
    { value: 'GB', label: 'United Kingdom' },
    { value: 'AU', label: 'Australia' },
    { value: 'DE', label: 'Germany' },
    { value: 'FR', label: 'France' },
    { value: 'IT', label: 'Italy' },
    { value: 'ES', label: 'Spain' },
    { value: 'NL', label: 'Netherlands' },
    { value: 'SE', label: 'Sweden' },
    { value: 'NO', label: 'Norway' },
    { value: 'DK', label: 'Denmark' },
    { value: 'FI', label: 'Finland' },
    { value: 'CH', label: 'Switzerland' },
    { value: 'AT', label: 'Austria' },
    { value: 'BE', label: 'Belgium' },
    { value: 'IE', label: 'Ireland' },
    { value: 'PT', label: 'Portugal' },
    { value: 'NZ', label: 'New Zealand' },
    { value: 'SG', label: 'Singapore' },
    { value: 'JP', label: 'Japan' },
    { value: 'KR', label: 'South Korea' },
    { value: 'IN', label: 'India' },
    { value: 'BR', label: 'Brazil' },
    { value: 'MX', label: 'Mexico' },
    { value: 'AR', label: 'Argentina' },
    { value: 'CL', label: 'Chile' },
    { value: 'ZA', label: 'South Africa' },
  ];

  const { signIn, signUp, signInWithProvider, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [ssoLoading, setSsoLoading] = useState<ProviderName | null>(null);
  const [providerState, setProviderState] = useState<Record<ProviderName, ProviderState>>({
    google: { available: false },
    microsoft: { available: false },
  });
  const [debouncedEmail, setDebouncedEmail] = useState("");

  const from = location.state?.from?.pathname || "/onboarding";

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedEmail(formData.email.trim());
    }, 400);
    return () => window.clearTimeout(handle);
  }, [formData.email]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    const checkProviders = async () => {
      setProviderState({
        google: { available: false, checking: true },
        microsoft: { available: false, checking: true },
      });

      const organizationId = typeof window !== 'undefined'
        ? window.sessionStorage.getItem('auth:selected_organization_id') ?? undefined
        : undefined;

      const nextState: Record<ProviderName, ProviderState> = {
        google: { available: false, checking: false },
        microsoft: { available: false, checking: false },
      };

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

          if (!active) return;

          if (!error && data?.available) {
            nextState[provider] = {
              available: true,
              mode: data?.mode ?? null,
              enforceSso: Boolean(data?.enforce_sso),
              buttonText: data?.button_text ?? null,
              checking: false,
            };
          }
        } catch (err) {
          console.warn('Unable to load SSO configuration', provider, err);
        }
      }

      if (active) {
        setProviderState(nextState);
      }
    };

    checkProviders();
    return () => { active = false; };
  }, [debouncedEmail]);

  const handleProvider = async (provider: ProviderName) => {
    setSsoError(null);
    setSsoLoading(provider);
    const result = await signInWithProvider(provider, formData.email || undefined);
    if (result.error) {
      setSsoError(result.error.message);
      toast({
        variant: "destructive",
        title: "SSO Error",
        description: result.error.message,
      });
    }
    setSsoLoading(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let result;
      if (isSignUp) {
        // Create organization first
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: formData.organization.name,
            description: formData.organization.description,
            address: formData.organization.address,
            state: formData.organization.state,
            country: formData.organization.country,
            phone: formData.organization.phone,
            email: formData.organization.email,
          })
          .select()
          .single();

        if (orgError) throw orgError;

        result = await signUp(formData.email, formData.password, {
          email: formData.email,
          first_name: formData.firstName,
          last_name: formData.lastName,
          organization: formData.organization.name,
          organization_id: orgData.id,
        });
        
        if (!result.error) {
          toast({
            title: "Account created!",
            description: "Please check your email to verify your account.",
          });
        }
      } else {
        result = await signIn(formData.email, formData.password);
        
        if (!result.error) {
          toast({
            title: "Welcome back!",
            description: "You have successfully signed in.",
          });
          navigate("/dashboard", { replace: true });
        }
      }

      if (result.error) {
        // Handle specific signup errors
        if (isSignUp && result.error.message?.includes("User already registered")) {
          toast({
            variant: "destructive",
            title: "Account already exists",
            description: "This email is already registered. Please sign in instead.",
          });
          setIsSignUp(false); // Switch to sign-in mode
        } else {
          toast({
            variant: "destructive",
            title: "Authentication Error",
            description: result.error.message,
          });
        }
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={logo} alt="Kourti Legal" className="h-12 w-12" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">
              {isSignUp ? "Create Account" : "Welcome Back"}
            </CardTitle>
            <p className="text-muted-foreground mt-2">
              {isSignUp 
                ? "Join Kourti Legal to manage your practice" 
                : "Sign in to your Kourti Legal account"
              }
            </p>
          </div>
        </CardHeader>
        
        <CardContent>
          {ssoError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive mb-4">
              {ssoError}
            </div>
          )}

          {/* SSO Options */}
          <div className="space-y-2 mb-4">
            {(["google", "microsoft"] as ProviderName[]).map((provider) => {
              const state = providerState[provider];
              if (!state.available && !state.checking) return null;

              return (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2"
                  disabled={!state.available || Boolean(ssoLoading && ssoLoading !== provider)}
                  onClick={() => handleProvider(provider)}
                >
                  {state.checking || ssoLoading === provider ? (
                    <LogIn className="h-4 w-4 animate-spin" />
                  ) : (
                    <Globe2 className="h-4 w-4" />
                  )}
                  <span>
                    {state.buttonText ?? `${isSignUp ? 'Sign up' : 'Continue'} with ${provider === 'google' ? 'Google' : 'Microsoft'}`}
                  </span>
                </Button>
              );
            })}
          </div>

          {(providerState.google.available || providerState.microsoft.available) && (
            <>
              <Separator className="my-4" />
              <p className="text-center text-xs uppercase tracking-wide text-muted-foreground mb-4">
                Or continue with email
              </p>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      placeholder="Enter your first name"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      placeholder="Enter your last name"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name *</Label>
                  <Input
                    id="orgName"
                    placeholder="Enter your organization name"
                    value={formData.organization.name}
                    onChange={(e) => setFormData({
                      ...formData,
                      organization: { ...formData.organization, name: e.target.value }
                    })}
                    required
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Organization Type *</Label>
                    <Select 
                      value={formData.organization.type}
                      onValueChange={(value) => setFormData({
                        ...formData,
                        organization: { ...formData.organization, type: value }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="law-firm">Law Firm</SelectItem>
                        <SelectItem value="corporate-legal">Corporate Legal Department</SelectItem>
                        <SelectItem value="government">Government Agency</SelectItem>
                        <SelectItem value="nonprofit">Nonprofit Organization</SelectItem>
                        <SelectItem value="solo">Solo Practice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Organization Size *</Label>
                    <Select 
                      value={formData.organization.size}
                      onValueChange={(value) => setFormData({
                        ...formData,
                        organization: { ...formData.organization, size: value }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-5">1-5 employees</SelectItem>
                        <SelectItem value="6-20">6-20 employees</SelectItem>
                        <SelectItem value="21-50">21-50 employees</SelectItem>
                        <SelectItem value="51-200">51-200 employees</SelectItem>
                        <SelectItem value="200+">200+ employees</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orgAddress">Business Address *</Label>
                  <Input
                    id="orgAddress"
                    placeholder="Enter your business address"
                    value={formData.organization.address}
                    onChange={(e) => setFormData({
                      ...formData,
                      organization: { ...formData.organization, address: e.target.value }
                    })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="orgState">State/Province *</Label>
                    <Input
                      id="orgState"
                      placeholder="Enter state or province"
                      value={formData.organization.state}
                      onChange={(e) => setFormData({
                        ...formData,
                        organization: { ...formData.organization, state: e.target.value }
                      })}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Country *</Label>
                    <Select 
                      value={formData.organization.country}
                      onValueChange={(value) => setFormData({
                        ...formData,
                        organization: { ...formData.organization, country: value }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {countries.map((country) => (
                          <SelectItem key={country.value} value={country.value}>
                            {country.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="orgPhone">Official Phone Number *</Label>
                    <Input
                      id="orgPhone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={formData.organization.phone}
                      onChange={(e) => setFormData({
                        ...formData,
                        organization: { ...formData.organization, phone: e.target.value }
                      })}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="orgEmail">Organization Email *</Label>
                    <Input
                      id="orgEmail"
                      type="email"
                      placeholder="contact@yourfirm.com"
                      value={formData.organization.email}
                      onChange={(e) => setFormData({
                        ...formData,
                        organization: { ...formData.organization, email: e.target.value }
                      })}
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="orgDescription">Description (Optional)</Label>
                  <Textarea
                    id="orgDescription"
                    placeholder="Brief description of your organization"
                    value={formData.organization.description}
                    onChange={(e) => setFormData({
                      ...formData,
                      organization: { ...formData.organization, description: e.target.value }
                    })}
                  />
                </div>
              </>
            )}

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
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  className="pl-10 pr-10"
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
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : (isSignUp ? (
                <>
                  Create Account & Organization
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              ) : "Sign In")}
            </Button>
          </form>
          
          <div className="mt-6">
            <Separator className="my-4" />
            <div className="text-center text-sm text-muted-foreground">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <Button
                variant="link"
                className="p-0 h-auto text-primary hover:underline font-medium"
                onClick={() => setIsSignUp(!isSignUp)}
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}