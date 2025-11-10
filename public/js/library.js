// library.js — render favourites into #cardGrid and open modal with a custom context menu

const FAV_KEY = 'kda_favs_v1';

// ---- Online-Fix overlay for Library ----
function loadOFIndexLS() {
  try { return JSON.parse(localStorage.getItem('kda_ofindex_v1') || '{}'); }
  catch { return {}; }
}

function guessOFMatchFromLS(title, map) {
  if (!title) return null;
  const tl = title.toLowerCase();
  for (const sv of Object.keys(map)) {
    if (sv && tl.includes(sv.toLowerCase())) {
      const meta = map[sv] || {};
      return {
        short: sv,
        full: meta.full || '',
        url: meta.url || '',
        item: meta.item || null
      };
    }
  }
  return null;
}

function createOFOverlayLib(ofMeta, preferImg) {
  const btn = document.createElement('button');
  btn.className = 'of-overlay';
  btn.title = ofMeta.full ? `Online-Fix ${ofMeta.full}` : 'Online-Fix';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ofMeta.item) {
      const cardImg = preferImg || ofMeta.item?.img || ofMeta.item?.poster || '';
      openModal({
        ...(ofMeta.item || {}),
        src: 'OnlineFix',
        poster: cardImg
      });
    } else if (ofMeta.url) {
      window.open(ofMeta.url, '_blank', 'noopener');
    }
  });
  return btn;
}

// ---------- storage helpers ----------
function fav_load() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
  catch { return []; }
}
function fav_save(list) { localStorage.setItem(FAV_KEY, JSON.stringify(list)); }
function fav_key(it) {
  const href = (it.href || it.link || it.detail || '').toLowerCase();
  const title = (it.title || '').toLowerCase();
  const src = (it.src || '').toLowerCase();
  return href || `${title}|${src}`;
}

async function removeFavSmart(g, cardEl) {
  // 1) server/LS
  let me = null;
  try { me = await (await fetch('/api/me')).json(); } catch { me = { ok:false }; }

  const key = g.__key || fav_key(g);

  if (me?.ok) {
    await fetch('/api/library/' + encodeURIComponent(key), { method: 'DELETE' });
  } else {
    const list = fav_load().filter(x => fav_key(x) !== key);
    fav_save(list);
  }

  // 2) DOM remove (no rerender, no scroll jump)
  if (cardEl) {
    const grid = document.getElementById('cardGrid');
    cardEl.remove();

    // 3) Empty state keď už nič neostalo
    if (!grid.querySelector('.card')) {
      grid.innerHTML = '<div style="padding:20px;color:var(--muted)">No favourites yet.</div>';
    }
  }
}

