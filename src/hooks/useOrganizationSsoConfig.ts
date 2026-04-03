import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';

// Type definition for SSO config
export type OrganizationSsoConfig = {
  id: string;
  organization_id: string;
  provider: 'google' | 'microsoft';
  client_id: string;
  client_secret: string | null;
  client_secret_masked: string | null;
  has_client_secret: boolean;
  tenant_id: string | null;
  domain_hint: string | null;
  redirect_uri: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type OrganizationSsoProvider = OrganizationSsoConfig['provider'];

type ManageSsoConfigPayload =
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
  | { action: 'rotate'; payload: { id: string; clientSecret: string } }
  | { action: 'test'; payload: { id: string } };

async function invokeManageSsoConfig<TResponse>(body: ManageSsoConfigPayload): Promise<TResponse> {
  const result = await invokeNodeApi<{ data: TResponse }>('/api/v1/misc/sso-config/manage', {
    method: 'POST',
    body,
  });

  return result.data;
}

export function useOrganizationSsoConfigs() {
  return useQuery({
    queryKey: ['organization-sso-configs'],
    queryFn: async (): Promise<OrganizationSsoConfig[]> => {
      return invokeNodeApi<OrganizationSsoConfig[]>('/api/v1/misc/sso-config');
    },
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
      const action: ManageSsoConfigPayload['action'] = input.id ? 'update' : 'create';

      const body: ManageSsoConfigPayload =
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

export type SsoTestResult = {
  success: boolean;
  message: string;
  errors?: string[];
  config?: {
    provider: string;
    client_id: string;
    redirect_uri: string;
    tenant_id: string | null;
    domain_hint: string | null;
    is_enabled: boolean;
  };
};

export function useTestSsoConfig() {
  return useMutation({
    mutationFn: async (id: string): Promise<SsoTestResult> => {
      const result = await invokeManageSsoConfig<SsoTestResult>({
        action: 'test',
        payload: { id },
      });

      return result;
    },
  });
}
