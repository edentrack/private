/**
 * Escape HTML special characters to prevent XSS when injecting user content
 * into document.write or innerHTML (e.g. receipt print window).
 */
export function escapeHtml(text: string): string {
  if (typeof text !== 'string') return '';
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
}
