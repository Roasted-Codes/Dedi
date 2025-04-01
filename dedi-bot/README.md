# Dedi Bot - Discord VPS Management

A Discord bot for managing Vultr VPS instances, designed to allow gaming communities to easily create, manage, and share game servers.

## Features

- **Instance Management**: Create, start, stop, and check the status of VPS instances
- **User-Friendly**: Simple commands for non-technical users
- **Instance Tracking**: Track who created each instance and when
- **Status Updates**: Real-time updates on instance status

## Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd dedi-bot
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
node index.js
```

## Configuration

Edit the `.env` file with your credentials:

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Your Discord bot token from the [Discord Developer Portal](https://discord.com/developers/applications) | Yes |
| `VULTR_API_KEY` | Your Vultr API key from [Vultr Account](https://my.vultr.com/settings/#settingsapi) | Yes |
| `VULTR_REGION` | Region code for new instances (default: ewr - New Jersey) | No |
| `VULTR_PLAN` | Instance plan for new instances (default: vc2-1c-1gb) | No |
| `VULTR_DEFAULT_SNAPSHOT_ID` | Default snapshot ID to use when creating new instances | No |

## Commands

### User Commands

| Command | Description | Options |
|---------|-------------|---------|
| `/list` | List all active game servers | None |
| `/status` | Check status of a server | `instance-id` (optional) |
| `/create` | Create a new server from snapshot | `name` (optional) |
| `/start` | Start a stopped server | `instance-id` (optional) |
| `/stop` | Stop a running server | `instance-id` (optional) |

## Project Structure

```
dedi-bot/
├── index.js                # Main entry point
├── commands/               # Command implementations
│   ├── public/             # End-user commands
│   └── admin/              # Admin commands (future)
├── services/               # Business logic
│   ├── instanceTracker.js  # Track instance metadata
│   └── vultrService.js     # Vultr API interactions
├── utils/                  # Helper functions
│   └── formatters.js       # Message formatting
└── config/                 # Configuration
    └── instanceLog.json    # Stores instance metadata
```

## Instance Tracking

The bot tracks instances in `config/instanceLog.json`, storing:

- Instance ID
- Creator (Discord user ID and username)
- Creation time
- Current status
- IP address
- Instance name

This allows users to see who created each server and its current status.

## Extending the Bot

### Adding New Commands

1. Create a new file in `commands/public/` or `commands/admin/`
2. Export an object with `data` (command definition) and `execute` (handler function)
3. The command will be automatically loaded when the bot starts

Example command file:

```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('command-name')
    .setDescription('Command description'),
  
  async execute(interaction) {
    // Command implementation
    await interaction.reply('Hello, world!');
  }
};
```

### Adding Admin Commands

Admin commands are stored in `commands/admin/` and should implement permission checks:

```javascript
// Check if user has admin permissions
if (!interaction.member.permissions.has('ADMINISTRATOR')) {
  return interaction.reply({
    content: 'You need administrator permissions to use this command.',
    ephemeral: true
  });
}
```

## License

MIT
