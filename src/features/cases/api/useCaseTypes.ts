import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseType } from '@/features/cases/types';
import { AppError, tryCatch } from '@/lib/error-handling';
import { Tables } from '@/integrations/supabase/types';

/**
 * Hook to fetch case types from the database
 * @returns Case types query result
 */
export function useCaseTypes() {
  return useQuery<CaseType[], AppError>({
    queryKey: ['caseTypes'],
    queryFn: async () => {
      // Use tryCatch to handle errors consistently
      const [data, error] = await tryCatch(async () => {
        // Fetch global case types and organization-specific ones
        const { data, error } = await supabase
          .from('case_types')
          .select('*')
          .or('is_global.eq.true,organization_id.eq.' + await getCurrentOrgId())
          .eq('is_active', true)
          .order('name');
        
        if (error) {
          throw error;
        }
        
        return data;
      });
      
      if (error) {
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
        created_by: type.created_by,
        is_global: type.is_global
      }));
      
      return caseTypes;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Helper function to get current organization ID
async function getCurrentOrgId(): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) return '';
  
  const { data } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userData.user.id)
    .single();
  
  return data?.organization_id || '';
}

/**
 * Fetch all case types directly (for use outside of React components)
 * @param organizationId - The ID of the organization (optional, will fetch global + org-specific)
 * @returns A promise that resolves to an array of case types
 */
export async function fetchCaseTypes(organizationId?: string): Promise<CaseType[]> {
  const [data, error] = await tryCatch(async () => {
    let query = supabase
      .from('case_types')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (organizationId) {
      query = query.or(`is_global.eq.true,organization_id.eq.${organizationId}`);
    } else {
      query = query.eq('is_global', true);
    }
    
    const { data, error } = await query;
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
    created_by: type.created_by,
    is_global: type.is_global
  }));
}
