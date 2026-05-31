/**
 * Defense-in-depth URL/path validation helpers.
 *
 * These guard against malicious or compromised server responses being used as
 * navigation targets (open redirect / `javascript:` injection) and against
 * tampered `location.state` open-redirects after login. They do NOT change the
 * happy path for legitimate values — valid `https:` URLs and absolute in-app
 * paths pass through unchanged.
 */

/**
 * Returns true when `url` is a well-formed absolute `https:` URL and, when
 * `allowedOrigins` is supplied, its origin is in that allowlist.
 *
 * @param url            Candidate URL (typically server-supplied).
 * @param allowedOrigins Optional allowlist of acceptable origins. Entries may be
 *                       exact origins (`https://checkout.paystack.com`) or a
 *                       bare host suffix (`paystack.com`) to match any subdomain.
 */
export function isSafeHttpsUrl(url: unknown, allowedOrigins?: string[]): url is string {
  if (typeof url !== 'string' || url.length === 0) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;

  if (!allowedOrigins || allowedOrigins.length === 0) return true;

  const host = parsed.hostname.toLowerCase();
  return allowedOrigins.some((entry) => {
    const normalized = entry.toLowerCase();
    // Exact-origin match (entry includes a scheme).
    if (normalized.includes('://')) {
      return parsed.origin.toLowerCase() === normalized;
    }
    // Host / host-suffix match (covers subdomains, e.g. checkout.paystack.com).
    const suffix = normalized.replace(/^\.+/, '');
    return host === suffix || host.endsWith(`.${suffix}`);
  });
}

/** True if the string contains a backslash or any control char / whitespace. */
function hasUnsafePathChar(p: string): boolean {
  if (p.includes('\\')) return true;
  for (let i = 0; i < p.length; i++) {
    // Reject C0 controls, space, and DEL — anything <= 0x20 or === 0x7f.
    const code = p.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Returns true when `p` is a safe in-app path: a single leading slash followed
 * by a normal path (never a scheme-relative `//host` redirect, a backslash
 * variant, or a control char). Used to validate post-login `redirect`/`from`
 * targets before navigating.
 */
export function isSafePath(p: unknown): p is string {
  if (typeof p !== 'string' || p.length === 0) return false;
  // Must start with exactly one '/', and not '//' or '/\' (protocol-relative).
  if (!p.startsWith('/')) return false;
  if (p.startsWith('//') || p.startsWith('/\\')) return false;
  // Reject backslashes and control characters / whitespace that browsers may
  // normalize into an external redirect.
  if (hasUnsafePathChar(p)) return false;
  return true;
}

/**
 * Known external origins we intentionally hand off to for OAuth / billing
 * redirects. Used as the `allowedOrigins` allowlist for those flows.
 */
export const PAYMENT_REDIRECT_ORIGINS = ['paystack.com', 'flutterwave.com'];

export const CALENDAR_OAUTH_ORIGINS = [
  'google.com',
  'microsoft.com',
  'microsoftonline.com',
  'live.com',
];
