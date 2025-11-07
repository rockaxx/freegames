
// ----- HELPERS -----
const DEFAULT_SOURCE = '/api/all'; // URL listingu, čo chceš scrapovať
const API_ENDPOINT = '';            // náš serverový endpoint

// --- progressive search state ---
let currentES = null;
let activeSrcFilter = 'ALL';
let onlineFixVersions = [];     // filled when OnlineFix cards arrive
const loadedKeys = new Set();   // dedupe (href|src or title|src)
// ===== FAVOURITES (localStorage) =====
const FAV_KEY = 'kda_favs_v1';
// ---- OF index persist (for Library page) ----
const OF_LS_KEY = 'kda_ofindex_v1';

// ---- STREAM MANAGEMENT (single active) ----
let activeES = null;
let currentSID = 0;

function closeStream() {
  if (activeES) {
    activeES.close();
    activeES = null;
  }
}

function openSSE(url, { onItem, onItems, onDone } = {}) {
  closeStream();
  const sid = ++currentSID;
  const withSid = url + (url.includes('?') ? '&' : '?') + 'sid=' + sid;

  const es = new EventSource(withSid);
  activeES = es;

  es.addEventListener('item', ev => {
    if (sid !== currentSID) return; // ignore stale events
    try {
      const payload = JSON.parse(ev.data);
      if (payload && payload.item && onItem) onItem(payload.item);
    } catch (_) {}
  });

  es.addEventListener('items', ev => {
    if (sid !== currentSID) return;
    try {
      const payload = JSON.parse(ev.data);
      if (payload && payload.items && onItems) onItems(payload.items, payload.source);
    } catch (_) {}
  });

  es.addEventListener('done', _ => {
    if (sid !== currentSID) return;
    if (onDone) onDone();
    closeStream();
  });

  es.addEventListener('error', _ => {
    // network/server closed; just stop this stream
    if (sid === currentSID) closeStream();
  });

  return es;
}


function saveOFIndexLS() {
  const byVersion = {};
  for (const [sv, v] of OFVersionIndex.entries()) {
    byVersion[sv] = {
      url: v.url || '',
      full: v.full || '',
      title: v.title || '',
      item: v.item ? {
        src: 'OnlineFix',
        title: v.item.title || '',
        href: v.item.href || v.url || '',
        poster: v.item.poster || '',
        img: v.item.poster || '',
        version: v.item.version || v.full || ''
      } : null
    };
  }

  const byBuild = {};
  for (const [b, v] of OFBuildIndex.entries()) {
    byBuild[b] = {
      url: v.url || '',
      full: v.full || '',
      title: v.title || '',
      item: v.item ? {
        src: 'OnlineFix',
        title: v.item.title || '',
        href: v.item.href || v.url || '',
        poster: v.item.poster || '',
        img: v.item.poster || '',
        version: v.item.version || v.full || '',
        build: v.item.build || ''
      } : null
    };
  }

  localStorage.setItem(OF_LS_KEY, JSON.stringify({ byVersion, byBuild }));
}


function seedOFIndexFromLS() {
  try {
    const raw = JSON.parse(localStorage.getItem(OF_LS_KEY) || '{}');

    // Backward compat (old structure)
    if (raw && !raw.byVersion && typeof raw === 'object') {
      for (const [sv, meta] of Object.entries(raw)) {
        OFVersionIndex.set(sv.toLowerCase(), {
          url: meta.url || '',
          full: meta.full || '',
          title: meta.title || '',
          item: meta.item || null
        });
      }
      return;
    }

    // New structure
    OFVersionIndex.clear();
    OFBuildIndex.clear();

    if (raw?.byVersion) {
      for (const [sv, meta] of Object.entries(raw.byVersion)) {
        OFVersionIndex.set(sv.toLowerCase(), {
          url: meta.url || '',
          full: meta.full || '',
          title: meta.title || '',
          item: meta.item || null
        });
      }
    }
    if (raw?.byBuild) {
      for (const [b, meta] of Object.entries(raw.byBuild)) {
        OFBuildIndex.set(b, {
          url: meta.url || '',
          full: meta.full || '',
          title: meta.title || '',
          item: meta.item || null
        });
      }
    }
  } catch {}
}
seedOFIndexFromLS();


function fav_load() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
  catch { return []; }
}
function fav_save(list) { localStorage.setItem(FAV_KEY, JSON.stringify(list)); }

