// steamunderground.js (fixed)
// Keeps new features (pagination + streaming), restores full metadata (releaseGroup, crackedBy, etc.)
// All code and comments are in English.

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
    const m = (html || '').match(/Game\s*Version:\s*([^<\n]+)/i);
    if (m) v = clean(m[1]);
  }
  return v || '';
}

// Robust extractor for "cracked by"/"release group" when explicit block is missing
function extractCrack($, html) {
  const normHtml = (html || '').replace(/<br\s*\/?>/gi, '\n');

  const LABELS = [
    'release group',
    'scene group',
    'game source',
    'game source / scene group',
    'cracked by',
    'crack',
  ];

  const tryStrong = () => {
    let out = '';
    $('strong, b').each((_, el) => {
      if (out) return;
      const labelText = clean($(el).text()).replace(/:$/, '').toLowerCase();
      if (!LABELS.includes(labelText)) return;

      const parentText = clean($(el).parent().text());
      let val = parentText.replace(
        new RegExp('^\\s*' + $(el).text().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:\\-–—]?\\s*', 'i'),
        ''
      );
      val = clean(val);
      if (val) out = val;
    });
    return out;
  };

  let c = tryStrong();
  if (c) return c;

  const rx = [
    /(Release\s*Group|Scene\s*Group|Game\s*Source(?:\s*\/\s*Scene\s*Group)?)\s*(?:[:\-–—]\s*|\s+)([A-Za-z0-9._ \-]{2,50})/i,
    /(Cracked?\s*by|Crack(?:ed)?(?:\s*by)?)\s*(?:[:\-–—]\s*|\s+)([A-Za-z0-9._ \-]{2,50})/i
  ];

  for (const r of rx) {
    const m = normHtml.match(r);
    if (m && m[2]) {
      return clean(m[2]);
    }
  }

  const legacy = clean($('div.releaseGroup .releaseGroupValue').text());
  if (legacy) return legacy;

  return '';
}

