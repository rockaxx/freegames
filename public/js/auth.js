// auth.js
// Injects avatar + dropdown and a full-screen Settings modal.
// Requirements:
// - <div id="auth-root"></div> somewhere in the topbar (or the script will fall back to .topbar__right / body)
// - /assets/user.png should exist for logged-out avatar
// - Backend endpoints (expected):
//   GET    /api/me                -> { ok: true, user: { username, email, ... } }
//   POST   /api/login             -> { ok: true, user: {...} }
//   POST   /api/register          -> { ok: true, user: {...} }
//   POST   /api/logout            -> { ok: true }
//   PATCH  /api/user              -> { ok: true, user: {...} }   // updates username/email/password
//   (fallback) POST /api/user/update with same payload if PATCH 404.
//
// Notes:
// - Code is defensive: if PATCH /api/user fails with 404, it tries POST /api/user/update.
// - Password change is optional. If you fill any password fields, current password is required and new passwords must match.
// - Pressing ESC closes dropdown and modal. Clicking outside closes as well.

(function () {
  // ---------- Mount points ----------
  const mountHost =
    document.getElementById('auth-root') ||
    document.querySelector('.topbar__right') ||
    document.body;

  // inject avatar + dropdown containers if not present
  if (!mountHost.querySelector('#accountBtn')) {
    mountHost.insertAdjacentHTML(
      'beforeend',
      `
        <div class="avatar" id="accountBtn" title="Your account"></div>
        <div id="accountBox" class="account-box" hidden></div>
      `
    );
  }

  const accBtn = mountHost.querySelector('#accountBtn');
  const accBox = mountHost.querySelector('#accountBox');

  // Add Settings overlay root (once)
  if (!document.getElementById('authSettingsOverlay')) {
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div id="authSettingsOverlay" class="auth-overlay" hidden>
        <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="authSettingsTitle">
          <div class="auth-modal__header">
            <h3 id="authSettingsTitle">Account Settings</h3>
            <button class="auth-close" id="authSettingsClose" aria-label="Close">&times;</button>
          </div>
          <div class="auth-modal__body">
            <form id="settingsForm" class="auth-form">
              <div class="auth-field">
                <label for="setUsername">Username</label>
                <input id="setUsername" type="text" autocomplete="username" required>
              </div>

              <div class="auth-field">
                <label for="setEmail">Email</label>
                <input id="setEmail" type="email" autocomplete="email" required>
              </div>

              <fieldset class="auth-fieldset">
                <legend>Change Password (optional)</legend>
                <div class="auth-field">
                  <label for="currPass">Current password</label>
                  <input id="currPass" type="password" autocomplete="current-password" placeholder="Required if changing password">
                </div>
                <div class="auth-field">
                  <label for="newPass">New password</label>
                  <input id="newPass" type="password" autocomplete="new-password">
                </div>
                <div class="auth-field">
                  <label for="newPass2">Confirm new password</label>
                  <input id="newPass2" type="password" autocomplete="new-password">
                </div>
              </fieldset>
            </form>
          </div>
          <div class="auth-modal__footer">
            <button class="btn btn--ghost" id="authSettingsCancel">Cancel</button>
            <button class="btn btn--primary" id="authSettingsSave">Save</button>
          </div>
        </div>
      </div>
      `
    );
  }

  const overlay = document.getElementById('authSettingsOverlay');
  const overlayClose = document.getElementById('authSettingsClose');
  const overlayCancel = document.getElementById('authSettingsCancel');
  const overlaySave = document.getElementById('authSettingsSave');
  const formSettings = document.getElementById('settingsForm');
  const inputUser = document.getElementById('setUsername');
  const inputEmail = document.getElementById('setEmail');
  const inputCurr = document.getElementById('currPass');
  const inputNew = document.getElementById('newPass');
  const inputNew2 = document.getElementById('newPass2');

  // ---------- State ----------
  let currentUser = null;

  // ---------- Renderers ----------
  function renderLoggedOut() {
    // zobrazí user.png namiesto písmena
    accBtn.innerHTML = `<img src="/assets/user.png" alt="User" class="avatar-icon">`;
    accBox.innerHTML = `
      <div class="account-tabs">
        <button id="tabLogin" class="tab active">Login</button>
        <button id="tabRegister" class="tab">Register</button>
      </div>

      <form id="loginForm" class="account-form">
        <input name="username" type="text" placeholder="Username" required autocomplete="username">
        <input name="password" type="password" placeholder="Password" required autocomplete="current-password">
        <button class="btn btn--primary" type="submit">Sign In</button>
      </form>

      <form id="registerForm" class="account-form" hidden>
        <input name="username" type="text" placeholder="Username" required autocomplete="username">
        <input name="email" type="email" placeholder="Email" required autocomplete="email">
        <input name="password" type="password" placeholder="Password" required autocomplete="new-password">
        <input name="password2" type="password" placeholder="Confirm Password" required autocomplete="new-password">
        <button class="btn btn--primary" type="submit">Create Account</button>
      </form>
    `;
    bindLoggedOutEvents();
  }

  function renderLogged(user) {
    currentUser = user || currentUser;
    const letter = (currentUser?.username || 'U').charAt(0).toUpperCase();
    accBtn.textContent = letter;

    accBox.innerHTML = `
      <div class="account-identity">
        <div class="avatar avatar--sm">${letter}</div>
        <div class="account-identity__meta">
          <div class="acc-name">${escapeHtml(currentUser?.username || '')}</div>
          <div class="acc-email">${escapeHtml(currentUser?.email || '')}</div>
        </div>
      </div>
      <div class="account-actions">
        <button id="settingsBtn" class="btn btn--ghost" style="width:100%;">Settings</button>
        <button id="profileBtn" class="btn btn--ghost" style="width:100%;">Profile</button>
        <button id="logoutBtn" class="btn btn--ghost" style="width:100%;">Logout</button>
      </div>
    `;
    bindLoggedInEvents();
  }

  // ---------- Event binders ----------
  function bindDropdownToggles() {
    accBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      accBox.hidden = !accBox.hidden;
      if (!accBox.hidden) {
        // Focus first available element for accessibility
        const firstFocusable = accBox.querySelector('button, input, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) firstFocusable.focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (!accBox.hidden && !accBox.contains(e.target) && e.target !== accBtn) {
        accBox.hidden = true;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!overlay.hidden) closeOverlay();
        if (!accBox.hidden) accBox.hidden = true;
      }
    });

    // Prevent dropdown from closing when clicking inside
    ['mousedown', 'click', 'touchstart'].forEach((ev) => {
      accBox.addEventListener(ev, (e) => e.stopPropagation());
    });
  }

  function bindLoggedOutEvents() {
    const tabLogin = accBox.querySelector('#tabLogin');
    const tabRegister = accBox.querySelector('#tabRegister');
    const formLogin = accBox.querySelector('#loginForm');
    const formRegister = accBox.querySelector('#registerForm');

    tabLogin?.addEventListener('click', () => {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      formLogin.hidden = false;
      formRegister.hidden = true;
      formLogin.querySelector('input')?.focus();
    });

    tabRegister?.addEventListener('click', () => {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      formRegister.hidden = false;
      formLogin.hidden = true;
      formRegister.querySelector('input')?.focus();
    });

    formLogin?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(formLogin);
      const body = {
        username: String(fd.get('username') || '').trim(),
        password: String(fd.get('password') || '')
      };
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await safeJson(r);
      if (!data?.ok) return alert(data?.error || 'Invalid login');
      renderLogged(data.user);
      accBox.hidden = true;
      //refresh
      window.location.reload();
    });

    formRegister?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(formRegister);
      const user = String(fd.get('username') || '').trim();
      const email = String(fd.get('email') || '').trim();
      const pass = String(fd.get('password') || '');
      const pass2 = String(fd.get('password2') || '');
      if (pass !== pass2) return alert('Passwords do not match');
      const r = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, email, password: pass })
      });
      const data = await safeJson(r);
      if (!data?.ok) return alert(data?.error || 'Register failed');
      renderLogged(data.user);
      accBox.hidden = true;
    });
  }

  function bindLoggedInEvents() {
    const btnLogout = accBox.querySelector('#logoutBtn');
    const btnSettings = accBox.querySelector('#settingsBtn');
    const btnProfile = accBox.querySelector('#profileBtn');
    btnLogout?.addEventListener('click', async () => {
      try { await fetch('/api/logout', { method: 'POST' }); } catch (_) {}
      location.reload();
    });
    btnSettings?.addEventListener('click', () => {
      location.href = `/settings`;
      accBox.hidden = true;
    });
    btnProfile?.addEventListener('click', () => {
      location.href = `/profile/${encodeURIComponent(currentUser.username)}`;
      accBox.hidden = true;
    });
  }

  function closeOverlay() {
    overlay.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  overlayClose?.addEventListener('click', closeOverlay);
  overlayCancel?.addEventListener('click', closeOverlay);
  overlay.addEventListener('mousedown', (e) => {
    // click on backdrop closes
    if (e.target === overlay) closeOverlay();
  });

  overlaySave?.addEventListener('click', async () => {
    // Basic validation
    const wantPwdChange = inputCurr.value || inputNew.value || inputNew2.value;
    if (wantPwdChange) {
      if (!inputCurr.value) return alert('Current password is required to change password.');
      if (!inputNew.value) return alert('Enter a new password.');
      if (inputNew.value !== inputNew2.value) return alert('New passwords do not match.');
      if (inputNew.value.length < 2) return alert('New password must be at least 6 characters.');
    }

    const payload = {};
    if (inputUser.value.trim() && inputUser.value.trim() !== currentUser?.username) {
      payload.username = inputUser.value.trim();
    }
    if (inputEmail.value.trim() && inputEmail.value.trim() !== currentUser?.email) {
      payload.email = inputEmail.value.trim();
    }
    if (wantPwdChange) {
      payload.currentPassword = inputCurr.value;
      payload.newPassword = inputNew.value;
    }

    if (Object.keys(payload).length === 0) {
      // Nothing to save
      closeOverlay();
      return;
    }

    // Busy state
    setBusy(overlaySave, true);

    let data = null;
    try {
      // Try PATCH first
      let r = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (r.status === 404) {
        // Fallback to POST /api/user/update
        r = await fetch('/api/account/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      data = await safeJson(r);
    } catch (err) {
      setBusy(overlaySave, false);
      return alert('Network error.');
    }

    setBusy(overlaySave, false);

    if (!data?.ok) return alert(data?.error || 'Failed to save settings');

    currentUser = data.user;
    renderLogged(currentUser);
    closeOverlay();
  });

  function setBusy(btn, isBusy) {
    if (!btn) return;
    btn.disabled = !!isBusy;
    btn.dataset.busy = isBusy ? '1' : '';
    btn.textContent = isBusy ? 'Saving…' : 'Save';
  }

  // ---------- Utilities ----------
  async function safeJson(resp) {
    try { return await resp.json(); } catch { return null; }
  }
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------- Init ----------
  bindDropdownToggles();

  (async function init() {
    try {
      const r = await fetch('/api/me');
      const data = await safeJson(r);
      if (data?.ok && data.user) {
        currentUser = data.user;
        renderLogged(currentUser);
      } else {
        renderLoggedOut();
      }
    } catch {
      renderLoggedOut();
    }
  })();
})();
