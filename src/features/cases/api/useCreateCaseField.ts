import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

interface CreateCaseFieldData {
  case_type_id: string;
  label: string;
  field_key: string;
  data_type: string;
  is_required?: boolean | null;
  options?: any;
  field_order?: number | null;
}

/**
 * Create a new case field for a given case type
 */
export function useCreateCaseField() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (newField: CreateCaseFieldData) => {
      const userId = await getCurrentUserId();
      
      const fieldData = {
        ...newField,
        organization_id: organizationId!,
        created_by: userId,
      };

      const { data, error } = await supabase
        .from('case_fields')
        .insert(fieldData)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, newField) => {
      queryClient.invalidateQueries({ queryKey: ['case-fields', newField.case_type_id] });
    },
  });
}