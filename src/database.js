/**
 * @file database.js
 * @description Handles the SQLite database connection, schema initialization, and automated cleanup routines.
 */

const sqlite3 = require('sqlite3').verbose();

// Initialize the SQLite database connection.
// It will automatically create 'database.sqlite' in the root folder if it doesn't exist.
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

/**
 * Initializes the database schema.
 * Creates the 'posts' table which acts as the memory for the bot.
 * * Schema Details:
 * - id: Auto-incremented primary key.
 * - user_id: Discord ID of the user posting the campaign.
 * - message_id: Discord ID of the message (turns to 'DELETED' if the user uses the correction window).
 * - content: The actual text of the advertisement for future similarity comparisons.
 * - timestamp: Epoch time in milliseconds when the post was made.
 * - delete_count: Tracks how many times the user abused the correction window.
 */
function initDatabase() {
    // 1. Table for active posts (cleaned up every 48h)
    db.run(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        delete_count INTEGER DEFAULT 0
    )`, (err) => {
        if (err) console.error('Error creating posts table:', err.message);
        else console.log('Table "posts" is ready for use.');
    });

    // 2. Table for permanent infraction tracking
    db.run(`CREATE TABLE IF NOT EXISTS user_infractions (
        user_id TEXT PRIMARY KEY,
        infraction_count INTEGER DEFAULT 0
    )`, (err) => {
        if (err) console.error('Error creating infractions table:', err.message);
        else console.log('Table "user_infractions" is ready for use.');
    });
}

/**
 * Automated Database Maintenance.
 * Periodically deletes old campaign records to prevent the database from growing indefinitely.
 * * @param {number} cooldownHours - The dynamic time limit (in hours) configured in index.js.
 * Any record older than this limit will be permanently deleted from the database.
 */
function startCleanup(cooldownHours) {
    function cleanOldRecords() {
        // Calculate the exact timestamp threshold in milliseconds
        const cooldownMs = Date.now() - (cooldownHours * 60 * 60 * 1000);

        db.run(`DELETE FROM posts WHERE timestamp < ?`, [cooldownMs], function(err) {
            if (err) console.error('Error cleaning up old records:', err.message);
            // this.changes returns the number of rows deleted by the query
            else if (this.changes > 0) console.log(`Auto-cleanup: ${this.changes} old record(s) deleted.`);
        });
    }

    // Run the cleanup immediately on startup, then schedule it to run every 1 hour (3,600,000 ms)
    cleanOldRecords();
    setInterval(cleanOldRecords, 3600000);
}

/**
 * 1.1: Registers a new infraction for a user and returns their total count.
 * @param {string} userId - The Discord ID of the user.
 * @returns {Promise<number>} The updated total number of infractions.
 */
function registerInfraction(userId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT infraction_count FROM user_infractions WHERE user_id = ?`, [userId], (err, row) => {
            if (err) return reject(err);
            
            if (row) {
                // User exists, increment their count
                const newCount = row.infraction_count + 1;
                db.run(`UPDATE user_infractions SET infraction_count = ? WHERE user_id = ?`, [newCount, userId], (err) => {
                    if (err) reject(err);
                    else resolve(newCount);
                });
            } else {
                // First time offender
                db.run(`INSERT INTO user_infractions (user_id, infraction_count) VALUES (?, 1)`, [userId], (err) => {
                    if (err) reject(err);
                    else resolve(1);
                });
            }
        });
    });
}

initDatabase();

// Export the new registerInfraction function as well
module.exports = { db, startCleanup, registerInfraction };