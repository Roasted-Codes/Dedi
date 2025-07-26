# Dedi Bot Simple

A streamlined Discord bot for managing Vultr VPS instances, designed for gaming communities to easily create, manage, and share game servers.

## Overview

This is a simplified version of the original Dedi Bot, redesigned to be:
- **Easy to understand**: All code in a single file with clear section headers
- **Simple to maintain**: No complex file structure or abstractions
- **Straightforward to debug**: Clear error messages and simplified logic

## Features

- **Create Game Servers**: Quickly spin up new servers from snapshots
- **Manage Instances**: Start, stop, and check server status using friendly dropdown menus
- **List Servers**: See all active servers and who created them
- **User Tracking**: Automatically associates servers with their Discord creators
- **In-memory State**: No file-based storage for simpler operation
- **User-Friendly Interface**: Select servers by name and description instead of technical IDs

## Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd dedi-bot-simple
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Copy the example environment file and edit it with your credentials:

```bash
cp .env.example .env
# Then edit .env with your Discord token and Vultr API key
```

4. **Start the bot**

```bash
npm start
```

## Environment Variables

Edit the `.env` file with your credentials:

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Your Discord bot token from the [Discord Developer Portal](https://discord.com/developers/applications) | Yes |
| `VULTR_API_KEY` | Your Vultr API key from [Vultr Account](https://my.vultr.com/settings/#settingsapi) | Yes |
| `VULTR_SNAPSHOT_ID` | ID of the snapshot to use when creating new instances (if not provided, the most recent snapshot will be used) | No |
| `VULTR_REGION` | Region code for new instances (default: ewr - New Jersey) | No |
| `VULTR_PLAN` | Instance plan for new instances (default: vc2-1c-1gb) | No |

## Commands

| Command | Description | Options |
|---------|-------------|---------|
| `/list` | List all active game servers | None |
| `/status` | Check status of a server | Shows dropdown of available servers |
| `/create` | Create a new server from snapshot | `name` (optional) |
| `/start` | Start a stopped server | Shows dropdown of stopped servers |
| `/stop` | Stop a running server | Shows dropdown of running servers |

## Differences from Original Version

This simplified version:

1. **Consolidates all code into a single file** for easier understanding and debugging
2. **Uses in-memory state** instead of file-based storage for simplicity
3. **Reduces the command set** to focus on core functionality
4. **Simplifies error handling** while maintaining robust operation
5. **Removes complex abstractions** like the separate wrapper for the Vultr API

## Understanding The Code

The code is organized into clearly labeled sections:

```
// ================ CONFIGURATION AND SETUP ================
// ================ IN-MEMORY STATE MANAGEMENT ================
// ================ VULTR API FUNCTIONS ================
// ================ UTILITY FUNCTIONS ================
// ================ COMMAND DEFINITIONS ================
// ================ EVENT HANDLERS ================
// ================ START THE BOT ================
```

This makes it easy to locate specific functionality when debugging or making changes.

## How to Use

1. **Invite the bot** to your Discord server using the OAuth2 URL from the Discord Developer Portal.
2. **Create a server** using the `/create` command (optionally specify a name).
3. **Check server status** using the `/status` command and selecting your server from the dropdown.
4. **Stop the server** when not in use with the `/stop` command and selecting from running servers.
5. **Start the server** again when needed with the `/start` command and selecting from stopped servers.

## License

MIT
