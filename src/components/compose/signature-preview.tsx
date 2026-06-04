"use client";

/**
 * Render the signature_html exactly the way the email will render it:
 * each \n becomes a line break, <a> tags are real links styled blue
 * underlined. Mirrors buildSignatureHtml() in lib/microsoft/compose.ts.
 */
function renderSignatureBody(signatureHtml: string): string {
  const sigLines = signatureHtml
    .split("\n")
    .map((line) => (line.trim() ? `<div>${line}</div>` : "<br />"))
    .join("");
  // Match the inline style used at send time so the preview matches the
  // recipient's view.
  return sigLines.replace(
    /<a\s+([^>]*?)>/gi,
    '<a style="text-decoration:underline;color:#2563eb;" $1>',
  );
}

/**
 * Read-only preview of the user's signature, shown below the body textarea
 * when "Include signature" is on. Visually attached to the textarea so it
 * reads as "this is part of the email you're sending."
 */
export function SignaturePreview({
  signatureHtml,
  signatureImageUrl,
}: {
  signatureHtml: string | null;
  signatureImageUrl: string | null;
}) {
  const trimmedHtml = signatureHtml?.trim() || "";
  const trimmedImg = signatureImageUrl?.trim() || "";
  const hasAnything = !!(trimmedHtml || trimmedImg);
  return (
    <div className="border border-dashed border-border rounded-md mt-1 p-3 bg-muted/30">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
        Signature (auto-appended)
      </p>
      {!hasAnything ? (
        <p className="text-xs text-muted-foreground italic">
          No signature set.{" "}
          <a href="/settings" className="underline">
            Configure in Settings
          </a>
          .
        </p>
      ) : (
        <div className="text-sm text-muted-foreground space-y-2">
          {trimmedImg && (
            <img
              src={trimmedImg}
              alt=""
              width={70}
              height={70}
              className="rounded object-cover"
              style={{ width: 70, height: 70 }}
            />
          )}
          {trimmedHtml && (
            <div
              // signatureHtml is the user's own settings content — they wrote
              // the markup themselves, so rendering it as HTML is safe + the
              // whole point (so they see what the recipient sees).
              dangerouslySetInnerHTML={{ __html: renderSignatureBody(trimmedHtml) }}
            />
          )}
        </div>
      )}
    </div>
  );
}
