const { fetchWithCFBypass } = require('./CF-hide');
const cheerio = require('cheerio');

// repackgames.js
async function scrapeDetailRepackGames(url) {
  const html = await fetchWithCFBypass(url);
  const $ = cheerio.load(html);

  const title = $("h1.article-title, h1.entry-title").first().text().trim();
  const poster = $(".media-single-content img").attr("src") || "";
  const desc = $(".entry p").first().text().trim();

  const releaseDate = $("div.game-info h3:contains('PUBLISHED')")
    .text()
    .replace("PUBLISHED On -", "")
    .trim();

  // systémové požiadavky
  const size = $("li:contains('Storage')").text().replace("Storage:", "").trim();

  // screenshoty
  const screenshots = [];
  $("#gallery-1 img").each((_, el) => {
    const src = $(el).attr("data-src") || $(el).attr("src");
    if (src) screenshots.push(src);
  });

  const trailer = $("iframe[src*='youtube']").attr("src") || "";

  // odkazy na downloady (MEGA, 1FICHIER, atď.)
  const downloadLinks = [];
  $("a.enjoy-css").each((_, el) => {
    const link = $(el).attr("href");
    const label = $(el).prev("span").text().trim();
    if (link && link.startsWith("http"))
      downloadLinks.push({ label, link });
  });

  return {
    src: "RepackGames",
    title,
    href: url,
    poster,
    desc,
    size,
    genre: "",
    developer: "",
    publisher: "",
    releaseDate,
    screenshots,
    trailer,
    downloadLinks
  };
}

// ----------- HOMEPAGE / ZOZNAM -----------
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
      $el.attr('id') || '';

    const category = $el.find('.artbtn-category a').text().trim();
    const author = $el.find('.link-author a').text().trim();
    const time = $el.find('.time-article a').text().trim();

    if (href && title) {
      items.push({
        src: 'RepackGames',
        title,
        href,
        img,
        tags: [category, author, time].filter(Boolean)
      });
    }
  });

  console.log(`[RepackGames] Načítaných položiek: ${items.length}`);
  return items;
}

// ----------- SEARCH / HĽADANIE -----------
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

    // iba platné výsledky
    if (href && title && href.includes('repack-games.com')) {
      items.push({
        src: 'RepackGames',
        title,
        href,
        img,
        tags: [category, author, time].filter(Boolean)
      });
    }
  });

  console.log(`[RepackGames SEARCH] Výsledkov: ${items.length}`);
  return items;
}

module.exports = {
  scrapeDetailRepackGames,
  scrapeRepackList,
  scrapeRepackSearch
};


module.exports = { scrapeDetailRepackGames, scrapeRepackList, scrapeRepackSearch };
