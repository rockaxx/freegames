const express = require('express');
const path = require('path');
const { scrape } = require('./scrape');
const { scrapeAnkerSearch, scrapeGame3rbSearch, scrapeRepackGamesSearch, scrapeSteamUndergroundSearch, scrapeOnlineFixFullSearch } = require('./search');
const { createUser, getUser } = require('./query');

const app = express();
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


app.get('/api/search', async (req,res)=>{
  const q = req.query.q||"";
  if(!q) return res.json({items:[]});

  const [A, B, C, D, E] = await Promise.all([
    scrapeAnkerSearch(q),
    scrapeGame3rbSearch(q),
    scrapeRepackGamesSearch(q),
    scrapeSteamUndergroundSearch(q),
    scrapeOnlineFixFullSearch(q)
  ]);

  res.json({ items: [...A, ...B, ...C, ...D, ...E] });

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

app.get('/api/all', async (req, res) => {
  try {
    const urls = [
      'https://ankergames.net/',
      'https://game3rb.com/',
      'https://repack-games.com/',
      'https://steamunderground.net/',
      'https://online-fix.me/'
    ];

    let final = [];

    for (const u of urls) {
      const part = await scrape(u);
      if (part.items) final.push(...part.items);
    }

    res.json({
      merged:true,
      count: final.length,
      items: final
    });
  } catch(e){
    console.error('ALL FAIL:', e.message);
    res.status(500).json({error:'ALL FAIL'});
  }
});

// catch-all nechaj až na konci
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[steam-like-template] running on http://localhost:${PORT}`);
});
