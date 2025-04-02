/**
 * Dedi Bot Simple - A streamlined Discord bot for managing Vultr VPS instances
 * 
 * This single-file implementation contains all functionality in one place for
 * maximum simplicity and ease of debugging.
 */

// ================ CONFIGURATION AND SETUP ================

// Environment variables
require('dotenv').config();

// Dependencies
const { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  REST, 
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const VultrNode = require('@vultr/vultr-node');

// Initialize Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Initialize Vultr client
const vultr = VultrNode.initialize({
  apiKey: process.env.VULTR_API_KEY
});

// ================ IN-MEMORY STATE MANAGEMENT ================

// Simple in-memory tracking of instances (replaces file-based instanceTracker)
const instanceState = {
  instances: [],
  
  // Add or update an instance
  trackInstance: function(instanceId, userId, username, status, metadata = {}) {
    const timestamp = new Date();
    const existingIndex = this.instances.findIndex(i => i.id === instanceId);
    
    const instanceData = {
      id: instanceId,
      creator: {
        id: userId,
        username
      },
      createdAt: timestamp.toISOString(),
      status: status || 'creating',
      ip: metadata.ip || null,
      name: metadata.name || `${username}'s Server`,
      lastUpdated: timestamp.toISOString()
    };
    
    if (existingIndex >= 0) {
      this.instances[existingIndex] = {
        ...this.instances[existingIndex],
        ...instanceData
      };
    } else {
      this.instances.push(instanceData);
    }
    
    return instanceData;
  },
  
  // Update instance status
  updateInstance: function(instanceId, status, metadata = {}) {
    const instanceIndex = this.instances.findIndex(i => i.id === instanceId);
    
    if (instanceIndex >= 0) {
      this.instances[instanceIndex] = {
        ...this.instances[instanceIndex],
        status,
        lastUpdated: new Date().toISOString(),
        ...metadata
      };
      
      return this.instances[instanceIndex];
    }
    
    return null;
  },
  
  // Get all active instances
  getActiveInstances: function() {
    return this.instances.filter(i => 
      i.status !== 'terminated' && i.status !== 'destroyed'
    );
  },
  
  // Get a specific instance
  getInstance: function(instanceId) {
    return this.instances.find(i => i.id === instanceId);
  },
  
  // Get instances for a specific user
  getUserInstances: function(userId) {
    return this.instances.filter(i => i.creator.id === userId);
  }
};

// ================ VULTR API FUNCTIONS ================

/**
 * Get information about a specific instance
 */
async function getInstance(instanceId) {
  try {
    const response = await vultr.instances.getInstance({ 
      "instance-id": instanceId 
    });
    return response.instance;
  } catch (error) {
    console.error('Error getting instance:', error);
    throw error;
  }
}

/**
 * List all instances in the Vultr account
 */
async function listInstances() {
  try {
    const response = await vultr.instances.listInstances();
    return response.instances || [];
  } catch (error) {
    console.error('Error listing instances:', error);
    throw error;
  }
}

/**
 * Start an instance
 */
async function startInstance(instanceId) {
  try {
    await vultr.instances.startInstance({
      "instance-id": instanceId
    });
    
    // Wait for the instance to be fully started
    return await checkInstanceStatus(instanceId, 'active', 'running');
  } catch (error) {
    console.error('Error starting instance:', error);
    throw error;
  }
}

/**
 * Stop an instance
 */
async function stopInstance(instanceId) {
  try {
    await vultr.instances.haltInstance({
      "instance-id": instanceId
    });
    
    // Wait for the instance to be fully stopped
    return await checkInstanceStatus(instanceId, 'active', 'stopped');
  } catch (error) {
    console.error('Error stopping instance:', error);
    throw error;
  }
}

/**
 * Check the status of an instance
 */
async function checkInstanceStatus(instanceId, expectedStatus, expectedPowerStatus, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const instance = await getInstance(instanceId);
      console.log(`Status check (${i+1}/${maxAttempts}): status=${instance.status}, power_status=${instance.power_status}`);
      
      if (expectedPowerStatus === 'stopped' && instance.power_status === 'stopped') {
        return true;
      } else if (instance.status === expectedStatus && instance.power_status === expectedPowerStatus) {
        return true;
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`Error checking instance status (attempt ${i+1}/${maxAttempts}):`, error);
    }
  }
  
  return false;
}

/**
 * Get all snapshots
 */
