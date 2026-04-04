import { db } from '../../db/pool.js';

export async function runDocumentChangeMonitor(
  organizationId: string,
  monitorId: string,
  lastRunAt: string | null
) {
  const since = lastRunAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find documents uploaded since last run
  const result = await db.query(
    `select d.id, d.name, d.mime_type, d.file_size, d.created_at, d.client_id,
            c.name as client_name
     from documents d
     left join clients c on c.id = d.client_id
     where d.organization_id = $1
       and d.created_at > $2
     order by d.created_at desc
     limit 100`,
    [organizationId, since]
  );

  let alertsCreated = 0;

  for (const doc of result.rows) {
    // Deduplicate
    const existing = await db.query(
      `select id from agent_alerts
       where organization_id = $1
         and entity_type = 'document'
         and entity_id = $2
         and alert_type = 'new_document'
         and status = 'active'`,
      [organizationId, doc.id]
    );

    if (existing.rows.length > 0) continue;

    const sizeKb = doc.file_size ? Math.round(doc.file_size / 1024) : null;

    await db.query(
      `insert into agent_alerts
         (organization_id, monitor_id, alert_type, severity, title, description, entity_type, entity_id, metadata)
       values ($1, $2, $3, $4, $5, $6, 'document', $7, $8)`,
      [
        organizationId,
        monitorId,
        'new_document',
        'info',
        `New document uploaded: ${doc.name}`,
        `Document "${doc.name}" was uploaded` +
          (doc.client_name ? ` for client ${doc.client_name}` : '') +
          (sizeKb ? ` (${sizeKb} KB)` : '') +
          `. Consider reviewing and classifying it.`,
        doc.id,
        JSON.stringify({
          fileName: doc.name,
          mimeType: doc.mime_type,
          fileSize: doc.file_size,
          clientId: doc.client_id,
          clientName: doc.client_name,
          uploadedAt: doc.created_at,
        }),
      ]
    );
    alertsCreated++;
  }

  return { documentsChecked: result.rows.length, alertsCreated };
}
