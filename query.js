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
module.exports = { createUser, getUser };