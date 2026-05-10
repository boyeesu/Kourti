import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, GitBranch, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  listDocumentVersions,
  activateDocumentVersion,
  getDocumentVersionDownloadUrl,
  type DocumentVersion,
} from '@/lib/featuresApi';

interface Props {
  documentId: string;
  /** When passed, renders an "active" badge next to the matching version. */
  currentVersionId?: string | null;
  onActivated?: (versionId: string) => void;
}

const SOURCE_LABELS: Record<DocumentVersion['source'], string> = {
  upload: 'Upload',
  assistant_edit: 'AI redline',
  user_accept: 'Accepted',
  user_reject: 'Rejected',
  generated: 'Generated',
};

const SOURCE_BADGE: Record<DocumentVersion['source'], string> = {
  upload: 'bg-gray-100 text-gray-700',
  assistant_edit: 'bg-purple-100 text-purple-700',
  user_accept: 'bg-green-100 text-green-700',
  user_reject: 'bg-red-100 text-red-700',
  generated: 'bg-blue-100 text-blue-700',
};

export function DocumentVersionsPanel({ documentId, currentVersionId, onActivated }: Props) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(currentVersionId ?? null);
  const [activating, setActivating] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDocumentVersions(documentId)
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch((err) =>
        toast.error('Failed to load versions', {
          description: err instanceof Error ? err.message : 'Unknown error',
        })
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    setActiveId(currentVersionId ?? null);
  }, [currentVersionId]);

  const handleActivate = async (versionId: string) => {
    setActivating(versionId);
    try {
      await activateDocumentVersion(documentId, versionId);
      setActiveId(versionId);
      onActivated?.(versionId);
      toast.success('Version activated');
    } catch (err) {
      toast.error('Activate failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setActivating(null);
    }
  };

  const handleDownload = async (versionId: string) => {
    try {
      const { signedUrl } = await getDocumentVersionDownloadUrl(documentId, versionId);
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error('Download failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-blue-500" />
          Version history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : versions.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            No versions yet. Versions are created when AI proposes edits or when you accept/reject
            tracked changes.
          </div>
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => {
              const isActive = activeId === v.id;
              return (
                <li
                  key={v.id}
                  className={`flex items-center gap-3 border rounded-md px-3 py-2 ${
                    isActive ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">v{v.version_number}</span>
                      <Badge variant="secondary" className={SOURCE_BADGE[v.source]}>
                        {SOURCE_LABELS[v.source]}
                      </Badge>
                      {isActive && (
                        <Badge variant="default" className="bg-blue-600">
                          Active
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {v.display_name ?? '(unnamed)'} ·{' '}
                      {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(v.id)}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {!isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleActivate(v.id)}
                      disabled={activating === v.id}
                    >
                      {activating === v.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3 mr-1" />
                      )}
                      Make active
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
