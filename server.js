// server.js
const express = require('express');
const path = require('path');
const { scrape } = require('./scrape');
const { createUser, getUser } = require('./database/query');
const { registerSearchStream } = require('./api');

const { signToken, verifyToken, parseCookies, buildCookie } = require('./auth'); // <<< NEW
const { scryptSync, randomBytes, timingSafeEqual } = require('crypto');

const { initCommunityTables } = require('./database/community_db');

initCommunityTables().catch(err => console.error('DB init failed:', err));

const app = express();

const PORT = process.env.PORT || 4021;

const IS_PROD = process.env.NODE_ENV === 'production';
app.disable('x-powered-by');
app.use(express.json());

app.use((req, _res, next) => {
  const cookies = parseCookies(req);
  const tok = cookies.sid;
  const payload = verifyToken(tok);
  if (payload) req.user = { id: payload.id, username: payload.username, email: payload.email };
  next();
});

registerSearchStream(app);
app.use(require('./api_community'));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Attach req.user if valid cookie present
app.use((req, _res, next) => {
  const cookies = parseCookies(req);
  const tok = cookies.sid;
  const payload = verifyToken(tok);
  if (payload) req.user = { id: payload.id, username: payload.username, email: payload.email };
  next();
});

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

app.listen(PORT, () => {
  console.log(`[steam-like-template] running on http://localhost:${PORT}`);
});
