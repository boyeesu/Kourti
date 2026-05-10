/**
 * Lightweight server-side HTML sanitisation (defence-in-depth).
 *
 * Strips dangerous tags (`<script>`, `<iframe>`, `<object>`, `<embed>`,
 * `<form>`) and inline `on*` event-handler attributes.  The client already
 * sanitises with DOMPurify, so this is a backstop layer.
 */
export function sanitizeHtml(html: string): string {
  // Remove dangerous tags and their content
  let cleaned = html.replace(
    /<\s*(script|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
    ''
  );
  // Remove self-closing / unclosed dangerous tags
  cleaned = cleaned.replace(/<\s*(script|iframe|object|embed|form)\b[^>]*\/?>/gi, '');
  // Remove on* event-handler attributes from remaining tags
  cleaned = cleaned.replace(/(<[^>]*?)\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '$1');
  return cleaned;
}
