/**
 * @file index.js
 * @description Main entry point for the Discord RPG Moderation Bot.
 * Handles event listeners, similarity algorithms, and spam filtering logic.
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Events, AttachmentBuilder } = require('discord.js');
const { db, startCleanup } = require('./database');
const stringSimilarity = require('string-similarity');

// --- BOT CONFIGURATION ---
/**
 * Global configuration object.
 * Adjust these values to customize the bot's behavior without altering the core logic.
 */
const CONFIG = {
    MONITORED_CHANNELS: ['CHAT_ID_1', 'CHAT_ID_2'], // Channels where the 48h rule applies
    STAFF_CHANNEL_ID: 'STAFF_CHAT_ID',              // Channel for sending spam logs
    COOLDOWN_HOURS: 48,                             // Minimum time (in hours) before posting the same ad
    CORRECTION_MINUTES: 10,                         // Time window (in minutes) to delete and repost without penalty
    MAX_CORRECTION_ATTEMPTS: 3,                     // Maximum allowed corrections per ad to prevent abuse
    SIMILARITY_THRESHOLD: 0.80,                     // Similarity percentage (0.0 to 1.0) to trigger the spam filter
    WARNING_DELETE_SECONDS: 10                      // Time (in seconds) before the warning message auto-deletes
};

// Start the database auto-cleanup routine using the configured cooldown
startCleanup(CONFIG.COOLDOWN_HOURS);

/**
 * Advanced Similarity Analysis Algorithm.
 * Evaluates if a newly posted text is too similar to an older text to prevent evasion.
 * @param {string} newText - The latest message content.
 * @param {string} oldText - The previously saved message content.
 * @returns {boolean} True if texts are considered highly similar (spam).
 */
function checkSimilarity(newText, oldText) {
    // Phase 1: Global Similarity (Dice's Coefficient)
    // Works best when users just swap a few words or fix minor typos.
    const globalSimilarity = stringSimilarity.compareTwoStrings(newText, oldText);
    if (globalSimilarity > CONFIG.SIMILARITY_THRESHOLD) return true;

    // Phase 2: Word Containment / Subset Check
    // Prevents users from bypassing Phase 1 by deleting half of their original text.
    // We clean punctuation and ignore words shorter than 3 characters to focus on the core meaning.
    const extractWords = (text) => text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    
    const newWords = extractWords(newText);
    const oldWords = extractWords(oldText);

    if (newWords.length === 0 || oldWords.length === 0) return false;

    // Identify which text is the smaller subset to check if it's contained within the larger text
    const smaller = newWords.length < oldWords.length ? newWords : oldWords;
    const larger = newWords.length < oldWords.length ? oldWords : newWords;

    const largerSet = new Set(larger); // O(1) lookup time for performance
    
    let matches = 0;
    for (const word of smaller) {
        if (largerSet.has(word)) matches++;
    }

    const containedRatio = matches / smaller.length;
    
    // If the ratio of contained words exceeds the threshold, flag it as the same campaign.
    return containedRatio > CONFIG.SIMILARITY_THRESHOLD;
}

// --- DISCORD CLIENT INITIALIZATION ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    // Memory (RAM) Optimization for cloud hosting limits (e.g., 100MB RAM cap)
    sweepers: {
        messages: {
            interval: 3600, // Sweep memory every 1 hour
            lifetime: 1800, // Discard messages older than 30 minutes from RAM
        }
    }
});

client.once(Events.ClientReady, () => {
    console.log(`✅ Bot online! Logged in as: ${client.user.tag}`);
});

/**
 * Event: Message Delete
 * Handles the "Correction Window" rule.
 * If a user deletes their ad within the allowed timeframe, we allow them to post a corrected version.
 */
client.on(Events.MessageDelete, async (message) => {
    if (message.author?.bot) return;

    // Calculate the correction window threshold in milliseconds
    const correctionWindowMs = Date.now() - (CONFIG.CORRECTION_MINUTES * 60 * 1000);

    // Update the database to mark the post as DELETED and increment the abuse counter
    db.run(
        `UPDATE posts SET message_id = 'DELETED', delete_count = delete_count + 1 WHERE message_id = ? AND timestamp > ?`,
        [message.id, correctionWindowMs],
        function(err) {
            if (err) console.error('Error updating delete status:', err.message);
            else if (this.changes > 0) console.log(`🗑️ Post marked as deleted for correction.`);
        }
    );
});

