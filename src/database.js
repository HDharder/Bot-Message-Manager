/**
 * @file database.js
 * @description Handles the SQLite database connection, schema initialization, and automated cleanup routines.
 * Designed to be lightweight and strictly adhere to cloud-hosting constraints (like Discloud).
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
    db.run(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        delete_count INTEGER DEFAULT 0
    )`, (err) => {
        if (err) {
            console.error('Error creating table:', err.message);
        } else {
            console.log('Table "posts" is ready for use.');
        }
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
            if (err) {
                console.error('Error cleaning up old records:', err.message);
            } else if (this.changes > 0) {
                // this.changes returns the number of rows deleted by the query
                console.log(`Auto-cleanup: ${this.changes} old record(s) deleted.`);
            }
        });
    }

    // Run the cleanup immediately on startup, then schedule it to run every 1 hour (3,600,000 ms)
    cleanOldRecords();
    setInterval(cleanOldRecords, 3600000);
}

// Execute the schema creation immediately when the file is imported
initDatabase();

// Export both the database instance (to run queries in index.js) 
// and the cleanup function (to be triggered with the dynamic config)
module.exports = { db, startCleanup };