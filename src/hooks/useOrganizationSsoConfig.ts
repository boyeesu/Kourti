import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

export type OrganizationSsoConfig = Database['public']['Views']['organization_sso_configs_view']['Row'];
export type OrganizationSsoProvider = OrganizationSsoConfig['provider'];

async function fetchOrganizationId(): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userId)
    .single();

  if (error) {
    throw error;
  }

  return (data as { organization_id: string | null } | null)?.organization_id ?? null;
}

async function fetchOrganizationSsoConfigs(): Promise<OrganizationSsoConfig[]> {
  const organizationId = await fetchOrganizationId();
  if (!organizationId) {
    return [];
  }

  const { data, error } = await supabase
    .from('organization_sso_configs_view')
    .select('*')
    .eq('organization_id', organizationId)
    .order('provider', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as OrganizationSsoConfig[];
}

type ManageSsoConfigFunctionPayload =
  | {
      action: 'create';
      payload: {
        provider: OrganizationSsoProvider;
        clientId: string;
        clientSecret?: string;
        tenantId?: string | null;
        domainHint?: string | null;
        redirectUri?: string | null;
        isEnabled?: boolean;
      };
    }
  | {
      action: 'update';
      payload: {
        id: string;
        clientId?: string;
        clientSecret?: string;
        tenantId?: string | null;
        domainHint?: string | null;
        redirectUri?: string | null;
        isEnabled?: boolean;
      };
    }
  | { action: 'delete'; payload: { id: string } }
  | { action: 'rotate'; payload: { id: string; clientSecret: string } };

async function invokeManageSsoConfig<TResponse>(
  body: ManageSsoConfigFunctionPayload
): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke('manage-sso-config', {
    body,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('No response returned from manage-sso-config function');
  }

  if (typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }

  return (data as { data: TResponse }).data;
}

export function useOrganizationSsoConfigs() {
  return useQuery({
    queryKey: ['organization-sso-configs'],
    queryFn: fetchOrganizationSsoConfigs,
    staleTime: 60 * 1000,
  });
}

type UpsertOrganizationSsoConfigInput = {
  id?: string;
  provider: OrganizationSsoProvider;
  clientId: string;
  clientSecret?: string;
  tenantId?: string | null;
  domainHint?: string | null;
  redirectUri?: string | null;
  isEnabled?: boolean;
};

export function useUpsertOrganizationSsoConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertOrganizationSsoConfigInput) => {
      const action: ManageSsoConfigFunctionPayload['action'] = input.id ? 'update' : 'create';

      const body: ManageSsoConfigFunctionPayload =
        action === 'create'
          ? {
              action,
              payload: {
                provider: input.provider,
                clientId: input.clientId,
                clientSecret: input.clientSecret,
                tenantId: input.tenantId ?? null,
                domainHint: input.domainHint ?? null,
                redirectUri: input.redirectUri ?? null,
                isEnabled: input.isEnabled ?? false,
              },
            }
          : {
              action,
              payload: {
                id: input.id!,
                clientId: input.clientId,
                clientSecret: input.clientSecret,
                tenantId: input.tenantId ?? null,
                domainHint: input.domainHint ?? null,
                redirectUri: input.redirectUri ?? null,
                isEnabled: input.isEnabled,
              },
            };

      const response = await invokeManageSsoConfig<OrganizationSsoConfig>(body);

      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-sso-configs'] });
    },
  });
}

export function useDeleteOrganizationSsoConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await invokeManageSsoConfig<boolean>({
        action: 'delete',
        payload: { id },
      });

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-sso-configs'] });
    },
  });
}

export function useRotateOrganizationSsoSecret() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; clientSecret: string }) => {
      const result = await invokeManageSsoConfig<OrganizationSsoConfig>({
        action: 'rotate',
        payload: { id: input.id, clientSecret: input.clientSecret },
      });

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-sso-configs'] });
    },
  });
}
