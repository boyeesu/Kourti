/**
 * Escape ILIKE meta-characters (`%`, `_`, `\`) in user-supplied strings
 * before wrapping them with `%…%` for a contains-style search.
 */
export function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}
