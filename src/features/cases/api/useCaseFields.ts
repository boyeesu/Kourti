import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseField } from '@/features/cases/types';

export function useCaseFields(caseTypeId: string) {
  return useQuery<CaseField[], Error>({
    queryKey: ['caseFields', caseTypeId],
    queryFn: async () => {
      if (!caseTypeId) return [] as CaseField[];
      const { data, error } = await supabase
        .from('case_fields')
        .select('*')
        .eq('case_type_id', caseTypeId as any)
        .order('field_order', { ascending: true });
      if (error) throw error;
      return (data as unknown as CaseField[]) || [];
    },
    enabled: Boolean(caseTypeId),
    staleTime: 5 * 60 * 1000,
  });
}