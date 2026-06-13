/**
 * Sanitize user-provided input strings to prevent cross-site scripting (XSS).
 * Escapes characters & < > " ' in dynamic templates.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
