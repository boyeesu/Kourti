import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Building, Users, FileText, CheckCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { buildDisplayName, getAuthRedirectUrl } from "@/utils/auth-helpers";
import { env } from "@/lib/env";
import logo from "@/assets/kourti-legal-logo.png";

const steps = [
  {
    id: 1,
    title: "Organization Setup",
    description: "Tell us about your organization",
    icon: Building,
  },
  {
    id: 2,
    title: "Team Configuration",
    description: "Set up your team structure",
    icon: Users,
  },
  {
    id: 3,
    title: "Practice Areas",
    description: "Configure your practice areas",
    icon: FileText,
  },
  {
    id: 4,
    title: "Welcome!",
    description: "You're all set to get started",
    icon: CheckCircle,
  },
];

const countries = [
  // African Countries
  { value: 'DZ', label: 'Algeria' },
  { value: 'AO', label: 'Angola' },
  { value: 'BJ', label: 'Benin' },
  { value: 'BW', label: 'Botswana' },
  { value: 'BF', label: 'Burkina Faso' },
  { value: 'BI', label: 'Burundi' },
  { value: 'CM', label: 'Cameroon' },
  { value: 'CV', label: 'Cape Verde' },
  { value: 'CF', label: 'Central African Republic' },
  { value: 'TD', label: 'Chad' },
  { value: 'KM', label: 'Comoros' },
  { value: 'CG', label: 'Congo' },
  { value: 'CD', label: 'Congo (DRC)' },
  { value: 'CI', label: 'Côte d\'Ivoire' },
  { value: 'DJ', label: 'Djibouti' },
  { value: 'EG', label: 'Egypt' },
  { value: 'GQ', label: 'Equatorial Guinea' },
  { value: 'ER', label: 'Eritrea' },
  { value: 'SZ', label: 'Eswatini' },
  { value: 'ET', label: 'Ethiopia' },
  { value: 'GA', label: 'Gabon' },
  { value: 'GM', label: 'Gambia' },
  { value: 'GH', label: 'Ghana' },
  { value: 'GN', label: 'Guinea' },
  { value: 'GW', label: 'Guinea-Bissau' },
  { value: 'KE', label: 'Kenya' },
  { value: 'LS', label: 'Lesotho' },
  { value: 'LR', label: 'Liberia' },
  { value: 'LY', label: 'Libya' },
  { value: 'MG', label: 'Madagascar' },
  { value: 'MW', label: 'Malawi' },
  { value: 'ML', label: 'Mali' },
  { value: 'MR', label: 'Mauritania' },
  { value: 'MU', label: 'Mauritius' },
  { value: 'MA', label: 'Morocco' },
  { value: 'MZ', label: 'Mozambique' },
  { value: 'NA', label: 'Namibia' },
  { value: 'NE', label: 'Niger' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'RW', label: 'Rwanda' },
  { value: 'ST', label: 'São Tomé and Príncipe' },
  { value: 'SN', label: 'Senegal' },
  { value: 'SC', label: 'Seychelles' },
  { value: 'SL', label: 'Sierra Leone' },
  { value: 'SO', label: 'Somalia' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'SS', label: 'South Sudan' },
  { value: 'SD', label: 'Sudan' },
  { value: 'TZ', label: 'Tanzania' },
  { value: 'TG', label: 'Togo' },
  { value: 'TN', label: 'Tunisia' },
  { value: 'UG', label: 'Uganda' },
  { value: 'ZM', label: 'Zambia' },
  { value: 'ZW', label: 'Zimbabwe' },
  // North America
  { value: 'CA', label: 'Canada' },
  { value: 'US', label: 'United States' },
  // Europe
  { value: 'GB', label: 'United Kingdom' },
];

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(1);
  
  const [formData, setFormData] = useState({
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
    team: {
      inviteEmails: [""],
      defaultRoles: [] as string[],
    },
    practiceAreas: [] as string[],
  });

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
    }
  }, [user, navigate]);

  const practiceAreaOptions = [
    "Corporate Law",
    "Litigation",
    "Real Estate",
    "Employment Law",
    "Intellectual Property",
    "Family Law",
    "Criminal Law",
    "Tax Law",
    "Immigration Law",
    "Environmental Law",
    "Banking & Finance",
    "Healthcare Law",
    "Insurance Law",
    "International Law",
    "Contract Law",
  ];

  const progress = (currentStep / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = async () => {
    try {
      const warningMessages: string[] = [];

      // Create organization with all collected data
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

      // Update user profile with organization (default to superadmin for onboarding)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          organization_id: orgData.id,
          role: 'superadmin',
        })
        .eq('user_id', user?.id || '');

      if (profileError) throw profileError;

      const inviteEmails = formData.team.inviteEmails
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      if (inviteEmails.length > 0) {
        let inviterName = user?.email ?? 'Team member';

        try {
          const { data: profileDetails, error: profileDetailsError } = await supabase
            .from('profiles')
            .select('first_name,last_name')
            .eq('user_id', user?.id || '')
            .single();

          if (profileDetailsError) throw profileDetailsError;

          if (profileDetails) {
            inviterName = buildDisplayName(
              (profileDetails as any)?.first_name ?? null,
              (profileDetails as any)?.last_name ?? null,
              user?.email ?? undefined
            );
          }
        } catch (profileDetailsError: any) {
          warningMessages.push(
            profileDetailsError?.message
              ? `Unable to load your profile details for invitations: ${profileDetailsError.message}`
              : 'Unable to load your profile details for invitations.'
          );
        }

        let invitationUrl: string | null = null;
        try {
          invitationUrl = getAuthRedirectUrl('/auth', env.APP_URL);
        } catch (invitationUrlError: any) {
          warningMessages.push(
            invitationUrlError?.message
              ? `Could not generate invitation link: ${invitationUrlError.message}`
              : 'Could not generate invitation link for team invites.'
          );
        }

        if (invitationUrl) {
          for (const email of inviteEmails) {
            try {
              const { data: inviteData, error: inviteError } = await supabase.rpc('invite_user_to_organization', {
                p_email: email,
                p_first_name: email.split('@')[0],
                p_last_name: 'User',
                p_role: 'user',
                p_department: undefined,
              });

              if (inviteError) {
                throw inviteError;
              }

              if (inviteData && typeof inviteData === 'object' && 'error' in inviteData) {
                throw new Error((inviteData as { error?: string }).error || 'Unknown invitation error');
              }

              try {
                const ssoLinks: Array<{ provider: 'google' | 'microsoft'; url: string; mode: 'supabase_managed' | 'federated' }> = [];
                let ssoEnforced = false;
                const ssoRedirect = getAuthRedirectUrl('/auth/callback', env.APP_URL);

                for (const provider of ['google', 'microsoft'] as const) {
                  try {
                    const { data: dryRun } = await supabase.functions.invoke('sso-authorize', {
                      body: {
                        provider,
                        email,
                        organization_id: orgData.id,
                        dry_run: true,
                      },
                    });

                    if (!dryRun?.available) continue;
                    if (dryRun.enforce_sso) {
                      ssoEnforced = true;
                    }

                    if (dryRun.mode === 'federated') {
                      const { data: authData } = await supabase.functions.invoke('sso-authorize', {
                        body: {
                          provider,
                          email,
                          organization_id: orgData.id,
                          redirect_to: ssoRedirect,
                        },
                      });
                      if (authData?.authorization_url) {
                        ssoLinks.push({ provider, url: authData.authorization_url, mode: 'federated' });
                      }
                    } else if (dryRun.mode === 'supabase_managed') {
                      try {
                        const authorizeUrl = new URL('/auth/v1/authorize', env.SUPABASE_URL);
                        authorizeUrl.searchParams.set('provider', provider);
                        authorizeUrl.searchParams.set('redirect_to', ssoRedirect);
                        authorizeUrl.searchParams.set('login_hint', email);
                        ssoLinks.push({ provider, url: authorizeUrl.toString(), mode: 'supabase_managed' });
                      } catch (urlError) {
                        console.warn('Unable to build managed SSO link during onboarding invite', urlError);
                      }
                    }
                  } catch (ssoError) {
                    console.warn('Failed to resolve SSO config for onboarding invitation', provider, ssoError);
                  }
                }

                const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-invitation-email', {
                  body: {
                    email,
                    firstName: email.split('@')[0],
                    lastName: 'User',
                    role: 'user',
                    organizationName: orgData.name,
                    inviterName,
                    invitationUrl,
                    ssoEnforced,
                    ssoLinks,
                  },
                });

                if (emailError) {
                  warningMessages.push(
                    emailError?.message
                      ? `Invitation email to ${email} could not be sent: ${emailError.message}`
                      : `Invitation email to ${email} could not be sent.`
                  );
                } else if (emailResult && typeof emailResult === 'object' && 'error' in emailResult) {
                  warningMessages.push(
                    `Invitation email to ${email} returned an error: ${(emailResult as { error?: string }).error || 'Unknown error'}`
                  );
                }
              } catch (emailError: any) {
                warningMessages.push(
                  emailError?.message
                    ? `Invitation email to ${email} encountered an error: ${emailError.message}`
                    : `Invitation email to ${email} encountered an unknown error.`
                );
              }
            } catch (inviteError: any) {
              warningMessages.push(
                inviteError?.message
                  ? `Failed to invite ${email}: ${inviteError.message}`
                  : `Failed to invite ${email}.`
              );
            }
          }
        }
      }

      toast({
        title: "Onboarding completed!",
        description: "Welcome to Kourti Legal. You're all set to get started.",
      });

      if (warningMessages.length > 0) {
        toast({
          title: "Onboarding completed with warnings",
          description: warningMessages.join(' '),
        });
      }

      navigate("/dashboard", { replace: true });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to complete onboarding. Please try again.",
      });
    }
  };

  const addEmailField = () => {
    setFormData({
      ...formData,
      team: {
        ...formData.team,
        inviteEmails: [...formData.team.inviteEmails, ""],
      },
    });
  };

  const updateEmail = (index: number, email: string) => {
    const newEmails = [...formData.team.inviteEmails];
    newEmails[index] = email;
    setFormData({
      ...formData,
      team: {
        ...formData.team,
        inviteEmails: newEmails,
      },
    });
  };

  const togglePracticeArea = (area: string) => {
    const newAreas = formData.practiceAreas.includes(area)
      ? formData.practiceAreas.filter(a => a !== area)
      : [...formData.practiceAreas, area];
    setFormData({ ...formData, practiceAreas: newAreas });
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
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
          </div>
        );
        
      case 2:
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium">Invite Team Members</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Add email addresses to invite your team members
              </p>
              
              <div className="space-y-3">
                {formData.team.inviteEmails.map((email, index) => (
                  <Input
                    key={index}
                    type="email"
                    placeholder="colleague@example.com"
                    value={email}
                    onChange={(e) => updateEmail(index, e.target.value)}
                  />
                ))}
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={addEmailField}
                  className="w-full"
                >
                  Add Another Email
                </Button>
              </div>
            </div>
          </div>
        );
        
      case 3:
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium">Practice Areas</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Select the practice areas relevant to your organization
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                {practiceAreaOptions.map((area) => (
                  <div key={area} className="flex items-center space-x-2">
                    <Checkbox
                      id={area}
                      checked={formData.practiceAreas.includes(area)}
                      onCheckedChange={() => togglePracticeArea(area)}
                    />
                    <Label htmlFor={area} className="text-sm font-normal">
                      {area}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
        
      case 4:
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold">Welcome to Kourti Legal!</h3>
              <p className="text-muted-foreground mt-2">
                Your organization has been set up successfully. You can now start managing your cases, documents, and team.
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium">Quick Start Tips:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Create your first case in the Cases section</li>
                <li>• Upload important documents to get organized</li>
                <li>• Set up your calendar for important deadlines</li>
                <li>• Invite team members to collaborate</li>
              </ul>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-card">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <img src={logo} alt="Kourti Legal" className="h-12 w-12" />
          </div>
          <Progress value={progress} className="w-full mb-6" />
          <div className="flex justify-center space-x-4 mb-6">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.id}
                  className={`flex flex-col items-center space-y-2 ${
                    step.id === currentStep
                      ? "text-primary"
                      : step.id < currentStep
                      ? "text-muted-foreground"
                      : "text-muted-foreground/50"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      step.id === currentStep
                        ? "bg-primary text-primary-foreground"
                        : step.id < currentStep
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-xs text-center">
                    <div className="font-medium">{step.title}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <CardTitle>{steps[currentStep - 1]?.title}</CardTitle>
          <p className="text-muted-foreground">
            {steps[currentStep - 1]?.description}
          </p>
        </CardHeader>
        
        <CardContent>
          {renderStepContent()}
          
          <div className="flex justify-between mt-8">
            <div className="space-x-2">
              {currentStep === 1 ? (
                <Button
                  variant="outline"
                  onClick={() => navigate("/auth")}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Login
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handlePrevious}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>
              )}
            </div>
            
            {currentStep === steps.length ? (
              <Button onClick={handleFinish}>
                Get Started
                <CheckCircle className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleNext}>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
