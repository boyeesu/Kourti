import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeFunctionWithCsrf } from '@/lib/csrfClient';
import { toast } from 'sonner';
import { useUserOrganization } from '@/hooks/useUserOrganization';

export function useAnalyzeDocument() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

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
      const { data, error } = await invokeFunctionWithCsrf('advanced-contract-analysis', {
        body: payload,
      });

      let analysisResponse = data;
      if (error) {
        const fallback = await invokeFunctionWithCsrf('contract-analysis-ai', {
          body: payload,
        });
        if (fallback.error) throw fallback.error;
        analysisResponse = fallback.data;
      }

      const analysis = (analysisResponse as Record<string, unknown>)?.analysis as string;
      if (!analysis) {
        throw new Error('No analysis returned from AI service');
      }
      localStorage.setItem(cacheKey, analysis);
      localStorage.setItem(lastCallKey, Date.now().toString());
      return { analysis, docId };
    },
    onSuccess: async ({ analysis, docId }) => {
      if (!organizationId) return;
      await supabase
        .from('documents')
        .update({ summary: analysis } as never)
        .eq('id', docId)
        .eq('organization_id', organizationId);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document summarized', { description: 'Summary saved.' });
    },
    onError: (error: unknown) => {
      toast.error('Error summarizing document', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}
