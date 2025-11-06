// public/js/community.js
// Community front-end: threads, votes, comments, game reputation.
// All comments are in English (as requested).

const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

const els = {
  list: $('#threadList'),
  empty: $('#emptyState'),
  search: $('#threadSearch'),
  sort: $('#sortSelect'),
  newBtn: $('#newThreadBtn'),
  modal: $('#threadModal'),
  closeModal: $('#closeModal'),
  form: $('#threadForm'),
  cancelThread: $('#cancelThread'),
  sidebarTop: $('#topThreads'),
  repBoard: $('#repBoard'),
  drawer: $('#commentsDrawer'),
  drawerTitle: $('#commentsTitle'),
  drawerClose: $('#commentsClose'),
  commentsList: $('#commentsList'),
  commentForm: $('#commentForm'),
  commentInput: $('#commentInput')
};

let state = {
  category: 'all',
  search: '',
  sort: 'new',
  threads: [],
  me: null,
  openThreadId: null
};

// Simple helper to generate a stable key for game reputation
function buildGameKey(source, title) {
  const src = (source || '').trim().toLowerCase();
  const ttl = (title || '').trim().toLowerCase();
  if (!ttl) return '';
  return `${src}|${ttl}`; // example: "onlinefix|beamng drive"
}

async function fetchMe() {
  try {
    const r = await fetch('/api/me');
    const j = await r.json();
    state.me = j.ok ? j.user : null;
  } catch {}
}

async function loadThreads() {
  const params = new URLSearchParams();
  if (state.category && state.category !== 'all') params.set('category', state.category);
  if (state.search) params.set('q', state.search);
  if (state.sort) params.set('sort', state.sort);

  const r = await fetch('/api/community/threads?' + params.toString());
  const data = await r.json();
  state.threads = data.threads || [];
  renderThreads();
  renderTop();
  renderRepBoard(data.topGames || []);
}

function renderThreads() {
  if (!state.threads.length) {
    els.list.innerHTML = '';
    els.empty.hidden = false;
    return;
  }
  els.empty.hidden = true;

  const html = state.threads.map(t => {
    const upActive = t.myVote === 1 ? 'vote-btn--active' : '';
    const downActive = t.myVote === -1 ? 'vote-btn--active' : '';
    const hasGame = !!t.game_title;
    const rep = hasGame ? `
      <div class="rep-line">
        <div class="rep-pill ${t.game_rep_score >= 0 ? 'rep-pill--up' : 'rep-pill--down'}">
          <span>${t.game_title}</span>
          <strong>${t.game_rep_score >= 0 ? '+' : ''}${t.game_rep_score}</strong>
        </div>
        <div class="rep-actions">
          <button class="rep-btn rep-btn--up" data-gkey="${t.game_key}" data-delta="1">+rep</button>
          <button class="rep-btn rep-btn--down" data-gkey="${t.game_key}" data-delta="-1">-rep</button>
        </div>
      </div>` : '';

    return `
    <article class="thread-card" data-id="${t.id}">
      <div class="thread-votes">
        <button class="vote-btn vote-btn--up ${upActive}" data-id="${t.id}" data-delta="1">▲</button>
        <span class="vote-score" data-id="${t.id}">${t.score}</span>
        <button class="vote-btn vote-btn--down ${downActive}" data-id="${t.id}" data-delta="-1">▼</button>
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

        <p class="thread-body">${escapeHtml(t.body)}</p>
        ${rep}

        <div class="thread-footer">
          <button class="btn btn--ghost sm show-comments" data-id="${t.id}" data-title="${escapeAttr(t.title)}">
            Comments (${t.comments_count})
          </button>
        </div>
      </div>
    </article>`;
  }).join('');

  els.list.innerHTML = html;

  // wire actions
  $$('.vote-btn').forEach(b => b.onclick = onVoteThread);
  $$('.rep-btn').forEach(b => b.onclick = onRepGame);
  $$('.show-comments').forEach(b => b.onclick = openComments);
}

function renderTop() {
  const top = [...state.threads].sort((a,b)=>b.score-a.score).slice(0,5);
  els.sidebarTop.innerHTML = top.map(t => `
    <div class="game-pill" data-id="${t.id}">
      <div class="game-pill__thumb"></div>
      <div class="game-pill__meta">
        <div class="game-pill__title">${escapeHtml(t.title)}</div>
        <div class="game-pill__sub">${t.score} votes • ${t.category}</div>
      </div>
    </div>
  `).join('');
}

