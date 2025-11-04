const https = require('https');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { URL } = require('url');
const iconv = require('iconv-lite');

const torAgent = new SocksProxyAgent('socks5h://127.0.0.1:9050');

function fetchHtmlTor(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      agent: torAgent
    };

    https.get(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', async () => {
        const buf = Buffer.concat(chunks);

        let html;
        if (u.hostname.includes('online-fix') || u.hostname.includes('fix.me') || u.hostname.includes('me')) {
          html = iconv.decode(buf, 'win1251');
        } else {
          html = buf.toString('utf8');
        }

        // ---- fetch current IP for debug ----
        if (!url.includes('api.ipify.org')) {
          try {
            const ip = await getTorIP();
            console.log(`[TOR IP] ${ip}`);
          } catch (e) {
            console.warn('[TOR IP] Failed to fetch IP');
          }
        }

        resolve(html);
      });
    }).on('error', reject);
  });
}

// helper to get Tor IP without recursion
function getTorIP() {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.ipify.org',
      path: '/?format=json',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      agent: torAgent
    };

    https.get(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.ip);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

module.exports = { fetchHtmlTor };
