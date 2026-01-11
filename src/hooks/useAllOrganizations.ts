import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Organization {
  id: string;
  name: string;
  type: string | null;
  email: string | null;
  description: string | null;
  address: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  user_count: number;
  status: string;
  is_active: boolean;
}

/**
 * Hook to fetch all organizations (platform admin only)
 */
export function useAllOrganizations() {
  return useQuery({
    queryKey: ['all-organizations'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc('get_all_organizations');

        if (error) {
          throw error;
        }

        return (data || []) as Organization[];
      } catch (error) {
        console.error('Error fetching all organizations:', error);
        throw error;
      }
    },
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}