// ---------- tiny DOM helper ----------
function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(c => n.append(c));
  return n;
}
function normalizeImg(u) {
  if (!u) return '';
  if (/^\/api\/img\?url=/.test(u)) return u; // already proxied
  try { return '/api/img?url=' + encodeURIComponent(u); } catch { return u; }
}
// ---------- modal ----------
function openModal(g, cardEl) { // pass cardEl from caller
  const modal = document.getElementById('gameModal');
  const body = document.getElementById('modalBody');
  body.innerHTML = '';

  const cover = el('div', {
    class: 'modal__cover',
    style: g.img || g.poster ? `background-image:url('${normalizeImg(g.img || g.poster)}');background-size:cover;background-position:center;` : ''
  });

  const info = [];

  // header: title + remove button (wraps on mobile)
  const titleEl = el('h2', { class: 'modal__title' }, g.title || 'Unknown');

  const removeBtn = el('button', {
    type: 'button',
    class: 'btn btn--fav', // reuse style if you have; or keep as separate class
    onclick: async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await removeFavSmart(g, cardEl);
      modal.hidden = true; // close modal after removal
    }
  }, 'Remove from favourites');

  const headerRow = el('div', { class: 'modal__header' }, [ titleEl, removeBtn ]);
  info.push(headerRow);

  if (Array.isArray(g.tags) && g.tags.length) info.push(el('p', { class: 'modal__tags' }, g.tags.join(', ')));

  const fields = [
    ['Size', g.size], ['Year', g.year], ['Version', g.version], ['Build', g.build], ['Release group', g.releaseGroup],
    ['Developer', g.developer], ['Publisher', g.publisher],
    ['Release date', g.releaseDate], ['Reviews', g.reviews], ['Uploaded', g.uploaded]
  ];
  fields.forEach(([k, v]) => v && info.push(el('p', {}, `${k}: ${v}`)));

  if (g.steam) info.push(el('p', {}, el('a', { href: g.steam, target: '_blank', rel: 'noopener' }, 'Steam page')));
  if (g.href)  info.push(el('p', {}, el('a', { href: g.href,  target: '_blank', rel: 'noopener' }, 'Open source')));

  if (g.desc)  info.push(el('p', { style: 'margin-top:10px;' }, g.desc));
  if (g.about) info.push(el('p', { style: 'margin-top:10px;' }, g.about));

  if (Array.isArray(g.screenshots) && g.screenshots.length) {
    const shots = g.screenshots.slice(0, 4).map(src => el('img', { src: normalizeImg(src), class: 'modal__shot' }));
    info.push(el('div', { class: 'modal__shots' }, shots));
  }

  if (Array.isArray(g.downloadLinks) && g.downloadLinks.length) {
    const links = g.downloadLinks.map(dl =>
      el('a', {
        href: (typeof dl === 'string' ? dl : dl.link),
        target: '_blank',
        rel: 'noopener',
        class: 'modal__download'
      }, (typeof dl === 'string' ? 'Download' : (dl.label || new URL(dl.link).hostname)))
    );
    info.push(el('div', { class: 'modal__links' }, links));
  }

  body.append(cover, el('div', { class: 'modal__info' }, info));
  modal.hidden = false;
}

document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('gameModal').hidden = true;
});
document.getElementById('gameModal').addEventListener('click', (e) => {
  if (e.target.id === 'gameModal') e.currentTarget.hidden = true;
});

// ---------- context menu (custom) ----------
const ctxStyle = document.createElement('style');
ctxStyle.textContent = `
.ctx-menu{
  position:fixed; z-index:10000; min-width:200px;
  background:rgba(20,28,38,0.98);
  border:1px solid rgba(255,255,255,0.08);
  border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,0.35);
  padding:6px; display:none; backdrop-filter:saturate(1.2) blur(6px);
}
.ctx-item{
  width:100%; display:flex; align-items:center; gap:8px;
  background:transparent; border:0; color:#e5eaf0; text-align:left;
  padding:10px 12px; border-radius:8px; cursor:pointer; font-weight:600;
}
.ctx-item:hover{ background:rgba(255,255,255,0.06); color:#fff; }
.ctx-sep{ height:1px; margin:6px; background:rgba(255,255,255,0.08); }
.ctx-kbd{ margin-left:auto; opacity:.5; font-size:12px; }
`;
document.head.appendChild(ctxStyle);

const ctxMenu = document.createElement('div');
ctxMenu.className = 'ctx-menu';
document.body.appendChild(ctxMenu);

function hideCtx() { ctxMenu.style.display = 'none'; }


function buildCtx(items, cardEl) {
  ctxMenu.innerHTML = '';
  items.filter(Boolean).forEach(it => {
    if (it === 'sep') { ctxMenu.appendChild(el('div', { class:'ctx-sep' })); return; }
    const btn = el('button', { class:'ctx-item' }, [
      it.icon ? el('span', { style:'opacity:.8;font-size:16px;' }, it.icon) : null,
      document.createTextNode(it.label),
      it.kbd ? el('span', { class:'ctx-kbd' }, it.kbd) : null
    ]);
    btn.onclick = (e) => { hideCtx(); it.onClick?.(e, cardEl); };  // pass cardEl here
    ctxMenu.appendChild(btn);
  });
}


