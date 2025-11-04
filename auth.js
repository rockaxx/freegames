// server/auth.js
// Minimal, dependency-free signed token for HttpOnly cookie sessions.

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_DEV_SECRET';

// base64url helpers
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlJSON(obj) { return b64url(JSON.stringify(obj)); }
function fromB64url(str) {
  const pad = 4 - (str.length % 4);
  const s = (str + (pad < 4 ? '='.repeat(pad) : '')).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64').toString('utf8');
}

// Sign/verify lightweight token: data.signature
function signToken(payload, { ttlSec = 60 * 60 * 24 * 7 } = {}) { // 7 days
  const now = Math.floor(Date.now() / 1000);
  const data = { ...payload, iat: now, exp: now + ttlSec };
  const body = b64urlJSON(data);
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(body).digest());
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = b64url(crypto.createHmac('sha256', JWT_SECRET).update(body).digest());

  // timing-safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromB64url(body));
    if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// Cookie helpers (no cookie-parser)
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(pair => {
    const i = pair.indexOf('=');
    if (i < 0) return;
    const k = pair.slice(0, i).trim();
    const v = decodeURIComponent(pair.slice(i + 1));
    out[k] = v;
  });
  return out;
}

function buildCookie(name, value, { maxAgeSec = 60 * 60 * 24 * 7, secure = false, path = '/', httpOnly = true, sameSite = 'Lax' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAgeSec}; SameSite=${sameSite}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  return c;
}

module.exports = {
  signToken,
  verifyToken,
  parseCookies,
  buildCookie,
};
