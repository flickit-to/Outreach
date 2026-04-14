export function classifyLink(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("linkedin.com")) return "linkedin";
    if (host.includes("twitter.com") || host.includes("x.com")) return "twitter";
    if (host.includes("calendly.com")) return "calendly";
    if (host.includes("github.com")) return "github";
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
    return null;
  } catch {
    return null;
  }
}

export function rewriteLinks(
  html: string,
  sendId: string,
  appUrl: string
): string {
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_match, url) => {
      const linkType = classifyLink(url);
      const typeParam = linkType ? `&t=${linkType}` : "";
      const trackUrl = `${appUrl}/api/track/click/${sendId}?url=${encodeURIComponent(url)}${typeParam}`;
      return `href="${trackUrl}"`;
    }
  );
}
