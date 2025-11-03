const { fetchWithCFBypass } = require('./CF-hide');
const cheerio = require('cheerio');

async function scrapeDetailRepackGames(url) {
  // načítaj HTML (v prípade CF sa použije fetchWithCFBypass)
  const html = await fetchWithCFBypass(url, {
    waitForSelector: 'article',
    headless: true
  });

  const $ = cheerio.load(html);

  const title = $('h1.entry-title').text().trim();
  const poster = $('img.aligncenter').attr('src') || '';
  const desc = $('div.entry-content p').first().text().trim();

  const size = $('strong:contains("Size")').next().text().trim() || '';
  const genre = $('strong:contains("Genre")').next().text().trim() || '';
  const developer = $('strong:contains("Developer")').next().text().trim() || '';
  const publisher = $('strong:contains("Publisher")').next().text().trim() || '';
  const releaseDate = $('strong:contains("Release Date")').next().text().trim() || '';

  const screenshots = [];
  $('div.gallery img').each((_, el) => {
    const src = $(el).attr('src');
    if (src) screenshots.push(src);
  });

  const trailer = $('iframe[src*="youtube"]').attr('src') || '';

  const downloadLinks = [];
  $('a[href*="repack-games.com/download"]').each((_, a) => {
    const link = $(a).attr('href');
    const label = $(a).text().trim();
    if (link) downloadLinks.push({ label, link });
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

module.exports = { scrapeDetailRepackGames };