function renderRepBoard(items) {
  // items: [{game_key, game_title, score}]
  if (!items.length) { els.repBoard.innerHTML = '<div class="muted">No reputation yet.</div>'; return; }
  els.repBoard.innerHTML = items.map(g => `
    <div class="rep-pill rep-pill--tight ${g.score >= 0 ? 'rep-pill--up' : 'rep-pill--down'}">
      <span>${escapeHtml(g.game_title)}</span>
      <strong>${g.score >= 0 ? '+' : ''}${g.score}</strong>
      <div class="rep-pill__actions">
        <button class="rep-btn rep-btn--up" data-gkey="${g.game_key}" data-delta="1">+rep</button>
        <button class="rep-btn rep-btn--down" data-gkey="${g.game_key}" data-delta="-1">-rep</button>
      </div>
    </div>
  `).join('');
  $$('.rep-btn', els.repBoard).forEach(b => b.onclick = onRepGame);
}

async function onVoteThread(e) {
  const id = +e.currentTarget.dataset.id;
  const delta = +e.currentTarget.dataset.delta;
  if (!state.me) return alert('Login required');
  const r = await fetch('/api/community/vote', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ threadId: id, delta })
  });
  const j = await r.json();
  if (!j.ok) return alert('Vote failed');
  await loadThreads();
}

async function onRepGame(e) {
  const key = e.currentTarget.dataset.gkey;
  const delta = +e.currentTarget.dataset.delta;
  if (!state.me) return alert('Login required');
  const r = await fetch('/api/game/rep', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ gameKey: key, delta })
  });
  const j = await r.json();
  if (!j.ok) return alert('Rep failed');
  await loadThreads();
}

function openComments(e) {
  const id = +e.currentTarget.dataset.id;
  const title = e.currentTarget.dataset.title;
  state.openThreadId = id;
  els.drawerTitle.textContent = `Comments — ${title}`;
  els.drawer.hidden = false;
  els.commentInput.value = '';
  loadComments(id);
}

async function loadComments(threadId) {
  const r = await fetch('/api/community/comments?threadId=' + threadId);
  const j = await r.json();
  const html = (j.comments || []).map(c => `
    <div class="comment">
      <div class="comment__head">
        <span class="comment__author">${escapeHtml(c.author)}</span>
        <span class="comment__time">${new Date(c.created_at).toLocaleString()}</span>
      </div>
      <div class="comment__body">${escapeHtml(c.body)}</div>
    </div>
  `).join('');
  els.commentsList.innerHTML = html || '<div class="muted">No comments yet.</div>';
}

els.commentForm.onsubmit = async (e) => {
  e.preventDefault();
  if (!state.me) return alert('Login required');
  const body = els.commentInput.value.trim();
  if (!body) return;
  const r = await fetch('/api/community/comment', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ threadId: state.openThreadId, body })
  });
  const j = await r.json();
  if (!j.ok) return alert('Comment failed');
  els.commentInput.value = '';
  loadComments(state.openThreadId);
};

els.drawerClose.onclick = () => { els.drawer.hidden = true; };

// Category filter
$$('.sidebar__item').forEach(btn => {
  btn.onclick = () => {
    $$('.sidebar__item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.category = btn.dataset.category;
    loadThreads();
  };
});

els.search.oninput = () => {
  state.search = els.search.value.trim();
  loadThreads();
};

els.sort.onchange = () => {
  state.sort = els.sort.value;
  loadThreads();
};

// Modal new thread
els.newBtn.onclick = () => els.modal.hidden = false;
els.closeModal.onclick = () => els.modal.hidden = true;
els.cancelThread.onclick = () => els.modal.hidden = true;

els.form.addEventListener('submit', async (e) => {
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
  const j = await r.json();
  if (!j.ok) return alert('Publish failed');

  els.modal.hidden = true;
  els.form.reset();
  loadThreads();
});

// utils
function escapeHtml(s='') {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s='') { return escapeHtml(s).replace(/"/g,'&quot;'); }

// bootstrap
(async function init(){
  await fetchMe();
  await loadThreads();
})();
