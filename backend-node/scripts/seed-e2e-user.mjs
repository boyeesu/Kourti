// Seed a dev/E2E user with email OTP disabled so /sign-in returns tokens
// directly. Idempotent. Reads DATABASE_URL from env (load .env before running).
import bcrypt from 'bcryptjs';
import pg from 'pg';

const EMAIL = process.env.E2E_USER_EMAIL || 'dev@kourti.local';
const PASSWORD = process.env.E2E_USER_PASSWORD || 'password123';
const ORG_NAME = 'E2E Dev Org';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Source backend-node/.env first.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Upsert auth_users
  const userRes = await client.query(
    `insert into public.auth_users (email, encrypted_password, is_active, email_confirmed_at, email_otp_enabled, totp_enabled)
     values ($1, $2, true, now(), false, false)
     on conflict (email) do update
       set encrypted_password = excluded.encrypted_password,
           is_active = true,
           email_otp_enabled = false,
           totp_enabled = false,
           email_confirmed_at = coalesce(public.auth_users.email_confirmed_at, now())
     returning id, email`,
    [EMAIL.toLowerCase(), hash]
  );
  const user = userRes.rows[0];

  // Ensure an org exists for this user
  let orgId;
  const existingProfile = await client.query(
    `select organization_id from public.profiles where user_id = $1 limit 1`,
    [user.id]
  );
  if (existingProfile.rows[0]?.organization_id) {
    orgId = existingProfile.rows[0].organization_id;
  } else {
    const orgRes = await client.query(
      `insert into public.organizations (name) values ($1) returning id`,
      [ORG_NAME]
    );
    orgId = orgRes.rows[0].id;
  }

  // Upsert profile
  await client.query(
    `insert into public.profiles (user_id, organization_id, email, first_name, last_name)
     values ($1, $2, $3, 'E2E', 'Dev')
     on conflict (user_id) do update
       set organization_id = excluded.organization_id,
           email = excluded.email`,
    [user.id, orgId, EMAIL.toLowerCase()]
  );

  // Grant superadmin role so the user passes every PermissionGate.
  const existingRole = await client.query(
    `select 1 from public.user_role_assignments
     where user_id = $1 and role_name = 'superadmin' and organization_id = $2 limit 1`,
    [user.id, orgId]
  );
  if (existingRole.rowCount === 0) {
    await client.query(
      `insert into public.user_role_assignments (user_id, role_name, organization_id, assigned_by)
       values ($1, 'superadmin', $2, $1)`,
      [user.id, orgId]
    );
  }

  console.log(`Seeded user ${user.email} (id=${user.id}) in org ${orgId} as superadmin`);
} finally {
  await client.end();
}
