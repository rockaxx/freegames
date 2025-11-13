// api/api_community.js
const express = require('express');
const router = express.Router();

const { ensureAuth } = require('../middleware/auth_middleware');
const {
  createThread,
  listThreads,
  voteThread,
  createComment,
  listComments,
  repGame,
  getGameRep,
  getThreadById,
  deleteThreadWithChildren
} = require('../database/community_db');

/**
 * Server-side admin check. Never trust client UI.
 * Expects req.user.role = 'admin' to be set by your auth layer.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  next();
}

/* ---------- COMMUNITY: read single thread ---------- */
router.get('/api/community/thread/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!id) return res.status(400).json({ ok: false, error: 'bad-id' });
    const uid = req.user ? req.user.id : null;
    const thread = await getThreadById(id, uid);
    if (!thread) return res.status(404).json({ ok: false });
    return res.json({ ok: true, thread });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

/* ---------- COMMUNITY: list ---------- */
router.get('/api/community/threads', async (req, res) => {
  try {
    const category = (req.query.category || 'all').trim();
    const q = (req.query.q || '').trim();
    const sort = (req.query.sort || 'new').trim();
    const { rows, topGames } = await listThreads({ category, q, sort });
    return res.json({ ok: true, threads: rows, topGames });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

/* ---------- COMMUNITY: create thread ---------- */
router.post('/api/community/thread', ensureAuth, async (req, res) => {
  try {
    const { title, body, category, gameTitle, gameKey } = req.body || {};
    if (!title || !body || !category) {
      return res.status(400).json({ ok: false, error: 'missing-fields' });
    }
    const id = await createThread({
      userId: req.user.id,
      title: String(title).trim(),
      body: String(body).trim(),
      category: String(category).trim(),
      gameKey: (gameKey || '').trim() || null,
      gameTitle: (gameTitle || '').trim() || null
    });
    return res.json({ ok: true, id });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

/* ---------- COMMUNITY: vote thread ---------- */
router.post('/api/community/vote', ensureAuth, async (req, res) => {
  try {
    const { threadId, delta } = req.body || {};
    const d = +delta === -1 ? -1 : 1;
    const r = await voteThread({
      userId: req.user.id,
      threadId: +threadId,
      delta: d
    });
    if (r && r.locked) {
      return res
        .status(409)
        .json({ ok: false, error: 'locked', value: r.value });
    }
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

/* ---------- COMMUNITY: comments ---------- */
router.get('/api/community/comments', async (req, res) => {
  try {
    const threadId = +req.query.threadId;
    if (!threadId) return res.status(400).json({ ok: false });
    const comments = await listComments(threadId);
    return res.json({ ok: true, comments });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

router.post('/api/community/comment', ensureAuth, async (req, res) => {
  try {
    const { threadId, body } = req.body || {};
    if (!threadId || !body) return res.status(400).json({ ok: false });
    await createComment({
      userId: req.user.id,
      threadId: +threadId,
      body: String(body).trim()
    });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

/* ---------- GAME REP ---------- */
router.post('/api/game/rep', ensureAuth, async (req, res) => {
  try {
    const { gameKey, delta, gameTitle } = req.body || {};
    if (!gameKey || !delta) return res.status(400).json({ ok: false });
    const d = +delta === -1 ? -1 : 1;
    const r = await repGame({
      userId: req.user.id,
      gameKey: String(gameKey).trim(),
      gameTitle: (gameTitle || '').trim(),
      delta: d
    });
    if (r && r.locked) {
      return res
        .status(409)
        .json({ ok: false, error: 'locked', value: r.value });
    }
    const score = await getGameRep(String(gameKey).trim());
    return res.json({ ok: true, score });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

router.get('/api/game/rep/:gameKey', async (req, res) => {
  try {
    const score = await getGameRep(String(req.params.gameKey || '').trim());
    return res.json({ ok: true, score });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

/* ---------- ADMIN: hard delete thread (+ children) ---------- */
router.delete(
  '/api/community/thread/:id',
  ensureAuth,
  requireAdmin,
  async (req, res) => {
    const id = +req.params.id;
    if (!id)
      return res.status(400).json({ ok: false, error: 'bad-id' });

    try {
      const deleted = await deleteThreadWithChildren(id);
      return res.json({ ok: true, deleted });
    } catch (err) {
      console.error('[DELETE thread] failed:', err);
      return res
        .status(500)
        .json({ ok: false, error: 'delete-failed' });
    }
  }
);

module.exports = router;
