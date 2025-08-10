import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseType } from '../types';

export function useCaseTypes() {
  return useQuery<CaseType[], Error>({
    queryKey: ['caseTypes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from<CaseType>('case_types')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
