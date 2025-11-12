// public/js/community_detail.js
const $ = (q, el=document) => el.querySelector(q);

const els = {
  title: $('#threadTitle'),
  meta: $('#threadMeta'),
  body: $('#threadBody'),
  voteUp: $('#voteUp'),
  voteDown: $('#voteDown'),
  voteScore: $('#voteScore'),
  repWrap: $('#repWrap'),
  repPill: $('#repPill'),
  repTitle: $('#repGameTitle'),
  repScore: $('#repScore'),
  repUp: $('#repUp'),
  repDown: $('#repDown'),
  comments: $('#commentsList'),
  form: $('#commentForm'),
  input: $('#commentInput')
};

const threadId = +location.pathname.split('/').pop();
let me = null;
let thread = null;

async function fetchMe() {
  try { const r = await fetch('/api/me'); const j = await r.json(); me = j.ok ? j.user : null; } catch {}
}

async function loadThread() {
  const r = await fetch(`/api/community/thread/${threadId}`);
  if (!r.ok) { els.body.textContent = 'Thread not found.'; return; }
  const j = await r.json();
  thread = j.thread;
  renderThread();
  await loadComments();
}
function renderThread() {
  document.title = `${thread.title} — Community`;
  // Add data-id to article for remove button
  document.getElementById('thread').setAttribute('data-id', thread.id);
  els.title.textContent = thread.title;

  const cat = escapeHtml(thread.category || 'General');
  const author = escapeHtml(thread.author || 'Unknown');
  const source = thread.source ? `<span class="chip chip--source">${escapeHtml(thread.source)}</span>` : '';
  const game = thread.game_title ? `<span class="chip chip--game">${escapeHtml(thread.game_title)}</span>` : '';

  els.meta.innerHTML = `
    <div class="chips">
      <span class="chip chip--cat">${cat}</span>
      ${game}
      ${source}
      <span class="chip chip--author"><span class="chip__avatar">${initial(author)}</span>${author}</span>
      <span class="chip chip--time" title="${new Date(thread.created_at).toLocaleString()}">${timeAgo(thread.created_at)}</span>
    </div>
  `;

  // pretty body: escape + linkify + newlines -> <br>
  els.body.innerHTML = linkify(escapeHtml(thread.body || '')).replace(/\n/g, '<br>');

  els.voteScore.textContent = thread.score || 0;

  const hasVoted = thread.myVote === 1 || thread.myVote === -1;
  els.voteUp.disabled = hasVoted;
  els.voteDown.disabled = hasVoted;
  els.voteUp.classList.toggle('vote-btn--active', thread.myVote === 1);
  els.voteDown.classList.toggle('vote-btn--active', thread.myVote === -1);

  if (thread.game_title && thread.game_title.trim() !== '') {
    els.repWrap.hidden = false;
    els.repTitle.textContent = thread.game_title;
    els.repScore.textContent = (thread.game_rep_score>=0?'+':'') + (thread.game_rep_score||0);
    els.repPill.classList.toggle('rep-pill--up', (thread.game_rep_score||0) >= 0);
    els.repPill.classList.toggle('rep-pill--down', (thread.game_rep_score||0) < 0);

    const hasRepped = thread.myRep === 1 || thread.myRep === -1;
    els.repUp.disabled = hasRepped;
    els.repDown.disabled = hasRepped;
    els.repUp.onclick = () => rep(1);
    els.repDown.onclick = () => rep(-1);
  } else {
    els.repWrap.hidden = true;
  }

  els.voteUp.onclick = () => vote(1);
  els.voteDown.onclick = () => vote(-1);
}

// --- utils ---
function initial(name='?'){ return (name.trim()[0] || '?').toUpperCase(); }
function timeAgo(d){
  const t = typeof d === 'string' ? new Date(d).getTime() : +d;
  const s = Math.floor((Date.now() - t)/1000);
  const m = Math.floor(s/60), h = Math.floor(m/60), dys = Math.floor(h/24);
  if (s < 60) return `${s}s ago`;
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${dys}d ago`;
}
function linkify(s){
  return s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

// --- toolbar actions ---
const copyBtn = document.getElementById('copyLink');
copyBtn?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); copyBtn.textContent = 'Copied'; setTimeout(()=>copyBtn.textContent='Copy link',1200); } catch {}
});
document.getElementById('goComments')?.addEventListener('click', () => {
  document.getElementById('comments')?.scrollIntoView({behavior:'smooth'});
});
if (location.hash === '#comments'){
  setTimeout(()=>document.getElementById('comments')?.scrollIntoView({behavior:'smooth'}), 120);
}

async function vote(delta) {
  if (!me) return window.showWarning('Login required');
  const r = await fetch('/api/community/vote', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ threadId, delta })
  });
  if (r.status === 409) { // already voted once
    els.voteUp.disabled = true; els.voteDown.disabled = true;
    return loadThread();
  }
  const j = await r.json();
  if (!j.ok) return alert('Vote failed');
  loadThread();
}

async function rep(delta) {
  if (!me) return window.showWarning('Login required');
  const r = await fetch('/api/game/rep', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ gameKey: thread.game_key, gameTitle: thread.game_title, delta })
  });
  if (r.status === 409) { // already repped once
    els.repUp.disabled = true; els.repDown.disabled = true;
    return loadThread();
  }
  const j = await r.json();
  if (!j.ok) return alert('Rep failed');
  loadThread();
}

async function loadComments() {
  const r = await fetch(`/api/community/comments?threadId=${threadId}`);
  const j = await r.json();
  els.comments.innerHTML = (j.comments||[]).map(c=>`
    <div class="comment">
      <div class="comment__head">
        <span class="comment__author">${escapeHtml(c.author)}</span>
        <span class="comment__time">${new Date(c.created_at).toLocaleString()}</span>
      </div>
      <div class="comment__body">${escapeHtml(c.body)}</div>
    </div>
  `).join('') || '<div class="muted">No comments yet.</div>';
}

els.form.onsubmit = async (e) => {
  e.preventDefault();
  if (!me) return window.showWarning('Login required');
  const body = els.input.value.trim();
  if (!body) return;
  const r = await fetch('/api/community/comment', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ threadId, body })
  });
  const j = await r.json();
  if (!j.ok) return alert('Comment failed');
  els.input.value = '';
  loadComments();
};

function escapeHtml(s='') { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

(async function init(){
  await fetchMe();
  await loadThread();
})();
