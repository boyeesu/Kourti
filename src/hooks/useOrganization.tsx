import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Organization {
  id: string;
  name: string;
  description?: string;
  address?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export function useOrganization() {
  return useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      // First get the user's organization ID from their profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!profile?.organization_id) {
        return null;
      }

      // Then get the organization details
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profile.organization_id)
        .single();

      if (error) throw error;
      return data as Organization;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useOrganizationMembers() {
  return useQuery({
    queryKey: ['organization-members'],
    queryFn: async () => {
      // Get the user's organization ID first
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!profile?.organization_id) {
        return [];
      }

      // Get all members in the organization
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, first_name, last_name, email, role, department, created_at')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}