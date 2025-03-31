// Load environment variables from .env file
require('dotenv').config();

// Import required Discord.js classes
const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder 
} = require('discord.js');

// Import Vultr API client
const VultrNode = require('@vultr/vultr-node');

// =============== CLIENT INITIALIZATION ===============

// Create a new Discord client instance with minimal permissions
// We only need the Guilds intent for slash commands
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Initialize Vultr client with API key from .env file
const vultr = VultrNode.initialize({
    apiKey: process.env.VULTR_API_KEY
});

// =============== COMMAND DEFINITIONS ===============

// Command to restore server from a snapshot
const restoreSnapshotCommand = new SlashCommandBuilder()
    .setName('restore-snapshot')
    .setDescription('Restore the server from a snapshot');

// Command to create a new snapshot with optional description
const createSnapshotCommand = new SlashCommandBuilder()
    .setName('create-snapshot')
    .setDescription('Create a new snapshot of the server')
    .addStringOption(option =>
        option.setName('description')
        .setDescription('Description for the snapshot')
        .setRequired(false) // Description is optional
    );

// Command to start the Vultr instance
const startCommand = new SlashCommandBuilder()
    .setName('start')
    .setDescription('Start the Vultr instance');

// Command to stop the Vultr instance
const stopCommand = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the Vultr instance');

// Command to check instance status and details
const statusCommand = new SlashCommandBuilder()
    .setName('status')
    .setDescription('Get detailed information about the server instance');

// =============== EVENT HANDLERS ===============

// This event runs once when the bot is ready
client.once('ready', async () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
    
    try {
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
            console.log(`Registered command: ${command.name}`);
        }
        
        console.log('✅ All slash commands registered successfully');
    } catch (error) {
        console.error('❌ Error registering slash commands:', error);
    }
});

// Helper function to check instance status
async function checkInstanceStatus(instanceId, expectedState, maxAttempts = 20) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const instance = await vultr.instances.getInstance({ "instance-id": instanceId });
            if (instance.instance.status === expectedState) {
                return true;
            }
            // Wait 3 seconds before checking again
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            console.error('Error checking instance status:', error);
        }
    }
    return false;
}

// This event handles all slash command interactions
client.on('interactionCreate', async interaction => {
    // Ignore non-command interactions
    if (!interaction.isCommand()) return;
    
    // Defer the reply to prevent timeout
    // This shows "Bot is thinking..." message
    await interaction.deferReply();
    
    try {
        // Handle different commands
        switch (interaction.commandName) {
            case 'restore-snapshot':
                await vultr.instances.restoreInstance({
                    "instance-id": process.env.VULTR_INSTANCE_ID,
                    "snapshot-id": process.env.VULTR_SNAPSHOT_ID
                });
                await interaction.editReply('⏳ Restoring from snapshot... This may take several minutes.');
                
                // For restore, we'll wait longer and check for active status
                const restoreSuccess = await checkInstanceStatus(process.env.VULTR_INSTANCE_ID, 'active', 40);
                if (restoreSuccess) {
                    await interaction.editReply('✅ Server has been successfully restored from snapshot and is running!');
                } else {
                    await interaction.editReply('⚠️ Restore process is in progress but taking longer than expected. Please check Vultr dashboard.');
                }
                break;

            case 'create-snapshot':
                try {
                    const description = interaction.options.getString('description') || 'Snapshot created via Discord bot';
                    console.log('Creating snapshot with parameters:', {
                        instanceId: process.env.VULTR_INSTANCE_ID,
                        description: description
                    });
                    
                    // Use the same kebab-case format that works for other API methods
                    const snapshot = await vultr.snapshots.create({
                        "instance-id": process.env.VULTR_INSTANCE_ID,
                        "description": description
                    });
                    
                    console.log('Snapshot creation response:', snapshot);
                    await interaction.editReply(`⏳ Creating snapshot with ID: ${snapshot.snapshot.id}... This may take several minutes.`);
                    await interaction.editReply('✅ Snapshot creation process has started. Check Vultr dashboard for completion.');
                } catch (error) {
                    console.error('Snapshot creation error details:', error);
                    await interaction.editReply(`❌ Failed to create snapshot: ${error.message}`);
                }
                break;

            case 'start':
                // Start the instance
                await vultr.instances.startInstance({
                    "instance-id": process.env.VULTR_INSTANCE_ID
                });
                await interaction.editReply('⏳ Starting the server... Please wait.');
                
                // Check if instance started successfully
                const startSuccess = await checkInstanceStatus(process.env.VULTR_INSTANCE_ID, 'active');
                if (startSuccess) {
                    await interaction.editReply('✅ Server has successfully started and is now running!');
                } else {
                    await interaction.editReply('⚠️ Start command was sent, but server may still be starting. Please check Vultr dashboard.');
                }
                break;

            case 'stop':
                // Stop the instance
                await vultr.instances.haltInstance({
                    "instance-id": process.env.VULTR_INSTANCE_ID
                });
                await interaction.editReply('⏳ Stopping the server... Please wait.');
                
                // Check if instance stopped successfully
                const stopSuccess = await checkInstanceStatus(process.env.VULTR_INSTANCE_ID, 'stopped');
                if (stopSuccess) {
                    await interaction.editReply('✅ Server has successfully stopped!');
                } else {
                    await interaction.editReply('⚠️ Stop command was sent, but server may still be shutting down. Please check Vultr dashboard.');
                }
                break;

            case 'status':
                try {
                    // Get instance information from Vultr API
                    const response = await vultr.instances.getInstance({
                        "instance-id": process.env.VULTR_INSTANCE_ID
                    });

                    // Extract useful information from the response
                    const instance = response.instance;
                    
                    // Create a formatted status message
                    const statusMessage = [
                        `📊 **Server Status Report**`,
                        `\`\`\``,
                        `Status: ${instance.status}`,
                        `Power Status: ${instance.power_status}`,
                        `Server State: ${instance.server_status}`,
                        `RAM: ${instance.ram} MB`,
                        `CPU Cores: ${instance.vcpu_count}`,
                        `Region: ${instance.region}`,
                        `IP Address: ${instance.main_ip}`,
                        `\`\`\``,
                        `Last Update: ${new Date(instance.date_updated).toLocaleString()}`
                    ].join('\n');

                    // Send the formatted message
                    await interaction.editReply(statusMessage);

                } catch (error) {
                    console.error('Error getting instance status:', error);
                    await interaction.editReply('❌ Failed to get server status. Please check with the administrator.');
                }
                break;
        }
    } catch (error) {
        // Log the full error for debugging
        console.error('Error details:', error);
        
        // Send a user-friendly error message
        await interaction.editReply('❌ Failed to execute command. Please check with the administrator.');
    }
});

// =============== START THE BOT ===============

// Log in to Discord with token from .env file
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Bot is connecting to Discord...'))
    .catch(error => console.error('Failed to login:', error));
