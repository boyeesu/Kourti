// @ts-check

/**
 * Build an absolute redirect URL for auth flows, trimming hash fragments.
 * @param {string} path - the path portion to append to the base URL
 * @param {string | undefined} appUrl - the application base URL (optional)
 * @returns {string}
 */
export function getAuthRedirectUrl(path, appUrl) {
  const trimmedPath = path.startsWith('/') ? path : `/${path}`;
  const base = appUrl && appUrl.trim().length
    ? appUrl.trim()
    : (typeof window !== 'undefined' ? window.location.origin : '');

  if (!base) {
    throw new Error('Unable to determine base URL for auth redirect');
  }

  const url = new URL(trimmedPath, base);
  url.hash = '';
  return url.toString();
}

/**
 * Format a readable display name from optional profile fields.
 * @param {string | null | undefined} firstName
 * @param {string | null | undefined} lastName
 * @param {string | null | undefined} email
 * @returns {string}
 */
export function buildDisplayName(firstName, lastName, email) {
  const nameParts = [firstName, lastName].filter(Boolean);

  if (nameParts.length) {
    return nameParts.join(' ');
  }

  if (email && email.trim().length) {
    return email;
  }

  return 'Team member';
}
