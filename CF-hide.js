// CF-hide.js (rýchla verzia + cache + retries + keepalive)
const https = require('https');
const zlib = require('zlib');
const { URL } = require('url');

const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 20, timeout: 60000 });
const CACHE = new Map(); // key -> { ts, ttl, body }

/**
 * Rozbalí gzipped/deflate/br odpoveď
 */
function decompressBuffer(buffer, encoding) {
  return new Promise((resolve, reject) => {
    if (!encoding || encoding.includes('identity')) return resolve(buffer.toString('utf8'));
    if (encoding.includes('gzip')) return zlib.gunzip(buffer, (e, r) => e ? reject(e) : resolve(r.toString('utf8')));
    if (encoding.includes('deflate')) return zlib.inflate(buffer, (e, r) => e ? reject(e) : resolve(r.toString('utf8')));
    if (encoding.includes('br')) return zlib.brotliDecompress(buffer, (e, r) => e ? reject(e) : resolve(r.toString('utf8')));
    resolve(buffer.toString('utf8'));
  });
}

/**
 * rýchly fetch s retry, keepAlive, gzip a jednoduchou cache
 * options: { timeout, retries, cacheTTL, userAgent }
 */
async function fetchWithCFBypass(rawUrl, options = {}) {
  const {
    timeout = 12000,
    retries = 2,
    cacheTTL = 1000 * 60 * 5, // 5 min
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  } = options;

  const url = new URL(rawUrl);
  const cacheKey = rawUrl;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (cached && (now - cached.ts) < cached.ttl) {
    return cached.body;
  }

  let attempt = 0;
  const doReq = () => new Promise((resolve, reject) => {
    attempt++;
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + (url.search || ''),
      method: 'GET',
      agent: keepAliveAgent,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout
    }, async (res) => {
      try {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', async () => {
          const buffer = Buffer.concat(chunks);
          let html = '';
          try {
            html = await decompressBuffer(buffer, res.headers['content-encoding'] || '');
          } catch (deErr) {
            // fallback to raw text
            html = buffer.toString('utf8');
          }

          // jednoduchá detekcia CF challenge
          if (html.includes('Just a moment') || html.includes('Checking your browser') || /cf-browser-verification/i.test(html)) {
            // vrátime prázdny string, ale medzitým logujeme
            console.warn(`[CF-hide] Challenge detected for ${rawUrl}`);
            return resolve('');
          }

          // uloz do cache
          CACHE.set(cacheKey, { ts: Date.now(), ttl: cacheTTL, body: html });
          resolve(html);
        });
      } catch (err) {
        reject(err);
      }
    });

    req.on('timeout', () => {
      req.destroy(new Error('Timeout'));
    });
    req.on('error', (err) => {
      reject(err);
    });
    req.end();
  });

  while (attempt <= retries) {
    try {
      const r = await doReq();
      return r;
    } catch (err) {
      // backoff pred retry
      if (attempt > retries) {
        throw err;
      }
      const backoff = 200 * Math.pow(2, attempt); // 200ms, 400ms, 800ms...
      await new Promise(res => setTimeout(res, backoff));
    }
  }
  return '';
}

function needsCFBypass(hostname) {
  const cfSites = ['repack-games.com', 'www.repack-games.com'];
  return cfSites.some(s => hostname.includes(s));
}

module.exports = { fetchWithCFBypass, needsCFBypass, CACHE };
