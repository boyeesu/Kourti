import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CaseIssue } from "../types";

export const useCaseIssues = (caseTypeId?: string) => {
  return useQuery({
    queryKey: ["case-issues", caseTypeId],
    queryFn: async (): Promise<CaseIssue[]> => {
      if (!caseTypeId) {
        return [];
      }
      
      const { data, error } = await supabase
        .from("case_issues")
        .select("*")
        .eq("case_type_id", caseTypeId as any)
        .order("name");

      if (error) {
        throw new Error(error.message);
      }

      return (data as unknown as CaseIssue[]) || [];
    },
    enabled: !!caseTypeId,
  });
};