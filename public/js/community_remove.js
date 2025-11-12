// public/js/community_remove.js
// Admin-only Remove Thread button handler.
// - Requires server DELETE /api/community/thread/:id (admin-only on server)
// - List container has id="threadList" (as in community.js)
// - Buttons should initially have class="remove-thread adm-hidden" in templates
// - This script reveals/handles them for admins and attaches a single delegated click handler.

(function () {
  function $(sel, root=document){ return root.querySelector(sel); }
  function $$(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  let isAdmin = false;
  let bootstrapped = false;

  async function getSession() {
    try {
      // Prefer /api/me (already exposed and cheap)
      const r = await fetch('/api/me', { credentials: 'include' });
      const j = await r.json();
      if (j && j.ok && j.user && j.user.role === 'admin') return true;
      return false;
    } catch {
      return false;
    }
  }

  function findThreadId(el) {
    if (!el) return null;
    const id = el.getAttribute('data-id') || el.getAttribute('data-thread-id');
    return id && /^\d+$/.test(id) ? id : null;
  }

  function revealAdminButtons(root) {
    if (!isAdmin) return;
    $$('.remove-thread.adm-hidden', root || document).forEach(btn => btn.classList.remove('adm-hidden'));
  }

  // Delegated click handler (one time bind)
  function attachDelegatedHandler() {
    if (bootstrapped) return;
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.remove-thread');
      if (!btn) return;

      if (!isAdmin) {
        // Even if the button is visible due to CSS mistake, server will still block.
        e.preventDefault();
        return;
      }

      const card = btn.closest('[data-id],[data-thread-id]');
      const id = findThreadId(card);
      if (!id) return;

      e.stopPropagation();
      if (!confirm('Delete this thread permanently? This cannot be undone.')) return;

      try {
        const r = await fetch('/api/community/thread/' + encodeURIComponent(id), {
          method: 'DELETE',
          credentials: 'include'
        });
        if (!r.ok) {
          const t = await r.text().catch(()=>'');
          alert('Delete failed: ' + t);
          return;
        }
        const j = await r.json().catch(()=>({ ok:false }));
        if (!j.ok) {
          alert('Delete failed.');
          return;
        }
        // If we're on detail page, redirect back to list
        if (location.pathname.startsWith('/community/')) {
          location.href = '/community';
          return;
        }
        // Otherwise remove card from DOM (list view)
        card?.remove();
        // Optional: show empty state if list is empty
        const list = $('#threadList');
        const empty = $('#emptyState');
        if (list && empty && list.children.length === 0) empty.hidden = false;
      } catch {
        alert('Network error.');
      }
    });
    bootstrapped = true;
  }

  function observeListMutations() {
    const list = $('#threadList');
    if (!list) return;
    const mo = new MutationObserver(() => {
      // New items landed -> reveal their buttons for admins
      revealAdminButtons(list);
    });
    mo.observe(list, { childList: true, subtree: true });
  }

  // Boot
  document.addEventListener('DOMContentLoaded', async () => {
    isAdmin = await getSession();
    attachDelegatedHandler();
    revealAdminButtons(document);
    observeListMutations();
  });
})();
