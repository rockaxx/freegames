// profile.js — view any profile by ?u=username, otherwise /api/me
// graceful fallback when not logged in: view-only

const els = {
  avatar: document.getElementById('avatarImg'),
  avatarFile: document.getElementById('avatarFile'),
  changeAvatarBtn: document.getElementById('changeAvatarBtn'),
  username: document.getElementById('pUsername'),
  created: document.getElementById('pCreated'),
  role: document.getElementById('pRole'),
  rep: document.getElementById('pRep'),
  repUp: document.getElementById('repUp'),
  repDown: document.getElementById('repDown'),
  repBox: document.getElementById('repBox'),

  bioText: document.getElementById('bioText'),
  bioForm: document.getElementById('bioForm'),
  bioInput: document.getElementById('bioInput'),
  editBioBtn: document.getElementById('editBioBtn'),
  bioCancel: document.getElementById('bioCancel'),

  extraList: document.getElementById('extraList'),
  addExtraBtn: document.getElementById('addExtraBtn'),
  extraForm: document.getElementById('extraForm'),
  extraInput: document.getElementById('extraInput'),
  extraCancel: document.getElementById('extraCancel'),

  commentsList: document.getElementById('commentsList'),
  commentForm: document.getElementById('commentForm'),
  commentInput: document.getElementById('commentInput'),
};

let me = null;
let profile = null; // { userId, username, avatar, bio, extras[], repScore, myRep, created_at }

async function fetchMe() {
  try {
    const r = await fetch('/api/me'); const j = await r.json();
    return j.ok ? j.user : null;
  } catch { return null; }
}
function qs(name){ const m = new URLSearchParams(location.search).get(name); return m ? m.trim() : ''; }

function isRoleAdmin() {
  return me && me.role === 'admin';
}


function renderProfile() {
  els.username.textContent = profile.username;
  els.created.textContent = '2025';
  els.role.textContent = profile.role === 'admin' ? 'Admin' : 'Member';
  els.rep.textContent = (profile.repScore>=0?'+':'') + (profile.repScore||0);

  els.avatar.src = profile.avatar || '/assets/user.png';
  els.bioText.textContent = profile.bio?.trim() || 'No bio yet.';
  els.bioInput.value = profile.bio || '';


els.extraList.innerHTML = '';
(profile.extras || []).forEach((ex, idx) => {
  const li = document.createElement('li');
  li.textContent = ex.text;

  if (me && me.id === profile.userId) {
    const del = document.createElement('button');
    del.textContent = '×';
    del.title = 'Remove';
    del.onclick = async () => {
      await fetch('/api/profile/extra', {
        method:'DELETE',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ idx })
      });
      profile.extras.splice(idx,1);
      li.remove();
    };
    li.appendChild(del);
  }

  els.extraList.appendChild(li);
});

  // enable/disable self-edit controls
  const isSelf = me && me.id === profile.userId;
  [els.editBioBtn, els.addExtraBtn, els.changeAvatarBtn].forEach(b => b.disabled = !isSelf);

  if (els.repBox) {
    els.repBox.style.display = isSelf ? 'none' : '';
  }
  // rep buttons
  els.repUp.disabled = !me || (profile.myRep === 1) || isSelf;
  els.repDown.disabled = !me || (profile.myRep === -1) || isSelf;
}

