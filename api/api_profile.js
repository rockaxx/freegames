const express = require('express');
const { ADMINS } = require('../config/admins');
const router = express.Router();
const {
  getUserByName, getUserById, getProfileByUserId,
  setProfileBio, addExtra, delExtra, setAvatar,
  repProfile, listProfileComments, addProfileComment
} = require('../database/community_db');

// require auth
function requireUser(req, res, next){
  if (!req.user) return res.status(401).json({ ok:false, error:'not logged in' });
  next();
}

// helpers
async function meUser(req){ return req.user ? req.user : null; }

function requireUser(req, res, next){
  if (!req.user) return res.status(401).json({ ok:false, error:'not logged in' });
  next();
}

function isAdminUser(username, id) {
  const wanted = ADMINS.get(String(username || '').toLowerCase());
  return Number(wanted) === Number(id);
}

router.get('/api/profile/me', requireUser, async (req,res)=>{
  const u = await getUserById(req.user.id);
  if (!u) return res.status(404).json({ ok:false, error:'not-found' });
  const pf = await getProfileByUserId(u.id, u.id);
  res.json({
    ok:true,
    profile: {
      userId: u.id,
      username: u.username,
      created_at: u.created_at,
      role: isAdminUser(u.username, u.id) ? 'admin' : 'member',
      ...pf
    }
  });
});

router.get('/api/profile/:username', async (req,res)=>{
  const u = await getUserByName(req.params.username);
  if (!u) return res.status(404).json({ ok:false, error:'not-found' });
  const viewer = req.user ? req.user.id : -1;
  const pf = await getProfileByUserId(u.id, viewer);
  res.json({
    ok:true,
    profile: {
      username: u.username,
      created_at: u.created_at,
      userId: u.id,
      role: isAdminUser(u.username, u.id) ? 'admin' : 'member',
      ...pf
    }
  });
});
// POST /api/profile/bio { bio }
router.post('/api/profile/bio', requireUser, async (req,res)=>{
  const bio = String(req.body?.bio || '').slice(0, 2000);
  await setProfileBio(req.user.id, bio);
  res.json({ ok:true });
});

// POST /api/profile/extra { text }
router.post('/api/profile/extra', requireUser, async (req,res)=>{
  const text = String(req.body?.text || '').slice(0, 200);
  const arr = await addExtra(req.user.id, text);
  res.json({ ok:true, extras: arr });
});

// DELETE /api/profile/extra { idx }
router.delete('/api/profile/extra', requireUser, async (req,res)=>{
  const idx = Number(req.body?.idx ?? -1);
  const arr = await delExtra(req.user.id, idx);
  res.json({ ok:true, extras: arr });
});

// POST /api/profile/avatar { dataUrl }
router.post('/api/profile/avatar', requireUser, async (req,res)=>{
  const dataUrl = String(req.body?.dataUrl || '');
  if (!/^data:image\//.test(dataUrl)) return res.status(400).json({ ok:false, error:'bad-image' });
  const saved = await setAvatar(req.user.id, dataUrl);
  res.json({ ok:true, avatar: saved });
});

// POST /api/profile/rep { username, delta }
router.post('/api/profile/rep', requireUser, async (req,res)=>{
  const username = String(req.body?.username || '');
  const delta = Number(req.body?.delta || 0);
  if (![1,-1].includes(delta)) return res.status(400).json({ ok:false, error:'bad-delta' });
  const r = await repProfile(req.user.id, username, delta);
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok:true, score: r.score });
});

// GET /api/profile/:username/comments
router.get('/api/profile/:username/comments', async (req,res)=>{
  const list = await listProfileComments(req.params.username);
  res.json({ ok:true, comments: list });
});

// POST /api/profile/:username/comments { body }
router.post('/api/profile/:username/comments', requireUser, async (req,res)=>{
  const body = String(req.body?.body || '').slice(0, 2000);
  const list = await addProfileComment(req.user.id, req.params.username, body);
  res.json({ ok:true, comments: list });
});

router.get('/api/profile/id/:id', async (req, res) => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ ok:false, error:'bad-id' });
  const u = await getUserById(id);
  if (!u) return res.status(404).json({ ok:false, error:'not-found' });
  const viewer = req.user ? req.user.id : -1;
  const pf = await getProfileByUserId(u.id, viewer);
  res.json({
    ok:true,
    profile: {
      username: u.username,
      created_at: u.created_at,
      userId: u.id,
      role: isAdminUser(u.username, u.id) ? 'admin' : 'member',
      ...pf
    }
  });
});

module.exports = router;