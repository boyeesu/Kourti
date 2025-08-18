
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BulkAction } from "@/components/table/BulkToolbar";

export function useBulkDocumentActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: BulkAction }) => {
      if (action.type === "delete") {
        const { error } = await supabase.from("documents").delete().in("id", ids);
        if (error) throw error;
      } else if (action.type === "setStatus") {
        const { error } = await supabase
          .from("documents")
          .update({ summary: `Updated status for ${ids.length} documents` })
          .in("id", ids);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] })
  });
}
