// mobile_menu.js
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('mobileMenuBtn');
  const drawer = document.getElementById('mobileDrawer');
  const backdrop = document.getElementById('sidebarBackdrop');
  const logoutBtn = document.getElementById('mnav-logout');

  // --- Drawer control ---
  if (btn && drawer && backdrop) {
    const openDrawer = () => {
      drawer.classList.add('is-open');
      backdrop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    };
    const closeDrawer = () => {
      drawer.classList.remove('is-open');
      backdrop.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };
    const toggleDrawer = () =>
      drawer.classList.contains('is-open') ? closeDrawer() : openDrawer();

    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleDrawer(); });
    backdrop.addEventListener('click', closeDrawer);
    drawer.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
    window.addEventListener('resize', () => { if (window.innerWidth > 900) closeDrawer(); });

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        closeDrawer();
        if (typeof window.wllogout === 'function') window.wllogout();
      });
    }
  }

  // --- Active-link highlight ---
  const normalize = (p) => {
    if (!p) return '/';
    try { if (p.startsWith('http')) p = new URL(p).pathname; } catch {}
    return p.toLowerCase()
            .replace(/index\.html$/, '')
            .replace(/\.html$/, '')
            .replace(/\/+$/, '') || '/';
  };

  const current = normalize(location.pathname);

  const routeMap = { store:'/', library:'/library', community:'/community', trusted:'/trusted' };

  const extractTarget = (el) => {
    if (el.hasAttribute('href')) return normalize(el.getAttribute('href'));
    const route = el.dataset && el.dataset.route;
    if (route && routeMap[route]) return routeMap[route];
    const oc = el.getAttribute && el.getAttribute('onclick');
    if (oc) {
      const m = oc.match(/['"]\/[^'"]*['"]/);
      if (m) return normalize(m[0].slice(1, -1));
    }
    return '';
  };

  // Desktop (topbar): <a> aj <button>
  document.querySelectorAll('.topbar .nav__link').forEach((el) => {
    const target = extractTarget(el);
    el.classList.toggle('active', target === current);
  });

  // Mobile drawer: zvýrazni všetky <a> v zásuvke
  document.querySelectorAll('#mobileDrawer a[href]').forEach((el) => {
    const target = normalize(el.getAttribute('href'));
    el.classList.toggle('active', target === current);
  });
});