function fav_key(it) {
  const href = (it.href || it.link || it.detail || '').toLowerCase();
  const title = (it.title || '').toLowerCase();
  const src = (it.src || '').toLowerCase();
  // Prefer unique href, else fallback title|src
  return href || `${title}|${src}`;
}

function fav_is(it) {
  const key = fav_key(it);
  return fav_load().some(x => fav_key(x) === key);
}

// Detect session once (cache)
let __me = null;
async function fetchSession() {
  if (__me !== null) return __me;
  try {
    const r = await fetch('/api/me');
    __me = await r.json();
  } catch { __me = { ok:false }; }
  return __me;
}

async function fav_add(itRaw) {
  const it = sanitizeGameForFav(itRaw);
  const me = await fetchSession();
  if (me.ok) {
    await fetch('/api/library/add', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ item: it })
    });
  } else {
    const list = fav_load();
    const key = fav_key(it);
    if (!list.some(x => fav_key(x) === key)) {
      list.push(it); fav_save(list);
    }
  }
}

async function fav_remove(it) {
  const key = fav_key(it);
  const me = await fetchSession();
  if (me.ok) {
    await fetch('/api/library/' + encodeURIComponent(key), { method: 'DELETE' });
  } else {
    const list = fav_load().filter(x => fav_key(x) !== key);
    fav_save(list);
  }
}
(async function syncLocalFavsOnce(){
  const me = await fetchSession();
  if (!me.ok) return;
  try {
    const local = fav_load();
    if (local && local.length) {
      await fetch('/api/library/import', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ items: local })
      });
      // keep LS as cache; alebo vyčisti: fav_save([]);
    }
  } catch {}
})();

function sanitizeGameForFav(g) {
  // ensure we keep original image (avoid nested /api/img)
  const img = (g.img && g.img.startsWith('/api/img')) ? g.img : (g.poster || g.img || '');

  // try find OF match now, so we persist overlay meta with the favourite
  const of = findOFForGame(g);

  return {
    src: g.src || '',
    title: g.title || '',
    href: g.href || g.link || g.detail || '',
    poster: img,
    img: img,
    tags: Array.isArray(g.tags) ? g.tags : (Array.isArray(g.genres) ? g.genres : []),
    size: g.size || '',
    year: g.year || '',
    version: g.version || '',
    build: g.build || '',
    releaseGroup: g.releaseGroup || '',
    developer: g.developer || '',
    publisher: g.publisher || '',
    releaseDate: g.releaseDate || '',
    reviews: g.reviews || '',
    uploaded: g.uploaded || '',
    desc: g.desc || '',
    about: g.about || '',
    screenshots: Array.isArray(g.screenshots) ? g.screenshots.slice(0, 12) : [],
    trailer: g.trailer || '',
    downloadLinks: Array.isArray(g.downloadLinks) ? g.downloadLinks : [],
    steam: g.steam || '',

    // persist OF meta for Library overlay
    of: of ? {
      short: of.short || '',
      full: of.full || '',
      url: of.url || '',
      item: of.item ? {
        src: 'OnlineFix',
        title: of.item.title || '',
        href: of.item.href || of.url || '',
        poster: of.item.poster || '',
        img: of.item.poster || '',
        version: of.item.version || of.full || '',
        build: of.item.build || of.full || ''

      } : null
    } : null
  };
}

// ===== CONTEXT MENU =====
let __ctxMenuEl = null;

function ctx_destroy() {
  if (__ctxMenuEl) { __ctxMenuEl.remove(); __ctxMenuEl = null; }
}

function ctx_create(x, y, items = []) {
  ctx_destroy();
  const box = document.createElement('div');
  box.className = 'ctx-menu';

  items.forEach((it, idx) => {
    if (it === 'sep') {
      const sep = document.createElement('div'); sep.className = 'ctx-sep'; box.appendChild(sep);
      return;
    }
    const a = document.createElement('div');
    a.className = 'ctx-item';
    a.textContent = it.label;
    a.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx_destroy();
      it.action?.();
    });
    box.appendChild(a);
  });

  // position
  const vw = window.innerWidth, vh = window.innerHeight;
  const rect = { w: 220, h: 160 };
  let left = x, top = y;
  if (left + rect.w > vw) left = vw - rect.w - 8;
  if (top + rect.h > vh) top = vh - rect.h - 8;
  box.style.left = left + 'px';
  box.style.top  = top  + 'px';

  document.body.appendChild(box);
  __ctxMenuEl = box;
}

