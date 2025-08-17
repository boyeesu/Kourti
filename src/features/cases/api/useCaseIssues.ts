import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CaseIssue } from "../types";

export const useCaseIssues = (caseTypeId?: string) => {
  return useQuery({
    queryKey: ["case-issues", caseTypeId],
    queryFn: async (): Promise<CaseIssue[]> => {
      if (!caseTypeId) {
        console.log('No case type ID provided, returning empty issues array');
        return [];
      }
      
      console.log('Fetching case issues for case type ID:', caseTypeId);
      
      const { data, error } = await supabase
        .from("case_issues")
        .select("*")
        .eq("case_type_id", caseTypeId)
        .order("name");

      if (error) {
        console.error('Error fetching case issues:', error);
        throw new Error(error.message);
      }

      console.log('Case issues retrieved:', data);
      return data || [];
    },
    enabled: !!caseTypeId,
  });
};