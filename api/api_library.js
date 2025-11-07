// api/api_library.js
const express = require('express');
const router = express.Router();

const {
  listLibraryItems,
  addLibraryItem,
  removeLibraryItem,
  toggleLibraryItem,
  importLibraryItems,
} = require('../database/community_db'); // <-- correct relative path

// Require auth
function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'not logged in' });
  next();
}

// GET /api/library -> all items for current user
router.get('/api/library', requireUser, async (req, res) => {
  const items = await listLibraryItems(req.user.id);
  res.json({ ok: true, items });
});

// POST /api/library/add { item }
router.post('/api/library/add', requireUser, async (req, res) => {
  const item = req.body?.item;
  if (!item || typeof item !== 'object') return res.status(400).json({ ok: false, error: 'bad item' });
  const { key } = await addLibraryItem(req.user.id, item);
  res.json({ ok: true, key });
});

// POST /api/library/toggle { item }
router.post('/api/library/toggle', requireUser, async (req, res) => {
  const item = req.body?.item;
  if (!item || typeof item !== 'object') return res.status(400).json({ ok: false, error: 'bad item' });
  const r = await toggleLibraryItem(req.user.id, item);
  res.json({ ok: true, ...r }); // <-- fixed
});

// DELETE /api/library/:key
router.delete('/api/library/:key', requireUser, async (req, res) => {
  const key = String(req.params.key || '');
  if (!key) return res.status(400).json({ ok: false, error: 'missing key' });
  await removeLibraryItem(req.user.id, key);
  res.json({ ok: true });
});

// POST /api/library/import { items: [...] }
router.post('/api/library/import', requireUser, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const r = await importLibraryItems(req.user.id, items);
  res.json({ ok: true, ...r });
});

module.exports = router;
