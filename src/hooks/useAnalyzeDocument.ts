import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useAnalyzeDocument() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation(
    async ({ docId, content }: { docId: string; content: string }) => {
      const { data, error } = await supabase.functions.invoke('contract-analysis', {
        body: { text: content, analysisType: 'summarize' }
      });
      if (error) throw error;
      return { analysis: (data as any).analysis as string, docId };
    },
    {
      onSuccess: async ({ analysis, docId }) => {
        await supabase
          .from('documents')
          .update({ summary: analysis })
          .eq('id', docId);
        queryClient.invalidateQueries({ queryKey: ['documents'] });
        toast({ title: 'Document summarized', description: 'Summary saved.' });
      },
      onError: (error: any) => {
        toast({ title: 'Error summarizing document', description: error.message, variant: 'destructive' });
      }
    }
  );
}