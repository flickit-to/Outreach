// Helpers for composing a tracked outbound email body.
// - injectPixel:   appends a 1x1 tracking pixel pointing at /api/track/open/:id
// - rewriteLinks:  every <a href="..."> becomes a redirect through
//                  /api/track/click/:id?u=<encoded original url>
// - plainToHtml:   turns the user-typed plain-text body into safe HTML
//                  (escapes <, &, etc., preserves line breaks)

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convert plain text composed in the app's textarea into HTML.
 * Autolinks bare URLs so they get click-tracked too.
 */
export function plainTextToHtml(plain: string): string {
  const escaped = escapeHtml(plain);
  // Autolink http(s) URLs
  const linked = escaped.replace(
    /(https?:\/\/[^\s<>"']+)/g,
    (m) => `<a href="${m}">${m}</a>`,
  );
  // Preserve line breaks
  return linked.replace(/\n/g, "<br />");
}

/**
 * Rewrite every <a href="X"> to redirect through /api/track/click/<activityId>?u=X.
 * Leaves mailto:, tel:, anchor links untouched.
 */
export function rewriteLinks(html: string, activityId: string, appUrl: string): string {
  return html.replace(/<a\s+([^>]*?)href="([^"]+)"([^>]*)>/gi, (match, before, href, after) => {
    const lower = href.toLowerCase();
    if (
      lower.startsWith("mailto:") ||
      lower.startsWith("tel:") ||
      lower.startsWith("#") ||
      lower.startsWith("javascript:")
    ) {
      return match;
    }
    const tracked = `${appUrl}/api/track/activity/click/${activityId}?u=${encodeURIComponent(href)}`;
    return `<a ${before}href="${tracked}"${after}>`;
  });
}

/**
 * Append a 1x1 tracking pixel to the end of the HTML body.
 * The pixel is invisible (width/height 1, opacity:0 via inline style fallback).
 */
export function injectPixel(html: string, activityId: string, appUrl: string): string {
  const pixel = `<img src="${appUrl}/api/track/activity/open/${activityId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
  return `${html}<br /><br />${pixel}`;
}

/**
 * Build the HTML signature block. Returns "" when nothing's configured.
 * Mirrors the format used by the Resend-based sequence engine
 * (lib/resend/templates.ts) so emails look consistent across send paths.
 */
export function buildSignatureHtml(opts: {
  html: string | null | undefined;
  imageUrl: string | null | undefined;
}): string {
  const html = (opts.html || "").trim();
  const imageUrl = (opts.imageUrl || "").trim();
  if (!html && !imageUrl) return "";
  const sigLines = html
    .split("\n")
    .map((line) => (line.trim() ? `<div>${line}</div>` : "<br />"))
    .join("");
  const sigLinesWithStyledLinks = sigLines.replace(
    /<a\s+([^>]*?)>/gi,
    '<a style="text-decoration:underline;color:#2563eb;" $1>',
  );
  return `<div style="margin-top:40px;font-size:14px;color:#555;">
${imageUrl ? `<div style="margin-bottom:10px;"><img src="${imageUrl}" alt="" width="70" height="70" style="width:70px;height:70px;object-fit:cover;display:block;border-radius:4px;margin-bottom:10px;" /></div>` : ""}
${sigLinesWithStyledLinks}
</div>`;
}

/**
 * One-stop: turn user text into a tracked HTML body, with an optional
 * signature block appended before the tracking pixel.
 */
export function buildTrackedHtml(args: {
  plainBody: string;
  activityId: string;
  appUrl: string;
  trackOpens: boolean;
  trackClicks: boolean;
  signature?: { html: string | null | undefined; imageUrl: string | null | undefined };
}): string {
  let html = plainTextToHtml(args.plainBody);
  const sig = args.signature ? buildSignatureHtml(args.signature) : "";
  if (sig) html = `${html}${sig}`;
  if (args.trackClicks) html = rewriteLinks(html, args.activityId, args.appUrl);
  if (args.trackOpens) html = injectPixel(html, args.activityId, args.appUrl);
  return html;
}
