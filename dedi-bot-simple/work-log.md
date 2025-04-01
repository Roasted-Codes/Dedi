# Dedi Bot - Work Log

This document explains the process of creating a Discord bot that can manage a Vultr server instance through Discord slash commands.

## Project Overview

The Dedi Bot allows Discord users to control a Vultr virtual server with simple slash commands, including:

- `/status` - Check the current status of the server
- `/start` - Start the server
- `/stop` - Stop the server 
- `/create-snapshot` - Create a new snapshot of the server
- `/restore-snapshot` - Restore the server from a snapshot

## Setting Up the Project

### 1. Create a new Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" tab and click "Add Bot"
4. Under "Privileged Gateway Intents", enable "SERVER MEMBERS INTENT"
5. Save changes and copy your bot token

### 2. Set up the project structure

```bash
mkdir dedi-bot
cd dedi-bot
npm init -y
npm install discord.js dotenv @vultr/vultr-node
```

### 3. Create environment variables

Create a `.env` file in the project root:

```
DISCORD_TOKEN=your_discord_bot_token_here
VULTR_API_KEY=your_vultr_api_key_here
VULTR_INSTANCE_ID=your_instance_id_here
VULTR_SNAPSHOT_ID=your_snapshot_id_here
```

## Bot Implementation

### Core Dependencies

- `discord.js` (v14): Interacts with the Discord API
- `dotenv`: Loads environment variables from .env file
- `@vultr/vultr-node`: Official Vultr API client for Node.js

### index.js Structure

Our `index.js` file is organized into several sections:

1. **Initialization**: Loading environment variables and initializing clients
2. **Command Definitions**: Defining slash commands using Discord.js SlashCommandBuilder
3. **Event Handlers**: Setting up event listeners for bot events
4. **Command Handlers**: Logic for each slash command
5. **Helper Functions**: Utility functions like status checking

### Key Code Components

#### Setting Up Discord Client

```javascript
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});
```

#### Creating Slash Commands

```javascript
const statusCommand = new SlashCommandBuilder()
    .setName('status')
    .setDescription('Get detailed information about the server instance');
```

#### Registering Commands with Discord

```javascript
client.once('ready', async () => {
    // Register all slash commands with Discord
    const commands = [
        restoreSnapshotCommand,
        createSnapshotCommand,
        startCommand,
        stopCommand,
        statusCommand
    ];

    for (const command of commands) {
        await client.application.commands.create(command.toJSON());
    }
});
```

## Debugging Process and Fixes

During development, we encountered several issues that needed fixing:

### 1. Discord.js Command Registration Issue

In Discord.js v14, SlashCommandBuilder objects need to be converted to JSON before registration:

```javascript
// Incorrect
await client.application.commands.create(command);

// Correct
await client.application.commands.create(command.toJSON());
```

### 2. Vultr API Method Name Mismatches

The Vultr API methods needed to be called with their exact names:

```javascript
// Incorrect
await vultr.instances.start({...});

// Correct
await vultr.instances.startInstance({...});
```

Fixed method names:
- `vultr.instances.getInstance` (for status)
- `vultr.instances.startInstance` (for start)
- `vultr.instances.haltInstance` (for stop)
- `vultr.instances.restoreInstance` (for restore-snapshot)
- `vultr.snapshots.create` (for create-snapshot)

### 3. Parameter Format Mismatch

The Vultr API expects parameters to use kebab-case (with hyphens):

```javascript
// Incorrect
{
    instance_id: process.env.VULTR_INSTANCE_ID
}

// Correct
{
    "instance-id": process.env.VULTR_INSTANCE_ID
}
```

### 4. Error Handling

We added comprehensive error handling to catch and log issues:

```javascript
try {
    // Command logic here
} catch (error) {
    console.error('Error details:', error);
    await interaction.editReply('❌ Failed to execute command.');
}
```

## Available Commands

### `/status`

Fetches and displays detailed information about the Vultr instance including:
- Current status
- Power status
- RAM and CPU information
- Region and IP address

### `/start`

Starts the Vultr instance if it's stopped and provides progress updates.

### `/stop`

Safely stops the running Vultr instance.

### `/create-snapshot`

Creates a backup snapshot of the current server state with an optional description.

### `/restore-snapshot`

Restores the server from a previously saved snapshot (specified in the .env file).

## Testing and Troubleshooting

When testing the bot, follow these steps:

1. Start the bot with `node index.js`
2. Check the console for successful login and command registration
3. Use the slash commands in Discord to interact with your Vultr instance
4. Watch the console for any error messages

### Common Issues and Solutions

- **Command not working**: Check console logs for API errors. Verify parameter names match what the API expects.
- **Access denied**: Ensure your Vultr API key has proper permissions.
- **Command not appearing**: Wait a few minutes as Discord can take time to register new slash commands globally.

## Future Improvements

Potential enhancements for the bot:

- Allow specifying different snapshots rather than using a fixed one
- Add user permission controls for sensitive commands
- Create a command to view all available snapshots
- Add server performance monitoring
- Implement scheduled automatic snapshots

## Security Considerations

- Never share your `.env` file or commit it to version control
- Keep your Discord bot token and Vultr API key secure
- Consider implementing additional permission checks before allowing users to use powerful commands
- Regularly rotate your API keys as a security best practice