/**
 * Event: Message Create
 * Core logic for the cooldown enforcement and spam moderation.
 */
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!CONFIG.MONITORED_CHANNELS.includes(message.channel.id)) return;

    const userId = message.author.id;
    const content = message.content;
    const now = Date.now();
    
    // Calculate the cooldown threshold in milliseconds
    const cooldownLimitMs = now - (CONFIG.COOLDOWN_HOURS * 60 * 60 * 1000);

    // Fetch the user's posts from the active cooldown period
    db.all(`SELECT * FROM posts WHERE user_id = ? AND timestamp > ?`, [userId, cooldownLimitMs], async (err, rows) => {
        if (err) return console.error('Error querying database:', err.message);

        let isSpam = false;
        let oldPostRecord = null;
        let isValidCorrection = false;

        // Iterate through past posts to check for similarity
        for (const row of rows) {
            const isSimilar = checkSimilarity(content, row.content);
            
            if (isSimilar) {
                oldPostRecord = row;
                
                const isWithinWindow = (now - row.timestamp) <= (CONFIG.CORRECTION_MINUTES * 60 * 1000);
                
                // Validate if it's a legitimate typo correction or an abusive evasion attempt
                if (row.message_id === 'DELETED' && isWithinWindow && row.delete_count <= CONFIG.MAX_CORRECTION_ATTEMPTS) {
                    isValidCorrection = true;
                } else {
                    isSpam = true;
                }
                break; 
            }
        }

        // Scenario 1: User is fixing a typo within the allowed window
        if (isValidCorrection) {
            db.run(`UPDATE posts SET message_id = ?, content = ? WHERE id = ?`, 
                [message.id, content, oldPostRecord.id]);
            console.log(`✅ Correction allowed for: ${message.author.username} (Attempt ${oldPostRecord.delete_count}/${CONFIG.MAX_CORRECTION_ATTEMPTS})`);
            return;
        }

        // Scenario 2: User is trying to bypass the cooldown rule (Spam detected)
        if (isSpam) {
            await message.delete().catch(console.error);

            // Send temporary warning in the channel
            const warningMsg = await message.channel.send(`⚠️ <@${userId}>, you cannot post this session right now. Please wait ${CONFIG.COOLDOWN_HOURS} hours or you have exceeded the correction limit!`);
            
            // Delete warning message after configured time
            setTimeout(() => warningMsg.delete().catch(console.error), (CONFIG.WARNING_DELETE_SECONDS * 1000));

            console.log(`🚫 Spam/Abuse blocked from: ${message.author.username}`);

            // Generate an audit log file for the staff
            const staffChannel = client.channels.cache.get(CONFIG.STAFF_CHANNEL_ID);
            if (staffChannel) {
                const logText = `USER: ${message.author.tag} (${userId})\n\n=== OLD TEXT ===\n${oldPostRecord.content}\n\n=== NEW TEXT (BLOCKED) ===\n${content}`;
                const buffer = Buffer.from(logText, 'utf-8');
                const attachment = new AttachmentBuilder(buffer, { name: `spam_log_${message.author.username}.txt` });

                staffChannel.send({ 
                    content: `🚨 **Spam Filter Triggered!**\nUser <@${userId}> attempted to bypass the ${CONFIG.COOLDOWN_HOURS}h/Correction rule in <#${message.channel.id}>.`,
                    files: [attachment]
                });
            }

        } else {
            // Scenario 3: Clean, brand-new campaign advertisement
            db.run(`INSERT INTO posts (user_id, message_id, content, timestamp) VALUES (?, ?, ?, ?)`, 
                [userId, message.id, content, now], 
                (err) => {
                    if (err) console.error('Error saving post:', err.message);
                    else console.log(`📝 New session registered from: ${message.author.username}`);
                }
            );
        }
    });
});

client.login(process.env.DISCORD_TOKEN);