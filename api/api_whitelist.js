// /api/api_whitelist.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const { scryptSync, randomBytes, timingSafeEqual } = require('crypto');
const { signToken, buildCookie, parseCookies, verifyToken } = require('../auth');
const {
  createWhitelistUser,
  getWhitelistUser,
  getPendingWhitelist,
  approveWhitelistUser
} = require('../database/query');

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * POST /api/whitelist/register
 * Body: { username, password }
 * Creates a pending whitelist account (allowed=0). If username already exists -> 409.
 */

function loadWhitelistUsernames() {
  try {
    const p = path.join(__dirname, '..', 'config', 'visitors.config');
    return fs.readFileSync(p, 'utf8')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('#'));
  } catch {
    return [];
  }
}

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'missing-fields' });
    }

    // jediná autorita na "taken" = DB
    const exists = await getWhitelistUser(username); // SELECT * FROM whitelist_users ... :contentReference[oaicite:1]{index=1}
    if (exists) {
      return res.status(409).json({ ok: false, error: 'username-taken' });
    }

    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    const stored = `${salt.toString('hex')}:${hash.toString('hex')}`;

    // create pending
    const id = await createWhitelistUser(username, stored); // allowed=0 by default :contentReference[oaicite:2]{index=2}

    // ak je v visitors.config → hneď approve (allowed=1)
    const inConfig = loadWhitelistUsernames().includes(username);
    if (inConfig) {
      await approveWhitelistUser(id); // UPDATE ... SET allowed=1 WHERE id=? :contentReference[oaicite:3]{index=3}
      return res.json({ ok: true, message: 'auto-approved' });
    }

    return res.json({ ok: true, message: 'registration-pending' });
  } catch (e) {
    console.error('WL register fail:', e);
    return res.status(500).json({ ok: false, error: 'register-failed' });
  }
});
/**
 * POST /api/whitelist/login
 * Body: { username, password }
 * Requires user.allowed === 1. Sets cookie w_sid.
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'missing-fields' });
    }

    const user = await getWhitelistUser(username);
    if (!user) return res.status(401).json({ ok: false, error: 'invalid' });
    if (!user.allowed) return res.status(403).json({ ok: false, error: 'not-approved' });

    const [saltHex, hashHex] = String(user.password).split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const hash = Buffer.from(hashHex, 'hex');
    const test = scryptSync(password, salt, 64);
    if (!timingSafeEqual(hash, test)) {
      return res.status(401).json({ ok: false, error: 'invalid' });
    }

    // whitelist session token
    const token = signToken({ wid: user.id, username: user.username });
    const cookie = buildCookie('w_sid', token, {
      secure: IS_PROD,
      sameSite: 'Lax',
      maxAgeSec: 60 * 60 * 24 * 7,
      httpOnly: true
    });
    res.setHeader('Set-Cookie', cookie);
    return res.json({ ok: true });
  } catch (e) {
    console.error('WL login fail:', e);
    return res.status(500).json({ ok: false, error: 'login-failed' });
  }
});

/**
 * POST /api/whitelist/logout
 * Clears w_sid cookie.
 */
router.post('/logout', (_req, res) => {
  res.setHeader(
    'Set-Cookie',
    'w_sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' + (IS_PROD ? '; Secure' : '')
  );
  res.json({ ok: true });
});

/**
 * GET /api/whitelist/me
 * Returns whitelist session info if logged in.
 */
router.get('/me', (req, res) => {
  const cookies = parseCookies(req);
  const payload = verifyToken(cookies.w_sid);
  if (!payload) return res.json({ ok: false });
  return res.json({ ok: true, wlUser: { id: payload.wid, username: payload.username } });
});

/**
 * Admin helpers (optional):
 * GET /api/whitelist/pending
 * POST /api/whitelist/approve/:id
 * You can wrap these with your admin guard later; left open for now as scaffolding.
 */
router.get('/pending', async (_req, res) => {
  const rows = await getPendingWhitelist();
  res.json({ ok: true, rows });
});

router.post('/approve/:id', async (req, res) => {
  const ok = await approveWhitelistUser(req.params.id);
  res.json({ ok });
});

module.exports = router;
