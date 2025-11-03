// onlinefix.js
const cheerio = require('cheerio');
const { fetchWithCFBypass } = require('./cloudflare');

function absolutize(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}

function extractDownloadLinks($, baseUrl, fullHtml) {
  const hostsRe = /(hosters\.online-fix\.me|drive\.online-fix\.me|uploads\.online-fix\.me|\/torrents\/|\.torrent$|^magnet:\?)/i;
  let container = $('[itemprop="articleBody"]');
  if (container.length === 0) {
    container = $('.single-content, .entry-content, article, body');
  }

  const seen = new Set();
  const out = [];

  const pushLink = (label, href) => {
    const link = absolutize(href, baseUrl);
    if (!seen.has(link)) {
      seen.add(link);
      out.push({ label: (label || 'Download').trim(), link });
    }
  };

  // 1) Zelené tlačidlá (kdekoľvek v article body)
  container.find('a.btn-success[href]').each((_, a) => {
    const href = $(a).attr('href');
    const label = $(a).text();
    if (href) pushLink(label, href);
  });

  // 2) Priame URL na známe hosty
  container.find([
    'a[href*="hosters.online-fix.me"]',
    'a[href*="drive.online-fix.me"]',
    'a[href*="uploads.online-fix.me"]',
    'a[href*="/torrents/"]',
    'a[href^="magnet:"]'
  ].join(',')).each((_, a) => {
    const href = $(a).attr('href');
    const label = $(a).text();
    if (href && hostsRe.test(href)) pushLink(label, href);
  });

  // 3) Posledný fallback: regex cez celé HTML (ak by Cheerio selektor zlyhal)
  if (out.length === 0 && fullHtml) {
    const re = /<a[^>]+href=(['"])([^'"]+)\1[^>]*>([\s\S]{1,200}?)<\/a>/gi;
    let m;
    while ((m = re.exec(fullHtml))) {
      const href = m[2];
      if (!hostsRe.test(href)) continue;
      const rawLabel = m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
      pushLink(rawLabel, href);
    }
  }

  return out;
}

async function scrapeDetailOnlineFix(url) {
  const html = await fetchWithCFBypass(url);
  if (!html) {
    return {
      src: 'OnlineFix', title: '', poster: '', desc: '', releaseDate: '',
      screenshots: [], trailer: '', downloadLinks: [], href: url
    };
  }

  const $ = cheerio.load(html, { decodeEntities: false });

  const title = $('h1.title, h2.title').first().text().trim();

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


  const downloadLinks = extractDownloadLinks($, url, html);

  return {
    src: 'OnlineFix',
    title,
    poster,
    desc,
    releaseDate,
    screenshots,
    trailer,
    downloadLinks,
    href: url
  };
}

async function scrapeOnlineFixSearch(q) {
  const url = `https://online-fix.me/index.php?do=search&subaction=search&story=${encodeURIComponent(q)}`;
  const html = await fetchWithCFBypass(url);
  if (!html) return [];

  const $ = cheerio.load(html, { decodeEntities: false });
  const results = [];

  $('.news-search .article').each((_, el) => {
    const $el = $(el);
    const a = $el.find('a.big-link');
    const href = a.attr('href') || '';
    const title = $el.find('h2.title').text().trim();
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
