# Dedi Bot

A Discord bot that can restore a Vultr server from a snapshot using a slash command.

## Prerequisites

- Node.js 18 or higher
- A Discord Bot Token
- A Vultr API Key
- Your Vultr Instance ID
- Your Vultr Snapshot ID

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```
   DISCORD_TOKEN=your_discord_bot_token_here
   VULTR_API_KEY=your_vultr_api_key_here
   VULTR_INSTANCE_ID=your_instance_id_here
   VULTR_SNAPSHOT_ID=your_snapshot_id_here
   ```
4. Start the bot:
   ```bash
   node index.js
   ```

## Usage

Once the bot is running, you can use the `/dedi-up` slash command in any channel where the bot has access. The bot will initiate the restore process and provide feedback on the status.

## Security Notes

- Never share your `.env` file or commit it to version control
- Keep your Discord bot token and Vultr API key secure
- Consider implementing additional permission checks before allowing users to use the command

## Error Handling

The bot will provide feedback if the restore process fails. Check the console logs for detailed error information. 