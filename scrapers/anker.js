const https = require('node:https');
const { URL } = require('node:url');
const cheerio = require('cheerio');

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

// ------------------ ANKER DETAIL ------------------
async function scrapeDetailAnker(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const poster =
    $('div.max-w-\\[16rem\\] picture source').attr('data-srcset') ||
    $('div.max-w-\\[16rem\\] picture img[alt$="poster"]').attr('src') || "";

  const h1 = $('h1').first().text().trim();
  const sub = $('p.text-lg').first().text().trim() || '';
  const desc = $('div.flex-1 p').first().text().trim();
  const version = $('span.animate-glow').text().trim();
  const size = $('div.hidden.lg\\:flex span').eq(1).text().trim();
  const year = $('div.hidden.lg\\:flex span').eq(2).text().trim();
  const publisher = $('div.text-gray-600:contains("Publisher")').next().text().trim();
  const releaseGroup = $('div.flex.items-center div.font-medium a[href*="/scene/"]').text().trim();
  const steam = $('a[href*="store.steampowered.com"]').attr('href') || "";

  const genres = [];
  $('div.text-gray-600:contains("Genre")').next().find('a').each((_, a) => genres.push($(a).text().trim()));

  return {
    src: 'Anker',
    title: h1,
    subtitle: sub,
    poster,
    desc,
    version,
    size,
    year,
    publisher,
    releaseGroup,
    genres,
    steam,
    href: url
  };
}

function scrapeAnker(html, base) {
  const $ = cheerio.load(html);
  const items = [];
  $('div.relative.group.cursor-pointer').each((_, el) => {
    const $el = $(el);
    const img = $el.find('picture img[alt$="poster"]').attr('src')
      || $el.find('picture img').attr('data-src')
      || $el.find('picture source').attr('data-srcset')
      || '';
    const $a = $el.find('a[aria-label]').first();
    const href = new URL($a.attr('href') || '', base).toString();
    let rawTitle = ($a.attr('aria-label') || '').replace(' - View details', '').trim();
    const genre = $el.find('span[title]').last().text().trim();
    const size = $el.find('span[title$="GB"]').attr('title') || '';
    if (rawTitle) {
      items.push({ src: 'Anker', title: rawTitle, href, img, tags: [genre, size].filter(Boolean) });
    }
  });
  return items;
}

module.exports = {scrapeDetailAnker,scrapeAnker};