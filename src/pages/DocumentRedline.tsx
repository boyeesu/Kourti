import { useParams } from 'react-router-dom';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useDocument } from '@/hooks/useDocuments';
import { RedlinePanel } from '@/components/redline/RedlinePanel';
import { DocumentVersionsPanel } from '@/components/documents/DocumentVersionsPanel';

export default function DocumentRedline() {
  const { id } = useParams<{ id: string }>();
  const { data: document, isLoading, error } = useDocument(id ?? '');

  if (!id) return <div className="p-6 text-sm text-red-600">Missing document id.</div>;

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div>
        <h1 className="text-2xl font-semibold">
          {isLoading ? 'Loading…' : (document?.name ?? 'Document')}
        </h1>
        <p className="text-sm text-muted-foreground">
          Propose AI tracked-change edits and manage versions for this document.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load document.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RedlinePanel documentId={id} documentName={document?.name} />
        </div>
        <div>
          <DocumentVersionsPanel
            documentId={id}
            currentVersionId={
              (document as { current_version_id?: string | null } | undefined)
                ?.current_version_id ?? null
            }
          />
        </div>
      </div>
    </div>
  );
}
