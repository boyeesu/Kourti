import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

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
}

/**
 * Hook for fetching voice transcriptions
 */
export function useVoiceTranscriptions() {
  return useQuery({
    queryKey: ['voice-transcriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_transcriptions')
        .select(`
          id,
          title,
          transcript,
          summary,
          case_id,
          duration_seconds,
          status,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as VoiceTranscription[];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook for fetching a single voice transcription
 */
export function useVoiceTranscription(id: string) {
  return useQuery({
    queryKey: ['voice-transcription', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_transcriptions')
        .select(`
          id,
          title,
          transcript,
          summary,
          case_id,
          duration_seconds,
          status,
          created_at,
          updated_at
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as VoiceTranscription;
    },
    enabled: !!id,
  });
}

/**
 * Hook for creating voice transcription
 */
export function useCreateVoiceTranscription() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transcriptionData: Omit<VoiceTranscription, 'id' | 'created_at' | 'updated_at'>) => {
      // Get current user data
      const { data: { user } } = await supabase.auth.getUser();
      
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
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-transcriptions'] });
      toast({
        title: "Success",
        description: "Voice transcription saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save voice transcription",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for updating voice transcription
 */
export function useUpdateVoiceTranscription() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<VoiceTranscription> }) => {
      const { data, error } = await supabase
        .from('voice_transcriptions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['voice-transcriptions'] });
      queryClient.invalidateQueries({ queryKey: ['voice-transcription', data.id] });
      toast({
        title: "Success",
        description: "Voice transcription updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update voice transcription",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for deleting voice transcription
 */
export function useDeleteVoiceTranscription() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('voice_transcriptions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-transcriptions'] });
      toast({
        title: "Success",
        description: "Voice transcription deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to delete voice transcription",
        variant: "destructive",
      });
    },
  });
}