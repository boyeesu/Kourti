import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import { useCurrentUserOrganization } from '@/hooks/useOrganization';
import { logError } from '@/lib/logger';

/** Feature keys mirror backend services/entitlements.ts FEATURE_KEYS. */
export type FeatureKey =
  | 'cases'
  | 'clients'
  | 'calendar'
  | 'documents'
  | 'contracts'
  | 'search'
  | 'invoices'
  | 'voice'
  | 'chat'
  | 'ai_review'
  | 'agents'
  | 'negotiations'
  | 'intelligence'
  | 'playbooks'
  | 'tabular_review'
  | 'redline'
  | 'sso';

export interface Entitlements {
  plan_type: string | null;
  features: FeatureKey[];
}

/** Display metadata for gated features — used by FeatureGate / nav locks. */
export const FEATURE_META: Record<
  string,
  { label: string; requiredPlan: 'Professional' | 'Enterprise' }
> = {
  agents: { label: 'AI Agents', requiredPlan: 'Professional' },
  negotiations: { label: 'Negotiations', requiredPlan: 'Professional' },
  intelligence: { label: 'Intelligence', requiredPlan: 'Professional' },
  playbooks: { label: 'Playbook automation', requiredPlan: 'Professional' },
  tabular_review: { label: 'Tabular review', requiredPlan: 'Professional' },
  redline: { label: 'Redline', requiredPlan: 'Professional' },
  sso: { label: 'SSO / SAML', requiredPlan: 'Enterprise' },
};

export function useEntitlements() {
  const { data: organization } = useCurrentUserOrganization();
  const orgId = organization?.id;

  return useQuery({
    queryKey: ['entitlements', orgId],
    queryFn: async () => {
      try {
        return await invokeNodeApi<Entitlements>('/api/v1/misc/entitlements');
      } catch (error) {
        logError('Error fetching entitlements', error);
        // Fail open to "no gating" so a transient error never hard-locks the
        // whole UI — the backend still enforces on every request.
        return { plan_type: null, features: [] } as Entitlements;
      }
    },
    enabled: !!orgId,
    staleTime: 60 * 1000,
  });
}

/** Convenience: does the current org have `feature`? */
export function useHasFeature(feature: FeatureKey): { allowed: boolean; isLoading: boolean } {
  const { data, isLoading } = useEntitlements();
  return { allowed: !!data?.features.includes(feature), isLoading };
}
