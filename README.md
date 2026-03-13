# Discord RPG Moderation Bot 🛡️🎲

A lightweight, highly optimized, and fully configurable Discord bot built with **Node.js** and **Discord.js v14**. Designed specifically for Tabletop RPG communities, this bot automates the moderation of campaign advertisement channels by preventing spam and enforcing posting cooldowns.

## 🚀 Key Features

* **48-Hour Cooldown Enforcement:** Automatically tracks and prevents users from posting the same (or highly similar) campaign advertisement within a custom cooldown window.
* **Advanced Fuzzy Matching:** Utilizes `string-similarity` and a custom word-containment algorithm to detect evasive spam. It prevents users from bypassing the rules by simply deleting paragraphs, altering formatting, or swapping a few words.
* **Correction Window:** Allows users to delete and repost their ads to fix typos if done within a specific timeframe after the original post.
* **Anti-Abuse System:** Limits the correction window to a maximum number of consecutive attempts to prevent database abuse.
* **Automated Staff Logging:** Generates and sends a `.txt` file containing the blocked and original texts directly to a designated staff channel whenever the spam filter is triggered.
* **Self-Cleaning Local Database:** Powered by `sqlite3`, the database automatically purges old records dynamically based on your cooldown settings to save disk space.
* **Memory (RAM) Optimized:** Implements custom Discord.js sweepers to prevent memory leaks, running stably under 100MB of RAM for strict cloud-hosting environments.

## ⚙️ Easy Configuration

You don't need to dig into the core logic to change how the bot behaves! All business rules are centralized in a single `CONFIG` object at the top of `src/index.js`. 

You can easily adjust:
* The cooldown hours (e.g., 48 hours, 24 hours, etc.).
* The correction window limit (e.g., 10 minutes).
* The maximum correction attempts allowed.
* The similarity threshold to trigger the spam filter (e.g., 80%).

## 🛠️ Tech Stack

* **Node.js**
* **Discord.js v14**
* **SQLite3** (Local file-based database)
* **String-similarity** (For Dice's Coefficient text comparison)

## 📖 How to Install & Run

1. **Clone the repository:**
   \`\`\`bash
   git clone https://github.com/HDharder/Bot-Message-Manager.git
   cd Bot-Message-Manager
   \`\`\`

2. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your bot token:
   \`\`\`env
   DISCORD_TOKEN=your_discord_bot_token_here
   \`\`\`

4. **Set up Channel IDs & Rules:**
   Open `src/index.js` and update the `CONFIG` object with your actual Discord channel IDs and desired moderation rules:
   \`\`\`javascript
   const CONFIG = {
       MONITORED_CHANNELS: ['123456789', '987654321'],
       STAFF_CHANNEL_ID: '1122334455',
       COOLDOWN_HOURS: 48,
       // ... other settings
   };
   \`\`\`

5. **Start the Bot:**
   \`\`\`bash
   npm start
   \`\`\`