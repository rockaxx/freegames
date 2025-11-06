// api.js
const https = require('node:https');
const cheerio = require('cheerio');

// Try to require from root first, then from ./scrapers/*
function req2(a, b) { try { return require(a); } catch { return require(b); } }

// Reuse existing detail functions
const { scrapeDetailAnker, scrapeDetail3rb } = require('./scrape');
const { scrapeDetailRepackGames } = require('./scrapers/repackgames');

// Listing/search helpers (root or scrapers fallback)
const { streamRepackGames } = req2('./repackgames', './scrapers/repackgames');
const { scrapeOnlineFixSearch, scrapeDetailOnlineFix } = req2('./onlinefix', './scrapers/onlinefix');
const { streamSteamUnderground } = req2('./steamunderground', './scrapers/steamunderground');

// Minimal fetch
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

// Concurrency helper for per-item streaming
async function forEachWithLimit(items, limit, worker) {
  let i = 0;
  const runners = Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      try { await worker(items[idx], idx); } catch { /* swallow */ }
    }
  });
  await Promise.all(runners);
}

function registerSearchStream(app) {
  app.get('/api/search/stream', async (req, res) => {
    const q = (req.query.q || '').trim();

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    const send = (event, payload) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    if (!q) {
      send('done', {});
      return res.end();
    }

    // ---- ANKER (per-item) ----
    async function streamAnker() {
      const url = `https://ankergames.net/search/${encodeURIComponent(q)}`;
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      const list = [];
      $('a[aria-label]').each((_, a) => {
        const $a = $(a);
        const raw = ($a.attr('aria-label') || '').replace(' - View details', '').trim();
        let href = $a.attr('href') || '';
        if (!raw || !href.includes('/game/')) return;
        href = href.startsWith('http') ? href : ('https://ankergames.net' + href);
        list.push({ title: raw, href });
      });

      await forEachWithLimit(list, 5, async (g) => {
        try {
          const d = await scrapeDetailAnker(g.href);
          send('item', { source: 'Anker', item: { ...g, ...d, src: 'Anker' } });
        } catch {
          send('item', { source: 'Anker', item: { ...g, src: 'Anker' } });
        }
      });
    }

    // ---- Game3RB (per-item) ----
    async function streamGame3rb() {
      const url = `https://game3rb.com/?s=${encodeURIComponent(q)}`;
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      const list = [];
      $('article.post-hentry').each((_, el) => {
        const $el = $(el);
        const $a = $el.find('h3.entry-title a').first();
        const title = $a.text().replace(/\s+/g, ' ').trim();
        const href = $a.attr('href');
        const img = $el.find('img.entry-image').attr('src') || $el.find('img.lazyload').attr('data-src') || '';
        if (title && href) list.push({ title, href, img });
      });

      await forEachWithLimit(list, 5, async (g) => {
        try {
          const d = await scrapeDetail3rb(g.href);
          const poster = d.poster || g.img || '';
          send('item', { source: 'Game3RB', item: { ...g, ...d, poster, src: 'Game3RB' } });
        } catch {
          send('item', { source: 'Game3RB', item: { ...g, src: 'Game3RB' } });
        }
      });
    }

    // ---- Online-Fix (per-item) ----
    async function streamOnlineFix() {
      const list = await scrapeOnlineFixSearch(q);
      await forEachWithLimit(list, 3, async (g) => {
        try {
          const d = await scrapeDetailOnlineFix(g.href);
          const poster = d.poster || g.img || '';
          send('item', { source: 'OnlineFix', item: { ...g, ...d, poster, src: 'OnlineFix' } });
        } catch {
          send('item', { source: 'OnlineFix', item: { ...g, src: 'OnlineFix' } });
        }
      });
    }

    async function streamSteamUndergroundRunner() {
      await streamSteamUnderground(q, async (item) => {
        send('item', { source: 'SteamUnderground', item });
      });
    }

    
    async function streamRepack() {
      await streamRepackGames(q, async (item) => {
        send('item', { source: 'RepackGames', item });
      });
    }


    const ping = setInterval(() => send('ping', { t: Date.now() }), 15000);

    await Promise.allSettled([
      streamAnker(),
      streamGame3rb(),
      streamRepack(),
      streamOnlineFix(),
      streamSteamUndergroundRunner()
    ]);

    clearInterval(ping);
    send('done', {});
    res.end();
  });
}

module.exports = { registerSearchStream };
