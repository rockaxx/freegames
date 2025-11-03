const puppeteer = require("puppeteer");

async function scrapeAnkerPage(url){
  const browser = await puppeteer.launch({
    headless:false,
    args:[
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  const page = await browser.newPage();
  await page.goto(url,{waitUntil:"networkidle2"});

  const html = await page.content();
  await browser.close();

  return scrapeAnker(html, url);
}
