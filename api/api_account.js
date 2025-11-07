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

// auth guard
function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ ok:false, error:'not logged in' });
  next();
}

/**
 * POST /api/account/update
 * Body: { username, email, currPass?, newPass? }
 * - zmení username/email
 * - ak je newPass, vyžaduje currPass (overí scrypt a uloží nový salt:hash)
 * - obnoví session cookie (sid) s novým menom/emailom
 */

router.post('/api/account/update', requireUser, async (req, res) => {
  console.log('BODY:', req.body);
  try {
    const id = req.user.id;
    let { username, currPass, newPass } = req.body || {};

    username = String(username || '').trim();

    if (!username) {
      return res.status(400).json({ ok:false, error:'username-required' });
    }

    // načítaj usera
    const me = await getUserById(id);
    if (!me) return res.status(404).json({ ok:false, error:'not-found' });

    // username uniqueness
    if (me.username !== username) {
      if (await usernameTaken(username, id)) {
        return res.status(409).json({ ok:false, error:'username-taken' });
      }
    }

    // password change?
    if (newPass) {
      if (!currPass) return res.status(400).json({ ok:false, error:'need-current-password' });

      const [saltHex, hashHex] = String(me.password || '').split(':');
      if (!saltHex || !hashHex) {
        return res.status(500).json({ ok:false, error:'bad-password-format' });
      }
      const salt = Buffer.from(saltHex, 'hex');
      const hash = Buffer.from(hashHex, 'hex');
      const test = scryptSync(currPass, salt, 64);
      if (!timingSafeEqual(hash, test)) {
        return res.status(400).json({ ok:false, error:'wrong-current-password' });
      }
      if (String(newPass).length < 2) {
        return res.status(400).json({ ok:false, error:'password-too-short' });
      }

      // store new
      const newSalt = randomBytes(16);
      const newHash = scryptSync(newPass, newSalt, 64);
      const stored = newSalt.toString('hex') + ':' + newHash.toString('hex');
      await updateUserPassword(id, stored);
    }

    // update username only
    if (me.username !== username) {
      await updateUserUsernameEmail(id, username, me.email); // email locked
    }

    // rebuild cookie
    const token = signToken({ id, username, email: me.email });
    const cookie = buildCookie('sid', token, {
      secure: IS_PROD,
      sameSite: 'Lax',
      maxAgeSec: 60 * 60 * 24 * 7
    });
    res.setHeader('Set-Cookie', cookie);

    return res.json({ ok:true, user: { id, username, email: me.email } });
  } catch (e) {
    console.error('ACCOUNT UPDATE FAIL:', e);
    return res.status(500).json({ ok:false, error:'update-failed' });
  }
});


module.exports = router;
