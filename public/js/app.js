// --- KONFIG ---
const DEFAULT_SOURCE = '/api/all'; // URL listingu, čo chceš scrapovať
const API_ENDPOINT = '';            // náš serverový endpoint

// --- progressive search state ---
let currentES = null;
let activeSrcFilter = 'ALL';
let onlineFixVersions = [];     // filled when OnlineFix cards arrive
const loadedKeys = new Set();   // dedupe (href|src or title|src)

function shortVersion(v) {
  // pick first up to 3 numeric segments, e.g. "0.37.5" from "0.37.5.0.18733"
  const m = (v || '').match(/\d+(?:\.\d+){0,5}/);
  if (!m) return '';
  return m[0].split('.').slice(0, 3).join('.');
}
let OFIndex = new Map();  // short version -> { url, full, title, item }
let loadedGames = [];

function resetOFState() {
  OFIndex.clear();
  loadedGames = [];
}

function shortVersionStr(v) {
  if (!v) return '';
  const m = String(v).match(/[0-9]+(?:\.[0-9]+)*/);
  if (!m) return '';
  return m[0].split('.').slice(0, 3).join('.'); // napr. 0.37.5
}

function registerOF(item) {
  if (!item || item.src !== 'OnlineFix') return;
  const sv = shortVersionStr(item.version);
  const url = item.href || item.link || item.detail || item.url || '';
  if (!sv || !url) return;
  OFIndex.set(sv.toLowerCase(), {
    url,
    full: item.version,
    title: item.title || '',
    item
  });
  // po každom novom OF zázname dooznač existujúce karty
  retagExistingCardsWithOF();
}

function matchOFForTitle(title) {
  if (!title) return null;
  const tl = title.toLowerCase();
  for (const [sv, meta] of OFIndex) {
    if (sv && tl.includes(sv)) return { short: sv, ...meta };
  }
  return null;
}

function createOFOverlay(ofMeta) {
  const btn = document.createElement('button');
  btn.className = 'of-overlay';
  btn.title = ofMeta.full ? `Online-Fix ${ofMeta.full}` : 'Online-Fix';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ofMeta.item) openModal(ofMeta.item);
    else if (ofMeta.url) window.open(ofMeta.url, '_blank');
  });

  return btn;
}

function retagExistingCardsWithOF() {
  const cards = document.querySelectorAll('#cardGrid .card');
  cards.forEach(card => {
    const title = card.querySelector('.card__title')?.textContent || '';
    const thumb = card.querySelector('.card__thumb');
    if (!thumb || !title) return;
    const of = matchOFForTitle(title);
    if (of && !thumb.querySelector('.of-overlay')) {
      thumb.appendChild(createOFOverlay(of));
      console.log('[OFX][match]', of.short, '->', `"${title}"`);
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

  list.forEach(g => {
    if (!g.img && g.poster) g.img = g.poster;
    g.img = normalizeImg(g.img);

    // source badge class (zjednotené)
    let badgeClass = 'badge--good';
    if (!g.tags || !g.tags.length) badgeClass = 'badge--warn';
    const tag0 = g.tags && g.tags.length ? g.tags[0] : 'Not Categorized';

    // OF match pre názov
    const of = matchOFForTitle(g.title);

    const overlay = of ? createOFOverlay(of) : null;

    const thumb = el('div', {
      class: 'card__thumb',
      style: g.img ? `background-image:url('${g.img}')` : ''
    }, overlay ? [overlay] : []);

    const card = el('article', {
      class: 'card',
      onclick: () => openModal(g)
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

    // swap skeleton or append
    const sk = grid.querySelector('.card.skeleton');
    if (sk) sk.replaceWith(card);
    else grid.append(card);

    // uložiť do pamäti
    loadedGames.push(g);
  });
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

    const card = el('article', { class: 'card', onclick: () => openModal(g) }, [
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
    info.push(el('p', {}, el('a', { href: game.steam, target: '_blank', rel: 'noopener' }, 'Steam stránka')));
  if (game.href)
    info.push(el('p', {}, el('a', { href: game.href, target: '_blank', rel: 'noopener' }, 'Otvoriť detail')));

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
        }, (dl.label || new URL(dl.link).hostname))
      );
      info.push(el('div', { class: 'modal__links' }, links));
    }
  }
  // --- ŠPECIÁLNE LEN PRE OnlineFix ---
  if (game.src === 'OnlineFix') {
    if (game.version) {
      info.push(el('p', { class: 'modal__version' }, `Version: ${game.version}`));
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

  // cancel previous stream if any
  if (currentES) { currentES.close(); currentES = null; }

  if (!q) {
    loadFromScrape(); // fallback to default listing
    return;
  }
  resetOFState();
  showSkeletons(100);

  // Server-Sent Events stream
  const url = `/api/search/stream?q=${encodeURIComponent(q)}`;
  const es = new EventSource(url);
  currentES = es;

  const batches = [];
  es.addEventListener('items', (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      const items = (payload.items || []).map((it, idx) => ({ id: idx + 1, ...it }));
      if (items.length) appendCards(items);
      batches.push({ source: payload.source, count: items.length });
    } catch (_) {}
  });

  // NEW: handle per-item events
  es.addEventListener('item', (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      if (payload && payload.item) {
        if (payload?.item?.src === 'OnlineFix') registerOF(payload.item); 
        const item = { id: Date.now() + Math.random(), ...payload.item };
        appendCards([item]);
      }
    } catch (_) {}
  });

  es.addEventListener('error', (ev) => {
    // network issue or server error — close and keep what we have
    es.close();
  });

  es.addEventListener('done', (ev) => {
    es.close();
    currentES = null;
    hideSkeletons();
    const grid = document.getElementById('cardGrid');
    const onlySk = grid.querySelectorAll('.card').length === grid.querySelectorAll('.card.skeleton').length;
    if (onlySk) {
      grid.innerHTML = '<div style="padding:20px;color:var(--muted);">No results.</div>';
    }
  });
});


async function loadFromScrape(){
  resetOFState();
  showSkeletons(100);

  const es = new EventSource('/api/all/stream');

  es.addEventListener('item',ev=>{
    const payload = JSON.parse(ev.data);
    if (payload?.item?.src === 'OnlineFix') registerOF(payload.item);
    const item = { id: Date.now()+Math.random(), ...payload.item };
    appendCards([item]);
  });

  es.addEventListener('done',()=>{
    hideSkeletons();
    es.close();
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
  await loadFromScrape(); // čaká na dokončenie fetch
});