async function getSnapshots() {
  try {
    const response = await vultr.snapshots.listSnapshots();
    // Sort snapshots by date (newest first)
    const snapshots = response.snapshots || [];
    snapshots.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
    return snapshots;
  } catch (error) {
    console.error('Error getting snapshots:', error);
    throw error;
  }
}

/**
 * Create a new instance from a snapshot
 */
async function createInstanceFromSnapshot(snapshotId, label) {
  try {
    console.log(`Creating instance with params:`, {
      snapshot_id: snapshotId,
      label,
      region: process.env.VULTR_REGION || "dfw",
      plan: process.env.VULTR_PLAN || "vc2-1c-1gb"
    });
    
    const response = await vultr.instances.createInstance({
      "snapshot_id": snapshotId,
      "label": label,
      "region": process.env.VULTR_REGION || "ewr",
      "plan": process.env.VULTR_PLAN || "vc2-1c-1gb"
    });
    
    console.log("Create instance response:", JSON.stringify(response, null, 2));
    
    return response.instance;
  } catch (error) {
    console.error('Error creating instance from snapshot:', error);
    throw error;
  }
}

/**
 * Get billing information for an instance
 */
async function getInstanceBilling(instanceId) {
  try {
    // Get billing history
    const response = await vultr.billing.listBillingHistory();
    
    // Filter charges for this instance and calculate total
    let totalCost = 0;
    if (response && response.billing_history) {
      const instanceCharges = response.billing_history.filter(charge => 
        charge.description.toLowerCase().includes(instanceId.toLowerCase())
      );
      totalCost = instanceCharges.reduce((sum, charge) => sum + parseFloat(charge.amount), 0);
    }
    
    return totalCost;
  } catch (error) {
    console.error('Error getting billing information:', error);
    return 0;
  }
}

/**
 * Delete an instance
 */
async function deleteInstance(instanceId) {
  try {
    await vultr.instances.deleteInstance({
      "instance-id": instanceId
    });
    return true;
  } catch (error) {
    console.error('Error deleting instance:', error);
    throw error;
  }
}

// ================ UTILITY FUNCTIONS ================

/**
 * Format instance status for display
 */
function formatStatus(instance) {
  let statusEmoji = '⚪';
  
  if (instance.power_status === 'running') {
    statusEmoji = '🟢';
  } else if (instance.power_status === 'stopped') {
    statusEmoji = '🔴';
  } else if (instance.status === 'pending') {
    statusEmoji = '🟡';
  }
  
  return {
    emoji: statusEmoji,
    label: instance.power_status || instance.status
  };
}

/**
 * Format a list of instances for display in Discord
 */
function formatInstanceList(instances) {
  if (!instances || instances.length === 0) {
    return '📃 **Server List**\nNo active servers found.';
  }
  
  let message = '📃 **Server List**\n';
  
  instances.forEach(instance => {
    const status = formatStatus(instance);
    const createdAt = new Date(instance.createdAt).toLocaleString();
    
    message += `\n${status.emoji} **${instance.name}**`;
    message += `\n> Status: ${status.label}`;
    
    if (instance.ip) {
      message += `\n> IP: \`${instance.ip}\``;
    }
    
    message += `\n> Created by: ${instance.creator.username}`;
    message += `\n> Created: ${createdAt}`;
    message += '\n';
  });
  
  return message;
}

/**
 * Format an instance for display in Discord
 */
function formatInstanceDetails(instance, vultrInstance = null) {
  const status = formatStatus(vultrInstance || instance);
  let message = `🖥️ **Server Details**\n`;
  
  // Use label instead of name, with fallback
  const serverName = (vultrInstance?.label || instance?.label || instance?.name || 'Unnamed Server');
  message += `\n${status.emoji} **${serverName}**`;
  message += `\n> Status: ${status.label}`;
  
  // Add Vultr-specific details if available
  if (vultrInstance) {
    message += `\n> Region: ${vultrInstance.region}`;
    message += `\n> Plan: ${vultrInstance.plan}`;
    message += `\n> CPU: ${vultrInstance.vcpu_count} cores`;
    message += `\n> RAM: ${vultrInstance.ram} MB`;
    message += `\n> Disk: ${vultrInstance.disk} GB`;
    
    if (vultrInstance.main_ip) {
      message += `\n> IP: \`${vultrInstance.main_ip}\``;
    }
  } else if (instance?.ip) {
    message += `\n> IP: \`${instance.ip}\``;
  }
  
  // Add creator info if available
  if (instance?.creator?.username) {
    message += `\n> Created by: ${instance.creator.username}`;
  }
  
  // Add creation date if available
  if (instance?.createdAt) {
    message += `\n> Created: ${new Date(instance.createdAt).toLocaleString()}`;
  }
  
  return message;
}

