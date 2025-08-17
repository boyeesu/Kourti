import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseType } from '@/features/cases/types';
import { useUserOrganization } from '@/hooks/useUserOrganization';

export function useCaseTypes() {
  const { data: organizationId } = useUserOrganization();

  return useQuery<CaseType[], Error>({
    queryKey: ['caseTypes', organizationId],
    queryFn: async () => {
      console.log('Fetching case types for organization:', organizationId);
      
      const { data, error } = await supabase
        .from('case_types')
        .select('*')
        .order('name');
      
      if (error) {
        console.error('Error fetching case types:', error);
        throw error;
      }
      
      console.log('Case types retrieved:', data);
      
      // Map the data to ensure it matches the CaseType interface
      return data.map((type: any) => ({
        id: type.id,
        name: type.name,
        description: type.description,
        created_at: type.created_at,
        // Use defaults for fields that might be missing in the database
        organization_id: type.organization_id || organizationId || '',
        created_by: type.created_by || ''
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}
