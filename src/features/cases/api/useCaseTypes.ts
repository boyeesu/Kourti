import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseType } from '@/features/cases/types';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { AppError, ErrorCode, tryCatch } from '@/lib/error-handling';
import { Tables } from '@/integrations/supabase/types';

/**
 * Hook to fetch case types from the database
 * @returns Case types query result
 */
export function useCaseTypes() {
  const { data: organizationId } = useUserOrganization();

  return useQuery<CaseType[], AppError>({
    queryKey: ['caseTypes', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        console.log('No organization ID available for case types');
        return [];
      }
      
      console.log('Fetching case types for organization:', organizationId);
      
      // Use tryCatch to handle errors consistently
      const [data, error] = await tryCatch(async () => {
        const { data, error } = await supabase
          .from('case_types')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .order('name');
        
        if (error) throw error;
        return data;
      });
      
      if (error) {
        console.error('Error fetching case types:', error);
        throw error;
      }
      
      // Use proper typing for the database result
      const caseTypes = (data || []).map((type: Tables<'case_types'>): CaseType => ({
        id: type.id,
        name: type.name,
        description: type.description,
        created_at: type.created_at,
        updated_at: type.updated_at,
        is_active: type.is_active ?? false,
        organization_id: type.organization_id,
        created_by: type.created_by
      }));
      
      console.log('Case types retrieved:', caseTypes);
      return caseTypes;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch all case types directly (for use outside of React components)
 * @param organizationId - The ID of the organization
 * @returns A promise that resolves to an array of case types
 */
export async function fetchCaseTypes(organizationId: string): Promise<CaseType[]> {
  if (!organizationId) {
    throw new AppError(
      'Organization ID is required to fetch case types',
      ErrorCode.VALIDATION_ERROR
    );
  }
  
  const [data, error] = await tryCatch(async () => {
    const { data, error } = await supabase
      .from('case_types')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');
    
    if (error) throw error;
    return data;
  });
  
  if (error) {
    console.error('Error fetching case types:', error);
    throw error;
  }
  
  return (data || []).map((type: Tables<'case_types'>): CaseType => ({
    id: type.id,
    name: type.name,
    description: type.description,
    created_at: type.created_at,
    updated_at: type.updated_at,
    is_active: type.is_active ?? false,
    organization_id: type.organization_id,
    created_by: type.created_by
  }));
}
