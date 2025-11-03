const cheerio = require("cheerio");
const https = require("node:https");
const { scrapeDetailAnker, scrapeDetail3rb } = require('./scrape');
const { scrapeRepackSearch  } = require('./repackgames');

async function scrapeRepackGamesSearch(q) {
  const url = `https://repack-games.com/?s=${encodeURIComponent(q)}`;
  const results = await scrapeRepackSearch(url);
  console.log(`[RepackGames] Found ${results.length} results.`);
  return results;
}


async function asyncPool(limit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);

    if (limit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}


function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}


async function scrapeAnkerSearch(q) {
  const url = `https://ankergames.net/search/${encodeURIComponent(q)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const games = [];
  $('a[aria-label]').each((_, a) => {
    const $a = $(a);
    const raw = ($a.attr('aria-label') || "").replace(" - View details", "").trim();
    if (!raw) return;
    let href = $a.attr('href') || "";
    if (!href.includes("/game/")) return;
    href = href.startsWith("http") ? href : ("https://ankergames.net" + href);
    games.push({ title: raw, href });
  });

  console.log(`[ANKER] Found ${games.length} results. Fetching details in parallel...`);

  const results = await asyncPool(5, games, async (g) => {
    try {
      const d = await scrapeDetailAnker(g.href);
      if (!d.title) d.title = g.title;
      return d;
    } catch (err) {
      console.warn('Detail fetch failed for', g.href, err);
      return g;
    }
  });

  return results;
}


async function scrapeGame3rbSearch(q) {
  const url = `https://game3rb.com/?s=${encodeURIComponent(q)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const articles = [];

  $('article.post-hentry').each((_, el) => {
    const $el = $(el);
    if ($el.find('h3.entry-title').length !== 1) return;

    const $a = $el.find('h3.entry-title a').first();
    const title = $a.text().replace(/\s+/g, ' ').trim();
    const href = $a.attr('href');
    const img = $el.find('img.entry-image').attr('src')
      || $el.find('img.lazyload').attr('data-src')
      || '';

    if (!title || !href) return;
    articles.push({ title, href, img });
  });

  console.log(`[Game3RB] Found ${articles.length} results. Fetching details in parallel...`);

  const results = await asyncPool(5, articles, async (g) => {
    try {
      const d = await scrapeDetail3rb(g.href);
      if (!d.title) d.title = g.title;
      if (!d.poster) d.poster = g.img;
      return d;
    } catch (err) {
      console.warn('Detail fetch failed for', g.href, err);
      return g;
    }
  });

  return results;
}


module.exports = { scrapeAnkerSearch, scrapeGame3rbSearch, scrapeRepackGamesSearch };
