import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logError, logWarn } from '@/lib/logger';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Building,
  Users,
  FileText,
  CreditCard,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { getSession } from '@/lib/authClient';
import { invokeNodeApi } from '@/lib/backendApi';
import { buildDisplayName, getAuthRedirectUrl } from '@/utils/auth-helpers';
import { env } from '@/lib/env';
import { AppLogo } from '@/components/ui/AppLogo';
import { useNotificationTriggers } from '@/hooks/useNotificationTriggers';
import { trackEvent, AnalyticsEvents, identifyUser } from '@/lib/analytics';
import { useOnboardingSteps } from '@/hooks/useOnboardingSteps';
import { AlertCircle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmailOtpChallenge } from '@/components/auth/EmailOtpChallenge';
import type { MfaRequiredResponse } from '@/lib/authClient';
import { useStartTrial } from '@/hooks/useTrialStatus';

const steps = [
  {
    id: 0,
    title: 'Account Basics',
    description: 'Just the essentials to get you started',
    icon: User,
  },
  {
    id: 1,
    title: 'Verify Email',
    description: 'Confirm your email to continue',
    icon: ShieldCheck,
  },
  {
    id: 2,
    title: 'Organization Setup',
    description: 'Tell us about your organization',
    icon: Building,
  },
  {
    id: 3,
    title: 'Team Configuration',
    description: 'Invite teammates (optional)',
    icon: Users,
  },
  {
    id: 4,
    title: 'Practice Areas',
    description: 'Configure your practice areas (optional)',
    icon: FileText,
  },
  {
    id: 5,
    title: 'Choose Your Plan',
    description: 'Start your trial or subscribe',
    icon: CreditCard,
  },
];

