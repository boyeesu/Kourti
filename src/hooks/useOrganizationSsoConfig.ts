import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/use-toast';

export type SsoProvider = 'google' | 'microsoft';

export interface OrganizationSsoProviderConfig {
  enabled: boolean;
  clientId?: string | null;
  redirectUri?: string | null;
  domainHint?: string | null;
  tenantId?: string | null;
  hasClientSecret?: boolean;
}

export interface OrganizationSsoConfig {
  google: OrganizationSsoProviderConfig;
  microsoft: OrganizationSsoProviderConfig;
}

interface UpdateOrganizationSsoConfigInput {
  provider: SsoProvider;
  config: {
    enabled: boolean;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    domainHint?: string;
    tenantId?: string;
  };
  rotateSecret?: boolean;
}

async function getOrganizationId() {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userId as any || '')
    .single();

  if (error) throw error;

  const organizationId = (profile as any)?.organization_id as string | null | undefined;
  if (!organizationId) {
    throw new Error('No organization associated with your account. Please contact your administrator.');
  }

  return organizationId;
}

export function useOrganizationSsoConfig() {
  return useQuery({
    queryKey: ['organization-sso-config'],
    queryFn: async () => {
      const organizationId = await getOrganizationId();

      const { data, error } = await supabase.functions.invoke('manage-sso-config', {
        body: {
          action: 'get',
          organizationId,
        },
      });

      if (error) throw error;

      const response = (data || {}) as Partial<OrganizationSsoConfig>;

      return {
        google: {
          enabled: response?.google?.enabled ?? false,
          clientId: response?.google?.clientId ?? response?.google?.client_id ?? '',
          redirectUri: response?.google?.redirectUri ?? response?.google?.redirect_uri ?? '',
          domainHint: response?.google?.domainHint ?? response?.google?.domain_hint ?? '',
          tenantId: response?.google?.tenantId ?? response?.google?.tenant_id ?? '',
          hasClientSecret:
            response?.google?.hasClientSecret ?? response?.google?.has_client_secret ?? Boolean(response?.google?.clientSecret),
        },
        microsoft: {
          enabled: response?.microsoft?.enabled ?? false,
          clientId: response?.microsoft?.clientId ?? response?.microsoft?.client_id ?? '',
          redirectUri: response?.microsoft?.redirectUri ?? response?.microsoft?.redirect_uri ?? '',
          domainHint: response?.microsoft?.domainHint ?? response?.microsoft?.domain_hint ?? '',
          tenantId: response?.microsoft?.tenantId ?? response?.microsoft?.tenant_id ?? '',
          hasClientSecret:
            response?.microsoft?.hasClientSecret ?? response?.microsoft?.has_client_secret ?? Boolean(response?.microsoft?.clientSecret),
        },
      } as OrganizationSsoConfig;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateOrganizationSsoConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: UpdateOrganizationSsoConfigInput) => {
      const organizationId = await getOrganizationId();

      const { data, error } = await supabase.functions.invoke('manage-sso-config', {
        body: {
          action: 'upsert',
          organizationId,
          provider: input.provider,
          config: input.config,
          rotateSecret: input.rotateSecret ?? false,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) {
        throw new Error((data as any).error);
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organization-sso-config'] });
      toast({
        title: `${variables.provider === 'google' ? 'Google Workspace' : 'Microsoft Entra ID'} settings saved`,
        description: 'Your single sign-on configuration has been updated.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Unable to update SSO settings',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
