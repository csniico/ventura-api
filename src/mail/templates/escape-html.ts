const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Escape a value before it is interpolated into an email body.
 *
 * Every string a template interpolates is attacker-influenced somewhere: a
 * display name, a customer name, a free-text note on an invoice. Dropping it
 * into the HTML raw let a sender inject markup into mail going out from the
 * Ventura domain — a branded phishing vector (SEC-005).
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char])
}

/**
 * Escape a multi-line value and preserve its line breaks as `<br />`.
 * For free-text the user typed and expects to see laid out as they wrote it.
 */
export function escapeHtmlMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br />')
}
