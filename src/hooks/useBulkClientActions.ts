import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BulkAction } from "@/components/table/BulkToolbar";

export function useBulkClientActions() {
  const qc = useQueryClient();
  return useMutation<void, Error, { ids: string[]; action: BulkAction }>(
    async ({ ids, action }) => {
      if (action.type === "delete") {
        const { error } = await supabase.from("clients").delete().in("id", ids);
        if (error) throw error;
      } else {
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
