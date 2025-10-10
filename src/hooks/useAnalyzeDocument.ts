
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useAnalyzeDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ docId, content }: { docId: string; content: string }) => {
      const cacheKey = `ai-summary-${docId}`;
      const lastCallKey = `ai-lastcall`;
      // Rate limit
      const lastCall = localStorage.getItem(lastCallKey);
      if (lastCall && Date.now() - Number(lastCall) < 1000) {
        throw new Error('API rate limit exceeded');
      }
      // Cache
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        return { analysis: cached, docId };
      }
      const payload = { text: content, analysisType: 'summarize' as const };
      const { data, error } = await supabase.functions.invoke('advanced-contract-analysis', {
        body: payload
      });

      let analysisResponse = data;
      if (error) {
        const fallback = await supabase.functions.invoke('contract-analysis', {
          body: payload
        });
        if (fallback.error) throw fallback.error;
        analysisResponse = fallback.data;
      }

      const analysis = (analysisResponse as any)?.analysis as string;
      if (!analysis) {
        throw new Error('No analysis returned from AI service');
      }
      localStorage.setItem(cacheKey, analysis);
      localStorage.setItem(lastCallKey, Date.now().toString());
      return { analysis, docId };
    },
    onSuccess: async ({ analysis, docId }) => {
      await supabase
        .from('documents')
        .update({ summary: analysis } as any)
        .eq('id', docId as any);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({ title: 'Document summarized', description: 'Summary saved.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error summarizing document', description: error.message || 'Unknown error', variant: 'destructive' });
    }
  });
}