function showCtx(x, y, items, cardEl) {
  buildCtx(items, cardEl);                            // pass cardEl
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  ctxMenu.style.display = 'block';
  const r = ctxMenu.getBoundingClientRect();
  let nx = x, ny = y;
  if (r.right > window.innerWidth - 8) nx = Math.max(8, window.innerWidth - r.width - 8);
  if (r.bottom > window.innerHeight - 8) ny = Math.max(8, window.innerHeight - r.height - 8);
  ctxMenu.style.left = nx + 'px';
  ctxMenu.style.top  = ny + 'px';
}


document.addEventListener('click', (e) => {
  if (!ctxMenu.contains(e.target)) hideCtx();
});
document.addEventListener('contextmenu', (e) => {
  // allow native menu only when not on our cards
  if (!e.target.closest('.card')) hideCtx();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideCtx();
});
window.addEventListener('resize', hideCtx);
window.addEventListener('scroll', hideCtx, true);


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


async function renderFavs() {
  const grid = document.getElementById('cardGrid');
  grid.innerHTML = '';

  let list = [];
  let me = null;

  try {
    const r = await fetch('/api/me');
    const j = await r.json();
    me = j.ok ? j.user : null;
  } catch {
    me = null;
  }

  if (me) {
    try {
      const r = await fetch('/api/library');
      const j = await r.json();
      list = (j.ok && Array.isArray(j.items)) ? j.items : [];
    } catch {
      list = [];
    }
  } else {
    list = fav_load(); // fallback to localStorage when logged out
  }

  if (!list.length) {
    grid.innerHTML = '<div style="padding:20px;color:var(--muted)">No favourites yet.</div>';
    return;
  }

  list.forEach(g => {
    const img = normalizeImg(g.img || g.poster);

    const badgeClass =
      g.src === 'Anker' ? 'badge--good' :
      g.src === 'Game3RB' ? 'badge--warn' :
      g.src === 'RepackGames' ? 'badge--neutral' :
      g.src === 'OnlineFix' ? 'badge--good' :
      g.src === 'SteamUnderground' ? 'badge--good' : 'badge--neutral';

    let ofMeta = null;
    if (g.of && (g.of.item || g.of.url)) ofMeta = g.of;
    else ofMeta = guessOFMatchFromLS(g.title, loadOFIndexLS());

    const overlay = ofMeta ? createOFOverlayLib(ofMeta, img) : null;

    const thumb = el('div', { class:'card__thumb', style: img ? `background-image:url('${img}')` : '' }, overlay ? [overlay] : []);
    const card = el('article', {
      class: 'card',
      onclick: () => openModal(g,card),
      oncontextmenu: (e) => {
        e.preventDefault(); e.stopPropagation();
        showCtx(e.clientX, e.clientY, [
          { label: 'Open details', onClick: () => openModal(g) },
          g.href ? { label: 'Open source page', onClick: () => window.open(g.href, '_blank','noopener') } : null,
          'sep',
          {
            label: 'Remove from favourites',
            onClick: async (_ev, cardEl) => {
              await removeFavSmart(g, cardEl);           
            }
          },
        ], card);                                    
      }
    }, [
      thumb,
      el('div', { class: 'card__body' }, [
        el('h3', { class: 'card__title' }, g.title),
        el('div', { class: 'card__meta' }, [
          el('span', {}, g.src || ''),
          el('span', { class: 'badge ' + badgeClass }, (g.tags?.[0] || 'Not Categorized').substring(0, 16))
        ])
      ])
    ]);

    grid.append(card);
  });
}


const search = document.getElementById('searchInput');
if (search) {
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = search.value.trim();
    if (!q) return;
    window.location.href = `/?s=${encodeURIComponent(q)}`;
  });
}


document.addEventListener('DOMContentLoaded', renderFavs);
