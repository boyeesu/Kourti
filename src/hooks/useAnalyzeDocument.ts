import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { invokeNodeApi } from '@/lib/backendApi';

export function useAnalyzeDocument() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async ({ docId, content }: { docId: string; content: string }) => {
      const cacheKey = `ai-summary-${docId}`;
      const lastCallKey = `ai-lastcall`;
      const lastCall = localStorage.getItem(lastCallKey);
      if (lastCall && Date.now() - Number(lastCall) < 1000) {
        throw new Error('API rate limit exceeded');
      }
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        return { analysis: cached, docId };
      }

      const result = await invokeNodeApi<{ analysis: string }>(
        '/api/v1/ai/advanced-contract-analysis',
        {
          method: 'POST',
          body: { text: content, analysisType: 'summarize' },
        }
      );
      const analysis = result.analysis;
      if (!analysis) throw new Error('No analysis returned');
      localStorage.setItem(cacheKey, analysis);
      localStorage.setItem(lastCallKey, Date.now().toString());
      return { analysis, docId };
    },
    onSuccess: async ({ analysis, docId }) => {
      if (!organizationId) return;
      try {
        await invokeNodeApi(`/api/v1/documents/${docId}`, {
          method: 'PATCH',
          body: { summary: analysis },
        });
      } catch {
        // Best-effort save — the analysis is already cached locally
      }
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
