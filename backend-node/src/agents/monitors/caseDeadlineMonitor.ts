import { db } from '../../db/pool.js';

interface MonitorConfig {
  daysBeforeWarning?: number;
  daysBeforeCritical?: number;
  escalateAfterDays?: number;
}

export async function runCaseDeadlineMonitor(
  organizationId: string,
  monitorId: string,
  config: MonitorConfig
) {
  const warningDays = Math.min(365, Math.max(1, Number(config.daysBeforeWarning) || 14));
  const criticalDays = Math.min(365, Math.max(1, Number(config.daysBeforeCritical) || 3));
  const escalateAfterDays = Math.min(365, Math.max(1, Number(config.escalateAfterDays) || 7));

  // Find cases with upcoming hearing dates
  const hearingResult = await db.query(
    `select id, title, next_hearing_date, case_number, status, assigned_to
     from cases
     where organization_id = $1
       and next_hearing_date is not null
       and next_hearing_date <= now() + ($2 || ' days')::interval
       and next_hearing_date >= now()
       and status not in ('closed', 'archived')
     order by next_hearing_date asc`,
    [organizationId, warningDays]
  );

  // Find overdue case activities
  const overdueResult = await db.query(
    `select ca.id, ca.title, ca.due_date, ca.case_id, ca.activity_type,
            c.title as case_title, c.case_number
     from case_activities ca
     join cases c on c.id = ca.case_id
     where c.organization_id = $1
       and ca.status != 'completed'
       and ca.due_date is not null
       and ca.due_date < now()
     order by ca.due_date asc
     limit 50`,
    [organizationId]
  );

  let alertsCreated = 0;

  // Create alerts for upcoming hearings
  for (const caseRow of hearingResult.rows) {
    const daysUntil = Math.ceil(
      (new Date(caseRow.next_hearing_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const severity = daysUntil <= criticalDays ? 'critical' : 'warning';

    const existing = await db.query(
      `select id from agent_alerts
       where organization_id = $1
         and entity_type = 'case'
         and entity_id = $2
         and alert_type = 'hearing_deadline'
         and status = 'active'`,
      [organizationId, caseRow.id]
    );

    if (existing.rows.length > 0) continue;

    await db.query(
      `insert into agent_alerts
         (organization_id, monitor_id, alert_type, severity, title, description, entity_type, entity_id, metadata)
       values ($1, $2, $3, $4, $5, $6, 'case', $7, $8)`,
      [
        organizationId,
        monitorId,
        'hearing_deadline',
        severity,
        `Hearing in ${daysUntil} day${daysUntil === 1 ? '' : 's'}: ${caseRow.title}`,
        `Case "${caseRow.title}"${caseRow.case_number ? ` (${caseRow.case_number})` : ''} ` +
          `has a hearing scheduled for ${caseRow.next_hearing_date}.`,
        caseRow.id,
        JSON.stringify({
          daysUntilHearing: daysUntil,
          hearingDate: caseRow.next_hearing_date,
          caseNumber: caseRow.case_number,
          assignedTo: caseRow.assigned_to,
        }),
      ]
    );
    alertsCreated++;
  }

  // Create alerts for overdue activities
  for (const activity of overdueResult.rows) {
    const daysOverdue = Math.ceil(
      (Date.now() - new Date(activity.due_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    const severity = daysOverdue >= escalateAfterDays ? 'critical' : 'warning';

    const existing = await db.query(
      `select id from agent_alerts
       where organization_id = $1
         and entity_type = 'case'
         and entity_id = $2
         and alert_type = 'overdue_activity'
         and status = 'active'
         and metadata->>'activityId' = $3`,
      [organizationId, activity.case_id, activity.id]
    );

    if (existing.rows.length > 0) continue;

    await db.query(
      `insert into agent_alerts
         (organization_id, monitor_id, alert_type, severity, title, description, entity_type, entity_id, metadata)
       values ($1, $2, $3, $4, $5, $6, 'case', $7, $8)`,
      [
        organizationId,
        monitorId,
        'overdue_activity',
        severity,
        `Overdue: "${activity.title}" (${daysOverdue} days)`,
        `Activity "${activity.title}" (${activity.activity_type}) on case "${activity.case_title}" ` +
          `was due ${activity.due_date} and is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.`,
        activity.case_id,
        JSON.stringify({
          activityId: activity.id,
          activityType: activity.activity_type,
          daysOverdue,
          dueDate: activity.due_date,
          caseTitle: activity.case_title,
        }),
      ]
    );
    alertsCreated++;
  }

  return {
    hearingsChecked: hearingResult.rows.length,
    overdueActivitiesChecked: overdueResult.rows.length,
    alertsCreated,
  };
}
