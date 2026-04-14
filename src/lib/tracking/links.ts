export function rewriteLinks(
  html: string,
  sendId: string,
  appUrl: string
): string {
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_match, url) => {
      const trackUrl = `${appUrl}/api/track/click/${sendId}?url=${encodeURIComponent(url)}`;
      return `href="${trackUrl}"`;
    }
  );
}
