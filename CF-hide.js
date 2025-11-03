/**
 * CF-hide.js
 * Univerzálny modul na obchádzanie Cloudflare ochrany
 * Kompatibilný s hocijakou stránkou
 */

const puppeteer = require('puppeteer');

/**
 * Fetchne obsah stránky s obídením Cloudflare
 * @param {string} url - URL stránky na scrape
 * @param {object} options - Voliteľné nastavenia
 * @returns {Promise<string>} HTML obsah stránky
 */
async function fetchWithCFBypass(url, options = {}) {
  const {
    timeout = 30000,
    waitForSelector = null,
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    headless = true,
    extraWaitTime = 2000
  } = options;

  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: headless ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security'
      ]
    });

    const page = await browser.newPage();

    // Nastavenie user agenta
    await page.setUserAgent(userAgent);

    // Skrytie automatizácie
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false
      });

      // Pridanie chrome objekt
      window.chrome = {
        runtime: {}
      };

      // Úprava permissions API
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    // Nastavenie viewportu
    await page.setViewport({ width: 1920, height: 1080 });

    // Extra HTTP headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });

    console.log(`[CF-hide] Načítavam: ${url}`);

    // Navigácia na stránku
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout
    });

    // Čakanie na Cloudflare check
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout });
    } else {
      // Generické čakanie pre CF check
      await page.waitForTimeout(extraWaitTime);
    }

    // Kontrola či CF challenge prebehol
    const title = await page.title();
    if (title.includes('Just a moment') || title.includes('Attention Required')) {
      console.log('[CF-hide] Čakám na CF challenge...');
      await page.waitForTimeout(5000);
    }

    // Získanie HTML obsahu
    const html = await page.content();

    console.log(`[CF-hide] Úspešne získané (${html.length} znakov)`);

    return html;

  } catch (error) {
    console.error('[CF-hide] Chyba:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Pomocná funkcia na detekciu či stránka potrebuje CF bypass
 * @param {string} hostname - Hostname stránky
 * @returns {boolean}
 */
function needsCFBypass(hostname) {
  const cfProtectedSites = [
    'repack-games.com',
    'www.repack-games.com'
    // Pridaj ďalšie stránky podľa potreby
  ];

  return cfProtectedSites.some(site => hostname.includes(site));
}

module.exports = {
  fetchWithCFBypass,
  needsCFBypass
};
