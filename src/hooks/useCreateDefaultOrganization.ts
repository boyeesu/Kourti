import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { logError } from '@/lib/logger';

/**
 * Hook to create a default organization for a user if they don't have one.
 * This can be used as a fallback when organization ID is missing.
 */
export function useCreateDefaultOrganization() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (organizationName?: string) => {
      const userId = await getCurrentUserId();

      if (!userId) {
        throw new Error("User is not authenticated. Please sign in first.");
      }

      // Check if user already has an organization
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId as any)
        .single();

      // If user already has an organization, return it
      if ((existingProfile as any)?.organization_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', (existingProfile as any).organization_id)
          .single();

        return org;
      }

      // Create a new organization
      const defaultName = organizationName || 'My Legal Practice';

      const { data: newOrg, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: defaultName,
          description: 'Default organization created automatically',
        } as any)
        .select()
        .single();

      if (orgError) {
        logError('Error creating organization', orgError);
        throw orgError;
      }

      // Update user's profile with the new organization ID
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          organization_id: (newOrg as any).id,
          role: 'superadmin',
        } as any)
        .eq('user_id', userId as any);

      if (profileError) {
        logError('Error updating profile', profileError);
        throw profileError;
      }

      // Also insert into user_role_assignments (new permission system)
      const { error: roleAssignmentError } = await supabase
        .from('user_role_assignments')
        .insert({
          user_id: userId,
          role_name: 'superadmin',
          organization_id: (newOrg as any).id,
          assigned_by: userId
        } as any);

      if (roleAssignmentError) {
        logError('Error assigning role', roleAssignmentError);
        // We log but don't throw here to avoid failing the whole flow if the profile update worked
        // The trigger might handle it or we can fix it later
      }

      // Sign out and back in to refresh JWT with the new org_id claim
      await supabase.auth.signOut();

      return newOrg || { id: '', name: 'Organization creation failed' };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-organization'] });
      toast({
        title: "Organization Created",
        description: `'${(data as any)?.name || 'Organization'}' has been created. Please sign in again to continue.`,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create organization.",
      });
    },
  });
}