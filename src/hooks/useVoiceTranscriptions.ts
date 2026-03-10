import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserOrganization } from '@/hooks/useUserOrganization';

interface VoiceTranscription {
  id: string;
  title: string;
  transcript: string;
  summary?: string;
  case_id?: string;
  duration_seconds?: number;
  status: string;
  created_at: string;
  updated_at: string;
  audio_file_url?: string;
}

/**
 * Hook for fetching voice transcriptions
 */
export function useVoiceTranscriptions() {
  const { data: organizationId } = useUserOrganization();
  return useQuery({
    queryKey: ['voice-transcriptions', organizationId],
    queryFn: async () => {
      // Check if user is authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      if (!organizationId) {
        throw new Error('Organization not found');
      }

      const { data, error } = await supabase
        .from('voice_transcriptions')
        .select(
          `
          id,
          title,
          transcript,
          summary,
          case_id,
          duration_seconds,
          status,
          created_at,
          updated_at
        `
        )
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data as VoiceTranscription[];
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: (failureCount, error) => {
      // Don't retry if it's an auth error
      if (error?.message === 'User not authenticated') {
        return false;
      }
      return failureCount < 3;
    },
  });
}

/**
 * Hook for fetching a single voice transcription
 */
export function useVoiceTranscription(id: string) {
  const { data: organizationId } = useUserOrganization();
  return useQuery({
    queryKey: ['voice-transcription', id, organizationId],
    queryFn: async () => {
      // Check if user is authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      if (!organizationId) {
        throw new Error('Organization not found');
      }

      const { data, error } = await supabase
        .from('voice_transcriptions')
        .select(
          `
          id,
          title,
          transcript,
          summary,
          case_id,
          duration_seconds,
          status,
          created_at,
          updated_at
        `
        )
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return null;
      }

      return data as VoiceTranscription;
    },
    enabled: !!id && !!organizationId,
    retry: (failureCount, error) => {
      // Don't retry if it's an auth error
      if (error?.message === 'User not authenticated') {
        return false;
      }
      return failureCount < 3;
    },
  });
}

/**
 * Hook for creating voice transcription
 */
export function useCreateVoiceTranscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      transcriptionData: Omit<VoiceTranscription, 'id' | 'created_at' | 'updated_at'>
    ) => {
      // Get current user data
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get user's organization from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error('User organization not found');
      }

      const { data, error } = await supabase
        .from('voice_transcriptions')
        .insert({
          ...transcriptionData,
          organization_id: profile.organization_id,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-transcriptions'] });
      toast.success('Success', { description: 'Voice transcription saved successfully' });
    },
    onError: (error: Error) => {
      toast.error('Error', { description: error.message || 'Failed to save voice transcription' });
    },
  });
}

/**
 * Hook for updating voice transcription
 */
export function useUpdateVoiceTranscription() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<VoiceTranscription> }) => {
      if (!organizationId) throw new Error('Organization not found');
      const { data, error } = await supabase
        .from('voice_transcriptions')
        .update(updates)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['voice-transcriptions'] });
      queryClient.invalidateQueries({ queryKey: ['voice-transcription', data.id] });
      toast.success('Success', { description: 'Voice transcription updated successfully' });
    },
    onError: (error: Error) => {
      toast.error('Error', {
        description: error.message || 'Failed to update voice transcription',
      });
    },
  });
}

/**
 * Hook for deleting voice transcription
 */
export function useDeleteVoiceTranscription() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error('Organization not found');
      const { error } = await supabase
        .from('voice_transcriptions')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-transcriptions'] });
      toast.success('Success', { description: 'Voice transcription deleted successfully' });
    },
    onError: (error: Error) => {
      toast.error('Error', {
        description: error.message || 'Failed to delete voice transcription',
      });
    },
  });
}