// ================ COMMAND DEFINITIONS ================

// Collection to store command handlers
client.commands = new Collection();

// Create the /list command
const listCommand = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('List all active game servers'),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Try to get instances from Vultr API to ensure our tracking is up to date
      try {
        const vultrInstances = await listInstances();
        
        // Update our tracked instances based on Vultr's data
        const activeInstances = instanceState.getActiveInstances();
        
        vultrInstances.forEach(vultrInstance => {
          const trackedInstance = activeInstances.find(i => i.id === vultrInstance.id);
          
          if (trackedInstance) {
            // Update existing instance
            instanceState.updateInstance(vultrInstance.id, vultrInstance.power_status, {
              ip: vultrInstance.main_ip
            });
          } else if (vultrInstance.power_status === 'running') {
            // Add new instance we're not tracking yet
            instanceState.trackInstance(
              vultrInstance.id,
              'unknown',
              'Unknown',
              vultrInstance.power_status,
              {
                ip: vultrInstance.main_ip,
                name: vultrInstance.label || 'Unknown Server'
              }
            );
          }
        });
        
        // Mark tracked instances that don't exist in Vultr as terminated
        activeInstances.forEach(trackedInstance => {
          const vultrInstance = vultrInstances.find(i => i.id === trackedInstance.id);
          if (!vultrInstance) {
            instanceState.updateInstance(trackedInstance.id, 'terminated');
          }
        });
      } catch (error) {
        console.error('Error syncing with Vultr API:', error);
        // Continue with local data if Vultr API fails
      }
      
      // Get the refreshed list of active instances
      const activeInstances = instanceState.getActiveInstances();
      
      // Format and send the response
      const formattedList = formatInstanceList(activeInstances);
      return interaction.editReply(formattedList);
    } catch (error) {
      console.error('Error executing list command:', error);
      return interaction.editReply('❌ There was an error trying to list the servers.');
    }
  }
};

// Create the /status command
const statusCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check the status of a game server'),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Get all instances first
      const vultrInstances = await listInstances();
      
      if (!vultrInstances || vultrInstances.length === 0) {
        return interaction.editReply('No servers found.');
      }

      // Create select menu options from instances
      const options = vultrInstances.map(instance => ({
        label: instance.label || 'Unnamed Server',
        description: `Status: ${instance.power_status} | IP: ${instance.main_ip} | Region: ${instance.region}`,
        value: instance.id
      }));

      // Create the select menu
      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_server')
            .setPlaceholder('Select a server to check')
            .addOptions(options)
        );

      // Send message with select menu
      return interaction.editReply({
        content: 'Choose a server to check its status:',
        components: [row]
      });
    } catch (error) {
      console.error('Error executing status command:', error);
      return interaction.editReply('❌ There was an error checking server status.');
    }
  }
};

// Create the /start command
const startCommand = {
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('Start a game server'),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Get all instances that are stopped
      const vultrInstances = await listInstances();
      const stoppedInstances = vultrInstances.filter(instance => 
        instance.power_status === 'stopped'
      );
      
      if (!stoppedInstances || stoppedInstances.length === 0) {
        return interaction.editReply('No stopped servers found. All servers may already be running.');
      }

      // Create select menu options from stopped instances
      const options = stoppedInstances.map(instance => ({
        label: instance.label || 'Unnamed Server',
        description: `Status: ${instance.power_status} | IP: ${instance.main_ip} | Region: ${instance.region}`,
        value: instance.id
      }));

      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('start_server')
            .setPlaceholder('Select a server to start')
            .addOptions(options)
        );

      return interaction.editReply({
        content: 'Choose a server to start:',
        components: [row]
      });
    } catch (error) {
      console.error('Error executing start command:', error);
      return interaction.editReply('❌ There was an error listing servers.');
    }
  }
};

