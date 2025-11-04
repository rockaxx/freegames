const express = require('express');
const path = require('path');
const { scrape } = require('./scrape');
const { createUser, getUser } = require('./database/query');
const {registerSearchStream} = require('./api');

const app = express();
registerSearchStream(app);
const PORT = process.env.PORT || 4021;

app.disable('x-powered-by');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));


const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

app.get('/api/img', async (req,res) => {
  const url = req.query.url;
  if(!url) return res.status(400).end();

  try {
    const r = await fetch(url, {
      headers:{
        'User-Agent':'Mozilla/5.0'
      }
    });

    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);

  } catch(e) {
    res.status(500).end();
  }
});


// === AUTH ===

app.post('/api/register', async (req,res) => {
  try {
    const { username, email, password } = req.body;
    if(!username || !email || !password) return res.status(400).json({error:"missing fields"});

    // TODO: hash – teraz raw (neriešime)
    const id = await createUser(username, email, password);
    res.json({ ok:true, id });
  } catch(e){
    res.status(500).json({error:"register failed"});
  }
});

app.post('/api/login', async (req,res) => {
  try {
    const { username, password } = req.body;
    if(!username || !password) return res.status(400).json({error:"missing fields"});

    const user = await getUser(username);
    if(!user) return res.status(401).json({error:"invalid"});

    // TODO hash compare – teraz raw equal
    if(user.password !== password) return res.status(401).json({error:"invalid"});

    res.json({ ok:true, user:{id:user.id, username:user.username, email:user.email} });
  } catch(e){
    res.status(500).json({error:"login failed"});
  }
});


app.get('/api/scrape', async (req, res) => {

  try {
    const listUrl = (req.query.url || '').trim();

    if (!listUrl || !/^https?:\/\//i.test(listUrl)) {
      return res.status(400).json({ error: 'Chýba platný ?url=' });
    }

    // voliteľná „allowlist“ proti SSRF – uprav podľa seba:
    const { hostname } = new URL(listUrl);
    const allow = new Set([
      'ankergames.net',
      'www.ankergames.net',
      'game3rb.com',
      'repack-games.com',
      'www.repack-games.com',
      'steamunderground.net',
      'www.steamunderground.net',
      'online-fix.me',
      'www.online-fix.me'
    ]);

    if (!allow.has(hostname)) {
      return res.status(403).json({ error: `Host ${hostname} nie je povolený.` });
    }

    const now = Date.now();
    const cached = cache.get(listUrl);
    if (cached && (now - cached.ts) < TTL_MS) {
      return res.json(cached.data);
    }

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
  if(res.flushHeaders) res.flushHeaders();

  const send = (event,payload)=>{
    res.write('event: '+event+'\n');
    res.write('data: '+JSON.stringify(payload)+'\n\n');
  };

  const urls = [
    'https://ankergames.net/',
    'https://game3rb.com/',
    'https://repack-games.com/',
    'https://steamunderground.net/',
    'https://online-fix.me/'
  ];

  for(const u of urls){
    const r = await scrape(u);
    const items = r.items || [];
    for(const it of items){
      send('item',{ item: { ...it } });
    }
  }

  send('done',{});
  res.end();
});

// catch-all nechaj až na konci
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[steam-like-template] running on http://localhost:${PORT}`);
});
