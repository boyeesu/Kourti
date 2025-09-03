
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BulkAction } from "@/components/table/BulkToolbar";

export function useBulkClientActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: BulkAction }) => {
      if (action.type === "delete") {
        const { error } = await supabase.from("clients").delete().in("id", ids as any);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("clients")
          .update({ status: action.status } as any)
          .in("id", ids as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] })
  });
}
