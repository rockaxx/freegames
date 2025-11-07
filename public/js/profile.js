// profile.js — view any profile by ?u=username, otherwise /api/me
// graceful fallback when not logged in: view-only

const els = {
  avatar: document.getElementById('avatarImg'),
  avatarFile: document.getElementById('avatarFile'),
  changeAvatarBtn: document.getElementById('changeAvatarBtn'),
  username: document.getElementById('pUsername'),
  created: document.getElementById('pCreated'),
  rep: document.getElementById('pRep'),
  repUp: document.getElementById('repUp'),
  repDown: document.getElementById('repDown'),

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

function renderProfile() {
  els.username.textContent = profile.username;
if (profile.extras && profile.extras.length > 0 && profile.extras[0].created_at) {
  els.created.textContent = 'Joined ' + new Date(profile.extras[0].created_at.replace(' ', 'T')).toLocaleDateString();
} else {
  els.created.textContent = 'Joined dont know';
}

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
  const parts = location.pathname.split('/').filter(Boolean); // ["profile", "Alex"] alebo ["profile","id","42"]
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

  if (me.id !== profile.userId) {
    els.editBioBtn.style.display = 'none';
    els.addExtraBtn.style.display = 'none';
    els.changeAvatarBtn.style.display = 'none';
    els.commentForm.style.display = 'none';
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

document.addEventListener('DOMContentLoaded', init);
