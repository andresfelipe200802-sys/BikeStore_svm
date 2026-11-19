import env from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'bikestore_rt';
export const REFRESH_COOKIE_PATH = '/api/auth';
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 604800; // 7 días

export function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS * 1000,
  };
}

export function setRefreshCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    path: REFRESH_COOKIE_PATH,
  });
}

export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    let val = part.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      val = val.slice(1, -1);
    }
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

export function getRefreshCookie(req) {
  const cookies = parseCookies(req?.headers?.cookie);
  const raw = cookies[REFRESH_COOKIE_NAME];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}
