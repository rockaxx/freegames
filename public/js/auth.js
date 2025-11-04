(function(){
  const accBtn = document.getElementById('accountBtn');
  const accBox = document.getElementById('accountBox');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const formLogin = document.getElementById('loginForm');
  const formRegister = document.getElementById('registerForm');

  function showLogin() {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.hidden = false;
    formRegister.hidden = true;
  }
  function showRegister() {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.hidden = false;
    formLogin.hidden = true;
  }

  // >>> Block outside-click handlers from firing when interacting inside the box
  ['mousedown','click','touchstart'].forEach(ev => {
    accBox.addEventListener(ev, e => e.stopPropagation());
  });

  accBtn.addEventListener('click', e => {
    e.stopPropagation();
    accBox.hidden = !accBox.hidden;
    if (!accBox.hidden) {
      showLogin();
      // >>> Focus first input for typing to work immediately
      setTimeout(() => {
        const first = accBox.querySelector('input');
        if (first) first.focus();
      }, 0);
    }
  });

  tabLogin.addEventListener('click', () => {
    showLogin();
    setTimeout(() => formLogin.querySelector('input')?.focus(), 0);
  });

  tabRegister.addEventListener('click', () => {
    showRegister();
    setTimeout(() => formRegister.querySelector('input')?.focus(), 0);
  });

  // Close when clicking outside
  document.addEventListener('click', e => {
    if (!accBox.hidden && !accBox.contains(e.target) && e.target !== accBtn) {
      accBox.hidden = true;
    }
  });

  function renderLogged(user){
    accBox.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="
          width:42px;height:42px;border-radius:50%;
          display:grid;place-items:center;
          background:linear-gradient(135deg,#263a50,#172738);
          border:1px solid rgba(255,255,255,.08);
          font-weight:800;font-size:17px;cursor:default;">
          ${(user.username?.[0] || 'U').toUpperCase()}
        </div>
        <div style="display:flex;flex-direction:column;">
          <div style="font-weight:700;font-size:15px;">${user.username || ''}</div>
          <div style="font-size:13px;color:var(--muted);">${user.email || ''}</div>
        </div>
      </div>
      <button id="logoutBtn" class="btn btn--ghost" style="width:100%;">Logout</button>
    `;
    accBox.querySelector('#logoutBtn').onclick = async () => {
      await fetch('/api/logout', { method:'POST' });
      location.reload();
    };
    document.getElementById('accountBtn').textContent =
      (user.username || 'U').charAt(0).toUpperCase();
  }

  // Register
  formRegister.addEventListener('submit', async e => {
    e.preventDefault();
    const [usernameEl, emailEl, passEl, pass2El] = formRegister.querySelectorAll('input');
    if (passEl.value !== pass2El.value) return alert('Passwords mismatch');

    const r = await fetch('/api/register', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        username: usernameEl.value.trim(),
        email: emailEl.value.trim(),
        password: passEl.value
      })
    });
    const data = await r.json();
    if(!data.ok) return alert(data.error || 'Register failed');
    renderLogged(data.user);
    accBox.hidden = true;
  });

  // Login
  formLogin.addEventListener('submit', async e => {
    e.preventDefault();
    const [usernameEl, passEl] = formLogin.querySelectorAll('input');

    const r = await fetch('/api/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        username: usernameEl.value.trim(),
        password: passEl.value
      })
    });
    const data = await r.json();
    if(!data.ok) return alert(data.error || 'Invalid login');
    renderLogged(data.user);
    accBox.hidden = true;
  });

  // Load current session on page load
  (async function init(){
    try {
      const r = await fetch('/api/me');
      const data = await r.json();
      if (data.ok && data.user) renderLogged(data.user);
    } catch(_) {}
  })();
})();
