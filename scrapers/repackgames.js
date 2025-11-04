// repackgames.js
const { fetchWithCFBypass } = require('./cloudflare');
const cheerio = require('cheerio');

/** Keep only one link per host and no exact-URL duplicates. */
function dedupeLinks(raw) {
  const seenUrl = new Set();
  const seenHost = new Set();
  const out = [];

  for (const item of raw) {
    if (!item || !item.link) continue;
    try {
      const u = new URL(item.link);
      const host = u.hostname.replace(/^www\./, '');

      if (seenUrl.has(u.href)) continue;      // exact same URL already kept
      if (seenHost.has(host)) continue;       // keep only first link per host

      seenUrl.add(u.href);
      seenHost.add(host);
      out.push({
        link: u.href,
        label: host, // normalize label to the hostname
      });
    } catch (_) {
      // ignore malformed links
    }
  }
  return out;
}

// ---------- DETAIL ----------
async function scrapeDetailRepackGames(url) {
  const html = await fetchWithCFBypass(url);
  const $ = cheerio.load(html);

  const title =
    $('h1.article-title, h1.entry-title').first().text().trim();
  const poster = $('.media-single-content img').attr('src') || '';
  const desc = $('.entry p').first().text().trim();

  const releaseDate = $("div.game-info h3:contains('PUBLISHED')")
    .text()
    .replace('PUBLISHED On -', '')
    .trim();

  // System requirements – only storage text (if present)
  const size = $("li:contains('Storage')")
    .text()
    .replace('Storage:', '')
    .trim();

  // Screenshots
  const screenshots = [];
  $('#gallery-1 img').each((_, el) => {
    const src = $(el).attr('data-src') || $(el).attr('src');
    if (src) screenshots.push(src);
  });

  // Trailer (YouTube)
  const trailer = $("iframe[src*='youtube']").attr('src') || '';

  // Raw download links collected from the page
  const rawLinks = [];
  $('a.enjoy-css').each((_, el) => {
    const link = $(el).attr('href');
    if (!link || !/^https?:\/\//i.test(link)) return;

    // Some pages put a descriptive <span> before the button. We ignore it
    // because we normalize labels to hostname to avoid duplicates.
    rawLinks.push({ link });
  });

  // Deduplicate by exact URL and by host (keep first per host)
  const downloadLinks = dedupeLinks(rawLinks);

  return {
    src: 'RepackGames',
    title,
    href: url,
    poster,
    desc,
    size,
    genre: '',
    developer: '',
    publisher: '',
    releaseDate,
    screenshots,
    trailer,
    downloadLinks,
  };
}

// ----------- HOMEPAGE / LIST -----------
async function scrapeRepackList(url) {
  const html = await fetchWithCFBypass(url, { headless: true });
  const $ = cheerio.load(html);
  const items = [];

  $('li.post').each((_, el) => {
    const $el = $(el);
    const href = $el.find('a').first().attr('href');
    const img =
      $el.find('img[data-src]').attr('data-src') ||
      $el.find('img').attr('src') ||
      '';
    const title =
      $el.find('h2').text().trim() ||
      $el.find('img').attr('title') ||
      $el.attr('id') ||
      '';

    const category = $el.find('.artbtn-category a').text().trim();
    const author = $el.find('.link-author a').text().trim();
    const time = $el.find('.time-article a').text().trim();

    if (href && title) {
      items.push({
        src: 'RepackGames',
        title,
        href,
        img,
        tags: [category, author, time].filter(Boolean),
      });
    }
  });

  console.log(`[RepackGames] Loaded items: ${items.length}`);
  return items;
}

// ----------- SEARCH -----------
async function scrapeRepackSearch(url) {
  const html = await fetchWithCFBypass(url, { headless: true });
  const $ = cheerio.load(html);
  const items = [];

  $('li').each((_, el) => {
    const $el = $(el);
    const href = $el.find('a').first().attr('href');
    const img =
      $el.find('img[data-src]').attr('data-src') ||
      $el.find('img').attr('src') ||
      '';
    const title =
      $el.find('h2').text().trim() ||
      $el.find('img').attr('alt') ||
      '';

    const category = $el.find('.artbtn-category a').text().trim();
    const author = $el.find('.link-author a').text().trim();
    const time = $el.find('.time-article a').text().trim();

    if (href && title && href.includes('repack-games.com')) {
      items.push({
        src: 'RepackGames',
        title,
        href,
        img,
        tags: [category, author, time].filter(Boolean),
      });
    }
  });

  console.log(`[RepackGames SEARCH] Results: ${items.length}`);
  return items;
}

module.exports = {
  scrapeDetailRepackGames,
  scrapeRepackList,
  scrapeRepackSearch,
};
