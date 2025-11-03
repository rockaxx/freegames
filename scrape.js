const https = require('node:https');
const { URL } = require('node:url');
const cheerio = require('cheerio');
const { scrapeDetailRepackGames, scrapeRepackList } = require('./scrapers/repackgames');
const { scrapeDetailAnker, scrapeAnker } = require('./scrapers/anker');
const { parseGame3rb, scrapeDetail3rb } = require('./scrapers/game3rb');


function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    https.get(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve(buf));
    }).on('error', reject);
  });
}



// ------------------ MAIN SCRAPER ------------------
async function scrape(url) {
  const html = await fetchHtml(url);
  const host = new URL(url).hostname;

  if (host.includes('ankergames.net')) {
    const items = scrapeAnker(html, url);
    return { source: url, count: items.length, items };
  }

  if (host.includes('game3rb.com')) {
    const items = parseGame3rb(html, url);
    return { source: url, count: items.length, items };
  }

  if (host.includes('repack-games.com')) {
    const items = await scrapeRepackList(url);
    return { source: url, count: items.length, items };
  }


  return { error: 'unknown domain' };
}


module.exports = { scrape, scrapeDetailAnker, scrapeDetail3rb, scrapeDetailRepackGames };