// Hide on click elsewhere / ESC
document.addEventListener('click', () => ctx_destroy());
document.addEventListener('contextmenu', e => {
  // let browser menu work if not our card menu (we handle per-card)
  if (__ctxMenuEl && !__ctxMenuEl.contains(e.target)) ctx_destroy();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ctx_destroy(); });

// Build per-card context menu
function showCardMenu(ev, game) {
  ev.preventDefault();
  ev.stopPropagation();

  const isFav = fav_is(game);
  const menu = [];
  menu.push({
    label: isFav ? 'Remove from favourites' : 'Add to favourites',
    action: () => isFav ? fav_remove(game) : fav_add(game)
  });
  menu.push('sep');
  menu.push({
    label: 'Open details',
    action: () => openModal(game)
  });
  if (game.href) {
    menu.push({
      label: 'Open source in new tab',
      action: () => window.open(game.href, '_blank', 'noopener')
    });
  }
  ctx_create(ev.clientX, ev.clientY, menu);
}

function shortVersion(v) {
  // pick first up to 3 numeric segments, e.g. "0.37.5" from "0.37.5.0.18733"
  const m = (v || '').match(/\d+(?:\.\d+){0,5}/);
  if (!m) return '';
  return m[0].split('.').slice(0, 3).join('.');
}
// Separate indices for fast lookup
let OFVersionIndex = new Map(); // "0.37.5" -> meta
let OFBuildIndex   = new Map(); // "18733"  -> meta

let loadedGames = [];

// === SORT FUNCTIONALITY ===
function sortGames(games, sortType) {
  const gamesCopy = [...games];
  
  switch(sortType) {
    case 'name-asc':
      return gamesCopy.sort((a, b) => a.title.localeCompare(b.title, 'sk'));
    case 'name-desc':
      return gamesCopy.sort((a, b) => b.title.localeCompare(a.title, 'sk'));
    case 'source-asc':
      return gamesCopy.sort((a, b) => (a.src || '').localeCompare(b.src || '', 'sk'));
    case 'source-desc':
      return gamesCopy.sort((a, b) => (b.src || '').localeCompare(a.src || '', 'sk'));
    default:
      return gamesCopy;
  }
}

function applySortToCards() {
  const sortType = document.getElementById('sortSelect')?.value || 'default';
  if (sortType === 'default') return;

  const grid = document.getElementById('cardGrid');
  const cards = Array.from(grid.querySelectorAll('.card:not(.skeleton)'));
  
  if (cards.length === 0) return;

  // Extract data from DOM cards
  const cardsWithData = cards.map(card => ({
    element: card,
    title: card.querySelector('.card__title')?.textContent || '',
    src: card.querySelector('.card__meta span:first-child')?.textContent || ''
  }));

  // Sort based on selected type
  let sorted;
  switch(sortType) {
    case 'name-asc':
      sorted = cardsWithData.sort((a, b) => a.title.localeCompare(b.title, 'sk'));
      break;
    case 'name-desc':
      sorted = cardsWithData.sort((a, b) => b.title.localeCompare(a.title, 'sk'));
      break;
    case 'source-asc':
      sorted = cardsWithData.sort((a, b) => a.src.localeCompare(b.src, 'sk'));
      break;
    case 'source-desc':
      sorted = cardsWithData.sort((a, b) => b.src.localeCompare(a.src, 'sk'));
      break;
    default:
      sorted = cardsWithData;
  }

  // Remove all cards and re-append in sorted order
  cards.forEach(card => card.remove());
  sorted.forEach(item => grid.appendChild(item.element));
}

function resetOFState() {
  OFVersionIndex.clear();
  OFBuildIndex.clear();
  loadedGames = [];
}


function shortVersionStr(v) {
  if (!v) return '';
  const m = String(v).match(/[0-9]+(?:\.[0-9]+){0,5}/);
  if (!m) return '';
  return m[0].split('.').slice(0, 3).join('.'); // e.g. 0.37.5
}

function normalizeBuild(b) {
  if (!b) return '';
  const m = String(b).match(/\b(\d{3,})\b/); // 3+ digits to avoid junk
  return m ? m[1] : '';
}

// Try to find a build number inside arbitrary text/title
function extractBuildFromText(t) {
  if (!t) return '';
  const m =
    /\bbuild[:\s-]*([0-9]{3,})\b/i.exec(t) || // "Build: 18733" / "Build 18733"
    /\((?:build|b)\s*([0-9]{3,})\)/i.exec(t)  || // "(Build 18733)" / "(b 18733)"
    /\b([0-9]{5,})\b/.exec(t); // last-chance for big integers like 6821040
  return m ? m[1] : '';
}

