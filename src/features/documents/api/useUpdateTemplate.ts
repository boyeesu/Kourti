import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DocTemplate } from '@/features/documents/types';

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: DocTemplate) => {
      const { data, error } = await supabase
        .from('doc_templates')
        .update({ ...template })
        .eq('id', template.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-templates'] })
  });
}
