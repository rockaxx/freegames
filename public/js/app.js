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

    const card = el('article', {class:'card', onclick: () => openModal(g)}, [
      el('div', {class:'card__thumb', style: g.img ? `background-image:url('${g.img}')` : ''}),
      el('div', {class:'card__body'}, [
        el('h3', {class:'card__title'}, g.title),
        el('div', {class:'card__meta'}, [
          el('span', {}, g.date || g.price || ''),
          el('span', {class:'badge ' + ((g.rating||'').includes('kladné') ? 'badge--good' : 'badge--warn')}, g.rating || (g.tags?.[0]||'')),
        ])
      ])
    ]);
    grid.append(card);
  });
}

function openModal(game){

  // normalizácia
  if(!game.img && game.poster) game.img = game.poster;
  if(!game.tags && game.genres) game.tags = game.genres;

  const modal = document.getElementById('gameModal');
  const body = document.getElementById('modalBody');

  body.innerHTML = '';

  body.append(
    el('div', {}, [
      el('div', {class:'modal__cover', style: game.img ? `background-image:url('${game.img}')` : ''}),
    ]),

    el('div', {}, [

      el('h2', {}, game.title || '???'),

      el('p', {}, `Tagy: ${(game.tags||[]).join(', ')}`),

      game.size         ? el('p', {}, 'Veľkosť: '+game.size) : null,
      game.year         ? el('p', {}, 'Rok: '+game.year) : null,
      game.version      ? el('p', {}, 'Verzia: '+game.version) : null,
      game.releaseGroup ? el('p', {}, 'Release group: '+game.releaseGroup) : null,
      game.publisher    ? el('p', {}, 'Publisher: '+game.publisher) : null,
      game.summary      ? el('p', {style:'margin-top:10px;'}, game.summary) : null,
      game.desc         ? el('p', {}, 'Popis: '+game.desc) : null,
      game.steam        ? el('p', {}, el('a',{href:game.steam,target:'_blank',rel:'noopener'},'Steam')) : null,
      game.href         ? el('p', {}, el('a',{href:game.href,target:'_blank',rel:'noopener'},'Otvoriť detail')) : null,

      el('div', {style:'display:flex; gap:10px; margin-top:10px'}, [
        el('button', {class:'btn btn--primary'}, 'Kúpiť'),
        el('button', {class:'btn btn--ghost'}, 'Do wishlistu'),
      ])
    ])
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

search.addEventListener('keydown', async (e)=>{
  if(e.key !== 'Enter') return;

  const q = search.value.trim();
  if(!q){
    renderCards(games);
    return;
  }

  try{
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    const list = (data.items || []).map((it,idx)=>({
      id: idx+1,
      ...it
    }));


    renderCards(list);
  }catch(e){
    console.warn('search fail',e);
  }
});


async function loadFromScrape(listUrl = DEFAULT_SOURCE) {
  try {
    const res = await fetch(listUrl);  // <--- TU
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();


    games = (data.items || []).map((it, idx) => ({
      id: idx + 1,
      ...it // ← toto je point. nekafrem data, nezúžim ich
    }));


    renderGameList();
    renderCards();
  } catch(e) {
    console.warn('Scrape failed, používam demo dataset:', e);
    renderGameList();
    renderCards();
  }
}

// bootstrap
attachEvents();
loadFromScrape(); // skúsi stiahnuť z DEFAULT_SOURCE; ak failne, zobrazí demo