const ACCOUNT_STEP = 0;
const VERIFY_STEP = 1;
const ORG_STEP = 2;
const TEAM_STEP = 3;
const PRACTICE_STEP = 4;
const PLAN_STEP = 5;

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
  { value: 'CI', label: "Côte d'Ivoire" },
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
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startTrial = useStartTrial();
  const [mfa, setMfa] = useState<MfaRequiredResponse | null>(null);

  const [formData, setFormData] = useState({
    account: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptedTerms: false,
    },
    organization: {
      name: '',
      type: '',
      size: '',
      description: '',
      address: '',
      state: '',
      country: '',
      phone: '',
      email: '',
    },
    team: {
      inviteEmails: [''],
      defaultRoles: [] as string[],
    },
    practiceAreas: [] as string[],
  });

  const { user, signUp } = useAuth();
  const navigate = useNavigate();
  const { createOnboardingNotification } = useNotificationTriggers();
  const { markStepComplete } = useOnboardingSteps();

  // If user is already authenticated (e.g., refreshed mid-flow after verifying email),
  // skip past account-creation + verify and resume at organization setup.
  useEffect(() => {
    if (user && currentStep <= VERIFY_STEP) {
      const firstName = (user.user_metadata?.first_name || user.user_metadata?.firstName) as
        | string
        | undefined;
      const lastName = (user.user_metadata?.last_name || user.user_metadata?.lastName) as
        | string
        | undefined;
      setFormData((prev) => ({
        ...prev,
        account: {
          ...prev.account,
          firstName: firstName || prev.account.firstName,
          lastName: lastName || prev.account.lastName,
          email: user.email || prev.account.email,
          password: '',
          confirmPassword: '',
        },
      }));
      setCurrentStep(ORG_STEP);
    }
  }, [user, currentStep]);

  const practiceAreaOptions = [
    'Corporate Law',
    'Litigation',
    'Real Estate',
    'Employment Law',
    'Intellectual Property',
    'Family Law',
    'Criminal Law',
    'Tax Law',
    'Immigration Law',
    'Environmental Law',
    'Banking & Finance',
    'Healthcare Law',
    'Insurance Law',
    'International Law',
    'Contract Law',
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;

  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {};

    if (step === 0) {
      if (!formData.account.firstName.trim()) {
        errors.firstName = 'First name is required';
      }
      if (!formData.account.lastName.trim()) {
        errors.lastName = 'Last name is required';
      }
      if (!formData.account.email.trim()) {
        errors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.account.email)) {
        errors.email = 'Please enter a valid email address';
      }
      if (!formData.account.password) {
        errors.password = 'Password is required';
      } else if (formData.account.password.length < 12) {
        errors.password = 'Password must be at least 12 characters';
      }
      if (formData.account.password !== formData.account.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }
      if (!formData.account.acceptedTerms) {
        errors.acceptedTerms =
          'You must accept the Terms of Service and Privacy Policy to continue';
      }
    }

    if (step === ORG_STEP) {
      if (!formData.organization.name.trim()) {
        errors.orgName = 'Organization name is required';
      }
      if (!formData.organization.type) {
        errors.orgType = 'Organization type is required';
      }
      if (!formData.organization.size) {
        errors.orgSize = 'Organization size is required';
      }
      if (!formData.organization.address.trim()) {
        errors.orgAddress = 'Business address is required';
      }
      if (!formData.organization.state.trim()) {
        errors.orgState = 'State/Province is required';
      }
      if (!formData.organization.country) {
        errors.orgCountry = 'Country is required';
      }
      if (!formData.organization.phone.trim()) {
        errors.orgPhone = 'Phone number is required';
      }
      if (!formData.organization.email.trim()) {
        errors.orgEmail = 'Organization email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.organization.email)) {
        errors.orgEmail = 'Please enter a valid email address';
      }
    }

    if (step === TEAM_STEP) {
      // Team step is optional, but validate emails if provided
      const validEmails = formData.team.inviteEmails.filter((email) => email.trim());
      for (let i = 0; i < validEmails.length; i++) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(validEmails[i])) {
          errors[`teamEmail${i}`] = 'Please enter a valid email address';
        }
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const runSignUpWithRetry = async () => {
    let signUpError: {
      message?: string;
      name?: string;
      constructor?: { name?: string };
    } | null = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        const result = await signUp(formData.account.email, formData.account.password, {
          email: formData.account.email,
          first_name: formData.account.firstName,
          last_name: formData.account.lastName,
        });

        if (!result.error) {
          return { ok: true as const, mfa: result.mfa ?? null };
        }

        signUpError = result.error;
        logError(`Signup error on attempt ${retryCount + 1}`, signUpError);

        const errorMessage = signUpError.message || '';
        const errorName = signUpError.name || signUpError.constructor?.name || '';
        const isRetryable =
          errorMessage.includes('timeout') ||
          errorMessage.includes('504') ||
          errorMessage.includes('Gateway') ||
          errorMessage.includes('fetch') ||
          errorName.includes('Retryable') ||
          errorName.includes('FetchError') ||
          errorName === 'AuthRetryableFetchError';

        if (isRetryable && retryCount + 1 < maxRetries) {
          retryCount++;
          toast.success(`Retrying signup... (${retryCount}/${maxRetries})`, {
            description: 'The signup service is busy. Trying again...',
          });
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
          continue;
        }
        break;
      } catch (error: unknown) {
        signUpError = error instanceof Error ? error : { message: String(error) };
        const msg = error instanceof Error ? error.message : '';
        const nm = error instanceof Error ? error.name || error.constructor?.name || '' : '';
        const isRetryable =
          msg.includes('fetch') ||
          msg.includes('timeout') ||
          msg.includes('504') ||
          nm.includes('Retryable') ||
          nm.includes('FetchError') ||
          nm === 'AuthRetryableFetchError';

        if (isRetryable && retryCount + 1 < maxRetries) {
          retryCount++;
          toast.success(`Retrying signup... (${retryCount}/${maxRetries})`, {
            description: 'Network issue detected. Trying again...',
          });
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
          continue;
        }
        break;
      }
    }

    return { ok: false as const, error: signUpError };
  };

  const reportSignUpError = (
    signUpError: { message?: string; name?: string; constructor?: { name?: string } } | null
  ) => {
    const finalErrorMessage = signUpError?.message || '';
    const finalErrorName = signUpError?.name || signUpError?.constructor?.name || '';
    const isTimeoutError =
      finalErrorMessage.includes('timeout') ||
      finalErrorMessage.includes('504') ||
      finalErrorMessage.includes('Gateway') ||
      finalErrorMessage.includes('network') ||
      finalErrorName.includes('Retryable') ||
      finalErrorName.includes('FetchError') ||
      finalErrorName === 'AuthRetryableFetchError';

    if (isTimeoutError) {
      toast.error('Connection timeout', {
        description: 'The signup is taking longer than usual. Please try again in a moment.',
      });
    } else if (finalErrorMessage.includes('rate limit') || finalErrorMessage.includes('too many')) {
      toast.error('Too many attempts', {
        description: 'Please wait a few minutes before trying again.',
      });
    } else if (finalErrorMessage.includes('email') && finalErrorMessage.includes('already')) {
      toast.error('Email already registered', {
        description:
          'This email address is already associated with an account. Please try signing in instead.',
      });
    } else {
      logError('Signup error details', signUpError);
      toast.error('Account creation failed', {
        description:
          finalErrorMessage ||
          'Unable to create your account. Please check your information and try again.',
      });
    }
  };

  const handleNext = async () => {
    if (!validateStep(currentStep)) {
      toast.error('Please complete all required fields', {
        description: 'Some required information is missing or invalid.',
      });
      return;
    }

    // Step 0 → Verify: create the account so OTP can fire immediately.
    if (currentStep === ACCOUNT_STEP) {
      if (user) {
        // Already authenticated (e.g., returning mid-flow). Skip straight to org.
        setCurrentStep(ORG_STEP);
        setValidationErrors({});
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await runSignUpWithRetry();
        if (!result.ok) {
          reportSignUpError(result.error);
          return;
        }
        if (result.mfa) {
          setMfa(result.mfa);
          setCurrentStep(VERIFY_STEP);
          setValidationErrors({});
          return;
        }
        // No MFA required — verification already complete server-side.
        setFormData((prev) => ({
          ...prev,
          account: { ...prev.account, password: '', confirmPassword: '' },
        }));
        setCurrentStep(ORG_STEP);
        setValidationErrors({});
      } finally {
        setIsSubmitting(false);
      }
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

  const handleFinish = async (finishMode: 'trial' | 'subscribe' = 'trial') => {
    setIsSubmitting(true);
    try {
      const warningMessages: string[] = [];

      // Account creation + OTP verification already happened at step 0 → step 1,
      // so by the time we reach the plan step a session must already exist.
      const session = getSession();
      const currentUser = session?.user;
      if (!currentUser) {
        toast.error('Session expired', {
          description: 'Please sign in again to finish setting up your workspace.',
        });
        navigate('/auth', { replace: true });
        return;
      }

      // Complete onboarding via Node backend (handles org creation, profile update, role assignment, permissions)
      const orgData = await invokeNodeApi<{ id: string; name: string }>(
        '/api/v1/onboarding/complete',
        {
          method: 'POST',
          body: {
            organization: {
              name: formData.organization.name,
              type: formData.organization.type,
              description: formData.organization.description,
              address: formData.organization.address,
              state: formData.organization.state,
              country: formData.organization.country,
              phone: formData.organization.phone,
              email: formData.organization.email,
            },
            profile: {
              firstName: formData.account.firstName,
              lastName: formData.account.lastName,
            },
          },
        }
      );

      // Start the 7-day trial BEFORE sending invites: the trial subscription
      // grants the seat allowance that invite enforcement checks against, so
      // inviting before it exists would be rejected (no seats). Idempotent on
      // the backend — a second call just returns the existing sub.
      try {
        await startTrial.mutateAsync();
      } catch (trialErr) {
        logWarn('Failed to start trial after onboarding', { trialErr });
      }

      const inviteEmails = formData.team.inviteEmails
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      if (inviteEmails.length > 0) {
        let inviterName = currentUser.email ?? 'Team member';

        try {
          inviterName = buildDisplayName(
            formData.account.firstName || null,
            formData.account.lastName || null,
            currentUser.email ?? undefined
          );
        } catch (profileDetailsError: unknown) {
          warningMessages.push(
            profileDetailsError instanceof Error && profileDetailsError.message
              ? `Unable to load your profile details for invitations: ${profileDetailsError.message}`
              : 'Unable to load your profile details for invitations.'
          );
        }

        let invitationUrl: string | null = null;
        try {
          invitationUrl = getAuthRedirectUrl('/auth', env.APP_URL);
        } catch (invitationUrlError: unknown) {
          warningMessages.push(
            invitationUrlError instanceof Error && invitationUrlError.message
              ? `Could not generate invitation link: ${invitationUrlError.message}`
              : 'Could not generate invitation link for team invites.'
          );
        }

        if (invitationUrl) {
          for (const email of inviteEmails) {
            try {
              await invokeNodeApi('/api/v1/invitations/invite', {
                method: 'POST',
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
            } catch (inviteError: unknown) {
              warningMessages.push(
                inviteError instanceof Error && inviteError.message
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
        logWarn('Failed to mark onboarding step complete', { stepError });
      }

      // Track onboarding completion and send welcome notification
      trackEvent(AnalyticsEvents.ONBOARDING_COMPLETED, {
        orgSize: formData.organization.size,
        practiceAreas: formData.practiceAreas.length,
      });
      identifyUser(currentUser.id, orgData.id);

      // Create welcome notification
      await createOnboardingNotification(formData.organization.name);

      toast.success('Onboarding completed!', {
        description: "Welcome to Kourti AI. You're all set to get started.",
      });

      if (warningMessages.length > 0) {
        toast.success('Onboarding completed with warnings', {
          description: warningMessages.join(' '),
        });
      }

      // Invalidate queries to ensure permissions are fresh
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['user-permission'] }),
        queryClient.invalidateQueries({ queryKey: ['role-permissions'] }),
        queryClient.invalidateQueries({ queryKey: ['user-organization'] }),
      ]);

      navigate(finishMode === 'subscribe' ? '/pricing' : '/dashboard', { replace: true });
    } catch (error: unknown) {
      toast.error('Error', {
        description:
          error instanceof Error
            ? error.message
            : 'Failed to complete onboarding. Please try again.',
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
        inviteEmails: [...formData.team.inviteEmails, ''],
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
      ? formData.practiceAreas.filter((a) => a !== area)
      : [...formData.practiceAreas, area];
    setFormData({ ...formData, practiceAreas: newAreas });
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case ACCOUNT_STEP:
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
                <Label htmlFor="firstName" className="text-sm font-medium">
                  First Name *
                </Label>
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
                        account: { ...formData.account, firstName: e.target.value },
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
                <Label htmlFor="lastName" className="text-sm font-medium">
                  Last Name *
                </Label>
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
                        account: { ...formData.account, lastName: e.target.value },
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
              <Label htmlFor="email" className="text-sm font-medium">
                Work Email *
              </Label>
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
                      account: { ...formData.account, email: e.target.value },
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
                <Label htmlFor="password" className="text-sm font-medium">
                  Password *
                </Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password"
                    className={`pl-12 pr-12 h-12 text-base ${validationErrors.password ? 'border-destructive' : ''}`}
                    autoComplete="new-password"
                    value={formData.account.password}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        account: { ...formData.account, password: e.target.value },
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
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm Password *
                </Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    className={`pl-12 pr-12 h-12 text-base ${validationErrors.confirmPassword ? 'border-destructive' : ''}`}
                    autoComplete="new-password"
                    value={formData.account.confirmPassword}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        account: { ...formData.account, confirmPassword: e.target.value },
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
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
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

            <div className="space-y-2.5">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="acceptedTerms"
                  className="mt-0.5"
                  checked={formData.account.acceptedTerms}
                  onCheckedChange={(checked) => {
                    setFormData({
                      ...formData,
                      account: { ...formData.account, acceptedTerms: checked === true },
                    });
                    if (validationErrors.acceptedTerms) {
                      setValidationErrors({ ...validationErrors, acceptedTerms: '' });
                    }
                  }}
                />
                <Label
                  htmlFor="acceptedTerms"
                  className="text-sm font-normal leading-relaxed cursor-pointer text-muted-foreground"
                >
                  I agree to the{' '}
                  <a
                    href="https://kourti.com/terms-of-use"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:no-underline"
                  >
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a
                    href="https://kourti.com/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:no-underline"
                  >
                    Privacy Policy
                  </a>
                  .
                </Label>
              </div>
              {validationErrors.acceptedTerms && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.acceptedTerms}
                </p>
              )}
            </div>
          </div>
        );

      case VERIFY_STEP:
        return (
          <div className="space-y-6">
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                We sent a 6-digit code to{' '}
                <span className="font-medium">{formData.account.email}</span>. Enter it to confirm
                your email and continue setting up your workspace.
              </AlertDescription>
            </Alert>
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              {mfa
                ? 'Verification panel open — enter your code above.'
                : "Didn't get a code? Go back and re-submit your details."}
            </div>
          </div>
        );

      case ORG_STEP:
        return (
          <div className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                This information helps us customize your experience. You can update these details
                later in Settings.
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
                    organization: { ...formData.organization, name: e.target.value },
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Organization Type *</Label>
                <Select
                  value={formData.organization.type}
                  onValueChange={(value) => {
                    setFormData({
                      ...formData,
                      organization: { ...formData.organization, type: value },
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
                      organization: { ...formData.organization, size: value },
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
                    organization: { ...formData.organization, address: e.target.value },
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orgState">State/Province *</Label>
                <Input
                  id="orgState"
                  placeholder="Enter state or province"
                  value={formData.organization.state}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      organization: { ...formData.organization, state: e.target.value },
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
                      organization: { ...formData.organization, country: value },
                    });
                    if (validationErrors.orgCountry) {
                      setValidationErrors({ ...validationErrors, orgCountry: '' });
                    }
                  }}
                >
                  <SelectTrigger
                    className={validationErrors.orgCountry ? 'border-destructive' : ''}
                  >
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      organization: { ...formData.organization, phone: e.target.value },
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
                      organization: { ...formData.organization, email: e.target.value },
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
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    organization: { ...formData.organization, description: e.target.value },
                  })
                }
              />
            </div>
          </div>
        );

      case TEAM_STEP:
        return (
          <div className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                You can skip this step and invite team members later. Invitations will be sent via
                email.
              </AlertDescription>
            </Alert>

            <div>
              <Label className="text-base font-medium">Invite Team Members (Optional)</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Add email addresses to invite your team members. They'll receive an invitation email
                with setup instructions.
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
                <Button type="button" variant="outline" onClick={addEmailField} className="w-full">
                  Add Another Email
                </Button>
              </div>
            </div>
          </div>
        );

      case PRACTICE_STEP:
        return (
          <div className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Select all practice areas that apply to your organization. This helps us customize
                features and templates for you.
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
                    {formData.practiceAreas.length} practice area
                    {formData.practiceAreas.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      case PLAN_STEP:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <CreditCard className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-2xl font-semibold">Choose how to get going</h3>
              <p className="text-muted-foreground">
                Start with a free trial, or jump straight to a paid plan.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-left">
              <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-5 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  Recommended
                </p>
                <h4 className="text-lg font-semibold">7-day free trial</h4>
                <p className="text-sm text-muted-foreground">
                  Full access to every feature for 7 days. No card required — you can subscribe
                  anytime from billing.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-5 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Paid plan
                </p>
                <h4 className="text-lg font-semibold">Subscribe now</h4>
                <p className="text-sm text-muted-foreground">
                  Skip the trial and pick a plan — we&apos;ll take you to checkout next.
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (mfa && mfa.method === 'email_otp') {
    return (
      <EmailOtpChallenge
        mfaToken={mfa.mfaToken}
        emailHint={mfa.emailHint ?? formData.account.email}
        purpose="signup"
        onSuccess={() => {
          setMfa(null);
          // Drop the plaintext password from React state now that the
          // account exists and is verified — there's no reason to keep
          // it readable for the rest of the flow.
          setFormData((prev) => ({
            ...prev,
            account: { ...prev.account, password: '', confirmPassword: '' },
          }));
          setCurrentStep(ORG_STEP);
        }}
        onCancel={() => {
          setMfa(null);
          setCurrentStep(ACCOUNT_STEP);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-5xl shadow-card border border-border/60">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <AppLogo size="md" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Welcome to Kourti AI</CardTitle>
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
                    Step {currentStep + 1} of {steps.length}
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
                          ? 'border-primary/50 bg-primary/5 text-foreground'
                          : isComplete
                            ? 'border-border/60 bg-background text-muted-foreground'
                            : 'border-border/30 bg-background/60 text-muted-foreground'
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : isComplete
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted text-muted-foreground'
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
                <h2 className="text-xl font-semibold">{steps[currentStep]?.title}</h2>
                <p className="text-sm text-muted-foreground">{steps[currentStep]?.description}</p>
              </div>

              {renderStepContent()}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-x-2">
                  {currentStep === ACCOUNT_STEP ? (
                    <Button variant="outline" onClick={() => navigate('/auth')}>
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Login
                    </Button>
                  ) : currentStep === VERIFY_STEP ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMfa(null);
                        setCurrentStep(ACCOUNT_STEP);
                      }}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Edit details
                    </Button>
                  ) : currentStep > ORG_STEP ? (
                    <Button variant="outline" onClick={handlePrevious}>
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Previous
                    </Button>
                  ) : null}
                </div>

                {currentStep === VERIFY_STEP ? null : currentStep === PLAN_STEP ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleFinish('subscribe')}
                      disabled={isSubmitting}
                    >
                      Subscribe now
                    </Button>
                    <Button
                      onClick={() => handleFinish('trial')}
                      disabled={isSubmitting}
                      className="min-w-[160px]"
                    >
                      {isSubmitting ? 'Setting up...' : 'Start free trial'}
                      {isSubmitting ? (
                        <div className="w-4 h-4 ml-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <ArrowRight className="w-4 h-4 ml-2" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button onClick={handleNext} className="min-w-[120px]" disabled={isSubmitting}>
                    {isSubmitting && currentStep === ACCOUNT_STEP ? 'Sending code...' : 'Continue'}
                    {!isSubmitting && <ArrowRight className="w-4 h-4 ml-2" />}
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
