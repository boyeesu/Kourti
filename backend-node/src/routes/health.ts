import { Router } from 'express';

import { db } from '../db/pool.js';

export const healthRouter = Router();

// Railway health check endpoint -- must return 200 for the deploy to succeed.
// DB status is reported in the body for monitoring but doesn't block the check.
healthRouter.get('/', async (_req, res) => {
  try {
    const dbStatus = await db
      .query('select 1 as ok')
      .then(() => 'ok' as const)
      .catch(() => 'error' as const);

    res.status(200).json({
      ok: true,
      service: 'kourti-backend-node',
      database: dbStatus,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Even if something unexpected happens, return 200 so Railway doesn't kill the container
    res.status(200).json({
      ok: true,
      service: 'kourti-backend-node',
      database: 'unknown',
      timestamp: new Date().toISOString(),
    });
  }
});
