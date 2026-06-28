# Garage S3 storage migration plan

Status: **driver landed, awaiting prod cutover.** `STORAGE_DRIVER=fs` by default (no behavior change). Flip to `s3` or `r2` after backfill.

## Cloudflare R2 cutover (recommended)

Use this variant when migrating off Railway volume storage to Cloudflare R2.

1. In Cloudflare R2, create a bucket (example: `kourti-prod-files`).
2. Create an API token scoped to that bucket with Object Read + Write.
3. Set these variables on the Railway backend service:
   ```
   STORAGE_DRIVER=r2
   R2_ACCOUNT_ID=<cloudflare-account-id>
   R2_BUCKET=kourti-prod-files
   R2_ACCESS_KEY_ID=<r2-access-key-id>
   R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
   STORAGE_READ_FALLBACK_FS=true
   ```
4. Redeploy backend (still safe; fallback allows old files to read from FS).
5. Dry-run backfill:
   ```
   railway ssh --service kourti-backend --environment production \
     "cd /app && node scripts/migrate-storage-to-s3.mjs"
   ```
6. Apply backfill:
   ```
   railway ssh --service kourti-backend --environment production \
     "cd /app && node scripts/migrate-storage-to-s3.mjs --apply --concurrency 8"
   ```
7. Verify uploads/downloads from the app and confirm objects appear in R2.
8. After verification window, disable fallback:
   ```
   STORAGE_READ_FALLBACK_FS=false
   ```
9. Keep the old volume mounted for at least 7 days, then detach to cut cost.

## Cutover steps (prod)

1. Set on the `kourti-backend` production service (pull access/secret from the
   Garage container per "Production Garage endpoints" above):
   ```
   S3_ENDPOINT=http://garage-s3.railway.internal:3900
   S3_REGION=garage
   S3_BUCKET=my-bucket
   S3_ACCESS_KEY=<from garage key info>
   S3_SECRET_KEY=<from garage key info>
   S3_FORCE_PATH_STYLE=true
   ```
   Do NOT set `STORAGE_DRIVER` yet — leaves the backend on the filesystem driver.
2. Redeploy backend. App behavior unchanged; the S3 client just sits idle.
3. SSH into backend, dry-run the backfill:
   ```
   railway ssh --service kourti-backend --environment production \
     "cd /app && node scripts/migrate-storage-to-s3.mjs"
   ```
   Confirm the file count looks right and there are no surprises.
4. Apply:
   ```
   railway ssh --service kourti-backend --environment production \
     "cd /app && node scripts/migrate-storage-to-s3.mjs --apply --concurrency 8"
   ```
5. Spot-check a few objects via `garage bucket info my-bucket` on the Garage service.
6. Set `STORAGE_DRIVER=s3` on the backend, redeploy.
7. Test uploads + downloads from the live app.
8. Leave the Railway volume mounted as rollback for at least 7 days. After that, you can detach.

## Rollback

If anything goes wrong after step 6: set `STORAGE_DRIVER=fs`, redeploy. The volume still has the originals. Any new uploads written to S3 between cutover and rollback won't exist on the FS — you'd need a reverse backfill (script does not currently support that direction; trivial to add if needed).

## Goal

Replace [backend-node/src/services/storage.ts](../backend-node/src/services/storage.ts)'s local-filesystem driver (writes to `/app/storage` on the backend's Railway volume) with an S3 driver pointed at the Garage S3 service running in the same Railway project.

## Honest caveat (read first)

Garage as currently deployed runs **single replica, replication_factor = 1**, with metadata in sqlite on a single Railway volume (`/data`). It gives you the S3 _API_, not S3-class durability. If that one volume is lost, the bucket is lost. This migration is worth doing for:

- decoupling files from the backend container's filesystem (other services / scripts / future workers can read & write directly)
- native S3 presigned URLs (browser → storage, no backend hop)
- standard ecosystem tooling (`aws s3 sync`, lifecycle rules, multipart)

It is **not** a backup or durability upgrade vs. the current Railway volume. If durability is what you want, the answer is R2 / B2 / AWS S3, not Garage.

## Production Garage endpoints