// Create the /stop command
const stopCommand = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop a game server'),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Get all instances that are running
      const vultrInstances = await listInstances();
      const runningInstances = vultrInstances.filter(instance => 
        instance.power_status === 'running'
      );
      
      if (!runningInstances || runningInstances.length === 0) {
        return interaction.editReply('No running servers found. All servers may already be stopped.');
      }

      // Create select menu options from running instances
      const options = runningInstances.map(instance => ({
        label: instance.label || 'Unnamed Server',
        description: `Status: ${instance.power_status} | IP: ${instance.main_ip} | Region: ${instance.region}`,
        value: instance.id
      }));

      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('stop_server')
            .setPlaceholder('Select a server to stop')
            .addOptions(options)
        );

      return interaction.editReply({
        content: 'Choose a server to stop:',
        components: [row]
      });
    } catch (error) {
      console.error('Error executing stop command:', error);
      return interaction.editReply('❌ There was an error listing servers.');
    }
  }
};

// Create the /create command
const createCommand = {
  data: new SlashCommandBuilder()
    .setName('create')
    .setDescription('Create a new game server')
    .addStringOption(option => 
      option
        .setName('name')
        .setDescription('A name for your server')
        .setRequired(false)),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      const serverName = interaction.options.getString('name') || 
                        `${interaction.user.username}'s Server`;
      
      await interaction.editReply('🔄 Fetching available snapshots...');
      
      // Get available snapshots
      const snapshots = await getSnapshots();
      
      if (!snapshots || snapshots.length === 0) {
        return interaction.editReply('❌ No snapshots available to create a server from.');
      }
      
      // Use the snapshot ID from .env or the most recent snapshot
      const snapshotId = process.env.VULTR_SNAPSHOT_ID || snapshots[0].id;
      
      await interaction.editReply(`🔄 Creating server "${serverName}" from snapshot. This will take several minutes...`);
      
      // Create the instance
      const instance = await createInstanceFromSnapshot(snapshotId, serverName);
      
      if (!instance || !instance.id) {
        return interaction.editReply('❌ Failed to create the server. Please try again later.');
      }
      
      // Track the new instance
      instanceState.trackInstance(
        instance.id,
        interaction.user.id,
        interaction.user.username,
        instance.status || 'creating',
        {
          ip: instance.main_ip,
          name: serverName
        }
      );
      
      return interaction.editReply(
        `✅ Server "${serverName}" creation started!\n` +
        `The server will take 5-10 minutes to be ready. Use \`/status\` to check when it's done.`
      );
    } catch (error) {
      console.error('Error executing create command:', error);
      return interaction.editReply('❌ There was an error creating the server.');
    }
  }
};

// Create the /destroy command
const destroyCommand = {
  data: new SlashCommandBuilder()
    .setName('destroy')
    .setDescription('Destroy a server and see its total cost'),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Get all instances
      const vultrInstances = await listInstances();
      const activeInstances = vultrInstances.filter(instance => 
        instance.status !== 'destroyed' && instance.power_status !== 'destroyed'
      );
      
      if (!activeInstances || activeInstances.length === 0) {
        return interaction.editReply('No active servers found to destroy.');
      }

      // Create select menu options from instances
      const options = activeInstances.map(instance => ({
        label: instance.label || 'Unnamed Server',
        description: `Status: ${instance.power_status} | IP: ${instance.main_ip} | Region: ${instance.region}`,
        value: instance.id
      }));

      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('destroy_server')
            .setPlaceholder('Select a server to destroy')
            .addOptions(options)
        );

      return interaction.editReply({
        content: '⚠️ **WARNING**: This will permanently destroy the server and all its data!\nSelect a server to destroy:',
        components: [row]
      });
    } catch (error) {
      console.error('Error executing destroy command:', error);
      return interaction.editReply('❌ There was an error listing servers.');
    }
  }
};

// Add all commands to the collection
client.commands.set(listCommand.data.name, listCommand);
client.commands.set(statusCommand.data.name, statusCommand);
client.commands.set(startCommand.data.name, startCommand);
client.commands.set(stopCommand.data.name, stopCommand);
client.commands.set(createCommand.data.name, createCommand);
client.commands.set(destroyCommand.data.name, destroyCommand);

// ================ EVENT HANDLERS ================

