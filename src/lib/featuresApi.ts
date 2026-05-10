/**
 * Frontend API client for the new ported features:
 *   - Playbook prompt templates
 *   - Document versions
 *   - Redline (DOCX tracked-changes)
 *   - Tabular review
 *
 * Built on top of invokeNodeApi from backendApi.ts so we share auth +
 * timeout handling.
 */

import { invokeNodeApi } from '@/lib/backendApi';
import { env } from '@/lib/env';
import { getAccessToken, refreshSession } from '@/lib/authClient';

// ─── Types ───────────────────────────────────────────────────────────

export type ColumnFormat =
  | 'text'
  | 'bulleted_list'
  | 'number'
  | 'percentage'
  | 'monetary_amount'
  | 'currency'
  | 'yes_no'
  | 'date'
  | 'tag';

export interface TabularColumn {
  index: number;
  name: string;
  description?: string;
  format?: ColumnFormat;
  tags?: string[];
  prompt?: string;
}

export interface TabularReview {
  id: string;
  organization_id: string;
  case_id: string | null;
  template_id: string | null;
  title: string;
  practice: string | null;
  columns_config: TabularColumn[];
  document_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface TabularCellContent {
  summary: string;
  flag?: 'green' | 'grey' | 'yellow' | 'red';
  reasoning?: string;
}

export interface TabularCell {
  id: string;
  document_id: string;
  column_index: number;
  status: 'pending' | 'generating' | 'done' | 'error';
  content: TabularCellContent | null;
  error_message: string | null;
  updated_at: string;
}

export interface TabularReviewDetail {
  review: TabularReview;
  columns: TabularColumn[];
  documents: Array<{
    id: string;
    name: string;
    file_path: string | null;
    mime_type: string | null;
    current_version_id: string | null;
  }>;
  cells: TabularCell[];
}

export interface PlaybookTemplate {
  id: string;
  organization_id: string | null;
  is_system: boolean;
  slug: string | null;
  title: string;
  description: string | null;
  kind: 'assistant' | 'tabular';
  prompt_md: string;
  columns_config: TabularColumn[] | null;
  practice: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  source: 'upload' | 'assistant_edit' | 'user_accept' | 'user_reject' | 'generated';
  storage_path: string;
  pdf_storage_path: string | null;
  display_name: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface DocumentEdit {
  id: string;
  document_id: string;
  version_id: string | null;
  ins_w_id: string | null;
  del_w_id: string | null;
  deleted_text: string | null;
  inserted_text: string | null;
  context_before: string | null;
  context_after: string | null;
  reason: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  resolved_at: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

const unwrap = <T>(r: ApiResponse<T>): T => r.data;

// ─── Playbook templates ──────────────────────────────────────────────

export async function listPlaybookTemplates(opts?: {
  kind?: 'assistant' | 'tabular';
  includeSystem?: boolean;
}): Promise<PlaybookTemplate[]> {
  return unwrap(
    await invokeNodeApi<ApiResponse<PlaybookTemplate[]>>('/api/v1/playbooks/templates', {
      query: { kind: opts?.kind, include_system: opts?.includeSystem ?? true },
    })
  );
}

export async function getPlaybookTemplate(id: string): Promise<PlaybookTemplate> {
  return unwrap(
    await invokeNodeApi<ApiResponse<PlaybookTemplate>>(`/api/v1/playbooks/templates/${id}`)
  );
}

export async function createPlaybookTemplate(
  body: Pick<PlaybookTemplate, 'title' | 'kind' | 'prompt_md'> &
    Partial<Pick<PlaybookTemplate, 'description' | 'columns_config' | 'practice'>>
): Promise<PlaybookTemplate> {
  return unwrap(
    await invokeNodeApi<ApiResponse<PlaybookTemplate>>('/api/v1/playbooks/templates', {
      method: 'POST',
      body,
    })
  );
}

// ─── Document versions ───────────────────────────────────────────────

export async function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  return unwrap(
    await invokeNodeApi<ApiResponse<DocumentVersion[]>>(`/api/v1/documents/${documentId}/versions`)
  );
}

export async function activateDocumentVersion(
  documentId: string,
  versionId: string
): Promise<{ activated: string }> {
  return unwrap(
    await invokeNodeApi<ApiResponse<{ activated: string }>>(
      `/api/v1/documents/${documentId}/versions/${versionId}/activate`,
      { method: 'POST' }
    )
  );
}

export async function getDocumentVersionDownloadUrl(
  documentId: string,
  versionId: string
): Promise<{ signedUrl: string; expiresIn: number }> {
  return unwrap(
    await invokeNodeApi<ApiResponse<{ signedUrl: string; expiresIn: number }>>(
      `/api/v1/documents/${documentId}/versions/${versionId}/download`
    )
  );
}

// ─── Redline ─────────────────────────────────────────────────────────

export interface RedlineProposeResponse {
  versionId: string;
  versionNumber: number;
  downloadUrl: string;
  appliedCount: number;
  errors: { index: number; reason: string }[];
  edits: DocumentEdit[];
}

export async function proposeRedline(
  documentId: string,
  body: { instruction: string; maxEdits?: number }
): Promise<RedlineProposeResponse> {
  return unwrap(
    await invokeNodeApi<ApiResponse<RedlineProposeResponse>>(
      `/api/v1/redline/${documentId}/propose`,
      { method: 'POST', body, timeout: 180_000 }
    )
  );
}

export interface RedlineResolveResponse {
  ok: boolean;
  status: 'accepted' | 'rejected';
  version_id: string | null;
  download_url: string | null;
  already_resolved?: boolean;
}

export async function resolveRedlineEdit(
  documentId: string,
  editId: string,
  verb: 'accept' | 'reject'
): Promise<RedlineResolveResponse> {
  return unwrap(
    await invokeNodeApi<ApiResponse<RedlineResolveResponse>>(
      `/api/v1/redline/${documentId}/edits/${editId}/${verb}`,
      { method: 'POST' }
    )
  );
}

export async function listRedlineEdits(
  documentId: string,
  status?: 'pending' | 'accepted' | 'rejected'
): Promise<DocumentEdit[]> {
  return unwrap(
    await invokeNodeApi<ApiResponse<DocumentEdit[]>>(`/api/v1/redline/${documentId}/edits`, {
      query: { status },
    })
  );
}

// ─── Tabular review ──────────────────────────────────────────────────

export async function listTabularReviews(caseId?: string): Promise<TabularReview[]> {
  return unwrap(
    await invokeNodeApi<ApiResponse<TabularReview[]>>('/api/v1/tabular-reviews', {
      query: { caseId },
    })
  );
}

export async function getTabularReview(reviewId: string): Promise<TabularReviewDetail> {
  return unwrap(
    await invokeNodeApi<ApiResponse<TabularReviewDetail>>(`/api/v1/tabular-reviews/${reviewId}`)
  );
}

export async function createTabularReview(body: {
  title: string;
  caseId?: string;
  templateId?: string;
  practice?: string;
  documentIds?: string[];
  columns?: TabularColumn[];
}): Promise<TabularReview> {
  return unwrap(
    await invokeNodeApi<ApiResponse<TabularReview>>('/api/v1/tabular-reviews', {
      method: 'POST',
      body,
    })
  );
}

export async function updateTabularReview(
  reviewId: string,
  body: {
    title?: string;
    practice?: string;
    documentIds?: string[];
    columns?: TabularColumn[];
  }
): Promise<TabularReview> {
  return unwrap(
    await invokeNodeApi<ApiResponse<TabularReview>>(`/api/v1/tabular-reviews/${reviewId}`, {
      method: 'PATCH',
      body,
    })
  );
}

export async function deleteTabularReview(reviewId: string): Promise<{ deleted: true }> {
  return unwrap(
    await invokeNodeApi<ApiResponse<{ deleted: true }>>(`/api/v1/tabular-reviews/${reviewId}`, {
      method: 'DELETE',
    })
  );
}

export async function regenerateTabularCell(
  reviewId: string,
  body: { documentId: string; columnIndex: number }
): Promise<TabularCell> {
  return unwrap(
    await invokeNodeApi<ApiResponse<TabularCell>>(
      `/api/v1/tabular-reviews/${reviewId}/regenerate-cell`,
      { method: 'POST', body, timeout: 90_000 }
    )
  );
}

export async function clearTabularReviewCells(reviewId: string): Promise<{ cleared: true }> {
  return unwrap(
    await invokeNodeApi<ApiResponse<{ cleared: true }>>(
      `/api/v1/tabular-reviews/${reviewId}/clear-cells`,
      { method: 'POST' }
    )
  );
}

// ─── Streaming AI completions ────────────────────────────────────────
//
// Backend endpoints that accept `stream: true` (e.g. /ai/compare-contracts,
// /ai/contract-generator, /ai/assistant, /ai/advanced-contract-analysis)
// emit Server-Sent Events of three shapes:
//   { type: 'delta', content: string }
//   { type: 'done',  tokensUsed: number, modelUsed: string }
//   { type: 'error', error: string }
// The helper below consumes that stream and yields each event so callers
// can feed deltas into a useState while accumulating the full string.

export type AiStreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'done'; tokensUsed: number; modelUsed: string }
  | { type: 'error'; error: string };

export async function* streamAiCompletion(
  path: string,
  body: Record<string, unknown>
): AsyncGenerator<AiStreamEvent> {
  let token = getAccessToken();
  if (!token) {
    const sess = await refreshSession();
    token = sess.accessToken;
  }
  const response = await fetch(`${env.BACKEND_API_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!response.ok || !response.body) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`stream ${response.status}: ${errBody}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const line = block.trim();
      if (!line || !line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      try {
        yield JSON.parse(payload) as AiStreamEvent;
      } catch {
        // Skip malformed events.
      }
    }
  }
}

/**
 * Stream a contract comparison. Calls `onDelta` with each text fragment
 * and resolves with the full string once the stream completes.
 */
export async function streamCompareContracts(
  body: { contractA: string; contractB: string },
  onDelta: (delta: string) => void
): Promise<{ comparison: string; tokensUsed: number; modelUsed: string }> {
  let full = '';
  let tokensUsed = 0;
  let modelUsed = '';
  for await (const event of streamAiCompletion('/api/v1/ai/compare-contracts', body)) {
    if (event.type === 'delta') {
      full += event.content;
      onDelta(event.content);
    } else if (event.type === 'done') {
      tokensUsed = event.tokensUsed;
      modelUsed = event.modelUsed;
    } else if (event.type === 'error') {
      throw new Error(event.error);
    }
  }
  return { comparison: full, tokensUsed, modelUsed };
}

/**
 * Stream a generated contract. Same pattern as streamCompareContracts.
 */
export async function streamContractGenerator(
  body: {
    contractType: string;
    parties?: string[];
    terms?: string;
    jurisdiction?: string;
  },
  onDelta: (delta: string) => void
): Promise<{ contract: string; tokensUsed: number; modelUsed: string }> {
  let full = '';
  let tokensUsed = 0;
  let modelUsed = '';
  for await (const event of streamAiCompletion('/api/v1/ai/contract-generator', body)) {
    if (event.type === 'delta') {
      full += event.content;
      onDelta(event.content);
    } else if (event.type === 'done') {
      tokensUsed = event.tokensUsed;
      modelUsed = event.modelUsed;
    } else if (event.type === 'error') {
      throw new Error(event.error);
    }
  }
  return { contract: full, tokensUsed, modelUsed };
}

// SSE generation stream — yields cell updates as they arrive.
export type TabularStreamEvent =
  | { type: 'start'; total: number }
  | { type: 'cell'; cell: TabularCell }
  | { type: 'error'; documentId: string; columnIndex: number; message: string }
  | { type: 'done' };

export async function* streamTabularGeneration(
  reviewId: string
): AsyncGenerator<TabularStreamEvent> {
  let token = getAccessToken();
  if (!token) {
    const sess = await refreshSession();
    token = sess.accessToken;
  }
  const response = await fetch(
    `${env.BACKEND_API_URL}/api/v1/tabular-reviews/${reviewId}/generate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
    }
  );
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    throw new Error(`generate failed: ${response.status} ${body}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';
    for (const block of lines) {
      const line = block.trim();
      if (!line || !line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      try {
        yield JSON.parse(payload) as TabularStreamEvent;
      } catch {
        // Skip malformed events.
      }
    }
  }
}
