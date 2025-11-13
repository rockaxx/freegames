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

// paths
const cfgDir = path.join(__dirname, '..', 'config');
const wantsLogPath = path.join(cfgDir, 'wl_wants.logs');
const visitorsPath = path.join(cfgDir, 'visitors.config');

// ensure config dir exists
try { fs.mkdirSync(cfgDir, { recursive: true }); } catch { /* noop */ }

function loadWhitelistUsernames() {
  try {
    return fs.readFileSync(visitorsPath, 'utf8')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('#'));
  } catch {
    return [];
  }
}

function sanitizeUsername(u) {
  return String(u || '').replace(/[\r\n]/g, ' ').trim();
}

function appendWantLog(username, ip) {
  const line = `${new Date().toISOString()} | ${sanitizeUsername(username)} | ${ip || '-'}`;
  try {
    fs.appendFileSync(wantsLogPath, line + '\n', 'utf8');
  } catch (e) {
    // best-effort logging, don't fail the request
    console.warn('[WL] failed to write wl_wants.logs:', e.message || e);
  }
}

async function enforceWhitelistState(user) {
  const cfgUsers = loadWhitelistUsernames();

  // bol odstránený z visitors.config → zober mu allowed
  if (user.allowed && !cfgUsers.includes(user.username)) {
    await approveWhitelistUser(user.id, false); // nastav allowed = 0
    user.allowed = 0;
  }

  return user;
}


router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'missing-fields' });
    }

    const uname = sanitizeUsername(username);

    // Only DB decides "taken"
    const exists = await getWhitelistUser(uname);
    if (exists) {
      return res.status(409).json({ ok: false, error: 'username-taken' });
    }

    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    const stored = `${salt.toString('hex')}:${hash.toString('hex')}`;

    // Create as pending
    const id = await createWhitelistUser(uname, stored); // allowed = 0 by default

    // Auto-approve if in visitors.config
    const inConfig = loadWhitelistUsernames().includes(uname);
    if (inConfig) {
      await approveWhitelistUser(id);
      return res.json({ ok: true, message: 'auto-approved', autoApproved: true });
    }

    // Pending → log intent
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
    appendWantLog(uname, ip);

    return res.json({ ok: true, message: 'registration-pending', autoApproved: false });
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

    const user = await getWhitelistUser(sanitizeUsername(username));
    if (!user) return res.status(401).json({ ok: false, error: 'invalid' });

    await enforceWhitelistState(user);

    const autoList = loadWhitelistUsernames();

    // auto-approve
    if (!user.allowed && autoList.includes(user.username)) {
      await approveWhitelistUser(user.id, true);
      user.allowed = 1;
    }

    // po synchronizácii stále nemá allowed?
    if (!user.allowed) {
      return res.status(403).json({ ok: false, error: 'not-approved' });
    }

    const [saltHex, hashHex] = String(user.password).split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const hash = Buffer.from(hashHex, 'hex');
    const test = scryptSync(password, salt, 64);
    if (!timingSafeEqual(hash, test)) {
      return res.status(401).json({ ok: false, error: 'invalid' });
    }

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
router.get('/me', async (req, res) => {
  const cookies = parseCookies(req);
  const payload = verifyToken(cookies.w_sid);
  if (!payload) return res.json({ ok: false });

  const user = await getWhitelistUser(payload.username);
  if (!user) {
    // user neexistuje → zruš cookie
    return res.json({ ok: false });
  }

  await enforceWhitelistState(user);

  if (!user.allowed) {
    // bol odstránený z visitors.config → vyradiť
    res.setHeader(
      "Set-Cookie",
      "w_sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" + (IS_PROD ? "; Secure" : "")
    );
    return res.json({ ok: false });
  }

  return res.json({ ok: true, wlUser: { id: user.id, username: user.username } });
});


/**
 * Admin helpers
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
