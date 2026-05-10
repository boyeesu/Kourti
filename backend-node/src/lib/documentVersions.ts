/**
 * Document version helpers.
 *
 * `loadActiveVersion` — resolves the storage paths for the version a
 * caller wants. If `versionId` is passed it loads that specific version;
 * otherwise it falls back to documents.current_version_id.
 *
 * `createVersion` — writes a new row, optionally bumps
 * documents.current_version_id, and returns the inserted row.
 *
 * `attachActiveVersionPaths` — batched lookup that decorates a list of
 * document rows with their active storage_path / pdf_storage_path in one
 * round trip (avoids N+1).
 */

import { db } from '../db/pool.js';

export type VersionSource =
  | 'upload'
  | 'assistant_edit'
  | 'user_accept'
  | 'user_reject'
  | 'generated';

export interface DocumentVersionRow {
  id: string;
  document_id: string;
  organization_id: string;
  version_number: number;
  source: VersionSource;
  storage_path: string;
  pdf_storage_path: string | null;
  display_name: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ActiveVersion {
  version_id: string;
  document_id: string;
  organization_id: string;
  version_number: number;
  source: VersionSource;
  storage_path: string;
  pdf_storage_path: string | null;
  mime_type: string | null;
}

// ---------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------

export async function loadActiveVersion(
  documentId: string,
  organizationId: string,
  versionId?: string | null
): Promise<ActiveVersion | null> {
  if (versionId) {
    const result = await db.query<DocumentVersionRow>(
      `select * from public.document_versions
       where id = $1 and document_id = $2 and organization_id = $3
       limit 1`,
      [versionId, documentId, organizationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      version_id: row.id,
      document_id: row.document_id,
      organization_id: row.organization_id,
      version_number: row.version_number,
      source: row.source,
      storage_path: row.storage_path,
      pdf_storage_path: row.pdf_storage_path,
      mime_type: row.mime_type,
    };
  }

  // Fall back to documents.current_version_id, or the legacy file_path
  // if the document predates versioning.
  const result = await db.query<{
    file_path: string | null;
    mime_type: string | null;
    current_version_id: string | null;
    v_id: string | null;
    v_number: number | null;
    v_source: VersionSource | null;
    v_storage_path: string | null;
    v_pdf_storage_path: string | null;
    v_mime_type: string | null;
  }>(
    `select d.file_path,
            d.mime_type,
            d.current_version_id,
            v.id              as v_id,
            v.version_number  as v_number,
            v.source          as v_source,
            v.storage_path    as v_storage_path,
            v.pdf_storage_path as v_pdf_storage_path,
            v.mime_type       as v_mime_type
       from public.documents d
       left join public.document_versions v on v.id = d.current_version_id
      where d.id = $1 and d.organization_id = $2
      limit 1`,
    [documentId, organizationId]
  );
  const row = result.rows[0];
  if (!row) return null;

  if (row.v_id && row.v_storage_path) {
    return {
      version_id: row.v_id,
      document_id: documentId,
      organization_id: organizationId,
      version_number: row.v_number ?? 1,
      source: row.v_source ?? 'upload',
      storage_path: row.v_storage_path,
      pdf_storage_path: row.v_pdf_storage_path,
      mime_type: row.v_mime_type,
    };
  }

  // Legacy doc with no versions — synthesise a virtual v1 from file_path.
  if (row.file_path) {
    return {
      version_id: '',
      document_id: documentId,
      organization_id: organizationId,
      version_number: 1,
      source: 'upload',
      storage_path: row.file_path,
      pdf_storage_path: null,
      mime_type: row.mime_type,
    };
  }

  return null;
}

export async function listVersions(
  documentId: string,
  organizationId: string
): Promise<DocumentVersionRow[]> {
  const result = await db.query<DocumentVersionRow>(
    `select * from public.document_versions
      where document_id = $1 and organization_id = $2
      order by version_number desc`,
    [documentId, organizationId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------

export interface CreateVersionInput {
  documentId: string;
  organizationId: string;
  source: VersionSource;
  storagePath: string;
  pdfStoragePath?: string | null;
  displayName?: string | null;
  sizeBytes?: number | null;
  mimeType?: string | null;
  createdBy?: string | null;
  /** Defaults to true: also point documents.current_version_id at this row. */
  setAsCurrent?: boolean;
}

export async function createVersion(input: CreateVersionInput): Promise<DocumentVersionRow> {
  const {
    documentId,
    organizationId,
    source,
    storagePath,
    pdfStoragePath = null,
    displayName = null,
    sizeBytes = null,
    mimeType = null,
    createdBy = null,
    setAsCurrent = true,
  } = input;

  const client = await db.connect();
  try {
    await client.query('begin');

    const nextNumberResult = await client.query<{ next_number: number }>(
      `select coalesce(max(version_number), 0) + 1 as next_number
         from public.document_versions
        where document_id = $1`,
      [documentId]
    );
    const nextNumber = nextNumberResult.rows[0]?.next_number ?? 1;

    const insertResult = await client.query<DocumentVersionRow>(
      `insert into public.document_versions
         (document_id, organization_id, version_number, source,
          storage_path, pdf_storage_path, display_name, size_bytes, mime_type, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning *`,
      [
        documentId,
        organizationId,
        nextNumber,
        source,
        storagePath,
        pdfStoragePath,
        displayName,
        sizeBytes,
        mimeType,
        createdBy,
      ]
    );
    const version = insertResult.rows[0]!;

    if (setAsCurrent) {
      await client.query(
        `update public.documents
            set current_version_id = $1, updated_at = now()
          where id = $2 and organization_id = $3`,
        [version.id, documentId, organizationId]
      );
    }

    await client.query('commit');
    return version;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------
// Batch decoration
// ---------------------------------------------------------------------

export async function attachActiveVersionPaths<
  T extends { id: string; current_version_id?: string | null; file_path?: string | null },
>(rows: T[]): Promise<Array<T & { storage_path: string | null; pdf_storage_path: string | null }>> {
  if (rows.length === 0) return [];

  const versionIds = rows.map((r) => r.current_version_id).filter((v): v is string => !!v);
  const versions = versionIds.length
    ? (
        await db.query<{ id: string; storage_path: string; pdf_storage_path: string | null }>(
          `select id, storage_path, pdf_storage_path
             from public.document_versions
            where id = any($1::uuid[])`,
          [versionIds]
        )
      ).rows
    : [];

  const byId = new Map(versions.map((v) => [v.id, v]));

  return rows.map((row) => {
    const v = row.current_version_id ? byId.get(row.current_version_id) : undefined;
    return {
      ...row,
      storage_path: v?.storage_path ?? row.file_path ?? null,
      pdf_storage_path: v?.pdf_storage_path ?? null,
    };
  });
}