function findOFForGame(game) {
  if (!game) return null;
  // Never overlay on OF cards directly
  if ((game.src || '').toLowerCase() === 'onlinefix') return null;

  // 1) Try version on the game
  const sv = shortVersionStr(game.version);
  if (sv) {
    const metaV = OFVersionIndex.get(sv.toLowerCase());
    if (metaV) return { short: sv.toLowerCase(), ...metaV };
  }

  // 2) Try build from explicit field
  let gb = normalizeBuild(game.build);
  if (gb) {
    const metaB = OFBuildIndex.get(gb);
    if (metaB) return { short: gb, ...metaB };
  }

  // 3) Try build from title
  gb = extractBuildFromText(game.title);
  if (gb) {
    const metaB = OFBuildIndex.get(gb);
    if (metaB) return { short: gb, ...metaB };
  }

  // 4) Fallback: version present inside title (legacy)
  const tl = (game.title || '').toLowerCase();
  for (const [key, meta] of OFVersionIndex) {
    if (key && tl.includes(key)) return { short: key, ...meta };
  }

  return null;
}



function registerOF(item) {
  if (!item || item.src !== 'OnlineFix') return;

  const url = item.href || item.link || item.detail || item.url || '';
  if (!url) return;

  const sv = shortVersionStr(item.version);
  let build = normalizeBuild(item.build);
  if (!build) {
    // try to pick build from version/title if scraper stuffed it there
    build = normalizeBuild(item.version) || normalizeBuild(item.title);
  }

  const meta = {
    url,
    full: item.version || '',
    title: item.title || '',
    item
  };

  // Index by version short (if present)
  if (sv) OFVersionIndex.set(sv.toLowerCase(), meta);

  // Index by build number (if present)
  if (build) OFBuildIndex.set(build, meta);

  // Re-tag existing cards after each new registration
  retagExistingCardsWithOF();
  // Persist cache
  saveOFIndexLS();
}

function matchOFForTitle(title) {
  if (!title) return null;
  const tl = title.toLowerCase();
  for (const [sv, meta] of OFIndex) {
    if (sv && tl.includes(sv)) return { short: sv, ...meta };
  }
  return null;
}

function createOFOverlay(ofMeta, preferImg) {
  const btn = document.createElement('button');
  btn.className = 'of-overlay';
  btn.title = ofMeta.full ? `Online-Fix ${ofMeta.full}` : 'Online-Fix';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ofMeta.item) {
      const cardImg = preferImg || ofMeta.item?.img || ofMeta.item?.poster || '';
      // otvor modal s OF detailom, ale s artom z tejto karty
      openModal({
        ...ofMeta.item,
        src: 'OnlineFix',
        img: cardImg,
        poster: cardImg
      });
    } else if (ofMeta.url) {
      window.open(ofMeta.url, '_blank', 'noopener');
    }
  });

  return btn;
}


