/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from './useUserOrganization';

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

      // @ts-expect-error - Table not in generated types yet
      const { data, error } = await supabase
        .from('user_onboarding_steps')
        .select('*')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data as unknown as OnboardingStep[]) || [];
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

      // @ts-expect-error - Table not in generated types yet
      const { data, error } = await supabase
        .from('user_onboarding_steps')
        .upsert(
          {
            user_id: userId,
            organization_id: organizationId,
            step_name: stepName,
            completed: true,
            completed_at: new Date().toISOString(),
            metadata: metadata || null,
          },
          {
            onConflict: 'user_id,step_name',
          }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
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
