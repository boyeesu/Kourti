import { useQuery } from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

export interface ActivityType {
  value: string;
  label: string;
}

import { formatActivityTypeLabel } from '@/utils/activityUtils';

// Default activity types for legal practice if none exist in DB
const defaultActivityTypes: ActivityType[] = [
  { value: 'hearing', label: 'Court Hearing' },
  { value: 'meeting', label: 'Client Meeting' },
  { value: 'deposition', label: 'Deposition' },
  { value: 'research', label: 'Legal Research' },
  { value: 'filing', label: 'Court Filing' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'investigation', label: 'Investigation' },
  { value: 'document_review', label: 'Document Review' },
  { value: 'mediation', label: 'Mediation' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'preparation', label: 'Case Preparation' },
  { value: 'follow_up', label: 'Follow-up' },
];

export function useActivityTypes() {
  return useQuery({
    queryKey: ['activity-types'],
    queryFn: async (): Promise<ActivityType[]> => {
      try {
        const types = await invokeNodeApi<string[]>('/api/v1/misc/activity-types');
        if (types.length > 0) {
          return types.map((type) => ({ value: type, label: formatActivityTypeLabel(type) }));
        }
        return defaultActivityTypes;
      } catch (error) {
        logError('Failed to fetch activity types', error);
        // Fallback to default types on error
        return defaultActivityTypes;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
