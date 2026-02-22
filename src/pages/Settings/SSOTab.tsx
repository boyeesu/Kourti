import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, RefreshCcw, AlertCircle, CheckCircle } from 'lucide-react';
import {
  useOrganizationSsoConfigs,
  useUpsertOrganizationSsoConfig,
  useTestSsoConfig,
} from '@/hooks/useOrganizationSsoConfig';
import { useUserRoleAssignments } from '@/hooks/useUserRoleAssignments';
import { useToast } from '@/hooks/use-toast';

const urlValidator = (value: string | undefined | null) => {
  if (!value) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const googleSchema = z
  .object({
    enabled: z.boolean(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    redirectUri: z.string().optional(),
    domainHint: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.enabled) {
      if (!data.clientId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['clientId'],
          message: 'Client ID is required when enabling Google Workspace SSO.',
        });
      }
      if (!data.redirectUri?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['redirectUri'],
          message: 'Redirect URI is required when enabling Google Workspace SSO.',
        });
      }
    }

    if (data.redirectUri && !urlValidator(data.redirectUri)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['redirectUri'],
        message: 'Enter a valid redirect URI (including https://).',
      });
    }
  });

const microsoftSchema = z
  .object({
    enabled: z.boolean(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    redirectUri: z.string().optional(),
    domainHint: z.string().optional(),
    tenantId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.enabled) {
      if (!data.clientId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['clientId'],
          message: 'Client ID is required when enabling Microsoft Entra ID.',
        });
      }
      if (!data.redirectUri?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['redirectUri'],
          message: 'Redirect URI is required when enabling Microsoft Entra ID.',
        });
      }
      if (!data.tenantId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tenantId'],
          message: 'Tenant ID is required when enabling Microsoft Entra ID.',
        });
      }
    }

    if (data.redirectUri && !urlValidator(data.redirectUri)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['redirectUri'],
        message: 'Enter a valid redirect URI (including https://).',
      });
    }
  });

type GoogleFormValues = z.infer<typeof googleSchema>;
type MicrosoftFormValues = z.infer<typeof microsoftSchema>;

