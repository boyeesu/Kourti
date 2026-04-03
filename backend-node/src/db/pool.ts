import { Pool } from 'pg';

import { env } from '../config/env.js';

// Railway and Supabase both require SSL in production.
// If DATABASE_URL already contains ?sslmode=..., pg will honor it.
// Otherwise, enable SSL with rejectUnauthorized=false for managed PG hosts.
const needsSsl =
  env.NODE_ENV === 'production' ||
  env.DATABASE_URL.includes('railway.app') ||
  env.DATABASE_URL.includes('supabase.co');

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
