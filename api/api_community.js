// api_community.js
const express = require('express');
const router = express.Router();

const { ensureAuth } = require('../middleware/auth_middleware');
const {
  createThread, listThreads, voteThread,
  createComment, listComments,
  repGame, getGameRep, getThreadById 
} = require('../database/community_db');

router.get('/api/community/thread/:id', async (req,res)=>{
  try{
    const id = +req.params.id;
    if(!id) return res.status(400).json({ ok:false });
    const uid = req.user ? req.user.id : null;
    const thread = await getThreadById(id, uid);
    if(!thread) return res.status(404).json({ ok:false });
    return res.json({ ok:true, thread });
  } catch(e){ return res.status(500).json({ ok:false }); }
});

// COMMUNITY API
router.get('/api/community/threads', async (req,res)=>{
  try{
    const category = (req.query.category||'all').trim();
    const q = (req.query.q||'').trim();
    const sort = (req.query.sort||'new').trim();
    const { rows, topGames } = await listThreads({ category, q, sort });
    return res.json({ ok:true, threads: rows, topGames });
  } catch(e){ return res.status(500).json({ ok:false }); }
});

router.post('/api/community/thread', ensureAuth, async (req,res)=>{
  try{
    const { title, body, category, gameTitle, gameKey } = req.body||{};
    if(!title || !body || !category) return res.status(400).json({ ok:false, error:'missing fields' });
    const id = await createThread({
      userId: req.user.id,
      title: title.trim(),
      body: body.trim(),
      category: category.trim(),
      gameKey: (gameKey||'').trim() || null,
      gameTitle: (gameTitle||'').trim() || null
    });
    return res.json({ ok:true, id });
  } catch(e){ return res.status(500).json({ ok:false }); }
});

// /api/community/vote
router.post('/api/community/vote', ensureAuth, async (req,res)=>{
  try{
    const { threadId, delta } = req.body||{};
    const d = (+delta === -1) ? -1 : 1;
    const r = await voteThread({ userId: req.user.id, threadId:+threadId, delta:d });
    if (r && r.locked) return res.status(409).json({ ok:false, error:'locked', value:r.value });
    return res.json({ ok:true });
  } catch(e){ return res.status(500).json({ ok:false }); }
});

router.get('/api/community/comments', async (req,res)=>{
  try{
    const threadId = +req.query.threadId;
    if(!threadId) return res.status(400).json({ ok:false });
    const comments = await listComments(threadId);
    return res.json({ ok:true, comments });
  } catch(e){ return res.status(500).json({ ok:false }); }
});

router.post('/api/community/comment', ensureAuth, async (req,res)=>{
  try{
    const { threadId, body } = req.body||{};
    if(!threadId || !body) return res.status(400).json({ ok:false });
    await createComment({ userId:req.user.id, threadId:+threadId, body:body.trim() });
    return res.json({ ok:true });
  } catch(e){ return res.status(500).json({ ok:false }); }
});

// /api/game/rep
router.post('/api/game/rep', ensureAuth, async (req,res)=>{
  try{
    const { gameKey, delta, gameTitle } = req.body||{};
    if(!gameKey || !delta) return res.status(400).json({ ok:false });
    const d = (+delta === -1) ? -1 : 1;
    const r = await repGame({ userId:req.user.id, gameKey:gameKey.trim(), gameTitle:(gameTitle||'').trim(), delta:d });
    if (r && r.locked) return res.status(409).json({ ok:false, error:'locked', value:r.value });
    const score = await getGameRep(gameKey.trim());
    return res.json({ ok:true, score });
  } catch(e){ return res.status(500).json({ ok:false }); }
});

router.get('/api/game/rep/:gameKey', async (req,res)=>{
  try{
    const score = await getGameRep(req.params.gameKey.trim());
    return res.json({ ok:true, score });
  } catch(e){ return res.status(500).json({ ok:false }); }
});



module.exports = router;
