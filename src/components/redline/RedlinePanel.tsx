import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Download, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { proposeRedline, listRedlineEdits, type DocumentEdit } from '@/lib/featuresApi';
import { EditCard } from './EditCard';

interface RedlinePanelProps {
  documentId: string;
  /** Optional document name for the empty state copy. */
  documentName?: string;
}

/**
 * Self-contained AI-redline panel for a .docx document.
 *
 *   1. User types an instruction (e.g. "tighten ambiguous indemnity language")
 *   2. Backend asks the LLM for tracked-change edits, applies them to a new
 *      document version, persists each change as a row in document_edits
 *   3. Each change renders as an EditCard with Accept / Reject
 *   4. Accepting/rejecting writes a new version of the .docx
 */
export function RedlinePanel({ documentId, documentName }: RedlinePanelProps) {
  const [instruction, setInstruction] = useState('');
  const [generating, setGenerating] = useState(false);
  const [edits, setEdits] = useState<DocumentEdit[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ index: number; reason: string }[]>([]);
  const [loadingEdits, setLoadingEdits] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listRedlineEdits(documentId)
      .then((rows) => {
        if (!cancelled) setEdits(rows);
      })
      .catch((err) => {
        toast.error('Failed to load existing edits', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingEdits(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const handlePropose = async () => {
    if (!instruction.trim()) {
      toast.error('Enter an instruction first');
      return;
    }
    setGenerating(true);
    setErrors([]);
    try {
      const result = await proposeRedline(documentId, {
        instruction: instruction.trim(),
        maxEdits: 15,
      });
      // Prepend new edits ahead of any pre-existing ones.
      setEdits((prev) => [...result.edits, ...prev]);
      setDownloadUrl(result.downloadUrl);
      setErrors(result.errors ?? []);
      toast.success(`Applied ${result.appliedCount} tracked change(s)`, {
        description: result.errors?.length
          ? `${result.errors.length} edit(s) failed to apply.`
          : undefined,
      });
    } catch (err) {
      toast.error('Redline failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const onResolved = (resolved: DocumentEdit) => {
    setEdits((prev) =>
      prev.map((e) => (e.id === resolved.id ? { ...e, status: resolved.status } : e))
    );
  };

  const pending = edits.filter((e) => e.status === 'pending');
  const resolved = edits.filter((e) => e.status !== 'pending');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          AI Redline
          {documentName && (
            <span className="text-sm font-normal text-muted-foreground truncate ml-2">
              · {documentName}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='e.g. "Tighten ambiguous indemnity language and remove uncapped liability."'
            rows={3}
            disabled={generating}
            className="text-sm"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted-foreground">
              The model will propose minimal substring edits as Word tracked changes.
            </p>
            <Button onClick={handlePropose} disabled={generating || !instruction.trim()} size="sm">
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Propose edits
            </Button>
          </div>
        </div>

        {downloadUrl && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-sm">
            <span className="text-blue-700">New tracked-changes version ready</span>
            <Button variant="outline" size="sm" asChild>
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                <Download className="h-3 w-3 mr-1" /> Download .docx
              </a>
            </Button>
          </div>
        )}

        {errors.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <div className="flex items-center gap-1 font-medium mb-1">
              <FileWarning className="h-3 w-3" /> {errors.length} edit(s) could not be located
            </div>
            <ul className="list-disc pl-4 space-y-0.5">
              {errors.slice(0, 5).map((e) => (
                <li key={e.index}>{e.reason}</li>
              ))}
            </ul>
          </div>
        )}

        {loadingEdits ? (
          <div className="text-xs text-muted-foreground">Loading edits…</div>
        ) : edits.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            No edits yet. Propose some above to get started.
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Pending ({pending.length})
                </h4>
                {pending.map((e) => (
                  <EditCard key={e.id} documentId={documentId} edit={e} onResolved={onResolved} />
                ))}
              </div>
            )}
            {resolved.length > 0 && (
              <details className="space-y-2">
                <summary className="text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer">
                  Resolved ({resolved.length})
                </summary>
                <div className="space-y-2 mt-2">
                  {resolved.map((e) => (
                    <EditCard key={e.id} documentId={documentId} edit={e} onResolved={onResolved} />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
