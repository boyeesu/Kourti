import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BulkAction } from "@/components/table/BulkToolbar";

export function useBulkClientActions() {
  const qc = useQueryClient();
  return useMutation(
    async ({ ids, action }: { ids: string[]; action: BulkAction }) => {
      if (action.type === "delete") {
        const { error } = await supabase.from("clients").delete().in("id", ids);
        if (error) throw error;
      } else if (action.type === "setStatus") {
        const { error } = await supabase
          .from("clients")
          .update({ status: action.status })
          .in("id", ids);
        if (error) throw error;
      }
    },
    { onSuccess: () => qc.invalidateQueries(["clients"]) }
  );
}
