import { useState, useEffect, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { summarizeContract, extractKeyClauses, redlineContract } from '@/lib/openaiService';

export function AIReviewDialog({ contractText }: { contractText: string }) {
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<null | {
    summary: string;
    clauses: string;
    redlines: string;
  }>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReview = useCallback(
    async (reviewContext?: string) => {
      setLoading(true);
      setError(null);
      setResults(null);
      try {
        const ctx = reviewContext ?? context;
        const fullText = ctx.trim()
          ? `${contractText}\n\nUser Instructions/Context: ${ctx}`
          : contractText;
        const [summary, clauses, redlines] = await Promise.all([
          summarizeContract(fullText),
          extractKeyClauses(fullText),
          redlineContract(fullText),
        ]);
        setResults({ summary, clauses, redlines });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('AI Review failed:', message);
        setError(`AI review failed: ${message}`);
      } finally {
        setLoading(false);
      }
    },
    [contractText, context]
  );

  // Auto-trigger review on mount
  useEffect(() => {
    handleReview('');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
      <DialogHeader className="flex-shrink-0">
        <DialogTitle>AI Review for Contract</DialogTitle>
        <DialogDescription>
          The AI will read, summarize, identify key clauses, and redline critical issues/risk areas
          in this contract.
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="flex-1 min-h-0 max-h-[60vh] overflow-auto">
        <div className="space-y-4 pr-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">
                Running AI analysis... This may take a moment.
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="text-destructive text-sm py-2 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              {error}
            </div>
          )}

          {results && !loading && (
            <div className="space-y-6 py-2">
              <div>
                <h4 className="font-semibold mb-2 text-primary">Summary</h4>
                <div className="bg-muted/60 border border-border rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                  {results.summary}
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2 text-primary">Key Clauses Extracted</h4>
                <div className="bg-muted/60 border border-border rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                  {results.clauses}
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2 text-primary">Redlines & Review Comments</h4>
                <div className="bg-muted/60 border border-border rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                  {results.redlines}
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <DialogFooter className="flex-shrink-0 pt-4 border-t border-border">
        {results || error ? (
          <div className="w-full space-y-2">
            <div className="space-y-2">
              <label className="font-medium text-sm">Review Context (optional)</label>
              <Textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g. Focus on indemnity and limitation of liability."
                rows={2}
              />
            </div>
            <Button
              onClick={() => handleReview()}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              {loading ? 'Running AI Review...' : 'Run Another Review'}
            </Button>
          </div>
        ) : !loading ? (
          <div className="w-full space-y-2">
            <div className="space-y-2">
              <label className="font-medium text-sm">Review Context (optional)</label>
              <Textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g. Focus on indemnity and limitation of liability. Flag missing non-compete or dubious payment schedule terms."
                rows={3}
              />
            </div>
            <Button onClick={() => handleReview()} disabled={loading} className="w-full">
              Run Review
            </Button>
          </div>
        ) : null}
      </DialogFooter>
    </DialogContent>
  );
}
