export function getTrackingPixelUrl(sendId: string, appUrl: string): string {
  return `${appUrl}/api/track/open/${sendId}`;
}

export function getTrackingPixelHtml(sendId: string, appUrl: string): string {
  const url = getTrackingPixelUrl(sendId, appUrl);
  return `<img src="${url}" width="1" height="1" style="display:none" alt="" />`;
}
