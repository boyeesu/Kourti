import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { resolveRedlineEdit, type DocumentEdit } from '@/lib/featuresApi';

interface EditCardProps {
  documentId: string;
  edit: DocumentEdit;
  onResolved?: (edit: DocumentEdit, status: 'accepted' | 'rejected') => void;
}

/**
 * Renders one tracked-change edit with Accept / Reject buttons.
 * Optimistically marks the local state on click so the user sees immediate
 * feedback; on backend failure the parent can revert by replacing the row.
 */
export function EditCard({ documentId, edit, onResolved }: EditCardProps) {
  const [status, setStatus] = useState<DocumentEdit['status']>(edit.status);
  const [pending, setPending] = useState<'accept' | 'reject' | null>(null);

  const handle = async (verb: 'accept' | 'reject') => {
    if (status !== 'pending' || pending) return;
    setPending(verb);
    try {
      const result = await resolveRedlineEdit(documentId, edit.id, verb);
      const next = result.status ?? (verb === 'accept' ? 'accepted' : 'rejected');
      setStatus(next);
      onResolved?.({ ...edit, status: next }, next);
    } catch (err) {
      toast.error(`${verb === 'accept' ? 'Accept' : 'Reject'} failed`, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setPending(null);
    }
  };

  const resolved = status !== 'pending';

  return (
    <div
      className={`border rounded-lg p-3 ${
        status === 'accepted'
          ? 'border-green-200 bg-green-50/60'
          : status === 'rejected'
            ? 'border-red-200 bg-red-50/60 opacity-75'
            : 'border-gray-200 bg-gray-50'
      }`}
    >
      {edit.reason && <p className="text-xs text-gray-600 mb-2 italic">{edit.reason}</p>}

      <div className="text-sm leading-relaxed font-serif bg-white border border-gray-200 rounded-md px-3 py-2 break-words">
        {edit.context_before && (
          <span className="text-gray-400">…{edit.context_before.slice(-30)}</span>
        )}
        {edit.deleted_text && (
          <span className="text-red-600 line-through">{edit.deleted_text}</span>
        )}
        {edit.inserted_text && (
          <span className="text-green-700 font-medium">{edit.inserted_text}</span>
        )}
        {edit.context_after && (
          <span className="text-gray-400">{edit.context_after.slice(0, 30)}…</span>
        )}
      </div>

      <div className="flex gap-2 mt-3">
        <Button
          variant={status === 'accepted' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handle('accept')}
          disabled={resolved || pending !== null}
        >
          {pending === 'accept' ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Check className="h-3 w-3 mr-1" />
          )}
          {status === 'accepted' ? 'Accepted' : 'Accept'}
        </Button>
        <Button
          variant={status === 'rejected' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handle('reject')}
          disabled={resolved || pending !== null}
        >
          {pending === 'reject' ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <X className="h-3 w-3 mr-1" />
          )}
          {status === 'rejected' ? 'Rejected' : 'Reject'}
        </Button>
      </div>
    </div>
  );
}
