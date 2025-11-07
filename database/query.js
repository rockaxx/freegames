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

module.exports = {
  createUser,
  getUser,
  // new:
  getUserById,
  usernameTaken,
  emailTaken,
  updateUserUsernameEmail,
  updateUserPassword
};
