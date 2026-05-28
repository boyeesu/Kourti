import { Pool } from 'pg';

import { env } from '../config/env.js';

// Railway requires SSL in production but serves a self-signed cert in
// the chain. Default to rejectUnauthorized=false for managed PG hosts;
// opt-in to strict verification with DB_SSL_REJECT_UNAUTHORIZED=true.
const needsSsl = env.NODE_ENV === 'production' || env.DATABASE_URL.includes('railway.app');

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
