#!/usr/bin/env node
/**
 * One-off backfill: copies every file under STORAGE_PATH (the filesystem
 * driver's root, default /app/storage) into the configured object bucket using
 * the same logical layout the runtime driver uses: `<bucket>/<filePath>`
 * becomes the object key.
 *
 * Idempotent: skips objects that already exist in S3 with the same size.
 *
 * Usage (from a Railway shell on the backend service, with S3_* or R2_* env vars set):
 *
 *   node scripts/migrate-storage-to-s3.mjs            # dry run, lists what would copy
 *   node scripts/migrate-storage-to-s3.mjs --apply    # actually upload
 *   node scripts/migrate-storage-to-s3.mjs --apply --concurrency 8
 *
 * Does NOT delete source files. Verify the bucket, then flip STORAGE_DRIVER=s3
 * (or STORAGE_DRIVER=r2) and redeploy. Keep the volume for at least a week
 * as rollback.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const APPLY = process.argv.includes('--apply');
const concIdx = process.argv.indexOf('--concurrency');
const CONCURRENCY = concIdx >= 0 ? Math.max(1, parseInt(process.argv[concIdx + 1], 10) || 4) : 4;

const STORAGE_ROOT = process.env.STORAGE_PATH || '/app/storage';
const ENDPOINT =
  process.env.S3_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`
    : undefined);
const REGION = process.env.S3_REGION || (process.env.R2_ACCOUNT_ID ? 'auto' : 'garage');
const BUCKET = process.env.S3_BUCKET || process.env.R2_BUCKET;
const ACCESS_KEY = process.env.S3_ACCESS_KEY || process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.S3_SECRET_KEY || process.env.R2_SECRET_ACCESS_KEY;
const FORCE_PATH_STYLE = (process.env.S3_FORCE_PATH_STYLE || 'true') !== 'false';

for (const [name, val] of [
  ['S3_ENDPOINT', ENDPOINT],
  ['S3_BUCKET', BUCKET],
  ['S3_ACCESS_KEY', ACCESS_KEY],
  ['S3_SECRET_KEY', SECRET_KEY],
]) {
  if (!val) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
}

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  forcePathStyle: FORCE_PATH_STYLE,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

const mime = (ext) =>
  ({
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.webm': 'audio/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  })[ext] || 'application/octet-stream';

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function alreadyUploaded(key, size) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return head.ContentLength === size;
  } catch (err) {
    if (err.name === 'NotFound' || err.name === 'NoSuchKey') return false;
    throw err;
  }
}

async function uploadOne(absPath) {
  // Key = path relative to STORAGE_ROOT. First segment is the logical bucket.
  const rel = path.relative(STORAGE_ROOT, absPath).split(path.sep).join('/');
  if (!rel || rel.startsWith('..')) return { skipped: true, rel, reason: 'outside root' };

  const stat = await fs.stat(absPath);
  if (await alreadyUploaded(rel, stat.size)) {
    return { skipped: true, rel, reason: 'already in s3' };
  }
  if (!APPLY) {
    return { skipped: false, rel, size: stat.size, dryRun: true };
  }
  const body = await fs.readFile(absPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: rel,
      Body: body,
      ContentType: mime(path.extname(rel).toLowerCase()),
    })
  );
  return { skipped: false, rel, size: stat.size };
}

const summary = { copied: 0, skipped: 0, bytes: 0, errors: 0 };
const queue = [];
const inflight = new Set();

async function drain() {
  while (queue.length || inflight.size) {
    while (queue.length && inflight.size < CONCURRENCY) {
      const file = queue.shift();
      const p = uploadOne(file)
        .then((r) => {
          if (r.skipped) {
            summary.skipped++;
            if (process.env.VERBOSE) console.log(`skip ${r.rel} (${r.reason})`);
          } else {
            summary.copied++;
            summary.bytes += r.size;
            console.log(`${APPLY ? 'copy' : 'plan'} ${r.rel} (${r.size}B)`);
          }
        })
        .catch((err) => {
          summary.errors++;
          console.error(`ERR ${file}: ${err.message}`);
        })
        .finally(() => inflight.delete(p));
      inflight.add(p);
    }
    if (inflight.size) await Promise.race(inflight);
  }
}

console.log(`Source: ${STORAGE_ROOT}`);
console.log(`Target: s3://${BUCKET} @ ${ENDPOINT}`);
console.log(`Mode  : ${APPLY ? 'APPLY' : 'DRY RUN — pass --apply to upload'}`);
console.log(`Concurrency: ${CONCURRENCY}`);
console.log('');

for await (const file of walk(STORAGE_ROOT)) queue.push(file);
console.log(`Found ${queue.length} files to consider`);
console.log('');

await drain();

console.log('');
console.log(`Done. copied=${summary.copied} skipped=${summary.skipped} bytes=${summary.bytes} errors=${summary.errors}`);
process.exit(summary.errors > 0 ? 2 : 0);
