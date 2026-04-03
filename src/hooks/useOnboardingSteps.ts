/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from './useUserOrganization';
import { invokeNodeApi } from '@/lib/backendApi';

export interface OnboardingStep {
  id: string;
  step_name: string;
  step_description: string | null;
  completed: boolean;
  completed_at: string | null;
  metadata: Record<string, any> | null;
}

export function useOnboardingSteps() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  const { data: steps = [], isLoading } = useQuery({
    queryKey: ['onboarding-steps', organizationId],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId || !organizationId) return [];

      return invokeNodeApi<OnboardingStep[]>('/api/v1/misc/onboarding-steps');
    },
    enabled: !!organizationId,
  });

  const markStepComplete = useMutation({
    mutationFn: async ({
      stepName,
      metadata,
    }: {
      stepName: string;
      metadata?: Record<string, any>;
    }) => {
      const userId = await getCurrentUserId();
      if (!userId || !organizationId) throw new Error('User or organization not found');

      return invokeNodeApi<any>(`/api/v1/misc/onboarding-steps/${stepName}`, {
        method: 'PUT',
        body: { metadata },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-steps'] });
    },
  });

  const isStepComplete = (stepName: string) => {
    return steps.find((s) => s.step_name === stepName)?.completed || false;
  };

  const getCompletionPercentage = () => {
    if (steps.length === 0) return 0;
    const completed = steps.filter((s) => s.completed).length;
    return Math.round((completed / steps.length) * 100);
  };

  return {
    steps,
    isLoading,
    markStepComplete,
    isStepComplete,
    getCompletionPercentage,
  };
}
