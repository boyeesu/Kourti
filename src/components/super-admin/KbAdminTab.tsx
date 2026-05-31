import { useState } from 'react';
import { Brain, Plus, RefreshCw, Search, Trash2, Pencil, X } from 'lucide-react';
import { format } from 'date-fns';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useKbChunks,
  useCreateKbChunk,
  useUpdateKbChunk,
  useDeleteKbChunk,
  useKbTestRetrieval,
  useKbReingest,
  type KbChunkSummary,
} from '@/hooks/useKbAdmin';

const PAGE_SIZE = 50;

interface EditState {
  id: string | null; // null => creating
  content: string;
  source: string;
  title: string;
  category: string;
}

const emptyEdit: EditState = { id: null, content: '', source: '', title: '', category: '' };

export function KbAdminTab() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [reason, setReason] = useState('');

  const [retrievalQuery, setRetrievalQuery] = useState('');

  const { data, isLoading } = useKbChunks({ q: query || undefined, limit: PAGE_SIZE, offset });
  const createChunk = useCreateKbChunk();
  const updateChunk = useUpdateKbChunk();
  const deleteChunk = useDeleteKbChunk();
  const testRetrieval = useKbTestRetrieval();
  const reingest = useKbReingest();

  const chunks = data?.chunks ?? [];
  const total = data?.total ?? 0;

  const runSearch = () => {
    setOffset(0);
    setQuery(search.trim());
  };

  const openCreate = () => {
    setEdit({ ...emptyEdit });
    setReason('');
  };

  const openEdit = (c: KbChunkSummary) => {
    // The list only has a preview; pull the full content lazily isn't wired
    // here — the preview is the editable seed and the admin can paste full copy.
    setEdit({
      id: c.id,
      content: c.content_preview.replace(/…$/, ''),
      source: c.entry_id,
      title: c.title,
      category: c.category,
    });
    setReason('');
  };

  const submitEdit = () => {
    if (!edit) return;
    if (reason.trim().length < 3) return;
    if (edit.id) {
      updateChunk.mutate(
        {
          id: edit.id,
          content: edit.content,
          source: edit.source || undefined,
          title: edit.title || undefined,
          category: edit.category || undefined,
          reason: reason.trim(),
        },
        { onSuccess: () => setEdit(null) }
      );
    } else {
      createChunk.mutate(
        {
          content: edit.content,
          source: edit.source || undefined,
          title: edit.title || undefined,
          category: edit.category || undefined,
          reason: reason.trim(),
        },
        { onSuccess: () => setEdit(null) }
      );
    }
  };

  const onDelete = (c: KbChunkSummary) => {
    const r = window.prompt(`Delete chunk "${c.title}"? Enter a reason (min 3 chars):`);
    if (!r || r.trim().length < 3) return;
    deleteChunk.mutate({ id: c.id, reason: r.trim() });
  };

  const onReingest = () => {
    const r = window.prompt(
      'Re-ingest the entire MARTHA knowledge base from source. Enter a reason (min 3 chars):'
    );
    if (!r || r.trim().length < 3) return;
    reingest.mutate({ reason: r.trim() });
  };

  const saving = createChunk.isPending || updateChunk.isPending;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" /> MARTHA Knowledge Base
          </h2>
          <p className="text-muted-foreground">
            Manage the marketing chatbot's grounding content. Changes affect public answers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onReingest} variant="outline" disabled={reingest.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${reingest.isPending ? 'animate-spin' : ''}`} />
            Re-ingest
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New chunk
          </Button>
        </div>
      </div>

      {/* Test retrieval */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Test retrieval</h3>
          <p className="text-sm text-muted-foreground">
            Preview the exact chunks MARTHA would ground on for a visitor question.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. How much does the Professional plan cost?"
              value={retrievalQuery}
              onChange={(e) => setRetrievalQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && retrievalQuery.trim())
                  testRetrieval.mutate({ query: retrievalQuery.trim() });
              }}
            />
            <Button
              variant="secondary"
              disabled={!retrievalQuery.trim() || testRetrieval.isPending}
              onClick={() => testRetrieval.mutate({ query: retrievalQuery.trim() })}
            >
              {testRetrieval.isPending ? 'Searching…' : 'Run'}
            </Button>
          </div>
          {testRetrieval.data && (
            <div className="space-y-2">
              {testRetrieval.data.matches.length === 0 ? (
                <div className="text-sm text-muted-foreground">No matching chunks.</div>
              ) : (
                testRetrieval.data.matches.map((m, i) => (
                  <div key={`${m.entry_id}-${i}`} className="p-3 border rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <div className="font-medium text-sm">{m.title}</div>
                      <Badge variant={m.similarity > 0 ? 'default' : 'outline'}>
                        {m.similarity > 0 ? `score ${m.similarity.toFixed(3)}` : 'text match'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mb-1">
                      {m.entry_id} • {m.category}
                    </div>
                    <div className="text-sm">{m.content_preview}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / edit form */}
      {edit && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">{edit.id ? 'Edit chunk' : 'New chunk'}</h3>
              <Button variant="ghost" size="icon" onClick={() => setEdit(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                placeholder="Title"
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
              <Input
                placeholder="Source / entry id (optional)"
                value={edit.source}
                onChange={(e) => setEdit({ ...edit, source: e.target.value })}
              />
              <Input
                placeholder="Category (optional)"
                value={edit.category}
                onChange={(e) => setEdit({ ...edit, category: e.target.value })}
              />
            </div>
            <Textarea
              placeholder="Chunk content (what MARTHA can quote)…"
              value={edit.content}
              onChange={(e) => setEdit({ ...edit, content: e.target.value })}
              rows={6}
            />
            <Input
              placeholder="Reason for this change (required, min 3 chars)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button
                onClick={submitEdit}
                disabled={saving || edit.content.trim().length === 0 || reason.trim().length < 3}
              >
                {saving ? 'Saving…' : edit.id ? 'Save changes' : 'Create chunk'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chunk list */}
      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search chunk content…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : chunks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No chunks found</div>
          ) : (
            <div className="space-y-2">
              {chunks.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-2 p-4 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {c.entry_id} • {c.category} • #{c.chunk_index}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!c.has_embedding && <Badge variant="destructive">no vector</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(c.created_at), 'MMM dd, yyyy')}
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{c.content_preview}</div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
