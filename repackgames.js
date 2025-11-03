const { fetchWithCFBypass } = require('./CF-hide');
const cheerio = require('cheerio');

// ----------- DETAIL STRÁNKY -----------
async function scrapeDetailRepackGames(url) {
  const html = await fetchWithCFBypass(url, { headless: true });
  const $ = cheerio.load(html);

  const title = $('h1.entry-title').text().trim();
  const poster =
    $('img.aligncenter').attr('src') ||
    $('div.entry-content img').first().attr('src') || '';
  const desc = $('div.entry-content p').first().text().trim();

  // meta info
  const size = $('strong:contains("Size")').next().text().trim() || '';
  const genre = $('strong:contains("Genre")').next().text().trim() || '';
  const developer = $('strong:contains("Developer")').next().text().trim() || '';
  const publisher = $('strong:contains("Publisher")').next().text().trim() || '';
  const releaseDate = $('strong:contains("Release Date")').next().text().trim() || '';

  // screenshots
  const screenshots = [];
  $('div.gallery img, .wp-block-gallery img').each((_, el) => {
    const src = $(el).attr('src');
    if (src) screenshots.push(src);
  });

  const trailer = $('iframe[src*="youtube"]').attr('src') || '';

  // download odkazy
  const downloadLinks = [];
  $('a[href*="download"], a[href*="links"]').each((_, a) => {
    const href = $(a).attr('href');
    const label = $(a).text().trim() || 'Download';
    if (href && href.startsWith('http'))
      downloadLinks.push({ label, link: href });
  });

  return {
    src: 'RepackGames',
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