// When the client is ready, register all slash commands
client.once('ready', async () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
  
  try {
    // Get all commands for registration
    const commands = [...client.commands.values()].map(command => command.data.toJSON());
    
    // Create REST API client
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    console.log(`Registering ${commands.length} application commands...`);
    
    // Register globally
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    
    console.log(`Successfully registered ${commands.length} application commands!`);
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
  // Ignore non-command interactions
  if (!interaction.isCommand()) return;
  
  const command = client.commands.get(interaction.commandName);
  
  if (!command) {
    console.error(`Command ${interaction.commandName} not found`);
    return interaction.reply({
      content: 'Sorry, this command is not available.',
      ephemeral: true
    });
  }
  
  try {
    // Execute the command
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);
    
    // Reply with error if the interaction hasn't been replied to yet
    const replyMethod = interaction.replied || interaction.deferred
      ? interaction.followUp
      : interaction.reply;
    
    replyMethod.call(interaction, {
      content: 'There was an error while executing this command.',
      ephemeral: true
    }).catch(console.error);
  }
});

// Add this to your event handlers section
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId === 'select_server') {
    await interaction.deferUpdate();
    const selectedId = interaction.values[0];

    try {
      const instance = await getInstance(selectedId);
      const trackedInstance = instanceState.getInstance(selectedId);
      
      // Format and send the response
      const formattedStatus = formatInstanceDetails(trackedInstance, instance);
      return interaction.editReply({
        content: formattedStatus,
        components: [] // Remove the select menu after selection
      });
    } catch (error) {
      console.error('Error handling server selection:', error);
      return interaction.editReply({
        content: '❌ There was an error getting the server status.',
        components: [] // Remove the select menu
      });
    }
  }
});

// Add these handlers to your interactionCreate event
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId === 'start_server') {
    await interaction.deferUpdate();
    const selectedId = interaction.values[0];

    try {
      await interaction.editReply({
        content: '🔄 Starting the server. This may take a few minutes...',
        components: [] // Remove the select menu
      });

      const success = await startInstance(selectedId);
      
      if (success) {
        instanceState.updateInstance(selectedId, 'running');
        return interaction.editReply('✅ Server started successfully!');
      } else {
        return interaction.editReply('❌ Failed to start the server. It may already be running or there might be an issue.');
      }
    } catch (error) {
      console.error('Error starting server:', error);
      return interaction.editReply('❌ There was an error starting the server.');
    }
  }

  if (interaction.customId === 'stop_server') {
    await interaction.deferUpdate();
    const selectedId = interaction.values[0];

    try {
      await interaction.editReply({
        content: '🔄 Stopping the server. This may take a few minutes...',
        components: [] // Remove the select menu
      });

      const success = await stopInstance(selectedId);
      
      if (success) {
        instanceState.updateInstance(selectedId, 'stopped');
        return interaction.editReply('✅ Server stopped successfully!');
      } else {
        return interaction.editReply('❌ Failed to stop the server. It may already be stopped or there might be an issue.');
      }
    } catch (error) {
      console.error('Error stopping server:', error);
      return interaction.editReply('❌ There was an error stopping the server.');
    }
  }
});

// Add this to your interaction handlers
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId === 'destroy_server') {
    await interaction.deferUpdate();
    const selectedId = interaction.values[0];

    try {
      // Get instance details before destroying
      const instance = await getInstance(selectedId);
      const serverName = instance.label || 'Unnamed Server';
      
      // Get billing info
      let cost = 0;
      try {
        const response = await vultr.billing.listBillingHistory();
        if (response && response.billing_history) {
          const instanceCharges = response.billing_history.filter(charge => 
            charge.description.toLowerCase().includes(selectedId.toLowerCase())
          );
          cost = instanceCharges.reduce((sum, charge) => sum + parseFloat(charge.amount), 0);
        }
      } catch (error) {
        console.error('Error getting billing info:', error);
      }
      
      // Confirm destruction
      await interaction.editReply({
        content: `🔄 Destroying server "${serverName}"...`,
        components: [] // Remove the select menu
      });

      // Destroy the instance
      await vultr.instances.deleteInstance({
        "instance-id": selectedId
      });

      // Update our state
      instanceState.updateInstance(selectedId, 'destroyed');

      // Format cost as USD
      const formattedCost = cost > 0 
        ? `$${cost.toFixed(2)}`
        : 'unavailable';

      return interaction.editReply(
        `✅ Server "${serverName}" has been destroyed.\n` +
        `Thanks for being a Real One! 🙏\n` +
        `This session total cost was approximately ${formattedCost}.`
      );
    } catch (error) {
      console.error('Error destroying server:', error);
      return interaction.editReply({
        content: '❌ There was an error destroying the server.',
        components: [] // Remove the select menu
      });
    }
  }
});

// ================ START THE BOT ================

// Log in to Discord with bot token
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('Bot is connecting to Discord...'))
  .catch(error => console.error('Failed to login:', error));