// Exact extractor for the SteamUnderground block shown in previous examples
function extractReleaseGroup($) {
  let v = clean($('.releaseGroup .releaseGroupValue').first().text());
  if (v) return v;

  const label = $('.releaseGroup .releaseGroupSpan')
    .filter((_, el) => /Game\s*Source\s*\/\s*Scene\s*Group/i.test($(el).text()))
    .first();
  if (label.length) {
    v = clean(label.siblings('.releaseGroupValue').first().text());
    if (v) return v;
  }

  return '';
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
  const m = (html || '').match(/Storage\s*:\s*([^\n<]+)/i);
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
  let href =
    $('a[href*="store.steampowered.com"]').first().attr('href') ||
    $('li:contains("Support the game") a[href*="store.steampowered.com"]').first().attr('href') ||
    '';
  if (!href) {
    const m = (html || '').match(/https?:\/\/store\.steampowered\.com\/[\w\-\/\?&=%#]+/i);
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

// Merge enriched detail fields into a list-card item with a stable shape
function mergeCardFields(base, detail) {
  const out = { ...base };
  if (detail) {
    if (detail.version) out.version = detail.version;
    if (detail.gameVersion) out.gameVersion = detail.gameVersion;
    if (detail.releaseGroup) {
      out.releaseGroup = detail.releaseGroup;
      out.crack = detail.releaseGroup;
      out.crackedBy = detail.releaseGroup;
    } else if (detail.crack) {
      out.crack = detail.crack;
      out.crackedBy = detail.crack;
      out.releaseGroup = detail.crack;
    }
    if (detail.size) out.size = detail.size;
    if (detail.steam) out.steam = detail.steam;
    if (!out.uploaded && detail.uploaded) {
      out.uploaded = detail.uploaded;
      out.uploadedText = detail.uploadedText || (detail.uploaded ? `Uploaded: ${detail.uploaded}` : '');
    }
  }
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

  // Meta via regex fallbacks
  const sizeRx = /Size:\s*([0-9.]+\s*(?:GB|MB))/i.exec(html)?.[1] || '';
  const genre = /Genre:\s*([A-Za-z ,]+)/i.exec(html)?.[1]?.trim() || '';
  const developer = /Developer:\s*([^<\n]+)/i.exec(html)?.[1]?.trim() || '';
  const publisher = /Publisher:\s*([^<\n]+)/i.exec(html)?.[1]?.trim() || '';
  const releaseDate = /Release Date:\s*([^<\n]+)/i.exec(html)?.[1]?.trim() || '';

  const gameVersion = extractGameVersion($, html);

  // Prefer explicit block, then fall back to robust extractor
  const releaseGroup = extractReleaseGroup($) || extractCrack($, html);
  const crack = releaseGroup;
  const crackedBy = releaseGroup;

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
    crackedBy,
    sysreq,
    uploaded,
    uploadedText,
    trailer,
    downloadLinks,
    steam
  };
}

// ---------- SEARCH (with pagination, then enrich) ----------
async function scrapeSteamUndergroundSearch(q) {
  const items = [];

  for (let page = 1; page < 999; page++) {
    const url = `https://steamunderground.net/page/${page}/?s=${encodeURIComponent(q)}`;
    const html = await fetchWithCFBypass(url);
    if (!html) break;

    const $ = cheerio.load(html);
    const pageItems = [];

    $('li.row-type').each((_, el) => {
      const $el = $(el);
      const href = $el.find('.post-c-wrap a').attr('href');

      const $img = $el.find('.thumb img').first();
      const img = bestImgUrl($img);
      const title = clean($el.find('.post-c-wrap a').text());
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

      if (href && title) {
        pageItems.push({
          src: 'SteamUnderground',
          title, href, img, tags, uploaded, uploadedText
        });
      }
    });

    if (pageItems.length === 0) break; // end paging
    items.push(...pageItems);
  }

  // Enrich after pagination (version, releaseGroup, size, steam, uploaded fallback)
  await mapWithLimit(items, 3, async (it) => {
    try {
      const dhtml = await fetchWithCFBypass(it.href);
      const d$ = cheerio.load(dhtml);

      const v = extractGameVersion(d$, dhtml);
      const rel = extractReleaseGroup(d$) || extractCrack(d$, dhtml);
      const sys = extractSysreq(d$);
      const storage = pickStorage(sys, dhtml);

      const sizeRx = /Size:\s*([0-9.]+\s*(?:GB|MB))/i.exec(dhtml)?.[1] || '';
      const finalSize = sizeRx || storage || '';
      if (finalSize) it.size = finalSize;
      if (v) it.version = it.gameVersion = v;
      if (rel) it.releaseGroup = it.crackedBy = it.crack = rel;

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

// ---------- STREAM (per-item progressive, with full metadata for cards) ----------
async function streamSteamUnderground(q, onItem) {
  for (let page = 1; page < 999; page++) {
    const url = `https://steamunderground.net/page/${page}/?s=${encodeURIComponent(q)}`;
    const html = await fetchWithCFBypass(url);
    if (!html) break;

    const $ = cheerio.load(html);
    const batch = [];

    $('li.row-type').each((_, el) => {
      const $el = $(el);
      const href = $el.find('.post-c-wrap a').attr('href');
      const img = bestImgUrl($el.find('.thumb img').first());
      const title = clean($el.find('.post-c-wrap a').text());

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

      if (href && title) batch.push({ title, href, img, tags, uploaded, uploadedText });
    });

    if (batch.length === 0) break;

    // stream per item with detail immediately; include full card shape
    await mapWithLimit(batch, 3, async (g) => {
      try {
        const dhtml = await fetchWithCFBypass(g.href);
        const d$ = cheerio.load(dhtml);
        const v = extractGameVersion(d$, dhtml);
        const rel = extractReleaseGroup(d$) || extractCrack(d$, dhtml);
        const sys = extractSysreq(d$);
        const storage = pickStorage(sys, dhtml);
        const sizeRx = /Size:\s*([0-9.]+\s*(?:GB|MB))/i.exec(dhtml)?.[1] || '';
        const finalSize = sizeRx || storage || '';
        const steam = extractSteamLink(d$, dhtml);

        const out = {
          src: 'SteamUnderground',
          title: g.title,
          href: g.href,
          img: g.img,
          tags: g.tags || [],
          uploaded: g.uploaded || '',
          uploadedText: g.uploadedText || (g.uploaded ? `Uploaded: ${g.uploaded}` : ''),
          version: v || '',
          gameVersion: v || '',
          releaseGroup: rel || '',
          crack: rel || '',
          crackedBy: rel || '',
          size: finalSize || '',
          steam: steam || ''
        };

        await onItem(out);
      } catch (e) {
        // swallow to continue streaming others
      }
    });
  }
}

module.exports = { scrapeSteamUndergroundSearch, scrapeDetailSteamUnderground, streamSteamUnderground };
