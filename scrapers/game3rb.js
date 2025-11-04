const { URL } = require('node:url');
const cheerio = require('cheerio');
const { fetchHtmlTor } = require('./proxyFetch');

function clean(s=''){ return s.replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim(); }
function normalizeUrl(u){ try{ return new URL(u).href; }catch{ return ''; } }

// Pick the nearest meaningful context text BEFORE the <a id="download-link">.
// We search a few likely places and score candidates.
function pickContext($, $a){
  const cands = [];

  const add = (t)=>{ t = clean(t); if(t && !/^download$/i.test(t)) cands.push(t); };

  const $d = $a.closest('div');

  // very near
  add($d.prev().text());
  add($d.prev().find('strong').first().text());

  // one level up
  add($d.parent().prev().text());
  add($d.parent().prev().find('strong').first().text());

  // search upwards for the first preceding <strong>
  const $strongUp = $a.parents().slice(0,4).map((i,el)=>$(el)).get()
    .map($p => $p.prevAll('div').find('strong').first())
    .find($s => $s && $s.length && clean($s.text()));
  if ($strongUp && $strongUp.length) add($strongUp.text());

  // broad: any previous strong in same column/group
  const $prevStrong = $d.prevAll().find('strong').first();
  add($prevStrong.text());

  // choose the “best looking” context
  const score = (s)=>{
    let sc = 0;
    if (/\[.*?\]/.test(s)) sc += 3;        // has [size] or brackets
    if (/Part|Disc|Episode|Fix|V\d/i.test(s)) sc += 3;
    if (/\b\d+(\.\d+)?\s*(MB|GB)\b/i.test(s)) sc += 2;
    if (s.length <= 40) sc += 1;           // concise is nicer
    return sc;
  };

  let best = '';
  let bestScore = -1;
  for (const t of cands){
    const sc = score(t);
    if (sc > bestScore){ bestScore = sc; best = t; }
  }
  return best;
}

function dedupeLinks(raw) {
  const byUrl = new Map(); // url -> {link, label}
  for (const it of raw) {
    if (!it || !it.link) continue;
    let href;
    try { href = new URL(it.link).href; } catch { continue; }

    const cur = byUrl.get(href);
    if (!cur) {
      byUrl.set(href, { link: href, label: it.label || 'Download' });
    } else {
      // Ak príde duplicitná URL s „bohatším“ labelom, ponechaj ten lepší
      const better = (a, b) => (a || '').length >= (b || '').length ? a : b;
      byUrl.set(href, { link: href, label: better(it.label, cur.label) });
    }
  }
  return Array.from(byUrl.values());
}


async function scrapeDetail3rb(url) {
  const html = await fetchHtmlTor(url);
  const $ = cheerio.load(html);

  const title = $('h1.post-title, h3.entry-title').first().text().trim();
  const poster =
    $('img.entry-image').attr('src') ||
    $('img.wp-image-57674').attr('src') ||
    $('img[fetchpriority="high"]').attr('src') ||
    '';

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
  const rawLinks = [];
  $('a#download-link').each((_, a) => {
    const $a = $(a);
    const href = normalizeUrl($a.attr('href') || '');
    if (!href || !href.startsWith('http')) return;

    // build: "Download - <context>"
    const ctx = pickContext($, $a);               // e.g. "Part 1 To 10 [4 GB]" or "[Steam-Fix V3 ] [6 MB]"
    const label = ctx ? `Download - ${ctx}` : 'Download';

    rawLinks.push({ label, link: href });
  });

  const downloadLinks = dedupeLinks(rawLinks);

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


function parseGame3rb(html, base) {
  const $ = cheerio.load(html);
  const list = [];

  $('article.post-hentry').each((_, el) => {
    const $el = $(el);

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

module.exports = {parseGame3rb,scrapeDetail3rb};