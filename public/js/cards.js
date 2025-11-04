// --- progressive search state ---
let currentES = null;
let activeSrcFilter = 'ALL';

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

// Append real cards without clearing the grid
function appendCards(list = []) {
  const grid = document.getElementById('cardGrid');
  list.forEach(g => {
    const shouldShow = (activeSrcFilter === 'ALL' || g.src === activeSrcFilter);
    if(!g.img && g.poster) g.img = g.poster;
    if (g.img) g.img = `/api/img?url=${encodeURIComponent(g.img)}`;

    let badgeClass = 'badge--good';
    if (g.src === 'Anker') badgeClass = 'badge--good';
    else if (g.src === 'Game3RB') badgeClass = 'badge--good';
    else if (g.src === 'RepackGames') badgeClass = 'badge--good';
    else if (g.src === 'SteamUnderground') badgeClass = 'badge--good';
    else if (g.src === 'OnlineFix') badgeClass = 'badge--good';

    // determine tag text
    let tag0 = g.tags && g.tags.length ? g.tags[0] : 'Not Categorized';

    // override if tag missing
    if (!g.tags || !g.tags.length) {
      badgeClass = 'badge--warn';
    }

    const card = el('article', { class: 'card', onclick: () => openModal(g), style: shouldShow ? '' : 'display:none;' }, [
      el('div', { class: 'card__thumb', style: g.img ? `background-image:url('${g.img}')` : '' }),
      el('div', { class: 'card__body' }, [
        el('h3', { class: 'card__title' }, g.title),
        el('div', { class: 'card__meta' }, [
          el('span', {}, g.src || ''),
          el('span', { class: 'badge ' + badgeClass }, tag0.substring(0, 16))
        ])
      ])
    ]);

    // replace one skeleton if present; otherwise append
    const sk = grid.querySelector('.card.skeleton');
    if (sk) sk.replaceWith(card);
    else grid.append(card);
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

function showLoading(msg = 'Načítavam hry…') {
  const el = document.getElementById('loadingScreen');
  if (!el) return;
  el.querySelector('p').textContent = msg;
  el.hidden = false;

  // Bezpečnostný timeout (fallback)
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => {
    hideLoading();
  }, 20000);
}

function hideLoading() {
  const el = document.getElementById('loadingScreen');
  if (!el) return;
  clearTimeout(el._timeout);
  el.hidden = true;
}


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

    if(!g.img && g.poster) g.img = g.poster;
    if (g.img) {
      g.img = `/api/img?url=${encodeURIComponent(g.img)}`;
    }

    let badgeClass = 'badge--good';
    if (g.src === 'Anker') badgeClass = 'badge--good';
    else if (g.src === 'Game3RB') badgeClass = 'badge--warn';
    else if (g.src === 'RepackGames') badgeClass = 'badge--neutral';
    const card = el('article', {class:'card', onclick: () => openModal(g)}, [
      el('div', {class:'card__thumb', style: g.img ? `background-image:url('${g.img}')` : ''}),
      el('div', {class:'card__body'}, [
        el('h3', {class:'card__title'}, g.title),
        el('div', {class:'card__meta'}, [
          el('span', {}, g.src || ''),
          el('span', { class: 'badge ' + badgeClass }, (g.tags?.[0] == "Simulati" ? "Simulation" : (g.tags?.[0] == "Cyberpun" ? "Cyberpunk" : g.tags?.[0]) || 'Not Categorized').substring(0, 16))
        ])
      ])
    ]);
    grid.append(card);
  });
}