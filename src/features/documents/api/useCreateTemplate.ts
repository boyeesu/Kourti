import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DocTemplate } from '@/features/documents/types';

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation<DocTemplate, Error, Omit<DocTemplate, 'id' | 'created_at' | 'updated_at'>>(async (template) => {
    const { data, error } = await supabase
      .from<DocTemplate>('doc_templates')
      .insert({ ...template })
      .select()
      .single();
    if (error) throw error;
    return data;
  }, {
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-templates'] })
  });
}
