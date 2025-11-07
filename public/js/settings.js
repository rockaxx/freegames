// /js/settings.js
(() => {
  const API_ME_URL = '/api/me';
  const API_UPDATE_URL = '/api/account/update'; // change if your backend uses a different path

  let originalUser = null;

  const qs = (id) => document.getElementById(id);

  function setMsg(text, cls = 'auth-hint') {
    const box = qs('settingsMsg');
    if (!box) return;
    box.className = `auth-hint ${cls}`;
    box.textContent = text || '';
  }

  // Inject inline settings form (no overlay)
  function injectInlineForm() {
    if (qs('settingsForm')) return; // already injected

    // hide old "Edit account" button if present
    const openBtn = qs('openSettingsOverlay');
    if (openBtn) openBtn.closest('.hero__actions')?.remove();

    // place form AFTER the hero section
    const main = document.querySelector('main.content');
    const anchor = main?.querySelector('.hero');

    const html = `
      <section class="settings-section" id="settingsSection" style="margin-top:18px;">
        <div class="settings-card" style="
          background:linear-gradient(180deg,#132233,#112031);
          border:1px solid rgba(255,255,255,.08);
          border-radius: var(--radius, 14px);
          box-shadow: var(--shadow, 0 10px 30px rgba(0,0,0,.35));
          padding:16px;
        ">
          <h2 style="margin:0 0 12px; font-size:18px; font-weight:800; color:#fff;">Account Settings</h2>

          <form id="settingsForm" class="auth-form" novalidate>
            <div class="auth-hint" id="settingsMsg" aria-live="polite"></div>

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

            <div class="auth-actions" style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
              <button class="btn btn--ghost" id="authSettingsCancel" type="button">Reset</button>
              <button class="btn btn--primary" id="authSettingsSave" type="submit">Save</button>
            </div>
          </form>
        </div>
      </section>
    `;

    if (anchor && anchor.parentNode) {
      anchor.insertAdjacentHTML('afterend', html);
    } else {
      // Fallback: append to main content
      main?.insertAdjacentHTML('beforeend', html);
    }
  }

  function prefillForm(user) {
    const u = user || {};
    if (qs('setUsername')) qs('setUsername').value = u.username || '';
    if (qs('setEmail')) qs('setEmail').value = u.email || '';
    if (qs('currPass')) qs('currPass').value = '';
    if (qs('newPass')) qs('newPass').value = '';
    if (qs('newPass2')) qs('newPass2').value = '';
    setMsg('');
  }

  async function fetchMe() {
    try {
      const r = await fetch(API_ME_URL, { credentials: 'include' });
      const j = await r.json();
      return j && j.ok ? j.user : null;
    } catch {
      return null;
    }
  }

  async function saveSettings() {
    const btn = qs('authSettingsSave');
    const form = qs('settingsForm');
    const username = qs('setUsername').value.trim();
    const email = qs('setEmail').value.trim();
    const currPass = qs('currPass').value;
    const newPass = qs('newPass').value;
    const newPass2 = qs('newPass2').value;

    // basic validation
    if (!username || !email) {
      setMsg('Username and email are required.', 'auth-error');
      return;
    }
    const changingPass = !!(newPass || newPass2);
    if (changingPass) {
      if (!currPass) {
        setMsg('Enter your current password to change it.', 'auth-error');
        return;
      }
      if (newPass !== newPass2) {
        setMsg('New passwords do not match.', 'auth-error');
        return;
      }
      if (newPass.length < 6) {
        setMsg('New password should be at least 6 characters.', 'auth-error');
        return;
      }
    }

    // send
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    setMsg('Saving…');

    try {
      const payload = { username, email };
      if (changingPass) {
        payload.currPass = currPass;
        payload.newPass = newPass;
      }

      const r = await fetch(API_UPDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        setMsg(out?.error || 'Update failed.', 'auth-error');
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }

      setMsg('Saved successfully.', 'auth-success');

      // Prefer username/email returned from backend if present
      const newUsername = out?.user?.username || username;
      const newEmail = out?.user?.email || email;

      // update sidebar profile link
      try {
        const link = qs('settingsProfileLink');
        if (link && newUsername) {
          link.href = '/profile/' + encodeURIComponent(newUsername);
        }
      } catch {}

      // reset form + re-fill with canonical values
      form?.reset();
      qs('setUsername').value = newUsername;
      qs('setEmail').value = newEmail;

      // keep a copy for Reset button
      originalUser = { username: newUsername, email: newEmail };

      btn.disabled = false;
      btn.textContent = originalText;
    } catch {
      setMsg('Network error. Please try again.', 'auth-error');
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  function wireEvents() {
    // Save (submit)
    qs('settingsForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      saveSettings();
    });

    // Reset -> back to last known good values (/api/me or last save)
    qs('authSettingsCancel')?.addEventListener('click', (e) => {
      e.preventDefault();
      prefillForm(originalUser);
      setMsg('Reverted changes.', 'auth-hint');
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    injectInlineForm();

    // load user and prefill
    const me = await fetchMe();
    if (!me) {
      setMsg('Please sign in to edit your settings.', 'auth-error');
      // disable inputs if not logged in
      ['setUsername', 'setEmail', 'currPass', 'newPass', 'newPass2', 'authSettingsSave'].forEach(id => {
        const el = qs(id);
        if (el) el.disabled = true;
      });
      return;
    }

    originalUser = { username: me.username || '', email: me.email || '' };
    prefillForm(originalUser);

    // update sidebar link immediately
    try {
      const link = qs('settingsProfileLink');
      if (link && me.username) link.href = '/profile/' + encodeURIComponent(me.username);
    } catch {}

    wireEvents();
  });
})();
