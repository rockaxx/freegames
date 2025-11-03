/**
 * CF-hide.js
 * Rýchla verzia bez Puppeteer – používa len HTTPS požiadavky s bežnými hlavičkami
 */

const https = require("https");
const { URL } = require("url");

/**
 * Fetchne obsah stránky (s pseudo "CF bypass" – vyzerá ako reálny browser)
 * @param {string} url - URL stránky
 * @param {object} options
 * @returns {Promise<string>} HTML obsah stránky
 */
async function fetchWithCFBypass(url, options = {}) {
  const {
    timeout = 20000,
    userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  } = options;

  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + (u.search || ""),
          method: "GET",
          headers: {
            "User-Agent": userAgent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
          },
          timeout,
        },
        (res) => {
          let html = "";
          res.on("data", (chunk) => (html += chunk));
          res.on("end", () => {
            // Ak Cloudflare vráti challenge
            if (html.includes("Just a moment") || html.includes("Checking your browser")) {
              console.warn("[CF-hide] Cloudflare challenge – stránka je blokovaná.");
              return resolve("");
            }
            resolve(html);
          });
        }
      );

      req.on("error", (err) => reject(err));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout"));
      });
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Detekcia či treba bypass
 */
function needsCFBypass(hostname) {
  const cfSites = ["repack-games.com", "www.repack-games.com"];
  return cfSites.some((s) => hostname.includes(s));
}

module.exports = { fetchWithCFBypass, needsCFBypass };
