import { useState, useEffect } from "react";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { supabase } from "@/integrations/supabase/client";

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: Record<string, any>;
  resource_type: "cases" | "documents" | "clients" | "contracts";
  created_at: string;
}

export function useSavedSearches() {
  const { data: organizationId } = useUserOrganization();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;

    const fetchSearches = async () => {
      try {
        const { data, error } = await supabase
          .from("saved_searches")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setSavedSearches(data || []);
      } catch (error) {
        console.error("Error fetching saved searches:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSearches();
  }, [organizationId]);

  const saveSearch = async (
    name: string,
    query: string,
    filters: Record<string, any>,
    resourceType: SavedSearch["resource_type"]
  ) => {
    if (!organizationId) return;

    try {
      const { data, error } = await supabase
        .from("saved_searches")
        .insert({
          organization_id: organizationId,
          name,
          query,
          filters,
          resource_type: resourceType,
        })
        .select()
        .single();

      if (error) throw error;
      setSavedSearches((prev) => [data, ...prev]);
      return data;
    } catch (error) {
      console.error("Error saving search:", error);
      throw error;
    }
  };

  const deleteSearch = async (id: string) => {
    try {
      const { error } = await supabase
        .from("saved_searches")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setSavedSearches((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      console.error("Error deleting search:", error);
      throw error;
    }
  };

  return {
    savedSearches,
    isLoading,
    saveSearch,
    deleteSearch,
  };
}

