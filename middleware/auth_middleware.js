// middleware/auth_middleware.js
// Minimal auth guard based on req.user set by your cookie parser.

function ensureAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'auth required' });
  next();
}

module.exports = { ensureAuth };
