// onlinefix.js
const cheerio = require('cheerio');
const https = require('https');
const iconv = require('iconv-lite');

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const html = iconv.decode(buf, 'win1251'); // TU JE POINT
        resolve(html);
      });
    }).on('error', reject);
  });
}
function absolutize(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}
function extractVersion($, html) {
  const blocks = [
    $('.edited-block, .edited-block.right, .edit').text(),
    $('[itemprop="articleBody"]').text(),
    $('.single-content, .entry-content, article').text(),
    $('body').text(),
    html
  ].map(t => (t || '').replace(/\s+/g, ' ').trim()).filter(Boolean);

  for (const t of blocks) {
    let m =
      /\bupdated\b[^.]*?\bto\b[^.]*?\bversion\b\s*([0-9][\w.\-]+)/i.exec(t) ||
      /\bversion[:\s-]*([0-9][\w.\-]+)/i.exec(t) ||
      /обновлен\w*[^.]*?\bдо\b[^.]*?\bверс(?:ии|ия)?\s*([0-9][\w.\-]+)/i.exec(t) ||
      /версия[:\s-]*([0-9][\w.\-]+)/i.exec(t) ||
      /\b(\d+\.\d+\.\d+\.\d+)\b/.exec(t);  // fallback for OFX

    if (m) return m[1].trim();
  }

  return '';
}


async function scrapeDetailOnlineFix(url) {

  const html = await fetchRaw(url);

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

  const version = extractVersion($, html); // ← toto

  return {
    src: 'OnlineFix',
    title,
    poster,
    desc,
    releaseDate,
    screenshots,
    trailer,
    downloadLinks,
    version,        // ← toto
    href: url
  };
}


async function scrapeOnlineFixSearch(q) {
  const url = `https://online-fix.me/index.php?do=search&subaction=search&story=${encodeURIComponent(q)}`;
  const html = await fetchRaw(url);
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
