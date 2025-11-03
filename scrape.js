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

async function scrapeDetail3rb(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  // ---- Title a základné info ----
  const title = $('h1.post-title, h3.entry-title').first().text().trim();
  const poster =
    $('img.entry-image').attr('src') ||
    $('img.wp-image-57674').attr('src') ||
    $('img[fetchpriority="high"]').attr('src') ||
    '';

  // ---- Hlavný blok detailov (Game Details) ----
  const detailsText = $('div.summaryy').text().replace(/\s+/g, ' ').trim();
  const size = /Size:\s*([0-9.]+\s*(?:GB|MB))/i.exec(detailsText)?.[1] || '';
  const genreText = /Genre:\s*([^]+?)\s*(?:Developer|Publisher|Release|ALL|$)/i.exec(detailsText)?.[1]?.trim() || '';
  const developer = /Developer:\s*(.+?)\s*(?:Publisher|Release|ALL|$)/i.exec(detailsText)?.[1]?.trim() || '';
  const publisher = /Publisher:\s*(.+?)\s*(?:Release|ALL|$)/i.exec(detailsText)?.[1]?.trim() || '';
  const releaseDate = /Release Date:\s*([0-9]{1,2}\s+\w+,\s*[0-9]{4})/i.exec(detailsText)?.[1]?.trim() || '';
  const reviews = /ALL REVIEWS:\s*(.+?)(?:\s|$)/i.exec(detailsText)?.[1]?.trim() || '';

  const genres = genreText.split(',').map(s => s.trim()).filter(Boolean);

  // ---- Steam link ----
  const steam = $('a[href*="store.steampowered.com"]').attr('href') || '';

  // ---- Screenshots ----
  const screenshots = [];
  $('div.slideshow-container img').each((_, img) => {
    const src = $(img).attr('src');
    if (src) screenshots.push(src);
  });

  // ---- Trailer ----
  const trailer =
    $('video source').attr('src') ||
    $('iframe[src*="streamable"], iframe[src*="youtube"]').attr('src') ||
    '';

  // ---- About this game ----
  const about = $('h3:contains("About This Game")')
    .nextAll('p')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim();

  // ---- Download links ----
  const downloadLinks = [];
  $('a#download-link').each((_, a) => {
    const link = $(a).attr('href');
    const label = $(a).closest('div').text().trim().replace(/\s+/g, ' ');
    if (link && link.startsWith('http')) {
      downloadLinks.push({ label, link });
    }
  });

  return {
    src: 'Game3RB',
    title,
    poster,
    size,
    genres,
    developer,
    publisher,
    releaseDate,
    reviews,
    steam,
    about,
    screenshots,
    trailer,
    downloadLinks,
    href: url
  };
}


// ------------------ GAME3RB LIST PARSER ------------------
function parseGame3rb(html, base) {
  const $ = cheerio.load(html);
  const list = [];

  $('article.post-hentry').each((_, el) => {
    const $el = $(el);

    // ak je vnútri viac než 1 h3, je to bordel sekcia -> preskoč
    if ($el.find('h3.entry-title').length !== 1) return;

    const $a = $el.find('h3.entry-title a').first();
    const title = $a.text().replace(/\s+/g, ' ').trim();
    const href = new URL($a.attr('href') || '', base).toString();
    const img = $el.find('img.entry-image').attr('src')
      || $el.find('img.lazyload').attr('data-src')
      || '';

    if (!title || !href) return;

    list.push({
      src: 'Game3RB',
      title,
      href,
      img
    });
  });

  return list;
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

  return { error: 'unknown domain' };
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

module.exports = { scrape, scrapeDetailAnker, scrapeDetail3rb };
