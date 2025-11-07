// config/admins.js
const fs = require('fs');
const path = require('path');

const ADMINS = new Map();

try {
  const p = path.join(__dirname, './admins.config');
  const txt = fs.readFileSync(p, 'utf8');
  txt.split(/\r?\n/).forEach(raw => {
    const line = raw.replace(/#.*/,'').trim(); // strip comments
    if (!line) return;
    const [name, id] = line.split(':').map(s => s.trim());
    const idNum = Number(id);
    if (name && Number.isInteger(idNum)) {
      ADMINS.set(name.toLowerCase(), idNum);
    }
  });
} catch {}

module.exports = { ADMINS };
