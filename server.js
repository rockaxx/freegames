const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./database/db');
const { scrape } = require('./scrapers/scrape');
const {
  createUser,
  getUser,
} = require('./database/query');

const { spawn } = require('child_process');

if (process.platform === 'linux') {
  // linux
  const tor = spawn('tor', ['--SocksPort','9050','--ControlPort','9051'], {
    stdio: 'inherit'
  });
}

const { registerSearchStream } = require('./api/api');
const { ADMINS } = require('./config/admins');
const { signToken, verifyToken, parseCookies, buildCookie } = require('./auth');
const { scryptSync, randomBytes, timingSafeEqual } = require('crypto');
const { initCommunityTables } = require('./database/community_db');

// ==== WHITELIST SYNC (AUTO UPDATE allowed=1/0) ====
const { startSync } = require('./config/whitelist_sync');
startSync(); // kontrola visitors.config každých 5 sekúnd

// Whitelist API router (login/register/logout/me for whitelist)
const wlRouter = require('./api/api_whitelist');

const app = express();
const PORT = process.env.PORT || 4021;
const IS_PROD = process.env.NODE_ENV === 'production';

initCommunityTables().catch(err => console.error('DB init failed:', err));

app.disable('x-powered-by');
app.use(express.json());

// ---- 1) Whitelist API must stay open (no gate here)
app.use('/api/whitelist', wlRouter);

// ---- 2) Attach whitelist user from w_sid cookie and enforce allowed=1
app.use((req, res, next) => {
  const cookies = parseCookies(req);
  const payload = verifyToken(cookies.w_sid);
  if (!payload) return next();

  // Ensure the wl user is still allowed; if not, nuke cookie
  db.get(`SELECT allowed FROM whitelist_users WHERE id=?`, [payload.wid], (err, row) => {
    if (err) {
      // Do not block on DB error; just continue without wlUser
      return next();
    }
    if (!row || !row.allowed) {
      res.setHeader(
        'Set-Cookie',
        'w_sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' + (IS_PROD ? '; Secure' : '')
      );
      return next();
    }
    req.wlUser = { id: payload.wid, username: payload.username };
    next();
  });
});

// ---- 3) Gate everything except open paths; require whitelist login
const OPEN_PATHS = [
  /^\/api\/whitelist(\/|$)/,
  /^\/blocked\.html$/,     // the login/register page for whitelist
  /^\/assets\//,           // favicon, images used by blocked.html
  /^\/favicon\.ico$/
];

app.get('/blocked.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'blocked.html'));
});

app.use((req, res, next) => {
  const allowedOpen = OPEN_PATHS.some(rx => rx.test(req.path));
  if (allowedOpen) return next();
  if (req.wlUser) return next();
  return res.sendFile(path.join(__dirname, 'public', 'blocked.html'));
});

// ---- 4) Normal app user attach (separate from whitelist)
function isAdminUser(username, id) {
  const wanted = ADMINS.get(String(username || '').toLowerCase());
  return Number(wanted) === Number(id);
}

// ---- attach req.user (PRED routermi!)
app.use((req, _res, next) => {
  const cookies = parseCookies(req);
  const tok = cookies.sid;
  const payload = verifyToken(tok);
  if (payload) {
    req.user = {
      id: payload.id,
      username: payload.username,
      email: payload.email,
      role: isAdminUser(payload.username, payload.id) ? 'admin' : 'member'
    };
  }
  next();
});

registerSearchStream(app);

// routery až po tom, čo už máme req.user:
app.use(require('./api/api_community'));
app.use(require('./api/api_library'));
app.use(require('./api/api_profile'));
app.use(require('./api/api_account'));
app.use(express.json({ limit: '5mb' }));

// Attach req.user if valid cookie present
app.use((req, _res, next) => {
  const cookies = parseCookies(req);
  const tok = cookies.sid;
  const payload = verifyToken(tok);
  if (payload) {
    const isAdmin = ADMINS.get(payload.username.toLowerCase()) === payload.id;
    req.user = {
      id: payload.id,
      username: payload.username,
      email: payload.email,
      role: isAdmin ? 'admin' : 'member'
    };
  }
  next();
});


