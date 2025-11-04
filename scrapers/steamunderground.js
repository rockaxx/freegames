// steamunderground.js
const cheerio = require('cheerio');
const { fetchWithCFBypass } = require('./cloudflare');

// ---------- helpers ----------
const clean = (t) => (t || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

const normalizeUrl = (u) => {
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  return u;
};

function extractGameVersion($, html) {
  let v =
    clean($('div.gameVersion .gameVersionValue').text()) ||
    clean($('.gameVersionValue').text()) ||
    clean($('.gameVersion').text().replace(/^\s*Game Version:\s*/i, ''));
  if (!v) {
    const m = html.match(/Game\s*Version:\s*([^<\n]+)/i);
    if (m) v = clean(m[1]);
  }
  return v || '';
}

function extractCrack($, html) {
  let c = clean($('div.releaseGroup .releaseGroupValue').text());
  if (!c) {
    const m =
      html.match(/Game\s*Source\s*\/\s*Scene\s*Group:\s*([^<\n]+)/i) ||
      html.match(/Release\s*Group:\s*([^<\n]+)/i) ||
      html.match(/Crack\s*:\s*([^<\n]+)/i);
    if (m) c = clean(m[1]);
  }
  return c || '';
}

function extractSysreq($) {
  const out = {};
  // <li><strong>Key:</strong> Value</li>
  $('.article-wrap li strong, .post-content li strong, .entry-content li strong, li strong').each((_, el) => {
    const key = clean($(el).text()).replace(/:$/, '');
    const full = clean($(el).parent().text());
    const val = clean(full.replace($(el).text(), '').replace(/^:/, ''));
    if (key && val) out[key] = val;
  });
  // <dt>Key</dt><dd>Value</dd>
  $('.article-wrap dt, .post-content dt, .entry-content dt, dt').each((_, el) => {
    const key = clean($(el).text()).replace(/:$/, '');
    const val = clean($(el).next('dd').text());
    if (key && val) out[key] = val;
  });
  return out;
}

function pickStorage(sysreq, html) {
  if (sysreq && sysreq.Storage) return clean(sysreq.Storage);
  const m = html.match(/Storage\s*:\s*([^\n<]+)/i);
  return m ? clean(m[1]) : '';
}

// Parse srcset -> return largest URL
function bestFromSrcset(srcset) {
  if (!srcset) return '';
  let best = '', bestW = -1;
  for (const part of srcset.split(',')) {
    const seg = part.trim();
    if (!seg) continue;
    const m = seg.match(/(\S+)\s+(\d+)w/i); // "URL 1024w"
    if (m) {
      const url = m[1];
      const w = parseInt(m[2], 10);
      if (w > bestW) { bestW = w; best = url; }
    } else {
      if (!best && /^https?:\/\//i.test(seg)) best = seg.split(/\s+/)[0];
    }
  }
  return best;
}

// Best URL from an <img> (handles lazy/srcset)
function bestImgUrl($img) {
  if (!$img || !$img.attr) return '';
  const srcset =
    $img.attr('data-lazy-srcset') ||
    $img.attr('data-srcset') ||
    $img.attr('srcset') || '';
  const fromSet = bestFromSrcset(srcset);
  if (fromSet) return normalizeUrl(fromSet);

  let url =
    $img.attr('data-lazy-src') ||
    $img.attr('data-src') ||
    $img.attr('src') ||
    '';
  return normalizeUrl(url);
}


// Extract a Steam store link if present
function extractSteamLink($, html) {
  // Prefer links inside article content
  let href =
    $('a[href*="store.steampowered.com"]').first().attr('href') ||
    $('li:contains("Support the game") a[href*="store.steampowered.com"]').first().attr('href') ||
    '';
  if (!href) {
    const m = html.match(/https?:\/\/store\.steampowered\.com\/[\w\-\/\?&=%#]+/i);
    if (m) href = m[0];
  }
  if (href && href.startsWith('//')) href = 'https:' + href;
  return href || '';
}

// small concurrency helper
async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array(Math.min(limit, items.length)).fill(0).map(worker));
  return out;
}

// ---------- DETAIL ----------
async function scrapeDetailSteamUnderground(url) {
  const html = await fetchWithCFBypass(url);
  const $ = cheerio.load(html);

  const title = clean($('h1.entry-title, h1.post-title').text());

  // Poster only (no screenshots)
  let poster =
    bestImgUrl($('img.aligncenter').first()) ||
    bestImgUrl($('img.wp-post-image').first()) ||
    bestImgUrl($('div.entry-content img').first()) ||
    '';
  poster = normalizeUrl(poster);

  const desc = clean($('div.entry-content p').first().text());

  // Uploaded date (from .post-date or common WP date selectors)
  const uploaded =
    clean($('.post-date').first().text()) ||
    clean($('time.entry-date').first().text()) ||
    clean($('.post-meta time').first().text()) ||
    '';
  const uploadedText = uploaded ? `Uploaded: ${uploaded}` : '';

  // Meta
  const sizeRx = /Size:\s*([0-9.]+\s*(?:GB|MB))/i.exec(html)?.[1] || '';
  const genre = /Genre:\s*([A-Za-z ,]+)/i.exec(html)?.[1]?.trim() || '';
  const developer = /Developer:\s*([^<\n]+)/i.exec(html)?.[1]?.trim() || '';
  const publisher = /Publisher:\s*([^<\n]+)/i.exec(html)?.[1]?.trim() || '';
  const releaseDate = /Release Date:\s*([^<\n]+)/i.exec(html)?.[1]?.trim() || '';

  const gameVersion = extractGameVersion($, html);
  const crack = extractCrack($, html);
  const releaseGroup = crack;
  const sysreq = extractSysreq($);
  const storage = pickStorage(sysreq, html);
  const finalSize = sizeRx || storage || '';

  const trailer =
    $('iframe[src*="youtube"], iframe[src*="streamable"]').attr('src') || '';

  const steam = extractSteamLink($, html);

  const downloadLinks = [];
  const seen = new Set();

  $('a[href*="steamunderground.net/download"]').each((_, a) => {
    const href = normalizeUrl($(a).attr('href') || '');
    if (!href || !href.startsWith('http')) return;

    const key = href.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const label = clean($(a).text()) || 'Download';
    downloadLinks.push({ label, link: href });
  });

  return {
    src: 'SteamUnderground',
    title,
    href: url,
    poster,
    desc,
    size: finalSize,
    genre,
    developer,
    publisher,
    releaseDate,
    version: gameVersion,
    gameVersion,
    crack,
    releaseGroup,
    sysreq,
    uploaded,       // raw date text
    uploadedText,   // "Uploaded: <date>"
    trailer,
    downloadLinks,
    steam
  };
}

// ---------- SEARCH ----------
async function scrapeSteamUndergroundSearch(q) {
  const url = `https://steamunderground.net/?s=${encodeURIComponent(q)}`;
  const html = await fetchWithCFBypass(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const items = [];

  $('li.row-type').each((_, el) => {
    const $el = $(el);
    const href = $el.find('.post-c-wrap a').attr('href');

    // Thumb for the card (not screenshots)
    const $img = $el.find('.thumb img').first();
    const img = bestImgUrl($img);

    const title = clean($el.find('.post-c-wrap a').text());

    // Uploaded date if present on the card
    const uploaded =
      clean($el.find('.post-date').first().text()) ||
      clean($el.find('time.entry-date').first().text()) ||
      '';
    const uploadedText = uploaded ? `Uploaded: ${uploaded}` : '';

    let tags = [];
    $el.find('.post-category a').each((_, a) => {
      const tag = clean($(a).text());
      if (tag) tags.push(tag);
    });
    tags = tags.filter(t => t.toLowerCase() !== 'uncategorized');

    if (href && title) items.push({ src: 'SteamUnderground', title, href, img, tags, uploaded, uploadedText });
  });

  // Enrich only meta (size/version/crack/uploaded fallback)
  await mapWithLimit(items, 3, async (it) => {
    try {
      const dhtml = await fetchWithCFBypass(it.href);
      const d$ = cheerio.load(dhtml);

      const v = extractGameVersion(d$, dhtml);
      const c = extractCrack(d$, dhtml);
      const sys = extractSysreq(d$);
      const storage = pickStorage(sys, dhtml);
      const sizeRx = /Size:\s*([0-9.]+\s*(?:GB|MB))/i.exec(dhtml)?.[1] || '';
      const finalSize = sizeRx || storage || '';
      if (finalSize) it.size = finalSize;
      if (v) { it.version = v; it.gameVersion = v; }
      if (c) it.crack = c;

      const steam = extractSteamLink(d$, dhtml);
      if (steam) it.steam = steam;

      if (!it.uploaded) {
        const up =
          clean(d$('.post-date').first().text()) ||
          clean(d$('time.entry-date').first().text()) ||
          clean(d$('.post-meta time').first().text()) ||
          '';
        if (up) {
          it.uploaded = up;
          it.uploadedText = `Uploaded: ${up}`;
        }
      }
    } catch (_) {}
    return it;
  });

  return items;
}

module.exports = { scrapeSteamUndergroundSearch, scrapeDetailSteamUnderground };
