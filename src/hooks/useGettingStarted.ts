import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useEffect } from 'react';
import { invokeNodeApi } from '@/lib/backendApi';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from '@/hooks/useUserOrganization';

interface OnboardingStatusResponse {
  loginCount: number;
  steps: Array<{
    id: string;
    step_name: string;
    completed: boolean;
    completed_at: string | null;
    metadata: Record<string, unknown> | null;
  }>;
  showChecklist: boolean;
}

export interface GettingStartedStep {
  name: string;
  title: string;
  description: string;
  link: string;
  icon: string;
}

export const GETTING_STARTED_STEPS: GettingStartedStep[] = [
  {
    name: 'complete_profile',
    title: 'Complete your profile',
    description: 'Add your name and contact details',
    link: '/settings?tab=profile',
    icon: 'User',
  },
  {
    name: 'add_client',
    title: 'Add your first client',
    description: 'Create a client record to get started',
    link: '/clients',
    icon: 'Users',
  },
  {
    name: 'create_matter',
    title: 'Create a matter',
    description: 'Open your first legal matter',
    link: '/cases',
    icon: 'Briefcase',
  },
  {
    name: 'upload_document',
    title: 'Upload a document',
    description: 'Store and organize your legal documents',
    link: '/documents',
    icon: 'FileText',
  },
  {
    name: 'draft_contract',
    title: 'Draft a contract',
    description: 'Create or upload a contract',
    link: '/contracts',
    icon: 'FileCheck',
  },
  {
    name: 'explore_calendar',
    title: 'Explore the calendar',
    description: 'View hearings and deadlines',
    link: '/calendar',
    icon: 'Calendar',
  },
  {
    name: 'try_ream_ai',
    title: 'Try Ream AI assistant',
    description: 'Ask Ream AI a legal question',
    link: '/ream-ai',
    icon: 'Sparkles',
  },
  {
    name: 'invite_team',
    title: 'Invite a team member',
    description: 'Grow your workspace by adding colleagues',
    link: '/settings?tab=roles',
    icon: 'UserPlus',
  },
];

function getDismissKey(userId: string) {
  return `kourti_checklist_dismissed_${userId}`;
}

export function useGettingStarted() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();
  const [dismissed, setDismissed] = useState(false);

  // Load dismiss state from localStorage on mount
  useEffect(() => {
    getCurrentUserId().then((userId) => {
      if (userId && localStorage.getItem(getDismissKey(userId)) === 'true') {
        setDismissed(true);
      }
    });
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-status', organizationId],
    queryFn: () => invokeNodeApi<OnboardingStatusResponse>('/api/v1/misc/onboarding-status'),
    enabled: !!organizationId,
  });

  const markStepComplete = useMutation({
    mutationFn: async (stepName: string) => {
      return invokeNodeApi(`/api/v1/misc/onboarding-steps/${stepName}`, {
        method: 'PUT',
        body: {},
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-steps'] });
    },
  });

  const dismissChecklist = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (userId) {
      localStorage.setItem(getDismissKey(userId), 'true');
    }
    setDismissed(true);
  }, []);

  const completedSteps = data?.steps?.filter((s) => s.completed) ?? [];
  const completedNames = new Set(completedSteps.map((s) => s.step_name));
  const totalSteps = GETTING_STARTED_STEPS.length;
  const completedCount = GETTING_STARTED_STEPS.filter((s) => completedNames.has(s.name)).length;
  const allComplete = completedCount >= totalSteps;

  const showChecklist = !!(data?.showChecklist && !dismissed && !allComplete);

  return {
    showChecklist,
    isLoading,
    steps: GETTING_STARTED_STEPS,
    completedNames,
    completedCount,
    totalSteps,
    markStepComplete,
    dismissChecklist,
  };
}
