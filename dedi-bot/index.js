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
            
            // Improved status checking - we need to check different fields based on the expected state
            if (expectedState === 'stopped') {
                // For 'stopped' state, check power_status rather than status
                console.log(`Attempt ${i+1}/${maxAttempts}: power_status=${instance.instance.power_status}, status=${instance.instance.status}`);
                if (instance.instance.power_status === 'stopped') {
                    return true;
                }
            } else {
                // For other states like 'active', check the status field
                console.log(`Attempt ${i+1}/${maxAttempts}: status=${instance.instance.status}, power_status=${instance.instance.power_status}`);
                if (instance.instance.status === expectedState) {
                    return true;
                }
            }
            
            // Wait 3 seconds before checking again
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            console.error(`Error checking instance status (attempt ${i+1}/${maxAttempts}):`, error);
        }
    }
    console.log(`Failed to reach ${expectedState} state after ${maxAttempts} attempts`);
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
                try {
                    console.log('Restoring server from snapshot:', {
                        instanceId: process.env.VULTR_INSTANCE_ID,
                        snapshotId: process.env.VULTR_SNAPSHOT_ID
                    });
                    
                    await vultr.instances.restoreInstance({
                        "instance-id": process.env.VULTR_INSTANCE_ID,
                        "snapshot-id": process.env.VULTR_SNAPSHOT_ID
                    });
                    
                    await interaction.editReply('⏳ Restoring from snapshot... This may take several minutes.');
                    
                    // Define a custom check for restored state - similar to start but with longer timeout
                    // A fully restored server should have both status=active and power_status=running
                    const checkRestored = async (instanceId, maxAttempts = 40) => {
                        for (let i = 0; i < maxAttempts; i++) {
                            try {
                                const instance = await vultr.instances.getInstance({ "instance-id": instanceId });
                                console.log(`Restore: Attempt ${i+1}/${maxAttempts}: status=${instance.instance.status}, power_status=${instance.instance.power_status}`);
                                
                                // Server is fully restored when both conditions are met
                                if (instance.instance.status === 'active' && instance.instance.power_status === 'running') {
                                    return true;
                                }
                                
                                // Wait 5 seconds before checking again (longer wait for restore)
                                await new Promise(resolve => setTimeout(resolve, 5000));
                            } catch (error) {
                                console.error(`Error checking restore status (attempt ${i+1}/${maxAttempts}):`, error);
                            }
                        }
                        console.log(`Failed to fully restore server after ${maxAttempts} attempts`);
                        return false;
                    };
                    
                    // For restore, we'll wait longer and check for both active and running status
                    const restoreSuccess = await checkRestored(process.env.VULTR_INSTANCE_ID);
                    if (restoreSuccess) {
                        await interaction.editReply('✅ Server has been successfully restored from snapshot and is running!');
                    } else {
                        await interaction.editReply('⚠️ Restore process is in progress but taking longer than expected. Please check Vultr dashboard.');
                    }
                } catch (error) {
                    console.error('Restore snapshot error details:', error);
                    await interaction.editReply(`❌ Failed to restore snapshot: ${error.message}`);
                }
                break;

            case 'create-snapshot':
                try {
                    // First check if server is running, as snapshots generally work better on running servers
                    const preCheck = await vultr.instances.getInstance({
                        "instance-id": process.env.VULTR_INSTANCE_ID
                    });
                    
                    // If server is stopped, warn the user but proceed
                    if (preCheck.instance.power_status !== 'running') {
                        await interaction.editReply('⚠️ Warning: Creating a snapshot of a stopped server. For best results, consider starting the server first.');
                        // Wait 3 seconds so user sees the warning
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                    
                    const description = interaction.options.getString('description') || 'Snapshot created via Discord bot';
                    console.log('Creating snapshot with parameters:', {
                        instanceId: process.env.VULTR_INSTANCE_ID,
                        description: description
                    });
                    
                    // Use the same kebab-case format that works for other API methods
                    const snapshot = await vultr.snapshots.createSnapshot({
                        "instance-id": process.env.VULTR_INSTANCE_ID,
                        "description": description
                    });
                    
                    console.log('Snapshot creation response:', JSON.stringify(snapshot, null, 2));
                    
                    if (snapshot && snapshot.snapshot && snapshot.snapshot.id) {
                        await interaction.editReply(`⏳ Creating snapshot with ID: \`${snapshot.snapshot.id}\`...\n\nThis may take several minutes to complete. The snapshot ID has been captured and can be used for future restore operations.`);
                        
                        // Provide the ID as a clear suggestion for updating their .env file
                        setTimeout(async () => {
                            await interaction.editReply(`✅ Snapshot creation process has started!\n\nID: \`${snapshot.snapshot.id}\`\nDescription: "${description}"\n\nTo use this snapshot for future restores, update your \`.env\` file with:\n\`\`\`\nVULTR_SNAPSHOT_ID=${snapshot.snapshot.id}\n\`\`\``);
                        }, 5000);
                    } else {
                        // Something went wrong with the API response
                        console.error('Unexpected snapshot API response format:', snapshot);
                        await interaction.editReply('⚠️ Snapshot creation request was sent, but received an unexpected response format. Please check the Vultr dashboard to confirm.');
                    }
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
                
                // Define a custom check for started state
                // A fully started server should have both status=active and power_status=running
                const checkStarted = async (instanceId, maxAttempts = 20) => {
                    for (let i = 0; i < maxAttempts; i++) {
                        try {
                            const instance = await vultr.instances.getInstance({ "instance-id": instanceId });
                            console.log(`Start: Attempt ${i+1}/${maxAttempts}: status=${instance.instance.status}, power_status=${instance.instance.power_status}`);
                            
                            // Server is fully started when both conditions are met
                            if (instance.instance.status === 'active' && instance.instance.power_status === 'running') {
                                return true;
                            }
                            
                            // Wait 3 seconds before checking again
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        } catch (error) {
                            console.error(`Error checking start status (attempt ${i+1}/${maxAttempts}):`, error);
                        }
                    }
                    console.log(`Failed to fully start server after ${maxAttempts} attempts`);
                    return false;
                };
                
                // Check if instance started successfully
                const startSuccess = await checkStarted(process.env.VULTR_INSTANCE_ID);
                if (startSuccess) {
                    await interaction.editReply('✅ Server has successfully started and is now running!');
                } else {
                    await interaction.editReply('⚠️ Start command was sent, but server may still be starting. Please check Vultr dashboard.');
                }
                break;

            case 'stop':
                try {
                    console.log('Stopping server instance:', process.env.VULTR_INSTANCE_ID);
                    
                    // Stop the instance
                    await vultr.instances.haltInstance({
                        "instance-id": process.env.VULTR_INSTANCE_ID
                    });
                    await interaction.editReply('⏳ Stopping the server... Please wait.');
                    
                    // Define dedicated check for stopped state with longer timeout
                    const checkStopped = async (instanceId, maxAttempts = 30) => {
                        for (let i = 0; i < maxAttempts; i++) {
                            try {
                                const response = await vultr.instances.getInstance({ "instance-id": instanceId });
                                const instance = response.instance;
                                const isPoweredOff = instance.power_status === 'stopped';
                                
                                console.log(`Stop: Attempt ${i+1}/${maxAttempts}: power_status=${instance.power_status}, status=${instance.status}`);
                                
                                if (isPoweredOff) {
                                    console.log('Server successfully stopped!');
                                    return true;
                                }
                                
                                // Update the message every 5 attempts to show progress
                                if (i % 5 === 0 && i > 0) {
                                    await interaction.editReply(`⏳ Stopping the server... Please wait. (Check ${i}/${maxAttempts})`);
                                }
                                
                                // Wait 4 seconds before checking again
                                await new Promise(resolve => setTimeout(resolve, 4000));
                            } catch (error) {
                                console.error(`Error checking stop status (attempt ${i+1}/${maxAttempts}):`, error);
                            }
                        }
                        console.log(`Failed to confirm server stop after ${maxAttempts} attempts`);
                        return false;
                    };
                    
                    // Check if instance stopped successfully with the dedicated function
                    const stopSuccess = await checkStopped(process.env.VULTR_INSTANCE_ID);
                    if (stopSuccess) {
                        await interaction.editReply('✅ Server has successfully stopped! The instance is now powered off.');
                    } else {
                        await interaction.editReply('⚠️ Stop command was sent, but could not confirm the server has fully shut down after multiple checks. Please verify in the Vultr dashboard.');
                    }
                } catch (error) {
                    console.error('Error stopping server:', error);
                    await interaction.editReply(`❌ Failed to stop server: ${error.message}`);
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
                    
                    // Create a formatted status message with proper date handling
                    const statusMessage = [
                        `📊 **Server Status Report**`,
                        `\`\`\``,
                        `Status: ${instance.status} ${instance.power_status === 'running' ? '🟢' : '🔴'}`,
                        `Power Status: ${instance.power_status}`,
                        `Server State: ${instance.server_status}`,
                        `RAM: ${instance.ram} MB`,
                        `CPU Cores: ${instance.vcpu_count}`,
                        `Region: ${instance.region}`,
                        `IP Address: ${instance.main_ip}`,
                        `\`\`\``,
                        // Use date_created instead of non-existent date_updated
                        `Server Created: ${(() => {
                            try {
                                return instance.date_created ? new Date(instance.date_created).toLocaleString() : 'Not available';
                            } catch (error) {
                                return 'Not available';
                            }
                        })()}`
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