app.get(['/profile/:username', '/profile/id/:id'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'error.html'));
});

app.get('/settings', (req, res) => {
  if (!req.user) {
    return res.sendFile(path.join(__dirname, 'public', 'autherr.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

// Serve trusted_downloads with markdown support
app.use('/trusted_downloads', express.static(path.join(__dirname, 'public', 'trusted_downloads'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.md')) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    }
  }
}));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));


app.get('/community/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'community_detail.html'));
});

const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

// Image proxy unchanged
app.get('/api/img', async (req,res) => {
  const url = req.query.url;
  if(!url) return res.status(400).end();
  try {
    const r = await fetch(url, { headers:{ 'User-Agent':'Mozilla/5.0' } });
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch(e) {
    res.status(500).end();
  }
});

// ==== AUTH (SECURE COOKIE SESSION) ====

// POST /api/register  -> create user, auto-login (optional)
app.post('/api/register', async (req,res) => {
  try {
    const { username, email, password } = req.body || {};
    if(!username || !email || !password) return res.status(400).json({ ok:false, error:'missing fields' });


    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    const stored = salt.toString('hex') + ':' + hash.toString('hex');
    const id = await createUser(username, email, stored);


    const token = signToken({ id, username, email });
    const cookie = buildCookie('sid', token, { secure: IS_PROD, sameSite: 'Lax', maxAgeSec: 60*60*24*7 });
    res.setHeader('Set-Cookie', cookie);
    return res.json({ ok:true, user:{ id, username, email } });
  } catch(e){
    return res.status(500).json({ ok:false, error:'register failed' });
  }
});

// POST /api/login  -> verify, set cookie
app.post('/api/login', async (req,res) => {
  try {
    const { username, password } = req.body || {};
    if(!username || !password) return res.status(400).json({ ok:false, error:'missing fields' });

    const user = await getUser(username);
    if(!user) return res.status(401).json({ ok:false, error:'invalid' });

    const [saltHex, hashHex] = String(user.password).split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const hash = Buffer.from(hashHex, 'hex');
    const test = scryptSync(password, salt, 64);
    if (!timingSafeEqual(hash, test)) return res.status(401).json({ ok:false, error:'invalid' });

    const token = signToken({ id: user.id, username: user.username, email: user.email });
    const cookie = buildCookie('sid', token, { secure: IS_PROD, sameSite: 'Lax', maxAgeSec: 60*60*24*7 });
    res.setHeader('Set-Cookie', cookie);
    return res.json({ ok:true, user:{ id: user.id, username: user.username, email: user.email } });
  } catch(e){
    return res.status(500).json({ ok:false, error:'login failed' });
  }
});

// GET /api/me  -> current session
app.get('/api/me', (req,res) => {
  if(!req.user) return res.json({ ok:false });
  return res.json({ ok:true, user: req.user });
});

// POST /api/logout -> clear cookie
app.post('/api/logout', (_req,res) => {
  // Overwrite cookie with empty, immediate expiry
  res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' + (IS_PROD ? '; Secure' : ''));
  return res.json({ ok:true });
});

// POST /api/account/update  -> change username/email (+ optional password)
app.post('/api/account/update', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok:false, error:'not logged in' });

    const { username, email, currPass, newPass } = req.body || {};
    const id = req.user.id;

    // basic validation
    const newUsername = String(username || '').trim();
    const newEmail = String(email || '').trim();
    if (!newUsername || !newEmail) {
      return res.status(400).json({ ok:false, error:'missing fields' });
    }

    // load current user
    const me = await require('./database/query').getUserById(id);
    if (!me) return res.status(404).json({ ok:false, error:'not-found' });

    // uniqueness checks (case-insensitive)
    const { usernameTaken, emailTaken, updateUserUsernameEmail, updateUserPassword } = require('./database/query');
    if (await usernameTaken(newUsername, id)) {
      return res.status(409).json({ ok:false, error:'username-taken' });
    }
    if (await emailTaken(newEmail, id)) {
      return res.status(409).json({ ok:false, error:'email-taken' });
    }

    // handle optional password change
    const wantsPasswordChange = !!(newPass && newPass.length);
    if (wantsPasswordChange) {
      if (!currPass) {
        return res.status(400).json({ ok:false, error:'need-current-password' });
      }
      // verify current password
      const [saltHex, hashHex] = String(me.password || '').split(':');
      if (!saltHex || !hashHex) {
        return res.status(500).json({ ok:false, error:'bad-password-format' });
      }
      const { scryptSync, timingSafeEqual, randomBytes } = require('crypto');
      const salt = Buffer.from(saltHex, 'hex');
      const hash = Buffer.from(hashHex, 'hex');
      const test = scryptSync(currPass, salt, 64);
      if (!timingSafeEqual(hash, test)) {
        return res.status(400).json({ ok:false, error:'wrong-current-password' });
      }
      if (String(newPass).length < 6) {
        return res.status(400).json({ ok:false, error:'password-too-short' });
      }

      // create new stored password "salt:hash"
      const newSalt = randomBytes(16);
      const newHash = scryptSync(newPass, newSalt, 64);
      const stored = newSalt.toString('hex') + ':' + newHash.toString('hex');
      await updateUserPassword(id, stored);
    }

    // update username/email if changed
    if (me.username !== newUsername || me.email !== newEmail) {
      await updateUserUsernameEmail(id, newUsername, newEmail);
    }

    // refresh cookie with new username/email so frontend immediately sees it
    const { signToken, buildCookie } = require('./auth');
    const IS_PROD = process.env.NODE_ENV === 'production';
    const token = signToken({ id, username: newUsername, email: newEmail });
    const cookie = buildCookie('sid', token, { secure: IS_PROD, sameSite: 'Lax', maxAgeSec: 60*60*24*7 });
    res.setHeader('Set-Cookie', cookie);

    return res.json({ ok:true, user: { id, username: newUsername, email: newEmail } });
  } catch (e) {
    console.error('ACCOUNT UPDATE FAIL:', e?.message || e);
    return res.status(500).json({ ok:false, error:'update-failed' });
  }
});


