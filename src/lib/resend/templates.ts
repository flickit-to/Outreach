import type { Contact } from "@/lib/types";
import { getTrackingPixelHtml } from "@/lib/tracking/pixel";
import { rewriteLinks } from "@/lib/tracking/links";

function replaceVars(text: string, contact: Contact): string {
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  return text
    .replace(/\{\{first_name\}\}/g, contact.first_name || "")
    .replace(/\{\{last_name\}\}/g, contact.last_name || "")
    .replace(/\{\{name\}\}/g, fullName)
    .replace(/\{\{company\}\}/g, contact.company || "")
    .replace(/\{\{role\}\}/g, contact.role || "")
    .replace(/\{\{email\}\}/g, contact.email);
}

export interface SignatureInput {
  html: string | null;
  imageUrl: string | null;
}

export function processEmailBody(
  body: string,
  contact: Contact,
  sendId: string,
  appUrl: string,
  signature?: SignatureInput
): string {
  const processed = replaceVars(body, contact);

  // Auto-link plain URLs in the body so they can be click-tracked
  const autoLinked = processed.replace(
    /(?<!["'>])(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1">$1</a>'
  );

  const htmlBody = autoLinked
    .split("\n")
    .map((line) => (line.trim() ? `<p>${line}</p>` : "<br>"))
    .join("");

  // Build signature HTML if provided
  let signatureBlock = "";
  if (signature && (signature.html || signature.imageUrl)) {
    const sigHtml = signature.html ? replaceVars(signature.html, contact) : "";
    const sigLines = sigHtml
      .split("\n")
      .map((line) => (line.trim() ? `<div>${line}</div>` : "<br>"))
      .join("");
    signatureBlock = `<div style="margin-top:24px;border-top:1px solid #eee;padding-top:12px;font-size:14px;color:#555;">
${signature.imageUrl ? `<div style="margin-bottom:12px;"><img src="${signature.imageUrl}" alt="" style="max-width:200px;height:auto;display:block;" /></div>` : ""}
${sigLines}
</div>`;
  }

  let html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
${htmlBody}
${signatureBlock}
${getTrackingPixelHtml(sendId, appUrl)}
</body>
</html>`;

  html = rewriteLinks(html, sendId, appUrl);
  return html;
}

export function processSubject(subject: string, contact: Contact): string {
  return replaceVars(subject, contact);
}
