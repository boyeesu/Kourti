import { Pool } from 'pg';
import type { PoolConfig } from 'pg';

import { env } from '../config/env.js';

// Railway requires SSL in production but serves a self-signed cert in the
// chain. For verified TLS (recommended for GDPR Art. 32 "encryption in
// transit"), set DB_SSL_CA to the PEM of the Railway/Postgres CA — the
// connection then validates the server certificate. Without a CA we fall back
// to encrypted-but-unvalidated TLS and warn in production.
const needsSsl = env.NODE_ENV === 'production' || env.DATABASE_URL.includes('railway.app');

function sslConfig(): PoolConfig['ssl'] {
  if (!needsSsl) return false;
  const ca = process.env.DB_SSL_CA;
  if (ca) {
    // Strict verification against a pinned CA.
    return { ca, rejectUnauthorized: true };
  }
  const strict = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';
  if (env.NODE_ENV === 'production' && !strict) {
    console.warn(
      '[db] WARNING: TLS to Postgres is enabled but the server certificate is ' +
        'NOT validated (no DB_SSL_CA / DB_SSL_REJECT_UNAUTHORIZED). Set DB_SSL_CA ' +
        'to pin the CA for verified transit encryption.'
    );
  }
  return { rejectUnauthorized: strict };
}

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: sslConfig(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