| Field               | Value                                         |
| ------------------- | --------------------------------------------- |
| Endpoint (internal) | `http://garage-s3.railway.internal:3900`      |
| Endpoint (public)   | `https://garage-s3-production.up.railway.app` |
| Region              | `garage`                                      |
| Bucket              | `my-bucket`                                   |
| Force path style    | `true` (required for Garage)                  |

Access key and secret are **not** in this repo. They're retrievable from the
running Garage container at any time with:

```
railway ssh --service "Garage S3" --environment production \
  "garage -c /etc/garage.toml key info my-admin-key --show-secret"
```

Set them as Railway service vars on `kourti-backend` (and `kourti-frontend` if
it ever does direct uploads). Never commit them.

To-do before cutover:

- Rename bucket to something less generic (`kourti-prod`, `kourti-staging`). Garage allows aliases.
- Mirror the same setup in `staging` env (currently Garage S3 only exists in production).

## Scope options

### A. Driver only (no data move) — smallest PR

1. Add `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
2. Rewrite `storage.ts` so `uploadFile`/`downloadFile`/`deleteFile`/`fileExists` branch on `STORAGE_DRIVER === 's3'`. Keep filesystem path as fallback so local dev still works without Garage.
3. Set the env vars on `kourti-backend` (staging first), flip `STORAGE_DRIVER=s3`, redeploy, test new uploads land in Garage (verify via `garage bucket info my-bucket` on the Garage service).
4. Existing files stay on the volume and are still served by the FS path — but only if you keep both drivers alive. Simpler: ship A + run B before production cutover.

### B. Driver + backfill (recommended for full cutover)

Do A, plus: 5. Write `scripts/migrate-storage-to-s3.mjs` (Node, runs from a one-off `railway run`): walk `/app/storage`, `putObject` each, verify count and total size against source, log to a manifest file. 6. Run on **staging** first. Verify a handful of downloads through the app. 7. Run on **production** during a low-traffic window. Keep the volume mounted but read-only after cutover. 8. After 7 days clean, detach the volume.

### C. B + native presigned URLs (touches frontend)

Do B, plus: 9. Replace [createSignedUrl](../backend-node/src/services/storage.ts#L135) (HMAC URL routed through `/api/v1/files/...`) with `getSignedUrl` from `@aws-sdk/s3-request-presigner`. Backend no longer proxies downloads — browser hits Garage directly. 10. CORS: add the frontend origin (`kourti.com`) to Garage's allowed origins for the bucket (`garage bucket website` / CORS rules). 11. Audit frontend for any place that assumes the file URL is same-origin (cookies, auth headers won't be sent to Garage). Most likely fine since the URL is signed. 12. Old `/api/v1/files/...` route stays for one release as a 302 redirect, then is deleted.

## Risks / things that will bite

- **`replication_factor = 1`**: documented above. Make sure stakeholders understand this is not durable storage.
- **`/data/.initialized` sentinel**: the auto-init in [start.sh](https://github.com/boyeesu/railway_garage_template/blob/main/start.sh) skips bucket/key creation on subsequent boots. If you change `GARAGE_ACCESS_KEY` / `GARAGE_SECRET_KEY` env vars expecting them to take effect, they won't — you must delete `/data/.initialized` and redeploy, or run the `garage key import` / `garage bucket allow` commands manually via `railway ssh`.
- **No HTTPS on the public Garage URL when used as S3 endpoint**: Railway terminates TLS, but Garage internally is HTTP. Use the internal `http://garage-s3.railway.internal:3900` from the backend (free, fast, no egress). Only use the public HTTPS endpoint for browser-side presigned URLs.
- **Path-style required**: AWS SDK defaults to virtual-hosted style (`<bucket>.host`). Garage needs `forcePathStyle: true`.
- **Bucket name `my-bucket`**: rename before production traffic touches it; this name will end up in logs and presigned URLs.
- **Backend writes today bypass any quota**: a runaway uploader will fill the Garage volume the same way it would fill the backend volume. Worth setting `garage bucket set-quotas my-bucket --max-size <bytes>`.

## Decision points still open

- Scope: A, B, or C above.
- Bucket naming: one bucket per env (`kourti-prod`, `kourti-staging`) or one bucket with per-env prefixes.
- Keep backend HMAC URLs (path C is opt-in) or move to native presigned.
- Whether to also use Garage from the **frontend** directly (uploads bypass backend). Out of scope for the first PR.
