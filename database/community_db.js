const db = require('./db'); // reuse the SAME sqlite connection/file
const sqlite3 = require('sqlite3').verbose();

// Promisified helpers over the shared db
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function initCommunityTables() {
  // threads
  await run(`CREATE TABLE IF NOT EXISTS threads(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL,
    game_key TEXT,
    game_title TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`);
  // votes for threads
  await run(`CREATE TABLE IF NOT EXISTS thread_votes(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    value INTEGER NOT NULL CHECK (value IN (-1, 1)),
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(thread_id, user_id)
  );`);
  // comments
  await run(`CREATE TABLE IF NOT EXISTS comments(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`);
  // game reputation (per-user vote)
  await run(`CREATE TABLE IF NOT EXISTS game_rep(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_key TEXT NOT NULL,
    game_title TEXT,
    user_id INTEGER NOT NULL,
    value INTEGER NOT NULL CHECK (value IN (-1, 1)),
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(game_key, user_id)
  );`);
}

async function createThread({ userId, title, body, category, gameKey, gameTitle }) {
  const r = await run(
    `INSERT INTO threads(user_id, title, body, category, game_key, game_title) VALUES(?,?,?,?,?,?)`,
    [userId, title, body, category, gameKey || null, gameTitle || null]
  );
  return r.lastID;
}

