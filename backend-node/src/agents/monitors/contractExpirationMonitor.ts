import { db } from '../../db/pool.js';

interface MonitorConfig {
  daysBeforeWarning?: number;
  daysBeforeCritical?: number;
}

export async function runContractExpirationMonitor(
  organizationId: string,
  monitorId: string,
  config: MonitorConfig
) {
  const warningDays = Math.min(365, Math.max(1, Number(config.daysBeforeWarning) || 30));
  const criticalDays = Math.min(365, Math.max(1, Number(config.daysBeforeCritical) || 7));

  // Find contracts expiring within the warning window
  const result = await db.query(
    `select id, title, end_date, client_id, value, currency, status
     from contracts
     where organization_id = $1
       and end_date is not null
       and end_date <= now() + ($2 || ' days')::interval
       and end_date >= now()
       and status not in ('expired', 'archived')
     order by end_date asc`,
    [organizationId, warningDays]
  );

  let alertsCreated = 0;

  for (const contract of result.rows) {
    const daysUntil = Math.ceil(
      (new Date(contract.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const severity = daysUntil <= criticalDays ? 'critical' : 'warning';

    // Deduplicate — don't create if active alert already exists for this contract
    const existing = await db.query(
      `select id from agent_alerts
       where organization_id = $1
         and entity_type = 'contract'
         and entity_id = $2
         and alert_type = 'contract_expiration'
         and status = 'active'`,
      [organizationId, contract.id]
    );

    if (existing.rows.length > 0) continue;

    await db.query(
      `insert into agent_alerts
         (organization_id, monitor_id, alert_type, severity, title, description, entity_type, entity_id, metadata)
       values ($1, $2, $3, $4, $5, $6, 'contract', $7, $8)`,
      [
        organizationId,
        monitorId,
        'contract_expiration',
        severity,
        `Contract "${contract.title}" expires in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
        `Contract "${contract.title}" is set to expire on ${contract.end_date}. ` +
          (contract.value ? `Value: ${contract.currency ?? ''} ${contract.value}. ` : '') +
          `Review and take action before expiration.`,
        contract.id,
        JSON.stringify({
          daysUntilExpiration: daysUntil,
          endDate: contract.end_date,
          contractValue: contract.value,
          currency: contract.currency,
          clientId: contract.client_id,
        }),
      ]
    );
    alertsCreated++;
  }

  return { contractsChecked: result.rows.length, alertsCreated };
}
