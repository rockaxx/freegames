// --- KONFIG ---
const DEFAULT_SOURCE = '/api/all'; // URL listingu, čo chceš scrapovať
const API_ENDPOINT = '';            // náš serverový endpoint

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

function renderGameList() {
  const wrap = document.getElementById('gameList');
  wrap.innerHTML = '';
  games.forEach(g => {
    wrap.append(el('div', {class:'game-pill', onclick: () => openModal(g)}, [
      el('div', {class:'game-pill__thumb', style: g.img ? `background-image:url('${g.img}')` : ''}),
      el('div', {class:'game-pill__meta'}, [
        el('div', {class:'game-pill__title'}, g.title),
        el('div', {class:'game-pill__sub'}, (g.tags||[]).join(' · ')),
      ])
    ]));
  });
}

function renderCards(list = games) {
  const grid = document.getElementById('cardGrid');
  grid.innerHTML = '';
  list.forEach(g => {

    // ↓ DOPLŇ 1 RIADOK:
    if(!g.img && g.poster) g.img = g.poster;
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
          el('span', { class: 'badge ' + badgeClass }, (g.tags?.[0] || 'Not Categorized').substring(0, 16))
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
  const cover = el('div', {
    class: 'modal__cover',
    style: game.img
      ? `background-image:url('${game.img}');background-size:cover;background-position:center;`
      : ''
  });

  // --- INFO BLOCK ---
  const info = [];

  info.push(el('h2', { class: 'modal__title' }, game.title || '???'));
  if (game.subtitle) info.push(el('p', { class: 'modal__subtitle' }, game.subtitle));
  if (game.tags?.length) info.push(el('p', { class: 'modal__tags' }, game.tags.join(', ')));

  const fields = [
    ['Veľkosť', game.size],
    ['Rok', game.year],
    ['Verzia', game.version],
    ['Release group', game.releaseGroup],
    ['Developer', game.developer],
    ['Publisher', game.publisher],
    ['Dátum vydania', game.releaseDate],
    ['Recenzie', game.reviews],
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
    // screenshoty (max 3)
    if (Array.isArray(game.screenshots) && game.screenshots.length) {
      const shots = game.screenshots.slice(0, 3);
      info.push(
        el('div', { class: 'modal__shots' },
          shots.map(src => el('img', { src, class: 'modal__shot' }))
        )
      );
    }

    if (game.trailer) {
      info.push(el('video', {
        controls: true,
        class: 'modal__trailer',
        src: game.trailer
      }));
    }

    if (Array.isArray(game.downloadLinks) && game.downloadLinks.length) {
      info.push(el('div', { class: 'modal__links' },
        game.downloadLinks.map(dl => el('a', {
          href: dl.link,
          target: '_blank',
          rel: 'noopener',
          class: 'modal__download'
        }, dl.label || dl.link))
      ));
    }
  }
  // --- ŠPECIÁLNE LEN PRE RepackGames ---
  if (game.src === 'RepackGames') {

    // Screenshoty
    if (Array.isArray(game.screenshots) && game.screenshots.length) {
      const shots = game.screenshots.slice(0, 4);
      info.push(
        el('div', { class: 'modal__shots' },
          shots.map(src => el('img', { src, class: 'modal__shot' }))
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

  // --- BUTTONS ---
  const buttons = el('div', { class: 'modal__buttons' }, [
    el('button', { class: 'btn btn--primary' }, 'Kúpiť'),
    el('button', { class: 'btn btn--ghost' }, 'Do wishlistu')
  ]);

  body.append(cover, el('div', { class: 'modal__info' }, info), buttons);
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

search.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const q = search.value.trim();
  if (!q) {
    renderCards(games);
    return;
  }
  showLoading('Vyhľadávam…');

  try {
    let data;
    for (let i = 0; i < 6; i++) { // skúsi 6x (cca 3 sekundy celkovo)
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) break;
      await new Promise(r => setTimeout(r, 500)); // počkaj pol sekundy
    }

    const list = (data.items || []).map((it, idx) => ({ id: idx + 1, ...it }));
    renderCards(list);
  } catch (e) {
    console.warn('search fail', e);
  } finally {
    hideLoading();
  }
});


async function loadFromScrape(listUrl = DEFAULT_SOURCE) {
  showLoading('Načítavam knižnicu hier…');

  // 🔧 Vráť Promise, aby sa .finally() spustilo
  return new Promise(async (resolve) => {
    try {
      const res = await fetch(listUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      games = (data.items || []).map((it, idx) => ({ id: idx + 1, ...it }));
      renderGameList();
      renderCards();
    } catch (e) {
      console.warn('Scrape failed, používam demo dataset:', e);
      renderGameList();
      renderCards();
    } finally {
      hideLoading(); 
      resolve();
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
  showLoading('Načítavam knižnicu hier…');
  await loadFromScrape(); // čaká na dokončenie fetch
  hideLoading();           // skryje až po úspechu
});
