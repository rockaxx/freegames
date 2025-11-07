// /api/api_account.js
const express = require('express');
const router = express.Router();
const {
  getUserById,
  usernameTaken,
  emailTaken,
  updateUserUsernameEmail,
  updateUserPassword
} = require('../database/query');
const { signToken, buildCookie } = require('../auth');
const { scryptSync, randomBytes, timingSafeEqual } = require('crypto');

const IS_PROD = process.env.NODE_ENV === 'production';

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ ok:false, error:'not logged in' });
  next();
}

/**
 * POST /api/account/update
 * Accepts any subset of: { username?, email?, currPass?, newPass? }
 * - If username provided -> uniqueness check, update
 * - If email provided    -> uniqueness check, update
 * - If newPass provided  -> requires currPass, verify, update
 * At least one change must be requested.
 */
router.post('/api/account/update', requireUser, async (req, res) => {
  try {
    const id = req.user.id;
    let { username, email, currPass, newPass } = req.body || {};

    if (username != null) username = String(username).trim();
    if (email != null)    email    = String(email).trim();

    const me = await getUserById(id);
    if (!me) return res.status(404).json({ ok:false, error:'not-found' });

    let wantUser = typeof username === 'string' && username.length > 0 && username !== me.username;
    let wantMail = typeof email === 'string'    && email.length    > 0 && email.toLowerCase() !== me.email.toLowerCase();
    let wantPass = typeof newPass === 'string'  && newPass.length  > 0;

    if (!wantUser && !wantMail && !wantPass) {
      return res.status(400).json({ ok:false, error:'no-changes' });
    }

    // Username change
    if (wantUser) {
      if (await usernameTaken(username, id)) {
        return res.status(409).json({ ok:false, error:'username-taken' });
      }
    }

    // Email change
    if (wantMail) {
      if (await emailTaken(email, id)) {
        return res.status(409).json({ ok:false, error:'email-taken' });
      }
    }

    // Password change
    if (wantPass) {
      if (!currPass) return res.status(400).json({ ok:false, error:'need-current-password' });
      const [saltHex, hashHex] = String(me.password || '').split(':');
      if (!saltHex || !hashHex) return res.status(500).json({ ok:false, error:'bad-password-format' });

      const salt = Buffer.from(saltHex, 'hex');
      const hash = Buffer.from(hashHex, 'hex');
      const test = scryptSync(currPass, salt, 64);
      if (!timingSafeEqual(hash, test)) return res.status(400).json({ ok:false, error:'wrong-current-password' });
      if (String(newPass).length < 6) return res.status(400).json({ ok:false, error:'password-too-short' });

      const newSalt = randomBytes(16);
      const newHash = scryptSync(newPass, newSalt, 64);
      const stored = newSalt.toString('hex') + ':' + newHash.toString('hex');
      await updateUserPassword(id, stored);
    }

    // Username + Email update in one call (only if any changed)
    const finalUsername = wantUser ? username : me.username;
    const finalEmail    = wantMail ? email    : me.email;
    if (wantUser || wantMail) {
      await updateUserUsernameEmail(id, finalUsername, finalEmail);
    }

    // Refresh cookie
    const token = signToken({ id, username: finalUsername, email: finalEmail });
    const cookie = buildCookie('sid', token, {
      secure: IS_PROD,
      sameSite: 'Lax',
      maxAgeSec: 60 * 60 * 24 * 7
    });
    res.setHeader('Set-Cookie', cookie);

    return res.json({ ok:true, user: { id, username: finalUsername, email: finalEmail } });
  } catch (e) {
    console.error('ACCOUNT UPDATE FAIL:', e);
    return res.status(500).json({ ok:false, error:'update-failed' });
  }
});

module.exports = router;
