// config/whitelist_sync.js
const fs = require('fs');
const path = require('path');
const db = require('../database/db');

function readVisitorsConfig() {
    const file = path.join(__dirname, 'visitors.config');

    if (!fs.existsSync(file)) return [];

    const raw = fs.readFileSync(file, 'utf8')
        .split('\n')
        .map(x => x.trim())
        .filter(x => x.length > 0);

    return raw;
}

function syncWhitelist() {
    const allowedUsers = new Set(readVisitorsConfig());

    db.all(`SELECT id, username, allowed FROM whitelist_users`, [], (err, rows) => {
        if (err) {
            console.error('[WHITELIST SYNC] DB error:', err);
            return;
        }

        rows.forEach(row => {
            const shouldBeAllowed = allowedUsers.has(row.username) ? 1 : 0;

            if (row.allowed !== shouldBeAllowed) {
                db.run(
                    `UPDATE whitelist_users SET allowed=? WHERE id=?`,
                    [shouldBeAllowed, row.id],
                    (err2) => {
                        if (err2) {
                            console.error(`[WHITELIST SYNC] Failed to update ${row.username}`, err2);
                        } else {
                            console.log(`[WHITELIST SYNC] ${row.username} → allowed=${shouldBeAllowed}`);
                        }
                    }
                );
            }
        });
    });
}

function startSync(intervalMs = 5000) {
    console.log('[WHITELIST SYNC] Started.');
    syncWhitelist();
    setInterval(syncWhitelist, intervalMs);
}

module.exports = { startSync };