function renderComments(list) {
  els.commentsList.innerHTML = '';
  if (!list || !list.length) {
    els.commentsList.innerHTML = '<div class="muted" style="padding:8px 2px;">No comments yet.</div>';
    return;
  }
  list.forEach(c => {
    const wrap = document.createElement('div');
    wrap.className = 'comment';
    wrap.innerHTML = `
      <div class="comment__head">
        <span class="comment__author">${escapeHtml(c.author || 'Unknown')}</span>
        <span>${new Date(c.created_at).toLocaleString()}</span>
      </div>
      <div class="comment__body">${escapeHtml(c.body || '')}</div>
    `;
    els.commentsList.appendChild(wrap);
  });
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function pathBits() {
  const parts = location.pathname.split('/').filter(Boolean);
  return parts;
}

async function loadProfile() {
  const parts = pathBits();
  let endpoint = null;

  if (parts[0] === 'profile' && parts[1]) {
    if (parts[1] === 'id' && parts[2]) {
      endpoint = `/api/profile/id/${encodeURIComponent(parts[2])}`;
    } else {
      endpoint = `/api/profile/${encodeURIComponent(parts[1])}`;
    }
  } else {
    endpoint = '/api/profile/me';
  }

  const r = await fetch(endpoint);
  if (r.status === 404) {
    document.querySelector('.content').innerHTML = '<div class="profile-card" style="padding:24px">User not found.</div>';
    return;
  }
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'profile error');
  profile = j.profile;
  renderProfile();

  // comments fetch via username (isté že máme profile.username)
  const rc = await fetch(`/api/profile/${encodeURIComponent(profile.username)}/comments`);
  const jc = await rc.json();
  if (jc.ok) renderComments(jc.comments || []);
}


async function init() {
  me = await fetchMe();
  await loadProfile();
  const isSelf = !!(me && me.id === profile.userId);

  // Hide self-only controls on other profiles
  if (!isSelf) {
    els.editBioBtn.style.display = 'none';
    els.addExtraBtn.style.display = 'none';
    els.changeAvatarBtn.style.display = 'none';
  }

  // Comment form: show for logged-in users, hide for guests
  els.commentForm.style.display = me ? '' : 'none';

  // Optional: disable inputs for guests (defensive)
  const submitBtn = els.commentForm.querySelector("button[type='submit']");
  if (!me) {
    els.commentInput.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
  } else {
    els.commentInput.disabled = false;
    if (submitBtn) submitBtn.disabled = false;
  }
  
  // Bio
  els.editBioBtn.onclick = () => { els.bioForm.hidden = false; els.bioInput.focus(); };
  els.bioCancel.onclick = () => { els.bioForm.hidden = true; };
  els.bioForm.onsubmit = async (e) => {
    e.preventDefault();
    const bio = els.bioInput.value.trim();
    const r = await fetch('/api/profile/bio', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ bio })
    });
    const j = await r.json();
    if (j.ok) {
      profile.bio = bio;
      els.bioText.textContent = bio || 'No bio yet.';
      els.bioForm.hidden = true;
    }
  };

  // Extras
  els.addExtraBtn.onclick = () => { els.extraForm.hidden = false; els.extraInput.focus(); };
  els.extraCancel.onclick = () => { els.extraForm.hidden = true; };
  els.extraForm.onsubmit = async (e) => {
    e.preventDefault();
    const text = els.extraInput.value.trim();
    if (!text) return;
    const r = await fetch('/api/profile/extra', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ text })
    });
    const j = await r.json();
    if (j.ok) {
      profile.extras = j.extras;
      els.extraInput.value = '';
      els.extraForm.hidden = true;
      renderProfile();
    }
  };

  // Avatar
  els.changeAvatarBtn.onclick = () => els.avatarFile.click();
  els.avatarFile.onchange = async () => {
    const f = els.avatarFile.files[0];
    if (!f) return;
    const b64 = await fileToDataURL(f);
    const r = await fetch('/api/profile/avatar', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ dataUrl: b64 })
    });
    const j = await r.json();
    if (j.ok && j.avatar) {
        profile.avatar = j.avatar;
        els.avatar.src = j.avatar;

        if (window.renderLogged) {
            renderLogged();
        }

        window.location.reload();
    }

  };

  // Rep
  els.repUp.onclick = async () => {
    const r = await fetch('/api/profile/rep', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ delta: 1, username: profile.username }) });
    const j = await r.json();
    if (j.ok) { profile.repScore = j.score; profile.myRep = 1; renderProfile(); }
  };
  els.repDown.onclick = async () => {
    const r = await fetch('/api/profile/rep', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ delta: -1, username: profile.username }) });
    const j = await r.json();
    if (j.ok) { profile.repScore = j.score; profile.myRep = -1; renderProfile(); }
  };

  // Comments
  els.commentForm.onsubmit = async (e) => {
    e.preventDefault();
    const body = els.commentInput.value.trim();
    if (!body) return;
    const r = await fetch(`/api/profile/${encodeURIComponent(profile.username)}/comments`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ body })
    });
    const j = await r.json();
    if (j.ok) {
      els.commentInput.value = '';
      renderComments(j.comments);
    }
  };
}

