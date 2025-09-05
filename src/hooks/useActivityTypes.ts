import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
        // Get distinct activity types from existing activities
        const { data, error } = await supabase
          .from('case_activities')
          .select('activity_type')
          .not('activity_type', 'is', null);

        if (error) throw error;

        // Get unique activity types
        const uniqueTypes = [...new Set((data || []).map(item => item.activity_type))];
        
        // If we have existing types, use them, otherwise use defaults
        if (uniqueTypes.length > 0) {
          return uniqueTypes.map(type => ({
            value: type,
            label: formatActivityTypeLabel(type)
          }));
        }
        
        // Return default types if no activities exist yet
        return defaultActivityTypes;
      } catch (error) {
        console.error('Failed to fetch activity types:', error);
        // Fallback to default types on error
        return defaultActivityTypes;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}