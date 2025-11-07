// /database/query.js
const db = require('./db');

function createUser(username, email, passwordHash) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (username,email,password) VALUES (?,?,?)`,
      [username, email, passwordHash],
      function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function getUser(username) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM users WHERE username=?`,
      [username],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

/* ==== NEW: helpers for account update ==== */
function getUserById(id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM users WHERE id=?`,
      [id],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

function usernameTaken(username, excludeId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id FROM users WHERE LOWER(username)=LOWER(?) AND id<>? LIMIT 1`,
      [username, excludeId],
      (err, row) => {
        if (err) return reject(err);
        resolve(!!row);
      }
    );
  });
}

function emailTaken(email, excludeId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND id<>? LIMIT 1`,
      [email, excludeId],
      (err, row) => {
        if (err) return reject(err);
        resolve(!!row);
      }
    );
  });
}

function updateUserUsernameEmail(id, username, email) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET username=?, email=? WHERE id=?`,
      [username, email, id],
      function(err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

function updateUserPassword(id, storedPassword) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET password=? WHERE id=?`,
      [storedPassword, id],
      function(err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

function createWhitelistUser(username, passwordHash) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO whitelist_users (username,password,allowed) VALUES (?,?,0)`,
      [username, passwordHash],
      function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function getWhitelistUser(username) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM whitelist_users WHERE username=?`,
      [username],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

function getPendingWhitelist() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, username, allowed, created_at FROM whitelist_users WHERE allowed=0 ORDER BY created_at DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function approveWhitelistUser(id) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE whitelist_users SET allowed=1 WHERE id=?`, [id], function(err) {
      if (err) return reject(err);
      resolve(this.changes > 0);
    });
  });
}



module.exports = {
  createUser,
  getUser,
  getUserById,
  usernameTaken,
  emailTaken,
  updateUserUsernameEmail,
  updateUserPassword,
  createWhitelistUser,
  getWhitelistUser,
  getPendingWhitelist,
  approveWhitelistUser
};
