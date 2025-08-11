import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseType } from '@/features/cases/types';

/**
 * Create a new case type
 */
export function useCreateCaseType() {
  const queryClient = useQueryClient();
  return useMutation<CaseType, Error, Partial<CaseType>>(
    async (newType) => {
      const { data, error } = await supabase
        .from<CaseType>('case_types')
        .insert(newType)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['case-types'] });
      },
    }
  );
}
