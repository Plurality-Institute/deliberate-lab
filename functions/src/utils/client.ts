import {CallableRequest} from 'firebase-functions/v2/https';

/**
 * Extract a privacy-preserving browser version string from a callable request.
 * Returns values like "Chrome 126", "Safari 17", "Firefox 128", "Edge 126".
 * Only the browser family and major version are included to avoid fingerprinting.
 */
export function getBrowserVersion(
  request: CallableRequest,
): string | undefined {
  // Support both v2 (rawRequest.headers) and potential direct headers usage
  const headers = request.rawRequest?.headers;
  const ua = headers?.['user-agent'];
  if (!ua || typeof ua !== 'string') return undefined;

  const getMajor = (ver: string) => ver.split('.')[0];

  // Common browsers and tokens (ordered to avoid false-positives)
  // Edge (Chromium, iOS, Android)
  let m = ua.match(/Edg(?:A|iOS)?\/([\d.]+)/);
  if (m) return `Edge ${getMajor(m[1])}`;

  // Samsung Internet
  m = ua.match(/SamsungBrowser\/([\d.]+)/);
  if (m) return `Samsung Internet ${getMajor(m[1])}`;

  // Opera (OPR on Chromium; Opera pre-Chromium)
  m = ua.match(/OPR\/([\d.]+)/) || ua.match(/Opera\/([\d.]+)/);
  if (m) return `Opera ${getMajor(m[1])}`;

  // Firefox (desktop + iOS)
  m = ua.match(/Firefox\/([\d.]+)/) || ua.match(/FxiOS\/([\d.]+)/);
  if (m) return `Firefox ${getMajor(m[1])}`;

  // Chrome (desktop + iOS token CriOS)
  m = ua.match(/Chrome\/([\d.]+)/) || ua.match(/CriOS\/([\d.]+)/);
  if (m) return `Chrome ${getMajor(m[1])}`;

  // Safari: Prefer Version/x.y token; Safari/ token is WebKit version
  m = ua.match(/Version\/([\d.]+).*Safari\//);
  if (m) return `Safari ${getMajor(m[1])}`;

  // UC Browser
  m = ua.match(/UCBrowser\/([\d.]+)/);
  if (m) return `UC Browser ${getMajor(m[1])}`;

  // Fallback minimal token; avoid storing the whole UA
  return undefined;
}