function retagExistingCardsWithOF() {
  const cards = document.querySelectorAll('#cardGrid .card');
  cards.forEach(card => {
    const thumb = card.querySelector('.card__thumb');
    if (!thumb) return;
    if (thumb.querySelector('.of-overlay')) return; // already tagged

    const src = (card.getAttribute('data-src') || '').toLowerCase();
    if (src === 'onlinefix') return; // never tag OF itself

    const dv = (card.getAttribute('data-version') || '').toLowerCase();
    const db = (card.getAttribute('data-build') || '');

    let meta = null;

    // Prefer build index when present
    if (db) meta = OFBuildIndex.get(db);

    // Then version index
    if (!meta && dv) meta = OFVersionIndex.get(dv);

    // Fallback: title scan for build, then version
    if (!meta) {
      const title = card.querySelector('.card__title')?.textContent || '';
      const gb = extractBuildFromText(title);
      if (gb) meta = OFBuildIndex.get(gb);
      if (!meta) {
        const tl = title.toLowerCase();
        for (const [key, m] of OFVersionIndex) {
          if (key && tl.includes(key)) { meta = m; break; }
        }
      }
    }

    if (meta) {
      let preferImg = '';
      const bg = thumb.style.backgroundImage;
      if (bg) {
        const m = bg.match(/url\(["']?(.*?)["']?\)/i);
        if (m) preferImg = m[1];
      }
      const shortKey = db || dv || '';
      thumb.appendChild(createOFOverlay({ short: shortKey, ...meta }, preferImg));
      console.log('[OFX][retag]', shortKey || 'title', '→', (card.querySelector('.card__title')?.textContent || '').trim());
    }
  });
}

function normalizeImg(src) {
  if (!src) return '';
  let s = String(src);
  const apiPrefix = '/api/img?url=';

  try {
    while (s.startsWith(apiPrefix)) {
      const q = s.slice(apiPrefix.length);
      const decoded = decodeURIComponent(q);
      if (decoded.startsWith(apiPrefix)) { s = decoded; continue; }
      s = decoded;
      break;
    }
  } catch {}

  if (s.startsWith('data:') || (s.startsWith('/') && !s.startsWith('/http'))) return s;
  if (/^https?:\/\//i.test(s)) return `${apiPrefix}${encodeURIComponent(s)}`;
  return `${apiPrefix}${encodeURIComponent(s)}`;
}


// Create N skeleton cards (shimmer placeholders)
function showSkeletons(n = 100) {
  const grid = document.getElementById('cardGrid');
  grid.innerHTML = '';
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const card = el('article', { class: 'card skeleton' }, [
      el('div', { class: 'card__thumb skeleton' }),
      el('div', { class: 'card__body' }, [
        el('h3', { class: 'card__title skeleton-line' }, ' '),
        el('div', { class: 'card__meta' }, [
          el('span', { class: 'skeleton-pill' }, ' '),
          el('span', { class: 'skeleton-pill' }, ' ')
        ])
      ])
    ]);
    nodes.push(card);
  }
  nodes.forEach(n => grid.append(n));
}

function hideSkeletons() {
  const grid = document.getElementById('cardGrid');
  const skels = grid.querySelectorAll('.card.skeleton');
  skels.forEach(s => s.remove());
}
document.getElementById('srcFilter').addEventListener('click', e => {

  const btn = e.target.closest('button');
  if (!btn) return;

  activeSrcFilter = btn.dataset.src;

  // highlight active
  document.querySelectorAll('#srcFilter button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');

  // HIDE/SHOW existujúcich kariet
  const cards = document.querySelectorAll('#cardGrid .card:not(.skeleton)');
  cards.forEach(card => {
    const src = card.querySelector('.card__meta span')?.textContent.trim();
    card.style.display = (activeSrcFilter === 'ALL' || src === activeSrcFilter) ? '' : 'none';
  });
});


function appendCards(list = []) {
  const grid = document.getElementById('cardGrid');
  const sortType = document.getElementById('sortSelect')?.value || 'default';

  list.forEach(g => {

    if (!g.img && g.poster) g.img = g.poster;
    g.img = normalizeImg(g.img);

    let badgeClass = (!g.tags || !g.tags.length) ? 'badge--warn' : 'badge--good';
    const tag0 = g.tags && g.tags.length ? g.tags[0] : 'Not Categorized';

    const sv = shortVersionStr(g.version);
    const gb = normalizeBuild(g.build) || extractBuildFromText(g.version) || extractBuildFromText(g.title);

    const of = findOFForGame(g);
    const overlay = of ? createOFOverlay(of, g.img) : null;

    const thumb = el('div', {
      class: 'card__thumb',
      style: g.img ? `background-image:url('${g.img}')` : ''
    }, overlay ? [overlay] : []);

    const card = el('article', {
      class: 'card',
      'data-version': sv || '',
      'data-build': gb || '',
      'data-src': g.src || '',
      onclick: () => openModal(g),
      oncontextmenu: (e) => showCardMenu(e, g)
    }, [
      thumb,
      el('div', { class: 'card__body' }, [
        el('h3', { class: 'card__title' }, g.title),
        el('div', { class: 'card__meta' }, [
          el('span', {}, g.src || ''),
          el('span', { class: 'badge ' + badgeClass }, (tag0 || 'Not Categorized').substring(0, 16))
        ])
      ])
    ]);

    const sk = grid.querySelector('.card.skeleton');
    if (sk) sk.replaceWith(card);
    else grid.append(card);

    loadedGames.push(g);
  });

  // Apply sort if not default
  if (sortType !== 'default') {
    applySortToCards();
  }
}



// --- DEMO fallback dataset (pôvodné) ---
let games = [
  { id: 1, title: "Aknosom Hunt", tags: ["Action","RPG"], rating: "Veľmi kladné", price: "19,99 €" },
  { id: 2, title: "Nebula Raider", tags: ["Adventure","Indie"], rating: "Kladné", price: "14,99 €" },
  { id: 3, title: "MetroVoid 2077", tags: ["Action","Singleplayer"], rating: "Zmiešané", price: "29,99 €" },
  { id: 4, title: "Backrooms Escape", tags: ["Horror","Co-op"], rating: "Veľmi kladné", price: "9,99 €" },
  { id: 5, title: "Thread Mesh Tactics", tags: ["Strategy","Tech"], rating: "Veľmi kladné", price: "24,99 €" },
  { id: 6, title: "DarkOrbit Redux", tags: ["Space","MMO"], rating: "Kladné", price: "Free" },
];


// --- UI helpery (tvoje) ---
function el(tag, attrs={}, children=[]) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if(k === 'class') node.className = v;
    else if(k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  children = Array.isArray(children) ? children : [children];
  children.forEach(c => node.append(c));
  return node;
}


function renderCards(list = games) {
  const grid = document.getElementById('cardGrid');
  grid.innerHTML = '';

  list.forEach(g => {
    if (!g.img && g.poster) g.img = g.poster;
    g.img = normalizeImg(g.img);

    let badgeClass = 'badge--good';
    if (g.src === 'Anker') badgeClass = 'badge--good';
    else if (g.src === 'Game3RB') badgeClass = 'badge--warn';
    else if (g.src === 'RepackGames') badgeClass = 'badge--neutral';

    // Online-Fix match for this card title
    const of = matchOFForTitle(g.title);
    const overlay = of
      ? el('a', {
          class: 'of-overlay',
          href: of.url,
          target: '_blank',
          rel: 'noopener',
          title: `Open Online-Fix detail (version ${of.full})`,
          onclick: (e) => e.stopPropagation()
        }, '+')
      : null;

    const thumb = el('div', {
      class: 'card__thumb',
      style: g.img ? `background-image:url('${g.img}')` : ''
    }, overlay ? [overlay] : []);

    const card = el('article', { class: 'card', onclick: () => openModal(g), oncontextmenu: (e) => showCardMenu(e, g) }, [
      thumb,
      el('div', { class: 'card__body' }, [
        el('h3', { class: 'card__title' }, g.title),
        el('div', { class: 'card__meta' }, [
          el('span', {}, g.src || ''),
          el('span', { class: 'badge ' + badgeClass }, (g.tags?.[0] == "Simulati" ? "Simulation" : (g.tags?.[0] == "Cyberpun" ? "Cyberpunk" : g.tags?.[0]) || 'Not Categorized').substring(0, 16))
        ])
      ])
    ]);

    grid.append(card);
  });
}



function openModal(game) {
  if (!game.img && game.poster) game.img = game.poster;
  if (!game.tags && game.genres) game.tags = game.genres;

  const modal = document.getElementById('gameModal');
  const body = document.getElementById('modalBody');
  body.innerHTML = '';

  // --- COVER ---
  const coverUrl = normalizeImg(game.img);
  const cover = el('div', {
    class: 'modal__cover',
    style: coverUrl
      ? `background-image:url('${coverUrl}');background-size:cover;background-position:center;`
      : ''
  });
  // --- INFO BLOCK ---
  const info = [];

  info.push(el('h2', { class: 'modal__title' }, game.title || '???'));
  if (game.subtitle) info.push(el('p', { class: 'modal__subtitle' }, game.subtitle));
  if (game.tags?.length) info.push(el('p', { class: 'modal__tags' }, game.tags.join(', ')));

  const fields = [
    ['Size', game.size],
    ['Year', game.year],
    ['Version', game.version],
    ['Release group', game.releaseGroup],
    ['Developer', game.developer],
    ['Publisher', game.publisher],
    ['Release date', game.releaseDate],
    ['Reviews', game.reviews],
    ['Uploaded', game.uploaded],
  ];
  fields.forEach(([label, val]) => val && info.push(el('p', {}, `${label}: ${val}`)));

  if (game.steam)
    info.push(el('p', {}, el('a', { href: game.steam, target: '_blank', rel: 'noopener' }, 'Steam page')));
  if (game.href)
    info.push(el('p', {}, el('a', { href: game.href, target: '_blank', rel: 'noopener' }, 'Open detail')));

  if (game.desc)
    info.push(el('p', { style: 'margin-top:10px;' }, game.desc));
  if (game.about)
    info.push(el('p', { style: 'margin-top:10px;' }, game.about));

  // --- ŠPECIÁLNE LEN PRE Game3RB ---
  if (game.src === 'Game3RB') {
    // screenshoty (max 4)
    if (Array.isArray(game.screenshots) && game.screenshots.length) {
      const shots = game.screenshots.slice(0, 4);
      info.push(
        el('div', { class: 'modal__shots' },
          shots.map(src => el('img', {
            src: normalizeImg(src),
            class: 'modal__shot'
          }))
        )
      );
    }


  // Render trailer only if the source does NOT have its own trailer section.
  const sourceHasOwnTrailer = (game.src === 'RepackGames' || game.src === 'OnlineFix');
  if (!sourceHasOwnTrailer && game.trailer) {
    if (/youtube|youtu\.be/.test(game.trailer)) {
      info.push(el('iframe', {
        class: 'modal__trailer',
        src: game.trailer,
        allowfullscreen: true,
        frameborder: 0
      }));
    } else {
      info.push(el('video', {
        controls: true,
        class: 'modal__trailer',
        src: game.trailer
      }));
    }
  }

  // NEW: render the generic block only for sources WITHOUT their own section
  const hasOwnDownloadSection = (game.src === 'RepackGames' || game.src === 'OnlineFix');
  if (!hasOwnDownloadSection && Array.isArray(game.downloadLinks)) {
    const validLinks = game.downloadLinks.filter(x => x && x.link && typeof x.link === 'string');
    if (validLinks.length) {
      info.push(el('div', { class: 'modal__links' },
        validLinks.map(dl => el('a', {
          href: dl.link,
          target: '_blank',
          rel: 'noopener',
          class: 'modal__download'
        }, dl.label || dl.link))
      ));
    }
  }
}

  // --- ŠPECIÁLNE LEN PRE RepackGames ---
  if (game.src === 'RepackGames') {

    // screenshoty (max 4)
    if (Array.isArray(game.screenshots) && game.screenshots.length) {
      const shots = game.screenshots.slice(0, 4);
      info.push(
        el('div', { class: 'modal__shots' },
          shots.map(src => el('img', {
            src: normalizeImg(src),
            class: 'modal__shot'
          }))
        )
      );
    }


    // Trailer (YouTube embed)
    if (game.trailer && game.trailer.includes('youtube')) {
      info.push(
        el('iframe', {
          class: 'modal__trailer',
          src: game.trailer,
          allowfullscreen: true,
          frameborder: 0
        })
      );
    }

    // Download links
    if (Array.isArray(game.downloadLinks) && game.downloadLinks.length) {
      const links = game.downloadLinks.map(dl =>
        el('a', {
          href: dl.link,
          target: '_blank',
          rel: 'noopener',
          class: 'modal__download'
        }, ("Download from: "+(dl.label || new URL(dl.link).hostname)))
      );
      info.push(el('div', { class: 'modal__links' }, links));
    }
  }
  // --- ŠPECIÁLNE LEN PRE OnlineFix ---
  if (game.src === 'OnlineFix') {
    if (game.version) {
      info.push(el('p', { class: 'modal__version' }, `Version: ${game.version}`));
    }
    if (game.build) {
      info.push(el('p', { class: 'modal__build' }, `Build: ${game.build}`));
    }
    // screenshoty (max 4)
    if (Array.isArray(game.screenshots) && game.screenshots.length) {
      const shots = game.screenshots.slice(0, 4);
      info.push(
        el('div', { class: 'modal__shots' },
          shots.map(src => el('img', {
            src: normalizeImg(src),
            class: 'modal__shot'
          }))
        )
      );
    }
    // trailer
    if (game.trailer) {
      info.push(
        el('iframe', {
          class: 'modal__trailer',
          src: game.trailer,
          allowfullscreen: true,
          frameborder: 0
        })
      );
    }

    // download links
    if (Array.isArray(game.downloadLinks) && game.downloadLinks.length) {
      const links = game.downloadLinks.map(dl =>
        el('a', {
          href: dl.link,
          target: '_blank',
          rel: 'noopener',
          class: 'modal__download'
        }, dl.label || new URL(dl.link).hostname)
      );
      info.push(el('div', { class: 'modal__links' }, links));
    }
  }

  // --- BUTTONS ---
  // const buttons = el('div', { class: 'modal__buttons' }, [
  //   el('button', { class: 'btn btn--primary' }, 'Kúpiť'),
  //   el('button', { class: 'btn btn--ghost' }, 'Do wishlistu')
  // ]);

  body.append(
    cover,
    el('div', { class: 'modal__info' }, info) // buttons deleted
  );
  modal.hidden = false;
}


function attachEvents(){
  document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('gameModal').hidden = true;
  });
  document.getElementById('gameModal').addEventListener('click', (e) => {
    if(e.target.id === 'gameModal') e.currentTarget.hidden = true;
  });
  document.querySelectorAll('.nav__link').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav__link').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

}

const search = document.getElementById('searchInput');
search.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const q = search.value.trim();

  // kill any previous streams immediately
  closeStream();

  if (!q) {
    loadFromScrape(); // fallback to default listing
    return;
  }

  showSkeletons(100);

  openSSE(`/api/search/stream?q=${encodeURIComponent(q)}`, {
    onItem(item) {
      // register OF version (no overlay on OF itself, just index)
      if (item?.src === 'OnlineFix' && (item.version || item.build)) registerOF(item);

      const it = { id: Date.now() + Math.random(), ...item };
      appendCards([it]);
    },

    onItems(itemsPayload) {
      const items = (itemsPayload || []).map((it, idx) => ({ id: idx + 1, ...it }));

      items.forEach(it => {
        if (it.src === 'OnlineFix' && (it.version || it.build)) registerOF(it);
      });

      if (items.length) appendCards(items);
    },

    onDone() {
      hideSkeletons();

      const grid = document.getElementById('cardGrid');
      if (!grid.querySelector('.card:not(.skeleton)')) {
        grid.innerHTML = '<div style="padding:20px;color:var(--muted);">No results.</div>';
      }
    }
  });

});


