import { PgBoss } from 'pg-boss';
import type { Job, WorkOptions } from 'pg-boss';

import { env } from '../config/env.js';

let boss: PgBoss | null = null;

export function getBoss(): PgBoss {
  if (!boss) {
    boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: 'pgboss',
    });

    boss.on('error', (err: Error) => {
      console.error('[pg-boss] error:', err.message);
    });
  }

  return boss;
}

// Job handler registry — agents register themselves here
type JobHandler = (jobs: Job[]) => Promise<void>;
const handlers = new Map<string, { handler: JobHandler; options?: WorkOptions }>();

export function registerAgentHandler(
  name: string,
  handler: (job: Job) => Promise<void>,
  options?: WorkOptions
) {
  // pg-boss v10 passes batches — wrap single-job handlers
  const batchHandler: JobHandler = async (jobs) => {
    for (const job of jobs) {
      await handler(job);
    }
  };
  handlers.set(name, { handler: batchHandler, options });
}

export async function startAgentWorker() {
  if (!env.AGENT_ENABLED) {
    console.log('[pg-boss] Agent worker disabled (AGENT_ENABLED=false)');
    return;
  }

  const b = getBoss();
  await b.start();
  console.log('[pg-boss] Started');

  // Create queues with retry/expiry settings
  for (const [name] of handlers) {
    await b.createQueue(name, {
      retryLimit: 2,
      retryDelay: 30,
      expireInSeconds: 900, // 15 min
      deleteAfterSeconds: 86_400, // 24h
    });
  }

  for (const [name, { handler, options }] of handlers) {
    const workOptions: WorkOptions = options ?? {
      localConcurrency: env.AGENT_MAX_CONCURRENT_JOBS,
    };
    await b.work(name, workOptions, handler);
    console.log(`[pg-boss] Registered handler: ${name}`);
  }
}

export async function stopAgentWorker() {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 10_000 });
    console.log('[pg-boss] Stopped');
  }
}