async function listThreads({ category = 'all', q = '', sort = 'new' }) {
  const where = [];
  const params = [];

  if (category && category !== 'all') {
    where.push(`t.category = ?`);
    params.push(category);
  }
  if (q) {
    where.push(`(t.title LIKE ? OR t.body LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`);
  }
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';

  // No myVote join here (list is anonymous). myVote riešime v detaile, kde máme userId.
  const rows = await all(
    `
    SELECT
      t.*,
      COALESCE(tv.score,0)                 AS score,
      COALESCE(cm.cnt,0)                   AS comments_count,
      COALESCE(gr.score,0)                 AS game_rep_score,
      NULL                                 AS myVote,
      COALESCE(u.username,'Anonymous')     AS author
    FROM threads t
    LEFT JOIN (SELECT thread_id, SUM(value) AS score FROM thread_votes GROUP BY thread_id) tv
      ON tv.thread_id = t.id
    LEFT JOIN (SELECT thread_id, COUNT(*) AS cnt FROM comments GROUP BY thread_id) cm
      ON cm.thread_id = t.id
    LEFT JOIN (SELECT game_key, SUM(value) AS score FROM game_rep GROUP BY game_key) gr
      ON gr.game_key = t.game_key
    LEFT JOIN users u
      ON u.id = t.user_id
    ${W}
  `,
    params
  );

  if (sort === 'top') {
    rows.sort((a, b) => (b.score | 0) - (a.score | 0));
  } else if (sort === 'hot') {
    rows.sort(
      (a, b) =>
        (b.score | 0) * 0.7 + new Date(b.created_at).getTime() -
        ((a.score | 0) * 0.7 + new Date(a.created_at).getTime())
    );
  } else {
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  const topGames = await all(`
    SELECT game_key, MAX(game_title) AS game_title, SUM(value) AS score
    FROM game_rep
    WHERE game_key IS NOT NULL AND TRIM(game_key) <> ''
    GROUP BY game_key
    ORDER BY score DESC
    LIMIT 10
  `);

  return { rows, topGames };
}

async function voteThread({ userId, threadId, delta }) {
  // write-once semantics
  const existing = await get(
    `SELECT value FROM thread_votes WHERE thread_id=? AND user_id=?`,
    [threadId, userId]
  );
  if (existing) {
    return { ok: false, locked: true, value: existing.value };
  }
  await run(
    `INSERT INTO thread_votes(thread_id,user_id,value) VALUES(?,?,?)`,
    [threadId, userId, delta]
  );
  return { ok: true };
}

async function createComment({ userId, threadId, body }) {
  await run(
    `INSERT INTO comments(thread_id,user_id,body) VALUES(?,?,?)`,
    [threadId, userId, body]
  );
}

async function listComments(threadId) {
  const rows = await all(
    `
    SELECT
        c.*,
        COALESCE(u.username,'Anonymous') AS author
    FROM comments c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.thread_id = ?
    ORDER BY c.created_at ASC
    `,
    [threadId]
  );
  return rows;
}

async function repGame({ userId, gameKey, gameTitle, delta }) {
  // write-once semantics
  const ex = await get(
    `SELECT value FROM game_rep WHERE game_key=? AND user_id=?`,
    [gameKey, userId]
  );
  if (ex) {
    return { ok: false, locked: true, value: ex.value };
  }
  await run(
    `INSERT INTO game_rep(game_key, game_title, user_id, value) VALUES(?,?,?,?)`,
    [gameKey, gameTitle || null, userId, delta]
  );
  return { ok: true };
}

async function getGameRep(gameKey) {
  const r = await get(
    `SELECT SUM(value) AS score FROM game_rep WHERE game_key=?`,
    [gameKey]
  );
  return r?.score || 0;
}

async function getThreadById(threadId, userId = null) {
  const row = await all(
    `
    SELECT
        t.*,
        COALESCE(tv.score,0)      AS score,
        COALESCE(cm.cnt,0)        AS comments_count,
        COALESCE(gr.score,0)      AS game_rep_score,
        mv.value                  AS myVote,
        mr.value                  AS myRep,
        COALESCE(u.username,'Anonymous') AS author
    FROM threads t
    LEFT JOIN (SELECT thread_id, SUM(value) AS score FROM thread_votes GROUP BY thread_id) tv
        ON tv.thread_id = t.id
    LEFT JOIN (SELECT thread_id, COUNT(*) AS cnt FROM comments GROUP BY thread_id) cm
        ON cm.thread_id = t.id
    LEFT JOIN (SELECT game_key, SUM(value) AS score FROM game_rep GROUP BY game_key) gr
        ON gr.game_key = t.game_key
    LEFT JOIN thread_votes mv
        ON mv.thread_id = t.id AND mv.user_id = ?
    LEFT JOIN game_rep mr
        ON mr.game_key = t.game_key AND mr.user_id = ?
    LEFT JOIN users u
        ON u.id = t.user_id
    WHERE t.id = ?
    LIMIT 1
    `,
    [userId || -1, userId || -1, threadId]
  );

  const result = row && row[0];
  if (!result) return null;
  return result;
}

/**
 * Hard delete of a thread + its comments + votes in one transaction.
 */
async function deleteThreadWithChildren(threadId) {
  if (!threadId) return 0;

  // First get the game_key of the deleted thread
  const row = await get(`SELECT game_key FROM threads WHERE id = ?`, [threadId]);
  const gameKey = row?.game_key || null;

  await run('BEGIN');
  try {
    await run(`DELETE FROM comments WHERE thread_id = ?`, [threadId]);
    await run(`DELETE FROM thread_votes WHERE thread_id = ?`, [threadId]);

    // Also remove game_rep entries belonging to that game's key
    if (gameKey) {
      await run(`DELETE FROM game_rep WHERE game_key = ?`, [gameKey]);
    }

    const r = await run(`DELETE FROM threads WHERE id = ?`, [threadId]);

    await run('COMMIT');
    return r.changes || 0;
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}


// ===== Library (DB) =====

// Key must match frontend's fav_key logic.
function favKeyServer(it) {
  const href = String(it.href || it.link || it.detail || '').toLowerCase();
  const title = String(it.title || '').toLowerCase();
  const src = String(it.src || '').toLowerCase();
  return href || `${title}|${src}`;
}

async function initLibraryTables() {
  await run(`CREATE TABLE IF NOT EXISTS library_items(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    payload TEXT NOT NULL,               -- JSON of sanitized favourite
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, key)
  )`);
}

async function listLibraryItems(userId) {
  const rows = await all(
    `SELECT key, payload, created_at FROM library_items WHERE user_id=? ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map((r) => {
    let obj = {};
    try {
      obj = JSON.parse(r.payload);
    } catch {}
    return { ...obj, __key: r.key, __created_at: r.created_at };
  });
}

async function addLibraryItem(userId, item) {
  const key = favKeyServer(item);
  const payload = JSON.stringify(item);
  await run(
    `INSERT OR IGNORE INTO library_items(user_id,key,payload) VALUES(?,?,?)`,
    [userId, key, payload]
  );
  // If already existed, refresh payload (optional)
  await run(
    `UPDATE library_items SET payload=? WHERE user_id=? AND key=?`,
    [payload, userId, key]
  );
  return { key };
}

async function removeLibraryItem(userId, key) {
  await run(
    `DELETE FROM library_items WHERE user_id=? AND key=?`,
    [userId, key]
  );
}

async function toggleLibraryItem(userId, item) {
  const key = favKeyServer(item);
  const row = await get(
    `SELECT id FROM library_items WHERE user_id=? AND key=?`,
    [userId, key]
  );
  if (row) {
    await removeLibraryItem(userId, key);
    return { inLibrary: false, key };
  } else {
    await addLibraryItem(userId, item);
    return { inLibrary: true, key };
  }
}

async function importLibraryItems(userId, items = []) {
  for (const it of items) {
    const key = favKeyServer(it);
    await run(
      `INSERT OR IGNORE INTO library_items(user_id,key,payload) VALUES(?,?,?)`,
      [userId, key, JSON.stringify(it)]
    );
  }
  return { imported: items.length };
}

// Hook library init into community init
const _initCommunityTables_orig = initCommunityTables;
initCommunityTables = async function patchedInitAll() {
  await _initCommunityTables_orig();
  await initLibraryTables();
};

// ===== Profiles =====

async function initProfileTables() {
  // base profile (bio + avatar)
  await run(`CREATE TABLE IF NOT EXISTS profiles(
    user_id INTEGER PRIMARY KEY,
    bio TEXT,
    avatar TEXT,
    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`);

  // extra short info lines on profile
  await run(`CREATE TABLE IF NOT EXISTS profile_extras(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`);

  // profile reputation (per voter)
  await run(`CREATE TABLE IF NOT EXISTS profile_rep(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,   -- profile owner
    voter_id INTEGER NOT NULL,  -- who voted
    value INTEGER NOT NULL CHECK (value IN (-1, 1)),
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, voter_id)
  );`);

  // comments under profile
  await run(`CREATE TABLE IF NOT EXISTS profile_comments(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_user_id INTEGER NOT NULL, -- profile owner
    author_user_id INTEGER NOT NULL,  -- commenter
    body TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`);
}

// make sure profile tables also init
const _initCommunityTables_orig2 = initCommunityTables;
initCommunityTables = async function initAllWithProfiles() {
  await _initCommunityTables_orig2();
  await initLibraryTables?.(); // if present
  await initProfileTables();
};

// Basic user lookup by username (needed by API)
async function getUserByName(username) {
  return await get(
    `SELECT id, username, email FROM users WHERE username = ? LIMIT 1`,
    [username]
  );
}

// Read a full profile with aggregates
async function getProfileByUserId(userId, viewerId = -1) {
  const base = await get(
    `SELECT user_id, bio, avatar FROM profiles WHERE user_id=?`,
    [userId]
  );
  const extras = await all(
    `SELECT id, text, created_at FROM profile_extras WHERE user_id=? ORDER BY id ASC`,
    [userId]
  );
  const rep = await get(
    `SELECT COALESCE(SUM(value),0) AS score FROM profile_rep WHERE user_id=?`,
    [userId]
  );
  const my =
    viewerId && viewerId > 0
      ? await get(
          `SELECT value FROM profile_rep WHERE user_id=? AND voter_id=?`,
          [userId, viewerId]
        )
      : null;

  return {
    user_id: userId,
    bio: base?.bio || '',
    avatar: base?.avatar || '',
    extras,
    repScore: rep?.score || 0,
    myRep: my?.value || 0
  };
}

async function setProfileBio(userId, bio) {
  await run(
    `INSERT INTO profiles(user_id,bio,avatar,updated_at)
     VALUES(?,?,NULL,datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio, updated_at=excluded.updated_at`,
    [userId, bio]
  );
}

async function setAvatar(userId, dataUrl) {
  await run(
    `INSERT INTO profiles(user_id,bio,avatar,updated_at)
     VALUES(?,?,?,datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET avatar=excluded.avatar, updated_at=excluded.updated_at`,
    [userId, '', dataUrl]
  );
  // return saved avatar to API
  const row = await get(
    `SELECT avatar FROM profiles WHERE user_id=?`,
    [userId]
  );
  return row?.avatar || '';
}

async function addExtra(userId, text) {
  await run(
    `INSERT INTO profile_extras(user_id,text) VALUES(?,?)`,
    [userId, text]
  );
  return await all(
    `SELECT id, text, created_at FROM profile_extras WHERE user_id=? ORDER BY id ASC`,
    [userId]
  );
}

async function delExtra(userId, idx) {
  // idx is 0-based in UI, map to actual row by order
  const rows = await all(
    `SELECT id FROM profile_extras WHERE user_id=? ORDER BY id ASC`,
    [userId]
  );
  const row = rows[idx];
  if (row)
    await run(
      `DELETE FROM profile_extras WHERE id=? AND user_id=?`,
      [row.id, userId]
    );
  return await all(
    `SELECT id, text, created_at FROM profile_extras WHERE user_id=? ORDER BY id ASC`,
    [userId]
  );
}

async function repProfile(voterId, username, delta) {
  const u = await getUserByName(username);
  if (!u) return { ok: false, error: 'user-not-found' };
  if (u.id === voterId) return { ok: false, error: 'self-vote' };

  // upsert-like: replace existing or insert
  await run(
    `INSERT INTO profile_rep(user_id, voter_id, value)
     VALUES(?,?,?)
     ON CONFLICT(user_id, voter_id) DO UPDATE SET value=excluded.value`,
    [u.id, voterId, delta]
  );
  const r = await get(
    `SELECT COALESCE(SUM(value),0) AS score FROM profile_rep WHERE user_id=?`,
    [u.id]
  );
  return { ok: true, score: r?.score || 0 };
}

async function listProfileComments(username) {
  const u = await getUserByName(username);
  if (!u) return [];
  return await all(
    `
    SELECT c.id, c.body, c.created_at,
           COALESCE(a.username,'Anonymous') AS author
    FROM profile_comments c
    LEFT JOIN users a ON a.id = c.author_user_id
    WHERE c.profile_user_id=?
    ORDER BY c.id DESC
  `,
    [u.id]
  );
}

async function addProfileComment(authorId, username, body) {
  const u = await getUserByName(username);
  if (!u) return [];
  await run(
    `INSERT INTO profile_comments(profile_user_id,author_user_id,body) VALUES(?,?,?)`,
    [u.id, authorId, body]
  );
  return await listProfileComments(username);
}

async function getUserById(id) {
  return await get(
    `SELECT id, username, email, created_at FROM users WHERE id=?`,
    [id]
  );
}

module.exports = {
  initCommunityTables,
  createThread,
  listThreads,
  voteThread,
  createComment,
  listComments,
  repGame,
  getGameRep,
  getThreadById,
  deleteThreadWithChildren,
  listLibraryItems,
  addLibraryItem,
  removeLibraryItem,
  toggleLibraryItem,
  importLibraryItems,
  getUserByName,
  getUserById,
  getProfileByUserId,
  setProfileBio,
  addExtra,
  delExtra,
  setAvatar,
  repProfile,
  listProfileComments,
  addProfileComment
};
