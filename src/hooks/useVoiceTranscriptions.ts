import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { invokeNodeApi } from '@/lib/backendApi';

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
      if (!organizationId) throw new Error('Organization not found');

      return invokeNodeApi<VoiceTranscription[]>('/api/v1/misc/voice-transcriptions');
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error?.message === 'User not authenticated') return false;
      return failureCount < 3;
    },
  });
}

export function useVoiceTranscription(id: string) {
  const { data: organizationId } = useUserOrganization();
  return useQuery({
    queryKey: ['voice-transcription', id, organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization not found');

      return invokeNodeApi<VoiceTranscription | null>(`/api/v1/misc/voice-transcriptions/${id}`);
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
      return invokeNodeApi<VoiceTranscription>('/api/v1/misc/voice-transcriptions', {
        method: 'POST',
        body: transcriptionData,
      });
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

      return invokeNodeApi<VoiceTranscription>(`/api/v1/misc/voice-transcriptions/${id}`, {
        method: 'PATCH',
        body: updates,
      });
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

      await invokeNodeApi(`/api/v1/misc/voice-transcriptions/${id}`, { method: 'DELETE' });
      return;
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
