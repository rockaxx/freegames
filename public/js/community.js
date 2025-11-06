// public/js/community.js
// Index page (list). Clicking a thread opens /community/:id.
// Inline composer creates a thread (no modal).

const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

const els = {
  list: $('#threadList'),
  empty: $('#emptyState'),
  search: $('#threadSearch'),
  sort: $('#sortSelect'),
  top: $('#topThreads'),
  repBoard: $('#repBoard'),
  composerToggle: $('#composerToggle'),
  composerForm: $('#threadForm'),
  composerCancel: $('#composerCancel')
};

let state = {
  category: 'all',
  search: '',
  sort: 'new',
  me: null,
  threads: []
};

const buildGameKey = (source, title) => {
  const s = (source||'').trim().toLowerCase();
  const t = (title||'').trim().toLowerCase();
  return t ? `${s}|${t}` : '';
};

async function fetchMe() {
  try {
    const r = await fetch('/api/me');
    const j = await r.json();
    state.me = j.ok ? j.user : null;
  } catch {}
}

async function loadThreads() {
  const params = new URLSearchParams();
  if (state.category !== 'all') params.set('category', state.category);
  if (state.search) params.set('q', state.search);
  if (state.sort) params.set('sort', state.sort);

  const r = await fetch('/api/community/threads?' + params.toString());
  if (!r.ok) {
    console.warn('threads failed', r.status);
    els.list.innerHTML = '';
    els.empty.hidden = false;
    return;
  }
  const data = await r.json();
  state.threads = data.threads || [];
  renderList();
  renderTop();
  renderRepBoard(data.topGames || []);
}

function renderList() {
  if (!state.threads.length) {
    els.list.innerHTML = '';
    els.empty.hidden = false;
    return;
  }
  els.empty.hidden = true;

  els.list.innerHTML = state.threads.map(t => `
    <article class="thread-card thread-card--link" data-id="${t.id}">
      <div class="thread-votes">
        <div class="vote-btn vote-btn--up ${t.myVote===1?'vote-btn--active':''}">▲</div>
        <div class="vote-score">${t.score||0}</div>
        <div class="vote-btn vote-btn--down ${t.myVote===-1?'vote-btn--active':''}">▼</div>
      </div>
      <div class="thread-main">
        <div class="thread-head">
          <h3 class="thread-title">${escapeHtml(t.title)}</h3>
          <div class="thread-tags">
            <span class="tag">${t.category}</span>
            <span class="tag tag--muted">${t.author}</span>
            <span class="tag tag--muted">${new Date(t.created_at).toLocaleString()}</span>
          </div>
        </div>
        <p class="thread-body clamp-3">${escapeHtml(t.body)}</p>
        <div class="thread-footer">
          <span class="muted">${t.comments_count||0} comments</span>
          ${t.game_title ? `<span class="muted"> • ${escapeHtml(t.game_title)} (${t.game_rep_score>=0?'+':''}${t.game_rep_score||0})</span>` : ''}
        </div>
      </div>
    </article>
  `).join('');

  $$('.thread-card--link').forEach(card => {
    card.onclick = () => {
      const id = card.dataset.id;
      location.href = `/community/${id}`;
    };
  });
}

function renderTop() {
  const top = [...state.threads].sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,5);
  els.top.innerHTML = top.map(t => `
    <div class="game-pill" data-id="${t.id}" onclick="location.href='/community/${t.id}'">
      <div class="game-pill__thumb"></div>
      <div class="game-pill__meta">
        <div class="game-pill__title">${escapeHtml(t.title)}</div>
        <div class="game-pill__sub">${t.score||0} votes • ${t.category}</div>
      </div>
    </div>
  `).join('');
}

function renderRepBoard(items) {
  if (!items.length) {
    els.repBoard.innerHTML = '<div class="muted">No reputation yet.</div>';
    return;
  }
  els.repBoard.innerHTML = items.map(g => `
    <div class="rep-pill rep-pill--tight ${g.score>=0?'rep-pill--up':'rep-pill--down'}">
      <span>${escapeHtml(g.game_title)}</span>
      <strong>${g.score>=0?'+':''}${g.score}</strong>
    </div>
  `).join('');
}

// Composer
els.composerToggle.onclick = () => {
  els.composerForm.hidden = !els.composerForm.hidden;
};
els.composerCancel.onclick = () => {
  els.composerForm.hidden = true;
  els.composerForm.reset();
};

els.composerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.me) return alert('Login required');
  const title = $('#threadTitle').value.trim();
  const category = $('#threadCategory').value;
  const body = $('#threadBody').value.trim();
  const gameTitle = $('#gameTitle').value.trim();
  const gameSource = $('#gameSource').value.trim();
  const gameKey = buildGameKey(gameSource, gameTitle);

  const r = await fetch('/api/community/thread', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ title, category, body, gameTitle, gameKey })
  });
  if (!r.ok) { alert('Publish failed'); return; }
  const j = await r.json();
  if (!j.ok) { alert('Publish failed'); return; }

  els.composerForm.reset();
  els.composerForm.hidden = true;
  loadThreads();
});

// Filters
$$('.sidebar__item').forEach(btn => {
  btn.onclick = () => {
    $$('.sidebar__item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.category = btn.dataset.category;
    loadThreads();
  };
});
$('#threadSearch').oninput = () => { state.search = $('#threadSearch').value.trim(); loadThreads(); };
$('#sortSelect').onchange = () => { state.sort = $('#sortSelect').value; loadThreads(); };

// Utils
function escapeHtml(s='') { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Init
(async function(){
  await fetchMe();
  await loadThreads();
})();