const HelperLabel = ({ label, tooltip }: { label: string; tooltip?: string }) => {
  if (!tooltip) {
    return <span>{label}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger type="button" className="text-muted-foreground">
          <Info className="h-3.5 w-3.5" aria-hidden />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-sm">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

export default function SSOTab() {
  const { data: configs, isLoading } = useOrganizationSsoConfigs();
  const updateMutation = useUpsertOrganizationSsoConfig();
  const testMutation = useTestSsoConfig();
  const [googleSecretStored, setGoogleSecretStored] = useState(false);
  const [microsoftSecretStored, setMicrosoftSecretStored] = useState(false);
  const { toast } = useToast();
  
  // Check if user is superadmin - MUST be before any conditional returns
  const { data: roleData } = useUserRoleAssignments();
  const isSuperAdmin = roleData?.isSuperAdmin || false;

  // Extract Google and Microsoft configs from array
  const googleConfig = configs?.find((c) => c.provider === 'google');
  const microsoftConfig = configs?.find((c) => c.provider === 'microsoft');

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const googleForm = useForm<GoogleFormValues>({
    resolver: zodResolver(googleSchema),
    defaultValues: {
      enabled: false,
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      domainHint: '',
    },
  });

  const microsoftForm = useForm<MicrosoftFormValues>({
    resolver: zodResolver(microsoftSchema),
    defaultValues: {
      enabled: false,
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      domainHint: '',
      tenantId: '',
    },
  });

  useEffect(() => {
    if (googleConfig) {
      googleForm.reset({
        enabled: googleConfig.is_enabled ?? false,
        clientId: googleConfig.client_id ?? '',
        clientSecret: '',
        redirectUri: googleConfig.redirect_uri ?? '',
        domainHint: googleConfig.domain_hint ?? '',
      });
      setGoogleSecretStored(Boolean(googleConfig.has_client_secret));
    }
  }, [googleConfig, googleForm]);

  useEffect(() => {
    if (microsoftConfig) {
      microsoftForm.reset({
        enabled: microsoftConfig.is_enabled ?? false,
        clientId: microsoftConfig.client_id ?? '',
        clientSecret: '',
        redirectUri: microsoftConfig.redirect_uri ?? '',
        domainHint: microsoftConfig.domain_hint ?? '',
        tenantId: microsoftConfig.tenant_id ?? '',
      });
      setMicrosoftSecretStored(Boolean(microsoftConfig.has_client_secret));
    }
  }, [microsoftConfig, microsoftForm]);

  const googleEnabled = googleForm.watch('enabled');
  const microsoftEnabled = microsoftForm.watch('enabled');

  const googleDomainHintHelper = useMemo(
    () =>
      'Restrict access to members of a specific Google Workspace domain (e.g. example.com). Optional but recommended.',
    []
  );
  const microsoftDomainHintHelper = useMemo(
    () =>
      'Provide a preferred domain hint for the Microsoft sign-in page (e.g. contoso.com). Optional.',
    []
  );

  // Test connection handlers
  const handleTestGoogle = async () => {
    if (!googleConfig?.id) {
      toast({
        title: 'Error',
        description: 'Please save your Google Workspace configuration first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await testMutation.mutateAsync(googleConfig.id);
      
      if (result.success) {
        toast({
          title: 'Connection Successful',
          description: result.message,
        });
      } else {
        toast({
          title: 'Configuration Issues',
          description: result.errors?.join(', ') || result.message,
          variant: 'destructive',
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to test Google SSO connection.';
      toast({
        title: 'Test Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleTestMicrosoft = async () => {
    if (!microsoftConfig?.id) {
      toast({
        title: 'Error',
        description: 'Please save your Microsoft Entra ID configuration first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await testMutation.mutateAsync(microsoftConfig.id);
      
      if (result.success) {
        toast({
          title: 'Connection Successful',
          description: result.message,
        });
      } else {
        toast({
          title: 'Configuration Issues',
          description: result.errors?.join(', ') || result.message,
          variant: 'destructive',
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to test Microsoft SSO connection.';
      toast({
        title: 'Test Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  // Show access denied if not superadmin - AFTER all hooks
  if (!isLoading && !isSuperAdmin) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Only super administrators can configure Single Sign-On settings. Contact your organization administrator for access.
        </AlertDescription>
      </Alert>
    );
  }

  const handleGoogleSubmit = async (values: GoogleFormValues) => {
    const trimmed = {
      enabled: values.enabled,
      clientId: values.clientId?.trim() || '',
      clientSecret: values.clientSecret?.trim() || '',
      redirectUri: values.redirectUri?.trim() || '',
      domainHint: values.domainHint?.trim() || undefined,
    };

    if (trimmed.enabled && !trimmed.clientSecret && !googleSecretStored) {
      googleForm.setError('clientSecret', {
        message: 'Client secret is required the first time you enable Google Workspace SSO.',
        type: 'manual',
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: googleConfig?.id,
        provider: 'google',
        clientId: trimmed.clientId,
        clientSecret: trimmed.clientSecret || undefined,
        redirectUri: trimmed.redirectUri,
        domainHint: trimmed.domainHint || undefined,
        isEnabled: trimmed.enabled,
      });

      if (trimmed.clientSecret) {
        setGoogleSecretStored(true);
        googleForm.setValue('clientSecret', '');
      }
      
      toast({
        title: 'Success',
        description: 'Google Workspace SSO configuration saved successfully.',
      });
    } catch (error: unknown) {
      console.error('Google SSO update error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save Google SSO configuration. Please try again.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleMicrosoftSubmit = async (values: MicrosoftFormValues) => {
    const trimmed = {
      enabled: values.enabled,
      clientId: values.clientId?.trim() || '',
      clientSecret: values.clientSecret?.trim() || '',
      redirectUri: values.redirectUri?.trim() || '',
      domainHint: values.domainHint?.trim() || undefined,
      tenantId: values.tenantId?.trim() || '',
    };

    if (trimmed.enabled && !trimmed.clientSecret && !microsoftSecretStored) {
      microsoftForm.setError('clientSecret', {
        message: 'Client secret is required the first time you enable Microsoft Entra ID SSO.',
        type: 'manual',
      });
      return;
    }

    if (trimmed.enabled && !trimmed.tenantId) {
      microsoftForm.setError('tenantId', {
        message: 'Tenant ID is required when enabling Microsoft Entra ID.',
        type: 'manual',
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: microsoftConfig?.id,
        provider: 'microsoft',
        clientId: trimmed.clientId,
        clientSecret: trimmed.clientSecret || undefined,
        redirectUri: trimmed.redirectUri,
        domainHint: trimmed.domainHint || undefined,
        tenantId: trimmed.tenantId,
        isEnabled: trimmed.enabled,
      });

      if (trimmed.clientSecret) {
        setMicrosoftSecretStored(true);
        microsoftForm.setValue('clientSecret', '');
      }
      
      toast({
        title: 'Success',
        description: 'Microsoft Entra ID SSO configuration saved successfully.',
      });
    } catch (error: unknown) {
      console.error('Microsoft SSO update error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save Microsoft SSO configuration. Please try again.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium">Single Sign-On</h3>
          <p className="text-sm text-muted-foreground">
            Connect your identity provider so members of your organization can access Kourti Legal with familiar credentials.
          </p>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Loading SSO configuration...
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Google Workspace</CardTitle>
                <CardDescription>
                  Enable OAuth-based sign-in for users managed in Google Workspace. Collect the credentials from the Google Cloud Console.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...googleForm}>
                  <form onSubmit={googleForm.handleSubmit(handleGoogleSubmit)} className="space-y-6">
                    <FormField
                      control={googleForm.control}
                      name="enabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Enable Google Workspace SSO</FormLabel>
                            <FormDescription>
                              Users will be redirected to Google for authentication when this is enabled.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={googleForm.control}
                        name="clientId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              <HelperLabel
                                label="OAuth Client ID"
                                tooltip="In Google Cloud Console, create an OAuth client under APIs & Services → Credentials. Use the Web application type."
                              />
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="XXXXXXXX.apps.googleusercontent.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={googleForm.control}
                        name="redirectUri"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              <HelperLabel
                                label="Redirect URI"
                                tooltip="Copy the callback URL provided by Kourti Legal into the Authorized redirect URIs list in Google Cloud."
                              />
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="https://app.example.com/auth/google/callback" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={googleForm.control}
                      name="clientSecret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <HelperLabel
                              label="Client Secret"
                              tooltip="Download the credentials JSON from Google Cloud and paste the client secret here."
                            />
                          </FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input
                                type="password"
                                placeholder={googleSecretStored ? 'Stored securely — enter a new secret to rotate' : 'Paste the client secret'}
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                className="whitespace-nowrap"
                                onClick={() => {
                                  googleForm.setValue('clientSecret', '');
                                  setGoogleSecretStored(false);
                                }}
                              >
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                Rotate
                              </Button>
                            </div>
                          </FormControl>
                          {googleSecretStored && (
                            <FormDescription>
                              A client secret is already stored. Provide a new secret only when you want to rotate credentials.
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={googleForm.control}
                      name="domainHint"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <HelperLabel label="Domain Hint" tooltip={googleDomainHintHelper} />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="example.com" {...field} />
                          </FormControl>
                          <FormDescription>
                            Optional. Restrict sign-in to a single Google Workspace domain.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={googleEnabled ? 'default' : 'outline'}>
                        {googleEnabled ? 'SSO Enabled' : 'SSO Disabled'}
                      </Badge>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleTestGoogle}
                          disabled={testMutation.isPending || !googleConfig?.id}
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          {testMutation.isPending ? 'Testing...' : 'Test Connection'}
                        </Button>
                        <Button type="submit" disabled={updateMutation.isPending}>
                          {updateMutation.isPending ? 'Saving...' : 'Save Google Workspace settings'}
                        </Button>
                      </div>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Microsoft Entra ID</CardTitle>
                <CardDescription>
                  Connect Azure Active Directory (Entra ID) to allow users to authenticate with Microsoft accounts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...microsoftForm}>
                  <form onSubmit={microsoftForm.handleSubmit(handleMicrosoftSubmit)} className="space-y-6">
                    <FormField
                      control={microsoftForm.control}
                      name="enabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Enable Microsoft Entra ID</FormLabel>
                            <FormDescription>
                              Redirect users to the Microsoft login page for authentication.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={microsoftForm.control}
                        name="clientId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              <HelperLabel
                                label="Application (client) ID"
                                tooltip="In Azure Portal, under App registrations, create a new registration and copy the Application ID."
                              />
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="00000000-0000-0000-0000-000000000000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={microsoftForm.control}
                        name="tenantId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              <HelperLabel
                                label="Directory (tenant) ID"
                                tooltip="Find the Directory ID in Azure Portal under Azure Active Directory → Overview."
                              />
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="00000000-0000-0000-0000-000000000000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={microsoftForm.control}
                      name="redirectUri"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <HelperLabel
                              label="Redirect URI"
                              tooltip="Add this redirect URI to the list of allowed URIs in your Azure app's Authentication settings."
                            />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="https://app.example.com/auth/microsoft/callback" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={microsoftForm.control}
                      name="clientSecret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <HelperLabel
                              label="Client Secret"
                              tooltip="Generate a new client secret in Azure Portal under Certificates & secrets, then paste it here."
                            />
                          </FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input
                                type="password"
                                placeholder={microsoftSecretStored ? 'Stored securely — enter a new secret to rotate' : 'Paste the client secret'}
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                className="whitespace-nowrap"
                                onClick={() => {
                                  microsoftForm.setValue('clientSecret', '');
                                  setMicrosoftSecretStored(false);
                                }}
                              >
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                Rotate
                              </Button>
                            </div>
                          </FormControl>
                          {microsoftSecretStored && (
                            <FormDescription>
                              A client secret is already stored. Provide a new secret only when you want to rotate credentials.
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={microsoftForm.control}
                      name="domainHint"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <HelperLabel label="Domain Hint" tooltip={microsoftDomainHintHelper} />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="contoso.com" {...field} />
                          </FormControl>
                          <FormDescription>
                            Optional. Pre-fill the Microsoft login page with this domain.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={microsoftEnabled ? 'default' : 'outline'}>
                        {microsoftEnabled ? 'SSO Enabled' : 'SSO Disabled'}
                      </Badge>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleTestMicrosoft}
                          disabled={testMutation.isPending || !microsoftConfig?.id}
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          {testMutation.isPending ? 'Testing...' : 'Test Connection'}
                        </Button>
                        <Button type="submit" disabled={updateMutation.isPending}>
                          {updateMutation.isPending ? 'Saving...' : 'Save Microsoft Entra ID settings'}
                        </Button>
                      </div>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
