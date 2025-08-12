import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DocTemplate } from '@/features/documents/types';

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: Omit<DocTemplate, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('doc_templates')
        .insert({ ...template })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-templates'] })
  });
}
