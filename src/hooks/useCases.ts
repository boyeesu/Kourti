import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { Case } from "@/types";

export interface CreateCaseData {
  title: string;
  description?: string;
  client_id?: string;
  status?: string;
  priority?: string;
  case_type_id?: string;
  case_issue_id?: string;
  court?: string;
  next_hearing_date?: string;
  assigned_to?: string;
  custom_fields?: Record<string, unknown>;
}

export interface UpdateCaseData extends Partial<CreateCaseData> {
  id: string;
}

export interface CasesResult {
  cases: Case[];
  count: number;
}

/**
 * Paginated cases hook with filtering support
 */
export function useCases(
  initialPage = 1,
  pageSize = 10,
  statusFilter?: string,
  priorityFilter?: string
) {
  const [page, setPage] = useState(initialPage);
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  const query = useQuery<CasesResult, Error>({
    queryKey: ["cases", organizationId, page, pageSize, statusFilter, priorityFilter],
    queryFn: async () => {
      if (!organizationId) {
        return { cases: [], count: 0 };
      }

      const from = (page - 1) * pageSize;
      const to = page * pageSize - 1;

      let queryBuilder = supabase
        .from("cases")
        .select(
          `
          *,
          client:client_id(id, name, email, company),
          assigned_user:assigned_to(user_id, first_name, last_name),
          case_type:case_type_id(id, name, description),
          case_issue:case_issue_id(id, name, description)
        `,
          { count: "exact" }
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .range(from, to);

      // Apply status filter
      if (statusFilter && statusFilter !== "all") {
        queryBuilder = queryBuilder.eq("status", statusFilter);
      }

      // Apply priority filter
      if (priorityFilter && priorityFilter !== "all") {
        queryBuilder = queryBuilder.eq("priority", priorityFilter);
      }

      const { data, error, count } = await queryBuilder;

      if (error) throw error;

      const cases = (data || []).map((caseItem: any) => ({
        ...caseItem,
        client: caseItem.client || null,
        assigned_user: caseItem.assigned_user || null,
        case_type: caseItem.case_type || null,
        case_issue: caseItem.case_issue || null,
      })) as Case[];

      return { cases, count: count || 0 };
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    page,
    pageSize,
    setPage,
  };
}

/**
 * Fetch a single case by ID
 */
export function useCase(id: string) {
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useQuery<Case, Error>({
    queryKey: ["case", id],
    queryFn: async () => {
      if (!user?.id || !organizationId) {
        throw new Error("User not authenticated or organization not found");
      }

      const { data, error } = await supabase
        .from("cases")
        .select(
          `
          *,
          client:client_id(id, name, email, company, phone),
          assigned_user:assigned_to(user_id, first_name, last_name, email),
          case_type:case_type_id(id, name, description),
          case_issue:case_issue_id(id, name, description)
        `
        )
        .eq("id", id)
        .eq("organization_id", organizationId)
        .single();

      if (error) throw error;
      return data as unknown as Case;
    },
    enabled: !!id && !!user?.id && !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Create a new case
 */
export function useCreateCase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (caseData: CreateCaseData) => {
      if (!user?.id || !organizationId) {
        throw new Error("User not authenticated or organization not found");
      }

      const { data, error } = await supabase
        .from("cases")
        .insert({
          ...caseData,
          organization_id: organizationId,
          created_by: user.id,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "Success",
        description: "Matter created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create matter.",
      });
    },
  });
}

/**
 * Update an existing case
 */
export function useUpdateCase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateCaseData) => {
      const { data, error } = await supabase
        .from("cases")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["case", data.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "Success",
        description: "Matter updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update matter.",
      });
    },
  });
}

/**
 * Delete a case
 */
export function useDeleteCase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cases").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "Success",
        description: "Matter deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete matter.",
      });
    },
  });
}

/**
 * Fetch all cases (for analytics, without pagination)
 */
export function useAllCases() {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<Case[], Error>({
    queryKey: ["all-cases", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from("cases")
        .select("id, title, status, priority, created_at, next_hearing_date, client_id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Case[];
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
  });
}
