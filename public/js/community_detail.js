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
  els.title.textContent = thread.title;
  els.meta.textContent = `${thread.category} • ${thread.author} • ${new Date(thread.created_at).toLocaleString()}`;
  els.body.textContent = thread.body;
  els.voteScore.textContent = thread.score || 0;

  // Mark and hard-disable vote buttons after first vote
  const hasVoted = thread.myVote === 1 || thread.myVote === -1;
  els.voteUp.disabled = hasVoted;
  els.voteDown.disabled = hasVoted;
  els.voteUp.classList.toggle('vote-btn--active', thread.myVote === 1);
  els.voteDown.classList.toggle('vote-btn--active', thread.myVote === -1);

  // Game reputation: show and lock if already repped
  if (thread.game_title) {
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
async function vote(delta) {
  if (!me) return alert('Login required');
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
  if (!me) return alert('Login required');
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
  if (!me) return alert('Login required');
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
