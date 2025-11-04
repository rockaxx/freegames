// onlinefix.js
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

const { fetchHtmlTor } = require('./proxyFetch');

function absolutize(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}
// Helper: get text strictly inside .content (or '' if .content missing)
function getContentText($, selector) {
  const $c = $('.content');
  if (!$c.length) return '';
  return selector ? $c.find(selector).text() : $c.text();
}

function extractVersion($, html) {
  // Only read from inside .content
  const blocks = [
    getContentText($, '.edited-block, .edited-block.right, .edit'),
    getContentText($, '[itemprop="articleBody"], .single-content, .entry-content, article'),
    getContentText($, null) // whole .content fallback
  ]
  .map(t => (t || '').replace(/\s+/g, ' ').trim())
  .filter(Boolean);

  for (const t of blocks) {
    const m =
      /\bupdated\b[^.]*?\bto\b[^.]*?\bversion\b\s*([0-9][\w.\-]+)/i.exec(t) ||
      /\bversion[:\s-]*([0-9][\w.\-]+)/i.exec(t) ||
      /обновлен\w*[^.]*?\bдо\b[^.]*?\bверс(?:ии|ия)?\s*([0-9][\w.\-]+)/i.exec(t) ||
      /версия[:\s-]*([0-9][\w.\-]+)/i.exec(t) ||
      /\b(\d+\.\d+\.\d+\.\d+)\b/.exec(t); // dotted fallback

    if (m) return m[1].trim();
  }
  return '';
}

function extractBuild($, html) {
  // Only read from inside .content
  const blocks = [
    getContentText($, '.edited-block, .edited-block.right, .edit'),
    getContentText($, '[itemprop="articleBody"], .single-content, .entry-content, article'),
    getContentText($, null) // whole .content fallback
  ]
  .map(t => (t || '').replace(/\s+/g, ' ').trim())
  .filter(Boolean);

  for (const t of blocks) {
    const m =
      /\bbuild[:\s-]*([0-9]{3,})\b/i.exec(t) ||      // "Build: 18733"
      /\bbuild\s+([0-9]{3,})\b/i.exec(t) ||          // "build 18733"
      /\b(\d+\.\d+\.\d+\.\d+)\b/.exec(t);            // dotted fallback if they misuse "build"

    if (m) return m[1].trim();
  }
  return '';
}

async function scrapeDetailOnlineFix(url) {

  const html = await fetchHtmlTor(url);

  if (!html) {

    return {
      src: 'OnlineFix', title: '', poster: '', desc: '', releaseDate: '',
      screenshots: [], trailer: '', downloadLinks: [], version:'', href: url
    };
  }

  const $ = cheerio.load(html, { decodeEntities: false });

  const title =
    $('#news-title').text().trim() ||
    $('h1.title, h2.title').first().text().trim();

  const poster =
    $('div.image img[data-src]').attr('data-src') ||
    $('div.image img').attr('src') || '';

  const desc = $('div.preview-text').text().trim();

  let releaseDate = '';
  {
    const t = $('[itemprop="articleBody"]').text() || $('body').text();
    const m = /Релиз игры:\s*([0-9.]+)/i.exec(t);
    if (m) releaseDate = m[1];
  }

  const screenshots = [];
  ($('[itemprop="articleBody"] img, .entry-content img, figure img') || []).each((_, el) => {
    const src = $(el).attr('src');
    if (src) screenshots.push(absolutize(src, url));
  });

  const trailer =
    $('iframe[src*="youtube"], iframe[src*="streamable"]').attr('src') || '';

  const downloadLinks = "None, not logged in, because, Alexíni Bombombíni Guzíni Pipilíni cant make it"

  const version = extractVersion($, html);
  const build = extractBuild($, html);

  return {
    src: 'OnlineFix',
    title,
    poster,
    desc,
    releaseDate,
    screenshots,
    trailer,
    downloadLinks,
    version,
    build,
    href: url
  };
}


async function scrapeOnlineFixSearch(q) {
  const url = `https://online-fix.me/index.php?do=search&subaction=search&story=${encodeURIComponent(q)}`;
  const html = await fetchHtmlTor(url);
  if (!html) return [];

  const $ = cheerio.load(html, { decodeEntities: false });
  const results = [];

  $('.news-search .article').each((_, el) => {
    const $el = $(el);
    const a = $el.find('a.big-link');
    const href = a.attr('href') || '';
    const title =
      $el.find('h2.title').text().trim() ||
      $el.find('a.big-link').text().trim();

    const img =
      $el.find('div.image img[data-src]').attr('data-src') ||
      $el.find('div.image img').attr('src') || '';

    if (href && title) {
      results.push({ src: 'OnlineFix', title, href, img, tags: [] });
    }
  });

  return results;
}

module.exports = { scrapeOnlineFixSearch, scrapeDetailOnlineFix };