async function loadFromScrape(){
  closeStream();
  showSkeletons(100);

  openSSE('/api/all/stream', {
    onItem(item) {
      if (item?.src === 'OnlineFix' && (item.version || item.build)) registerOF(item);
      const it = { id: Date.now() + Math.random(), ...item };
      appendCards([it]);
    },
    onItems(itemsPayload) {
      const items = (itemsPayload || []).map((it, idx) => ({ id: idx + 1, ...it }));
      items.forEach(it => {
        if (it.src === 'OnlineFix' && (it.version || it.build)) registerOF(it);
      });
      if (items.length) appendCards(items);
    },
    onDone() {
      hideSkeletons();
    }
  });
}


// === IMAGE PREVIEW (fullscreen zoom + zoom toggle) ===
document.addEventListener('click', e => {
  const img = e.target.closest('.modal__shot');
  if (!img) return;

  // vytvor overlay
  const overlay = document.createElement('div');
  overlay.className = 'image-preview-overlay';

  const big = document.createElement('img');
  big.src = img.src;
  overlay.appendChild(big);
  document.body.appendChild(overlay);

  let zoomed = false;

  // toggle zoom on image click
  big.addEventListener('click', ev => {
    ev.stopPropagation(); // aby sa nezavrelo overlay
    zoomed = !zoomed;
    if (zoomed) {
      big.style.transform = 'scale(1.8)'; // zväčšiť
      big.style.cursor = 'zoom-out';
    } else {
      big.style.transform = 'scale(1)';
      big.style.cursor = 'zoom-in';
    }
  });

  // zatvoriť kliknutím mimo obrázka
  overlay.addEventListener('click', ev => {
    if (ev.target === overlay) overlay.remove();
  });

  // ESC zatváranie
  const onKey = ev => {
    if (ev.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
});


document.addEventListener('DOMContentLoaded', async () => {
  attachEvents();
  
  // Event listener pre sort dropdown
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      applySortToCards();
    });
  }
  
  await loadFromScrape(); 

  const params = new URLSearchParams(window.location.search);
  const initialQuery = (params.get('s') || '').trim();

  if (initialQuery) {
    const input = document.getElementById('searchInput');
    if (input) input.value = initialQuery;

    closeStream();
    showSkeletons(100);

    openSSE(`/api/search/stream?q=${encodeURIComponent(initialQuery)}`, {
      onItem(item) {
        if (item?.src === 'OnlineFix' && (item.version || item.build)) registerOF(item);
        const it = { id: Date.now() + Math.random(), ...item };
        appendCards([it]);
      },
      onItems(itemsPayload) {
        const items = (itemsPayload || []).map((it, idx) => ({ id: idx + 1, ...it }));
        items.forEach(it => {
          if (it.src === 'OnlineFix' && (it.version || it.build)) registerOF(it);
        });
        if (items.length) appendCards(items);
      },
      onDone() {
        hideSkeletons();

        const grid = document.getElementById('cardGrid');
        if (!grid.querySelector('.card:not(.skeleton)')) {
          grid.innerHTML = '<div style="padding:20px;color:var(--muted);">No results.</div>';
        }
      }
    });
  }

});