function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

const searchInput = document.getElementById('searchProfiles');
const suggestBox  = document.getElementById('profileSuggest');

let lastValue = '';
let activeIndex = -1;   // keyboard selection
let currentItems = [];  // cached results

function escHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}

function hideSuggest() {
  suggestBox.style.display = 'none';
  suggestBox.innerHTML = '';
  activeIndex = -1;
  currentItems = [];
}

function renderSuggest(items){
  currentItems = items;
  activeIndex = -1;

  suggestBox.innerHTML = items.map((u, i) => `
    <div class="suggest-item" data-u="${escHtml(u.username)}" data-idx="${i}" style="
      display:flex; align-items:center; gap:10px;
      padding:8px 10px; cursor:pointer;
      border-bottom:1px solid rgba(255,255,255,.06);
      background:transparent;
    ">
      <img src="${u.avatar ? escHtml(u.avatar) : '/assets/user.png'}"
           alt=""
           width="28" height="28"
           style="flex:0 0 28px; height:28px; border-radius:50%;
                  border:1px solid rgba(255,255,255,.10);
                  object-fit:cover; background:#172738;">
      <span style="font-weight:700; color:var(--text)">${escHtml(u.username)}</span>
    </div>
  `).join('');

  suggestBox.style.display = 'block';
}

function moveActive(delta){
  if (!currentItems.length) return;
  activeIndex = (activeIndex + delta + currentItems.length) % currentItems.length;

  // visual state
  [...suggestBox.querySelectorAll('.suggest-item')].forEach((el, idx) => {
    el.style.background = idx === activeIndex ? 'rgba(102,192,244,.12)' : 'transparent';
    el.style.outline = idx === activeIndex ? '1px solid rgba(102,192,244,.25)' : 'none';
  });

  // ensure visible
  const el = suggestBox.querySelector(`.suggest-item[data-idx="${activeIndex}"]`);
  if (el) el.scrollIntoView({ block:'nearest' });
}

function goActive(){
  if (activeIndex < 0 || activeIndex >= currentItems.length) return;
  const u = currentItems[activeIndex];
  window.location.href = '/profile/' + encodeURIComponent(u.username);
}

searchInput.addEventListener('input', async () => {
  const q = searchInput.value.trim();
  if (!q || q.length < 2) return hideSuggest();
  if (q === lastValue) return;
  lastValue = q;

  try {
    const r = await fetch('/api/profile/search?q=' + encodeURIComponent(q));
    const j = await r.json();
    if (!j.ok || !Array.isArray(j.results) || !j.results.length) return hideSuggest();
    renderSuggest(j.results);
  } catch {
    hideSuggest();
  }
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveActive(+1);
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveActive(-1);
  }
  else if (e.key === 'Enter') {

    // 1) suggestions open + something selected -> goActive()
    if (suggestBox.style.display === 'block' && currentItems.length && activeIndex >= 0) {
      e.preventDefault();
      goActive();
      return;
    }

    // 2) suggestions open but no selection -> take raw text
    if (suggestBox.style.display === 'block' && currentItems.length && activeIndex === -1) {
      e.preventDefault();
      const q = searchInput.value.trim();
      if (q) window.location.href = '/profile/' + encodeURIComponent(q);
      return;
    }

    // 3) no suggestions at all -> raw
    const q = searchInput.value.trim();
    if (q) {
      e.preventDefault();
      window.location.href = '/profile/' + encodeURIComponent(q);
    }
  }
  else if (e.key === 'Escape') {
    hideSuggest();
  }
});

// click select
suggestBox.addEventListener('click', (e) => {
  const t = e.target.closest('.suggest-item');
  if (!t) return;
  window.location.href = '/profile/' + encodeURIComponent(t.dataset.u);
});

// close on outside click
document.addEventListener('click', (e) => {
  if (!suggestBox.contains(e.target) && !searchInput.contains(e.target)) hideSuggest();
});


document.addEventListener('DOMContentLoaded', init);
