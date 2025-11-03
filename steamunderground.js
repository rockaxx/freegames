// steamunderground.js
const cheerio = require('cheerio');
const { fetchWithCFBypass } = require('./CF-hide');

// ---------- DETAIL ----------
async function scrapeDetailSteamUnderground(url) {
  const html = await fetchWithCFBypass(url);
  const $ = cheerio.load(html);

  const title = $('h1.entry-title, h1.post-title').text().trim();
  const poster =
    $('img.aligncenter').attr('src') ||
    $('img.wp-post-image').attr('src') ||
    $('div.entry-content img').first().attr('src') || '';
  const desc = $('div.entry-content p').first().text().trim();

  const size = /Size:\s*([0-9.]+\s*(?:GB|MB))/i.exec(html)?.[1] || '';
  const genre = /Genre:\s*([A-Za-z ,]+)/i.exec(html)?.[1]?.trim() || '';
  const developer = /Developer:\s*([^<\n]+)/i.exec(html)?.[1]?.trim() || '';
  const publisher = /Publisher:\s*([^<\n]+)/i.exec(html)?.[1]?.trim() || '';
  const releaseDate = /Release Date:\s*([^<\n]+)/i.exec(html)?.[1]?.trim() || '';

  const screenshots = [];
  $('figure img, .wp-block-gallery img').each((_, el) => {
    const src = $(el).attr('src');
    if (src) screenshots.push(src);
  });

  const trailer = $('iframe[src*="youtube"], iframe[src*="streamable"]').attr('src') || '';

  const downloadLinks = [];
  $('a[href*="steamunderground.net/download"]').each((_, a) => {
    const href = $(a).attr('href');
    const label = $(a).text().trim() || 'Download';
    if (href && href.startsWith('http')) downloadLinks.push({ label, link: href });
  });

  return {
    src: 'SteamUnderground',
    title,
    poster,
    desc,
    size,
    genre,
    developer,
    publisher,
    releaseDate,
    screenshots,
    trailer,
    downloadLinks,
    href: url
  };
}

// ---------- SEARCH ----------
async function scrapeSteamUndergroundSearch(q) {
  const url = `https://steamunderground.net/?s=${encodeURIComponent(q)}`;
  console.log('[SteamUnderground] Loading:', url);

  const html = await fetchWithCFBypass(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  $('li.row-type').each((_, el) => {
    const $el = $(el);
    const title = $el.find('.post-c-wrap a').text().trim();
    const href = $el.find('.post-c-wrap a').attr('href');
    const img =
      $el.find('.thumb img[data-src]').attr('data-src') ||
      $el.find('.thumb img').attr('src') || '';

    const tags = [];
    $el.find('.post-category a').each((_, a) => {
      const tag = $(a).text().trim();
      if (tag) tags.push(tag);
    });

    if (href && title) {
      results.push({
        src: 'SteamUnderground',
        title,
        href,
        img,
        tags
      });
    }
  });

  console.log(`[SteamUnderground] Found ${results.length} results.`);
  return results;
}

module.exports = { scrapeSteamUndergroundSearch, scrapeDetailSteamUnderground };
