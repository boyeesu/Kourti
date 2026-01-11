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
import { Building, Users, FileText, CheckCircle, ArrowRight, ArrowLeft, User, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { buildDisplayName, getAuthRedirectUrl } from "@/utils/auth-helpers";
import { env } from "@/lib/env";
import { AppLogo } from "@/components/ui/AppLogo";
import { useNotificationTriggers } from "@/hooks/useNotificationTriggers";
import { trackEvent, AnalyticsEvents, identifyUser } from "@/lib/analytics";
import { useOnboardingSteps } from "@/hooks/useOnboardingSteps";
import { AlertCircle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const steps = [
  {
    id: 0,
    title: "Create Your Account",
    description: "Set up your account to get started",
    icon: User,
  },
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
  const [currentStep, setCurrentStep] = useState(0);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    account: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
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

  const { user, signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { createOnboardingNotification } = useNotificationTriggers();
  const { markStepComplete } = useOnboardingSteps();

  // Handle authentication state changes during onboarding
  useEffect(() => {
    // If user becomes authenticated during onboarding (e.g., after email verification),
    // populate form data from user metadata and advance to organization setup
    if (user && currentStep === 0 && !formData.account.firstName && !formData.account.lastName) {
      const firstName = user.user_metadata?.first_name || user.user_metadata?.firstName;
      const lastName = user.user_metadata?.last_name || user.user_metadata?.lastName;
      if (firstName || lastName) {
        setFormData(prev => ({
          ...prev,
          account: {
            ...prev.account,
            firstName: firstName || '',
            lastName: lastName || '',
            email: user.email || prev.account.email,
          }
        }));
        // Auto-advance to step 1 since account is already created
        setCurrentStep(1);
      }
    }
  }, [user, currentStep, formData.account.firstName, formData.account.lastName]);

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

  const progress = ((currentStep + 1) / steps.length) * 100;

  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {};
    
    if (step === 0) {
      if (!formData.account.firstName.trim()) {
        errors.firstName = "First name is required";
      }
      if (!formData.account.lastName.trim()) {
        errors.lastName = "Last name is required";
      }
      if (!formData.account.email.trim()) {
        errors.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.account.email)) {
        errors.email = "Please enter a valid email address";
      }
      if (!formData.account.password) {
        errors.password = "Password is required";
      } else if (formData.account.password.length < 8) {
        errors.password = "Password must be at least 8 characters";
      }
      if (formData.account.password !== formData.account.confirmPassword) {
        errors.confirmPassword = "Passwords do not match";
      }
    }
    
    if (step === 1) {
      if (!formData.organization.name.trim()) {
        errors.orgName = "Organization name is required";
      }
      if (!formData.organization.type) {
        errors.orgType = "Organization type is required";
      }
      if (!formData.organization.size) {
        errors.orgSize = "Organization size is required";
      }
      if (!formData.organization.address.trim()) {
        errors.orgAddress = "Business address is required";
      }
      if (!formData.organization.state.trim()) {
        errors.orgState = "State/Province is required";
      }
      if (!formData.organization.country) {
        errors.orgCountry = "Country is required";
      }
      if (!formData.organization.phone.trim()) {
        errors.orgPhone = "Phone number is required";
      }
      if (!formData.organization.email.trim()) {
        errors.orgEmail = "Organization email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.organization.email)) {
        errors.orgEmail = "Please enter a valid email address";
      }
    }
    
    if (step === 2) {
      // Team step is optional, but validate emails if provided
      const validEmails = formData.team.inviteEmails.filter(email => email.trim());
      for (let i = 0; i < validEmails.length; i++) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(validEmails[i])) {
          errors[`teamEmail${i}`] = "Please enter a valid email address";
        }
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = async () => {
    if (!validateStep(currentStep)) {
      toast({
        variant: "destructive",
        title: "Please complete all required fields",
        description: "Some required information is missing or invalid.",
      });
      return;
    }

    // Step 0: Just validate and move to next step (don't create account yet)
    if (currentStep === 0) {
      // Just move to next step - account creation happens at the end
      setCurrentStep(1);
      setValidationErrors({});
      return;
    }
    
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      setValidationErrors({});
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      const warningMessages: string[] = [];

      // Create account first if not already authenticated
      if (!user) {
        // Retry signup up to 3 times for timeout errors
        let signUpError = null;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            const result = await signUp(formData.account.email, formData.account.password, {
              email: formData.account.email,
              first_name: formData.account.firstName,
              last_name: formData.account.lastName,
            });

            console.log('Signup result:', result);

            if (!result.error) {
              // Success, break out of retry loop
              console.log('Signup successful, breaking retry loop');
              break;
            }

            signUpError = result.error;
            console.error('Signup error on attempt', retryCount + 1, ':', signUpError);

            // Check if it's a retryable error (timeout, 504, network issues, or AuthRetryableFetchError)
            const errorMessage = signUpError.message || '';
            const errorName = signUpError.name || signUpError.constructor?.name || '';
            const isRetryableError =
              errorMessage.includes('timeout') ||
              errorMessage.includes('504') ||
              errorMessage.includes('Gateway') ||
              errorMessage.includes('fetch') ||
              errorName.includes('Retryable') ||
              errorName.includes('FetchError') ||
              errorName === 'AuthRetryableFetchError';

            if (isRetryableError) {
              retryCount++;
              if (retryCount < maxRetries) {
                toast({
                  title: `Retrying signup... (${retryCount}/${maxRetries})`,
                  description: "The signup service is busy. Trying again...",
                });
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
                continue;
              }
            }

            // Not a retryable error, or we've exhausted retries
            break;

          } catch (error: any) {
            signUpError = error;
            // Handle network errors and timeouts
            const catchErrorMessage = error.message || '';
            const catchErrorName = error.name || error.constructor?.name || '';
            const isCatchRetryable =
              catchErrorMessage.includes('fetch') ||
              catchErrorMessage.includes('timeout') ||
              catchErrorMessage.includes('504') ||
              catchErrorName.includes('Retryable') ||
              catchErrorName.includes('FetchError') ||
              catchErrorName === 'AuthRetryableFetchError';

            if (isCatchRetryable) {
              retryCount++;
              if (retryCount < maxRetries) {
                toast({
                  title: `Retrying signup... (${retryCount}/${maxRetries})`,
                  description: "Network issue detected. Trying again...",
                });
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
                continue;
              }
            }
            break;
          }
        }

        if (signUpError) {
          // Handle specific error types with better messaging
          const finalErrorMessage = signUpError.message || '';
          const finalErrorName = signUpError.name || signUpError.constructor?.name || '';
          const isTimeoutError =
            finalErrorMessage.includes('timeout') ||
            finalErrorMessage.includes('504') ||
            finalErrorMessage.includes('Gateway') ||
            finalErrorMessage.includes('network') ||
            finalErrorName.includes('Retryable') ||
            finalErrorName.includes('FetchError') ||
            finalErrorName === 'AuthRetryableFetchError';

          if (isTimeoutError) {
            toast({
              variant: "destructive",
              title: "Connection timeout",
              description: "The signup is taking longer than usual. Please try again in a moment.",
            });
          } else if (finalErrorMessage.includes('rate limit') || finalErrorMessage.includes('too many')) {
            toast({
              variant: "destructive",
              title: "Too many attempts",
              description: "Please wait a few minutes before trying again.",
            });
          } else if (finalErrorMessage.includes('email') && finalErrorMessage.includes('already')) {
            toast({
              variant: "destructive",
              title: "Email already registered",
              description: "This email address is already associated with an account. Please try signing in instead.",
            });
          } else {
            // Log the actual error for debugging
            console.error('Signup error details:', signUpError);
            toast({
              variant: "destructive",
              title: "Account creation failed",
              description: finalErrorMessage || "Unable to create your account. Please check your information and try again.",
            });
          }
          return;
        }

        // Wait for auth state to update with retry logic
        let sessionRetries = 0;
        const maxSessionRetries = 5;
        let session = null;
        
        while (sessionRetries < maxSessionRetries) {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            console.error('Session error:', sessionError);
          }
          if (sessionData?.session?.user) {
            session = sessionData.session;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
          sessionRetries++;
        }

        if (!session?.user) {
          // Try one more time with getUser
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (!currentUser) {
            toast({
              title: "Email verification required",
              description: "Please check your email to verify your account, then refresh this page to continue.",
            });
            return;
          }
        }
      }

      // Get current user (should be authenticated now)
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        throw new Error('User not authenticated. Please try again.');
      }

      // Check if user already has an organization (created by trigger)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', currentUser.id)
        .single();

      let orgData;
      if (existingProfile?.organization_id) {
        // Update existing organization created by trigger
        const { data: updatedOrg, error: updateError } = await supabase
          .from('organizations')
          .update({
            name: formData.organization.name,
            type: formData.organization.type,
            description: formData.organization.description,
            address: formData.organization.address,
            state: formData.organization.state,
            country: formData.organization.country,
            phone: formData.organization.phone,
            email: formData.organization.email,
          })
          .eq('id', existingProfile.organization_id)
          .select()
          .single();

        if (updateError) throw updateError;
        orgData = updatedOrg;
      } else {
        // Create new organization if trigger didn't create one
        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: formData.organization.name,
            type: formData.organization.type,
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
        orgData = newOrg;
      }

      // Update user profile with organization and user details (default to superadmin for onboarding)
      // Ensure first_name and last_name are saved even if trigger didn't capture them
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          organization_id: orgData.id,
          role: 'superadmin',
          first_name: formData.account.firstName || currentUser.user_metadata?.first_name || null,
          last_name: formData.account.lastName || currentUser.user_metadata?.last_name || null,
        })
        .eq('user_id', currentUser.id);

      if (profileError) throw profileError;

      // Seed default permissions for the superadmin role in this organization
      try {
        const resources = ['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks', 'settings', 'users'];
        const actions = ['create', 'read', 'update', 'delete', 'manage'];

        const permissionsToInsert = resources.flatMap(resource =>
          actions.map(action => ({
            role_name: 'superadmin',
            organization_id: orgData.id,
            resource,
            action,
            granted: true,
            created_by: currentUser.id,
          }))
        );

        const { error: permError } = await supabase
          .from('role_permissions')
          .upsert(permissionsToInsert, {
            onConflict: 'role_name,organization_id,resource,action',
            ignoreDuplicates: true,
          });

        if (permError) {
          console.warn('Failed to seed permissions:', permError);
          // Non-fatal - continue with onboarding
        }
      } catch (permSeedError) {
        console.warn('Error seeding permissions:', permSeedError);
        // Non-fatal - continue with onboarding
      }

      const inviteEmails = formData.team.inviteEmails
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      if (inviteEmails.length > 0) {
        let inviterName = currentUser.email ?? 'Team member';

        try {
          const { data: profileDetails, error: profileDetailsError } = await supabase
            .from('profiles')
            .select('first_name,last_name')
            .eq('user_id', currentUser.id)
            .single();

          if (profileDetailsError) throw profileDetailsError;

          if (profileDetails) {
            inviterName = buildDisplayName(
              (profileDetails as any)?.first_name ?? null,
              (profileDetails as any)?.last_name ?? null,
              currentUser.email ?? undefined
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
                const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-invitation-email', {
                  body: {
                    email,
                    firstName: email.split('@')[0],
                    lastName: 'User',
                    role: 'user',
                    organizationName: orgData.name,
                    inviterName,
                    invitationUrl,
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

      // Mark onboarding steps as complete
      try {
        await markStepComplete.mutateAsync({
          stepName: 'organization_setup',
          metadata: {
            orgName: formData.organization.name,
            orgSize: formData.organization.size,
            practiceAreas: formData.practiceAreas,
          },
        });
      } catch (stepError) {
        console.warn('Failed to mark onboarding step complete:', stepError);
      }

      // Track onboarding completion and send welcome notification
      trackEvent(AnalyticsEvents.ONBOARDING_COMPLETED, { 
        orgSize: formData.organization.size,
        practiceAreas: formData.practiceAreas.length 
      });
      identifyUser(currentUser.id, orgData.id);
      
      // Create welcome notification
      await createOnboardingNotification(formData.organization.name);

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
    } finally {
      setIsSubmitting(false);
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
      case 0:
        return (
          <div className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Create your account to get started with email and password.
              </AlertDescription>
            </Alert>

            <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2.5">
                    <Label htmlFor="firstName" className="text-sm font-medium">First Name *</Label>
                    <div className="relative">
                      <User className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="firstName"
                        name="firstName"
                        autoComplete="given-name"
                        placeholder="John"
                        className={`pl-12 h-12 text-base ${validationErrors.firstName ? 'border-destructive' : ''}`}
                        value={formData.account.firstName}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            account: { ...formData.account, firstName: e.target.value }
                          });
                          if (validationErrors.firstName) {
                            setValidationErrors({ ...validationErrors, firstName: '' });
                          }
                        }}
                        required
                      />
                    </div>
                    {validationErrors.firstName && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {validationErrors.firstName}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="lastName" className="text-sm font-medium">Last Name *</Label>
                    <div className="relative">
                      <User className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="lastName"
                        name="lastName"
                        autoComplete="family-name"
                        placeholder="Doe"
                        className={`pl-12 h-12 text-base ${validationErrors.lastName ? 'border-destructive' : ''}`}
                        value={formData.account.lastName}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            account: { ...formData.account, lastName: e.target.value }
                          });
                          if (validationErrors.lastName) {
                            setValidationErrors({ ...validationErrors, lastName: '' });
                          }
                        }}
                        required
                      />
                    </div>
                    {validationErrors.lastName && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {validationErrors.lastName}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="email" className="text-sm font-medium">Work Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="john@example.com"
                      className={`pl-12 h-12 text-base ${validationErrors.email ? 'border-destructive' : ''}`}
                      autoComplete="email"
                      value={formData.account.email}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          account: { ...formData.account, email: e.target.value }
                        });
                        if (validationErrors.email) {
                          setValidationErrors({ ...validationErrors, email: '' });
                        }
                      }}
                      required
                    />
                  </div>
                  {validationErrors.email && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {validationErrors.email}
                    </p>
                  )}
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2.5">
                    <Label htmlFor="password" className="text-sm font-medium">Password *</Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Create a password"
                        className={`pl-12 pr-12 h-12 text-base ${validationErrors.password ? 'border-destructive' : ''}`}
                        autoComplete="new-password"
                        value={formData.account.password}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            account: { ...formData.account, password: e.target.value }
                          });
                          if (validationErrors.password) {
                            setValidationErrors({ ...validationErrors, password: '' });
                          }
                        }}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-4 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <Eye className="h-5 w-5 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    {validationErrors.password && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {validationErrors.password}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password *</Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm your password"
                        className={`pl-12 pr-12 h-12 text-base ${validationErrors.confirmPassword ? 'border-destructive' : ''}`}
                        autoComplete="new-password"
                        value={formData.account.confirmPassword}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            account: { ...formData.account, confirmPassword: e.target.value }
                          });
                          if (validationErrors.confirmPassword) {
                            setValidationErrors({ ...validationErrors, confirmPassword: '' });
                          }
                        }}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-4 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <Eye className="h-5 w-5 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    {validationErrors.confirmPassword && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {validationErrors.confirmPassword}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/40 p-5 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground mb-3">What happens next?</p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>Verify your email to activate the account.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>Complete onboarding to set up your organization.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>Invite teammates when you&apos;re ready.</span>
                    </li>
                  </ul>
                </div>
          </div>
        );
        
      case 1:
        return (
          <div className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                This information helps us customize your experience. You can update these details later in Settings.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name *</Label>
              <Input
                id="orgName"
                placeholder="Enter your organization name"
                value={formData.organization.name}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    organization: { ...formData.organization, name: e.target.value }
                  });
                  if (validationErrors.orgName) {
                    setValidationErrors({ ...validationErrors, orgName: '' });
                  }
                }}
                className={validationErrors.orgName ? 'border-destructive' : ''}
                required
              />
              {validationErrors.orgName && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.orgName}
                </p>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Organization Type *</Label>
                <Select
                  value={formData.organization.type}
                  onValueChange={(value) => {
                    setFormData({
                      ...formData,
                      organization: { ...formData.organization, type: value }
                    });
                    if (validationErrors.orgType) {
                      setValidationErrors({ ...validationErrors, orgType: '' });
                    }
                  }}
                >
                  <SelectTrigger className={validationErrors.orgType ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select organization type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="law-firm">Law Firm</SelectItem>
                    <SelectItem value="solo-practitioner">Solo Practitioner</SelectItem>
                    <SelectItem value="legal-clinic">Legal Clinic</SelectItem>
                    <SelectItem value="corporate-legal-dept">Corporate Legal Department</SelectItem>
                    <SelectItem value="government-agency">Government Agency</SelectItem>
                    <SelectItem value="non-profit">Non-Profit Organization</SelectItem>
                    <SelectItem value="academic-institution">Academic Institution</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {validationErrors.orgType && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.orgType}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Organization Size *</Label>
                <Select 
                  value={formData.organization.size}
                  onValueChange={(value) => {
                    setFormData({
                      ...formData,
                      organization: { ...formData.organization, size: value }
                    });
                    if (validationErrors.orgSize) {
                      setValidationErrors({ ...validationErrors, orgSize: '' });
                    }
                  }}
                >
                  <SelectTrigger className={validationErrors.orgSize ? 'border-destructive' : ''}>
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
                {validationErrors.orgSize && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.orgSize}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="orgAddress">Business Address *</Label>
              <Input
                id="orgAddress"
                placeholder="Enter your business address"
                value={formData.organization.address}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    organization: { ...formData.organization, address: e.target.value }
                  });
                  if (validationErrors.orgAddress) {
                    setValidationErrors({ ...validationErrors, orgAddress: '' });
                  }
                }}
                className={validationErrors.orgAddress ? 'border-destructive' : ''}
                required
              />
              {validationErrors.orgAddress && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.orgAddress}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orgState">State/Province *</Label>
                <Input
                  id="orgState"
                  placeholder="Enter state or province"
                  value={formData.organization.state}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      organization: { ...formData.organization, state: e.target.value }
                    });
                    if (validationErrors.orgState) {
                      setValidationErrors({ ...validationErrors, orgState: '' });
                    }
                  }}
                  className={validationErrors.orgState ? 'border-destructive' : ''}
                  required
                />
                {validationErrors.orgState && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.orgState}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Country *</Label>
                <Select 
                  value={formData.organization.country}
                  onValueChange={(value) => {
                    setFormData({
                      ...formData,
                      organization: { ...formData.organization, country: value }
                    });
                    if (validationErrors.orgCountry) {
                      setValidationErrors({ ...validationErrors, orgCountry: '' });
                    }
                  }}
                >
                  <SelectTrigger className={validationErrors.orgCountry ? 'border-destructive' : ''}>
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
                {validationErrors.orgCountry && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.orgCountry}
                  </p>
                )}
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
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      organization: { ...formData.organization, phone: e.target.value }
                    });
                    if (validationErrors.orgPhone) {
                      setValidationErrors({ ...validationErrors, orgPhone: '' });
                    }
                  }}
                  className={validationErrors.orgPhone ? 'border-destructive' : ''}
                  required
                />
                {validationErrors.orgPhone && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.orgPhone}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="orgEmail">Organization Email *</Label>
                <Input
                  id="orgEmail"
                  type="email"
                  placeholder="contact@yourfirm.com"
                  value={formData.organization.email}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      organization: { ...formData.organization, email: e.target.value }
                    });
                    if (validationErrors.orgEmail) {
                      setValidationErrors({ ...validationErrors, orgEmail: '' });
                    }
                  }}
                  className={validationErrors.orgEmail ? 'border-destructive' : ''}
                  required
                />
                {validationErrors.orgEmail && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.orgEmail}
                  </p>
                )}
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
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                You can skip this step and invite team members later. Invitations will be sent via email.
              </AlertDescription>
            </Alert>
            
            <div>
              <Label className="text-base font-medium">Invite Team Members (Optional)</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Add email addresses to invite your team members. They'll receive an invitation email with setup instructions.
              </p>
              
              <div className="space-y-3">
                {formData.team.inviteEmails.map((email, index) => (
                  <div key={index} className="space-y-1">
                    <Input
                      type="email"
                      placeholder="colleague@example.com"
                      value={email}
                      onChange={(e) => {
                        updateEmail(index, e.target.value);
                        if (validationErrors[`teamEmail${index}`]) {
                          setValidationErrors({ ...validationErrors, [`teamEmail${index}`]: '' });
                        }
                      }}
                      className={validationErrors[`teamEmail${index}`] ? 'border-destructive' : ''}
                    />
                    {validationErrors[`teamEmail${index}`] && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {validationErrors[`teamEmail${index}`]}
                      </p>
                    )}
                  </div>
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
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Select all practice areas that apply to your organization. This helps us customize features and templates for you.
              </AlertDescription>
            </Alert>
            
            <div>
              <Label className="text-base font-medium">Practice Areas (Optional)</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Select the practice areas relevant to your organization. You can add more later.
              </p>
              
              {formData.practiceAreas.length > 0 && (
                <div className="mb-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <p className="text-sm font-medium text-primary mb-1">
                    {formData.practiceAreas.length} practice area{formData.practiceAreas.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-3">
                {practiceAreaOptions.map((area) => (
                  <div key={area} className="flex items-center space-x-2">
                    <Checkbox
                      id={area}
                      checked={formData.practiceAreas.includes(area)}
                      onCheckedChange={() => togglePracticeArea(area)}
                    />
                    <Label htmlFor={area} className="text-sm font-normal cursor-pointer">
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
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-5xl shadow-card border border-border/60">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <AppLogo size="md" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Welcome to Kourti Legal</CardTitle>
            <p className="text-muted-foreground">
              Let&apos;s get your workspace ready in just a few steps.
            </p>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid gap-8 lg:grid-cols-[260px,1fr]">
            <aside className="space-y-6 rounded-xl border border-border/60 bg-muted/40 p-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Progress</p>
                <div className="mt-2 space-y-2">
                  <Progress value={progress} className="w-full" />
                  <p className="text-xs text-muted-foreground">
                    Step {currentStep} of {steps.length}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {steps.map((step) => {
                  const Icon = step.icon;
                  const isActive = step.id === currentStep;
                  const isComplete = step.id < currentStep;
                  return (
                    <div
                      key={step.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${
                        isActive
                          ? "border-primary/50 bg-primary/5 text-foreground"
                          : isComplete
                          ? "border-border/60 bg-background text-muted-foreground"
                          : "border-border/30 bg-background/60 text-muted-foreground"
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full ${
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : isComplete
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{step.title}</p>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>

            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">{steps[currentStep - 1]?.title}</h2>
                <p className="text-sm text-muted-foreground">{steps[currentStep - 1]?.description}</p>
              </div>

              {renderStepContent()}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-x-2">
                  {currentStep === 0 ? (
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

                {currentStep === steps.length - 1 ? (
                  <Button onClick={handleFinish} disabled={isSubmitting} className="min-w-[120px]">
                    {isSubmitting ? "Creating Account..." : "Get Started"}
                    {isSubmitting ? (
                      <div className="w-4 h-4 ml-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <CheckCircle className="w-4 h-4 ml-2" />
                    )}
                  </Button>
                ) : (
                  <Button onClick={handleNext} className="min-w-[120px]">
                    Continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
