// scrape.js – ankergames A + game3rb B

const https = require('node:https');
const { URL } = require('node:url');
const cheerio = require('cheerio');

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + (u.search||''),
      method: 'GET',
      headers: { 'User-Agent':'Mozilla/5.0' }
    };
    const req = https.request(opts, res => {
      const parts=[];
      res.on('data',c=>parts.push(c));
      res.on('end',()=>resolve(Buffer.concat(parts).toString('utf8')));
    });
    req.on('error',reject);
    req.end();
  });
}

// ------------------ parsers ------------------

async function scrapeDetailAnker(url){
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const poster =
    $('div.max-w-\\[16rem\\] picture source').attr('data-srcset') ||
    $('div.max-w-\\[16rem\\] picture img[alt$="poster"]').attr('src') ||
    "";

  const h1 = $('h1').first().text().trim();
  const sub = $('p.text-lg').first().text().trim() || '';

  const desc = $('div.flex-1 p').first().text().trim();

  const version = $('span.animate-glow').text().trim(); // V 0.2.89

  const pc = $('span.bg-gray-200\\/50').text().trim(); // PC
  const size = $('div.hidden.lg\\:flex span').eq(1).text().trim(); // 3.0GB
  const year = $('div.hidden.lg\\:flex span').eq(2).text().trim(); // 2025

  const pubText = $('div.text-gray-600:contains("Publisher")')
        .next()
        .text().trim();

  const releaseGroup = $('div.flex.items-center div.font-medium a[href*="/scene/"]').text().trim();

  const steam = $('a[href*="store.steampowered.com"]').attr('href')||"";

  const genres = [];
  $('div.text-gray-600:contains("Genre")')
     .next()
     .find('a')
     .each((_,a)=>genres.push($(a).text().trim()));

  return {
    src:'Anker',
    title: h1,
    subtitle: sub,
    poster,
    desc,
    version,
    size,
    year,
    publisher: pubText,
    releaseGroup,
    genres,
    steam,
    href:url
  };
}


function scrapeAnker(html, base) {
  const $ = cheerio.load(html);
  const items = [];

  $('div.relative.group.cursor-pointer').each((_, el) => {
    const $el = $(el);

    // POSTER priamo v tom tile
    const img =
      $el.find('picture img[alt$="poster"]').attr('src') ||
      $el.find('picture img').attr('data-src') ||
      $el.find('picture source').attr('data-srcset') ||
      '';

    const $a = $el.find('a[aria-label]').first();
    const href = new URL($a.attr('href') || '', base).toString();

    let rawTitle = ($a.attr('aria-label') || '')
        .replace(' - View details','')
        .trim();

    const genre = $el.find('span[title]').last().text().trim();

    const size = $el.find('span[title$="GB"]').attr('title') || '';

    if (rawTitle) {
      items.push({
        src:'Anker',
        title: rawTitle,
        href,
        img,
        tags: [genre,size].filter(Boolean)
      });
    }
  });

  return items;
}


// B = game3rb.com
function parseGame3rb(html,base){
  const $ = cheerio.load(html);
  const list=[];
  $('article.post-hentry').each((_,el)=>{
    const $el = $(el);
    const $a = $el.find('h3.g1-gamma.g1-gamma-1st.entry-title a').first();
    const title = $a.text().trim();
    const href  = new URL($a.attr('href'),base).toString();
    const img   = $el.find('img.entry-image').attr('src')||'';

    list.push({
      src: 'Game3RB',
      title,
      href,
      img
    });
  });
  return list;
}

async function scrapeDetail3rb(url){
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const poster = $('img.entry-image').attr('src')||"";
  const h1 = $('h3.entry-title').text().trim() || "";

  const box = $('div.summaryy').text();

  const size = /Size:\s*(.+)/i.exec(box)?.[1]?.trim()||"";
  const genre = /Genre:\s*(.+)/i.exec(box)?.[1]?.trim()?.split(',').map(s=>s.trim())||[];

  const dev = /Developer:\s*(.+)/i.exec(box)?.[1]?.trim()||"";
  const pub = /Publisher:\s*(.+)/i.exec(box)?.[1]?.trim()||"";
  const d_release = /Release Date:\s*(.+)/i.exec(box)?.[1]?.trim()||"";
  const reviews = /ALL REVIEWS:\s*(.+)/i.exec(box)?.[1]?.trim()||"";

  return {
    src:'Game3RB',
    title:h1,
    poster,
    size,
    genre,
    developer:dev,
    publisher:pub,
    releaseDate:d_release,
    reviews,
    href:url
  }
}


// ------------------ main ---------------------

async function scrape(url){
  const html = await fetchHtml(url);
  const host = new URL(url).hostname;
  let out=[];

  if (url.includes('ankergames.net')) {
    const html = await fetchHtml(url);
    const items = scrapeAnker(html, url);
    return {source:url, count:items.length, items};
  }


  // game3rb
  if (host.includes('game3rb.com')){
    out = parseGame3rb(html,url);
    return {source:url,count:out.length,items:out};
  }

  return {error:'unknown domain'};
}

module.exports = { scrape,scrapeDetailAnker };
