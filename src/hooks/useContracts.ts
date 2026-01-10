import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { Contract } from "@/types";

export interface CreateContractData {
  title: string;
  description?: string;
  content?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  value?: number;
  currency?: string;
  client_id?: string;
  contract_type?: string;
  terms?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateContractData extends Partial<CreateContractData> {
  id: string;
}

export interface ContractsResult {
  contracts: Contract[];
  count: number;
}

/**
 * Paginated contracts hook with filtering support
 */
export function useContracts(
  initialPage = 1,
  pageSize = 10,
  statusFilter?: string
) {
  const [page, setPage] = useState(initialPage);
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  const query = useQuery<ContractsResult, Error>({
    queryKey: ["contracts", organizationId, page, pageSize, statusFilter],
    queryFn: async () => {
      if (!organizationId) {
        return { contracts: [], count: 0 };
      }

      const from = (page - 1) * pageSize;
      const to = page * pageSize - 1;

      let queryBuilder = supabase
        .from("contracts")
        .select(
          `
          *,
          client:client_id(id, name, email, company)
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

      const { data, error, count } = await queryBuilder;

      if (error) throw error;

      const contracts = (data || []).map((contract: any) => ({
        ...contract,
        client: contract.client || null,
      })) as Contract[];

      return { contracts, count: count || 0 };
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
 * Fetch a single contract by ID
 */
export function useContract(id: string) {
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useQuery<Contract, Error>({
    queryKey: ["contract", id],
    queryFn: async () => {
      if (!user?.id || !organizationId) {
        throw new Error("User not authenticated or organization not found");
      }

      const { data, error } = await supabase
        .from("contracts")
        .select(
          `
          *,
          client:client_id(id, name, email, company, phone)
        `
        )
        .eq("id", id)
        .eq("organization_id", organizationId)
        .single();

      if (error) throw error;
      return data as unknown as Contract;
    },
    enabled: !!id && !!user?.id && !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Create a new contract
 */
export function useCreateContract() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (contractData: CreateContractData) => {
      if (!user?.id || !organizationId) {
        throw new Error("User not authenticated or organization not found");
      }

      const { data, error } = await supabase
        .from("contracts")
        .insert({
          ...contractData,
          organization_id: organizationId,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "Success",
        description: "Contract created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create contract.",
      });
    },
  });
}

/**
 * Update an existing contract
 */
export function useUpdateContract() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateContractData) => {
      const { data, error } = await supabase
        .from("contracts")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract", data.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "Success",
        description: "Contract updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update contract.",
      });
    },
  });
}

/**
 * Delete a contract
 */
export function useDeleteContract() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "Success",
        description: "Contract deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete contract.",
      });
    },
  });
}

/**
 * Fetch all contracts (for analytics, without pagination)
 */
export function useAllContracts() {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<Contract[], Error>({
    queryKey: ["all-contracts", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from("contracts")
        .select("id, title, status, value, currency, created_at, start_date, end_date, contract_type, client_id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Contract[];
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch expiring contracts (within N days)
 */
export function useExpiringContracts(daysAhead: number = 30) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<Contract[], Error>({
    queryKey: ["expiring-contracts", organizationId, daysAhead],
    queryFn: async () => {
      if (!organizationId) return [];

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

      const { data, error } = await supabase
        .from("contracts")
        .select(
          `
          *,
          client:client_id(id, name, email)
        `
        )
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .lte("end_date", futureDate.toISOString())
        .gte("end_date", new Date().toISOString())
        .order("end_date", { ascending: true });

      if (error) throw error;
      return (data || []) as Contract[];
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 5 * 60 * 1000,
  });
}
