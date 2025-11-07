// /public/js/settings.js
(() => {
  const s = (id) => document.getElementById(id);

  function hideAll() {
    ['formUsername','formEmail','formPassword'].forEach(id => {
      const el = s(id);
      if (el) el.style.display = 'none';
    });
  }
  function show(elId) {
    hideAll();
    const el = s(elId);
    if (el) el.style.display = 'block';
  }
  function setMsg(elId, text, ok) {
    const el = s(elId);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'auth-hint ' + (ok ? 'auth-success' : 'auth-error');
  }

  async function getMe() {
    try {
      const r = await fetch('/api/me', { credentials: 'include' });
      const j = await r.json();
      return j.ok ? j.user : null;
    } catch { return null; }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const me = await getMe();
    if (!me) {
      window.location.href = '/autherr.html';
      return;
    }

    // prepínače
    s('btnChangeUsername')?.addEventListener('click', () => show('formUsername'));
    s('btnChangeEmail')?.addEventListener('click',    () => show('formEmail'));
    s('btnChangePassword')?.addEventListener('click', () => show('formPassword'));

    // default
    show('formUsername');

    // username
    s('formUsername')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = s('inpNewUsername').value.trim();
      if (!username) return setMsg('msgUser', 'Enter username.', false);

      const r = await fetch('/api/account/update', {
        method:'POST', headers:{'Content-Type':'application/json'},
        credentials:'include', body:JSON.stringify({ username })
      });
      let j=null; try{ j=await r.json(); }catch{}
      if (!r.ok || !j?.ok) return setMsg('msgUser', 'Failed: ' + (j?.error || r.status), false);
      setMsg('msgUser', 'Saved.', true);
      window.location.reload();
    });

    // email
    s('formEmail')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = s('inpNewEmail').value.trim();
      if (!email) return setMsg('msgEmail', 'Enter email.', false);

      const r = await fetch('/api/account/update', {
        method:'POST', headers:{'Content-Type':'application/json'},
        credentials:'include', body:JSON.stringify({ email })
      });
      let j=null; try{ j=await r.json(); }catch{}
      if (!r.ok || !j?.ok) return setMsg('msgEmail', 'Failed: ' + (j?.error || r.status), false);
      setMsg('msgEmail', 'Saved.', true);
      window.location.reload();
    });

    // password
    s('formPassword')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currPass = s('inpCurr').value;
      const newPass  = s('inpNew').value;
      const newPass2 = s('inpNew2').value;
      if (!newPass) return setMsg('msgPass', 'Enter new password.', false);
      if (newPass !== newPass2) return setMsg('msgPass', 'Passwords do not match.', false);

      const r = await fetch('/api/account/update', {
        method:'POST', headers:{'Content-Type':'application/json'},
        credentials:'include', body:JSON.stringify({ currPass, newPass })
      });
      let j=null; try{ j=await r.json(); }catch{}
      if (!r.ok || !j?.ok) return setMsg('msgPass', 'Failed: ' + (j?.error || r.status), false);
      setMsg('msgPass', 'Saved.', true);
      s('inpCurr').value=''; s('inpNew').value=''; s('inpNew2').value='';
      window.location.reload();
    });
  });
})();
