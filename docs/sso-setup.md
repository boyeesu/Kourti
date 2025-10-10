# Configuring Single Sign-On (SSO)

Kourti Legal now supports organization-scoped SSO with Google Workspace and Microsoft Entra ID. This document describes the required configuration so operators can provision matching OAuth applications and connect them to the Supabase project.

## 1. Required redirect URLs

Register the following redirect URLs for every identity provider you configure:

| Purpose | URL |
| --- | --- |
| Supabase Edge authorize function | `https://<your-project>.functions.supabase.co/sso-authorize` |
| Supabase Edge callback handler | `https://<your-project>.functions.supabase.co/sso-callback` |
| Application post-login redirect | `https://<your-app-domain>/auth/callback` |

The Edge function URLs are used by the dynamic per-organization flow. The application redirect should match the path used by `getAuthRedirectUrl('/auth/callback')` (by default `/auth/callback` on your app domain).

> **Tip:** Replace `<your-project>` with the Supabase project ref (e.g., `abcd1234`) and `<your-app-domain>` with the deployed front-end hostname.

## 2. Google Workspace (OAuth 2.0)

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create (or select) an OAuth 2.0 Client ID for a **Web application**.
3. Add the redirect URIs listed above.
4. Under **Authorized domains**, include your application domain.
5. Record the **Client ID** and **Client secret**.
6. In Supabase, add an `organization_sso_configs` row with:
   - `provider`: `google`
   - `client_id` / `client_secret`: values from Google Cloud
   - `authorize_url` (optional): default `https://accounts.google.com/o/oauth2/v2/auth`
   - `token_url` (optional): default `https://oauth2.googleapis.com/token`
   - `scope`: e.g. `openid email profile`
   - `use_supabase_managed`: `false` to use the Edge function flow, or `true` if Google is configured globally in Supabase Auth.
   - `match_domains`: optional email domains restricted to this config.

## 3. Microsoft Entra ID (Azure AD)

1. Open the [Azure portal](https://portal.azure.com/) and create an **App registration**.
2. For the redirect URI, choose **Web** and add the callback URL above.
3. Enable the `openid`, `email`, `profile`, and `offline_access` API permissions.
4. Create a client secret and note its value.
5. Record the **Application (client) ID**, **Directory (tenant) ID**, and secret.
6. In Supabase, insert an `organization_sso_configs` row with:
   - `provider`: `microsoft`
   - `client_id` / `client_secret`: values from Entra ID
   - `tenant_id`: your directory tenant (use `common` for multi-tenant)
   - `authorize_url`: `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize`
   - `token_url`: `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token`
   - `scope`: `openid profile email offline_access`
   - `use_supabase_managed`: `false` for per-organization credentials or `true` if using Supabase-managed provider.

## 4. Environment variables

Ensure the following environment variables are configured for the Edge functions:

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (already required by other functions)
- `SSO_STATE_SECRET`: random string used to sign OAuth state parameters.
- `APP_URL`: public URL of the front-end application (used for redirect resolution).

## 5. Table structure reference

The code expects an `organization_sso_configs` table similar to:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `organization_id` | UUID (nullable) | Owning organization or `NULL` for global config |
| `provider` | text | `google` or `microsoft` |
| `match_domains` | text[] | Email domains to match (optional) |
| `domain` | text | Alternative single-domain match |
| `client_id` / `client_secret` | text | Provider credentials |
| `authorize_url` / `token_url` | text | Override endpoints |
| `tenant_id` | text | Required for Microsoft |
| `scope` | text | Space-separated scopes |
| `use_supabase_managed` | boolean | If `true`, use Supabase Auth configured provider |
| `enforce_sso` | boolean | Require SSO for this organization |
| `default_redirect` | text | Optional redirect override |

## 6. Testing checklist

1. Run `supabase functions deploy sso-authorize` and `sso-callback`.
2. Configure at least one organization SSO entry.
3. From the login page, enter an email belonging to that organization and verify the provider button becomes available.
4. Click the SSO button and confirm the redirect flows through the provider, returns to `/auth/callback`, and lands back in the app with a valid session.
5. Send an invitation and confirm the email contains SSO deep links when enforced.

For troubleshooting, tail the Supabase function logs (`supabase functions serve --env-file .env.local sso-authorize`) to inspect errors during the OAuth handshake.
