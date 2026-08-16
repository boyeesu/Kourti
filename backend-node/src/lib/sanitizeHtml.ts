import sanitize from 'sanitize-html';

/**
 * Server-side HTML sanitisation (defence-in-depth).
 *
 * Do not implement HTML sanitisation with regular expressions: malformed HTML
 * and browser parsing rules make that approach bypassable. The allowlist below
 * preserves ordinary rich-text formatting while rejecting executable content,
 * event handlers, and unsafe URL schemes.
 */
export function sanitizeHtml(html: string): string {
  return sanitize(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'b',
      'i',
      'u',
      's',
      'blockquote',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'a',
    ],
    allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    transformTags: {
      a: sanitize.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  });
}
