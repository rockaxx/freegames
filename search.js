// search.js
const cheerio = require("cheerio");
const https = require("node:https");
const { scrapeDetailAnker } = require('./scrape');

function fetchHtml(url){
  return new Promise((resolve,reject)=>{
    https.get(url,{headers:{'User-Agent':'Mozilla/5.0'}},res=>{
      let d='';
      res.on('data',c=>d+=c);
      res.on('end',()=>resolve(d));
    }).on('error',reject);
  });
}


// ---------------- ANKER SEARCH ----------------
async function scrapeAnkerSearch(q){
  const url = `https://ankergames.net/search/${encodeURIComponent(q)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const games = [];

  $('a[aria-label]').each((_,a)=>{
    const $a = $(a);
    const raw = ($a.attr('aria-label')||"").replace(" - View details","").trim();
    if(!raw) return;

    let href = $a.attr('href')||"";
    if(!href.includes("/game/")) return;

    href = href.startsWith("http")?href:("https://ankergames.net"+href);
    games.push({title:raw, href});
  });

    const out=[];

    for(const g of games){
    const d = await scrapeDetailAnker(g.href);
    out.push(d);
    }

    return out;

}

// ---------------- GAME3RB SEARCH ----------------
async function scrapeGame3rbSearch(q){
  const url = `https://game3rb.com/?s=${encodeURIComponent(q)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const out=[];

  $('article.post-hentry').each((_,el)=>{
    const $el = $(el);
    const $a = $el.find("h3.g1-gamma.g1-gamma-1st.entry-title a").first();
    const title = $a.text().trim();
    const href  = $a.attr('href');
    const img   = $el.find("img.entry-image").attr("src") || "";

    if(!title || !href) return;

    out.push({
      title,
      href,
      img,
      desc:"",
      src:'GAME3RB'
    });
  });

  return out;
}

// EXPORT
module.exports = { scrapeAnkerSearch, scrapeGame3rbSearch };