// ==== scraping routes stay as-is ====

app.get('/api/scrape', async (req, res) => {
  try {
    const listUrl = (req.query.url || '').trim();
    if (!listUrl || !/^https?:\/\//i.test(listUrl)) {
      return res.status(400).json({ error: 'Chýba platný ?url=' });
    }
    const { hostname } = new URL(listUrl);
    const allow = new Set([
      'ankergames.net','www.ankergames.net',
      'game3rb.com',
      'repack-games.com','www.repack-games.com',
      'steamunderground.net','www.steamunderground.net',
      'online-fix.me','www.online-fix.me'
    ]);
    if (!allow.has(hostname)) return res.status(403).json({ error: `Host ${hostname} nie je povolený.` });

    const now = Date.now();
    const cached = cache.get(listUrl);
    if (cached && (now - cached.ts) < TTL_MS) return res.json(cached.data);

    const data = await scrape(listUrl);
    cache.set(listUrl, { ts: now, data });
    res.json(data);
  } catch (e) {
    console.error('SCRAPE FAIL:', e?.message || e);
    res.status(500).json({ error: 'Scrape zlyhal.' });
  }
});


app.get('/api/all/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (res.flushHeaders) res.flushHeaders();

  let alive = true;
  req.on('close', () => { alive = false; });

  const send = (event, payload) => {
    if (!alive) return false;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  };

  const urls = [
    'https://ankergames.net/',
    'https://game3rb.com/',
    'https://repack-games.com/',
    'https://steamunderground.net/',
    'https://online-fix.me/'
  ];

  try {
    for (const u of urls) {
      if (!alive) break;
      const r = await scrape(u);
      const items = r.items || [];
      for (const it of items) {
        if (!alive) break;
        if (!send('item', { item: { ...it } })) break;
      }
    }
  } catch (_) {
    // ignore; client likely dropped
  } finally {
    if (alive) send('done', {});
    res.end();
  }
});


// Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'error.html'));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[GameIT] running on 0.0.0.0:${PORT}`);
});
