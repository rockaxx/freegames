const https = require('node:https');
const { URL } = require('node:url');
const cheerio = require('cheerio');
const { scrapeDetailRepackGames, scrapeRepackList } = require('./repackgames');
const { scrapeDetailAnker, scrapeAnker } = require('./anker');
const { parseGame3rb, scrapeDetail3rb } = require('./game3rb');
const { fetchHtmlTor } = require('./proxyFetch');

// ------------------ MAIN SCRAPER ------------------
async function scrape(url) {
  const html = await fetchHtmlTor(url);
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
