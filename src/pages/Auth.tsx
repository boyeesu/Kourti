import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/kourti-legal-logo.png";

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
      type: "law-firm",
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
    { value: 'BW', label: 'Botswana' },
    { value: 'CA', label: 'Canada' },
    { value: 'GM', label: 'Gambia' },
    { value: 'GH', label: 'Ghana' },
    { value: 'KE', label: 'Kenya' },
    { value: 'LS', label: 'Lesotho' },
    { value: 'LR', label: 'Liberia' },
    { value: 'MW', label: 'Malawi' },
    { value: 'MU', label: 'Mauritius' },
    { value: 'NA', label: 'Namibia' },
    { value: 'NG', label: 'Nigeria' },
    { value: 'RW', label: 'Rwanda' },
    { value: 'SC', label: 'Seychelles' },
    { value: 'SL', label: 'Sierra Leone' },
    { value: 'ZA', label: 'South Africa' },
    { value: 'TZ', label: 'Tanzania' },
    { value: 'UG', label: 'Uganda' },
    { value: 'GB', label: 'United Kingdom' },
    { value: 'US', label: 'United States' },
    { value: 'ZM', label: 'Zambia' },
    { value: 'ZW', label: 'Zimbabwe' },
  ];

  const { signIn, signUp, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Check if this is an invited user
  const searchParams = new URLSearchParams(location.search);
  const invitedEmail = searchParams.get('email');
  const isInvited = searchParams.get('invited') === 'true';

  const from = location.state?.from?.pathname || "/onboarding";

  // Pre-fill email and switch to signup mode for invited users
  useEffect(() => {
    if (isInvited && invitedEmail) {
      setFormData(prev => ({ ...prev, email: decodeURIComponent(invitedEmail) }));
      setIsSignUp(true);
    }
  }, [isInvited, invitedEmail]);

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let result;
      if (isSignUp) {
        // For invited users, don't pass organization details - they'll be linked via the invitation
        const metadata = isInvited 
          ? {
              email: formData.email,
              first_name: formData.firstName,
              last_name: formData.lastName,
            }
          : {
              email: formData.email,
              first_name: formData.firstName,
              last_name: formData.lastName,
              organization: formData.organization.name,
              organization_details: {
                name: formData.organization.name,
                description: formData.organization.description,
                address: formData.organization.address,
                state: formData.organization.state,
                country: formData.organization.country,
                phone: formData.organization.phone,
                email: formData.organization.email,
              },
            };

        result = await signUp(formData.email, formData.password, metadata);
        
        if (!result.error) {
          toast({
            title: "Account created!",
            description: isInvited 
              ? "Your account has been created. You can now sign in."
              : "Please check your email to verify your account.",
          });
          
          // For invited users, redirect to dashboard after successful signup
          if (isInvited) {
            navigate("/dashboard", { replace: true });
          }
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
              {isInvited ? "Accept Invitation" : (isSignUp ? "Create Account" : "Welcome Back")}
            </CardTitle>
            <p className="text-muted-foreground mt-2">
              {isInvited 
                ? "Set your password to complete your account setup"
                : (isSignUp 
                    ? "Join Kourti Legal to manage your practice" 
                    : "Sign in to your Kourti Legal account")
              }
            </p>
          </div>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && !isInvited && (
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
                      value={formData.organization.type || "law-firm"}
                      onValueChange={(value) => setFormData({
                        ...formData,
                        organization: { ...formData.organization, type: value }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Law Firm" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="law-firm">Law Firm</SelectItem>
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
                  disabled={isInvited}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">{isInvited ? "Create Password" : "Password"}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={isInvited ? "Create a secure password" : "Enter your password"}
                  className="pl-10 pr-10"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={8}
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
              {isInvited && (
                <p className="text-xs text-muted-foreground">
                  Password must be at least 8 characters long
                </p>
              )}
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : (
                isInvited ? (
                  <>
                    Create Account
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                ) : isSignUp ? (
                  <>
                    Create Account & Organization
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                ) : "Sign In"
              )}
            </Button>
          </form>
          
          {!isInvited && (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}