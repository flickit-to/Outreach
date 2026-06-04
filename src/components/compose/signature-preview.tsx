"use client";

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
  const hasAnything = !!(signatureHtml?.trim() || signatureImageUrl?.trim());
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
          {signatureImageUrl && (
            <img
              src={signatureImageUrl}
              alt=""
              width={70}
              height={70}
              className="rounded object-cover"
              style={{ width: 70, height: 70 }}
            />
          )}
          {signatureHtml && (
            <div className="whitespace-pre-wrap">{signatureHtml}</div>
          )}
        </div>
      )}
    </div>
  );
}
