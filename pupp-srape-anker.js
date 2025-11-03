// pupp-scrape-anker.js
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function autoScroll(page, timeoutMs = 8000) {
  // scroll until nothing new for a bit
  await page.evaluate(() => {
    window._scrolled = 0;
  });

  const start = Date.now();
  let lastHeight = await page.evaluate('document.body.scrollHeight');

  while (Date.now() - start < timeoutMs) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    await new Promise(r => setTimeout(r,300));


    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === lastHeight) {
      // small wait to ensure lazy-load finished
      await new Promise(r => setTimeout(r,300));

      const newHeight2 = await page.evaluate('document.body.scrollHeight');
      if (newHeight2 === lastHeight) break;
      lastHeight = newHeight2;
    } else {
      lastHeight = newHeight;
    }
  }
}

function parseAnkerHtml(html, base = 'https://ankergames.net/') {
  const $ = cheerio.load(html);
  const items = [];
  $('div.relative.group.cursor-pointer').each((_, el) => {
    const $el = $(el);
    let img = $el.find('img[data-src]').attr('data-src')
            || $el.find('picture source').attr('data-srcset')
            || $el.find('img').attr('src') || '';
    const $a = $el.find('a[aria-label]').first();
    const href = ($a.attr('href')) ? new URL($a.attr('href'), base).toString() : '';
    let rawTitle = ($a.attr('aria-label')||'').replace(' - View details','').trim();
    if (rawTitle) items.push({ src:'A', title: rawTitle, href, img });
  });
  return items;
}

async function scrapeAnkerFilter(page, letter) {
  const url = `https://ankergames.net/games-list?filter=${encodeURIComponent(letter)}`;
  // goto with referer + user agent set in caller
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  // small wait for scripts + lazy load
  await new Promise(r => setTimeout(r,700));

  await autoScroll(page, 10000); // adjust if you want longer
  const html = await page.content();
  return parseAnkerHtml(html, 'https://ankergames.net/');
}

async function scrapeAnkerAllPuppeteer({ headless = true } = {}) {
  const letters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const browser = await puppeteer.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36');

    // optional: set some headers to look more legit
    await page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9'
    });

    const all = [];
    for (const L of letters) {
      try {
        console.log('ANKER ➜ scraping filter', L);
        const items = await scrapeAnkerFilter(page, L);
        console.log('  found', items.length);
        all.push(...items);
        // small delay between letters so server doesn't rage
        await new Promise(r => setTimeout(r,300));
      } catch (err) {
        console.error('ANKER letter fail', L, err.message || err);
        // pokračujeme ďalej
      }
    }

    // deduplicate by href+title
    const seen = new Set();
    const dedup = [];
    for (const it of all) {
      const key = (it.href||'') + '|' + (it.title||'');
      if (!seen.has(key)) { seen.add(key); dedup.push(it); }
    }

    return dedup;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeAnkerAllPuppeteer: scrapeAnkerAllPuppeteer };
