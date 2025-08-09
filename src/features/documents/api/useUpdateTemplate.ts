import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DocTemplate } from '../types';

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation<DocTemplate, Error, DocTemplate>(async (template) => {
    const { data, error } = await supabase
      .from<DocTemplate>('doc_templates')
      .update({ ...template })
      .eq('id', template.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }, {
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-templates'] })
  });
}
