const express = require('express');
const path = require('path');
const { scrape } = require('./scrape'); // <-- pridaj
const { scrapeAnkerSearch, scrapeGame3rbSearch } = require('./search');
const app = express();
const PORT = process.env.PORT || 4021;

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// jednoduchý cache (5 minút), nech nešľapeš na cudzí web pri každom refreshi
const cache = new Map(); // key=url, val={ts,data}
const TTL_MS = 5 * 60 * 1000;



app.get('/api/search', async (req,res)=>{
  const q = req.query.q||"";
  if(!q) return res.json({items:[]});

  const [A,B] = await Promise.all([
    scrapeAnkerSearch(q),
    scrapeGame3rbSearch(q)
  ]);

  res.json({ items:[...A,...B] });
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
      'www.game3rb.com'
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
      'https://game3rb.com/'
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
