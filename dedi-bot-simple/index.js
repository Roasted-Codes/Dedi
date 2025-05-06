/**
 * Dedi Bot Simple - A streamlined Discord bot for managing Vultr VPS instances
 * 
 * This single-file implementation contains all functionality in one place for
 * maximum simplicity and ease of debugging.
 */

// ================ CONFIGURATION AND SETUP ================ //
// This section loads necessary libraries, environment variables, and sets up
// the connections to Discord and Vultr.

// Load environment variables from the .env file
// This allows us to keep sensitive information like API keys out of the code.
// Make sure you have a .env file in the same directory with DISCORD_TOKEN and VULTR_API_KEY.
require('dotenv').config();

// Import required libraries (dependencies)
const { 
  Client,                  // The main Discord client class used to interact with Discord.
  GatewayIntentBits,       // Defines which events the bot needs to receive from Discord (e.g., messages, presence updates).
  Collection,              // A utility class similar to a Map, used here for storing bot commands.
  REST,                    // Module for interacting with the Discord REST API (used for registering commands).
  Routes,                  // Utility for constructing Discord API routes easily.
  SlashCommandBuilder,     // Helper to build the structure of slash commands (/list, /create, etc.).
  ActionRowBuilder,        // Helper to build rows that contain components like buttons or select menus.
  StringSelectMenuBuilder  // Helper to build dropdown select menus for user interaction.
} = require('discord.js'); // The official Discord library for Node.js.
const VultrNode = require('@vultr/vultr-node'); // The Vultr API client library for interacting with Vultr services.

// Initialize the Discord Client
// We need to tell Discord what kind of events our bot wants to receive (Intents).
// GatewayIntentBits.Guilds is necessary for basic bot functionality within servers (guilds),
// like receiving command interactions.
const client = new Client({
  intents: [GatewayIntentBits.Guilds] // Specifies the bot will only receive guild-related events.
});

// Initialize the Vultr API Client
// It uses the API key stored in the .env file. The key 'VULTR_API_KEY' must match the one in your .env file.
const vultr = VultrNode.initialize({
  apiKey: process.env.VULTR_API_KEY // Reads the API key from the environment variable.
});

// Simple Vultr API test on startup
// This makes a quick call to the Vultr API when the bot starts to check if the connection
// and API key are working. It prints a success or failure message to the console.
console.log('Testing Vultr API connection...');
vultr.instances.listInstances()
  .then(response => console.log('✅ Vultr API connected successfully')) // Logs success if the API call works.
  .catch(error => console.log('❌ Vultr API connection failed:', error.message)); // Logs an error if the API call fails.

// ================ IN-MEMORY STATE MANAGEMENT ================ //
// This section handles storing information about the Vultr instances (servers)
// that the bot manages. It uses a simple JavaScript object (`instanceState`)
// to keep track of server details directly in the bot's memory.
// This is simpler than using a database but means the data is lost if the bot restarts.

// `instanceState` holds all the data about the servers.
const instanceState = {
  // `instances` is an array where each element represents a server.
  instances: [],
  
  /**
   * Adds a new server to the tracking list or updates an existing one.
   * @param {string} instanceId - The unique ID of the Vultr instance.
   * @param {string} userId - The Discord user ID of the person who created the server.
   * @param {string} username - The Discord username of the creator.
   * @param {string} status - The current status (e.g., 'creating', 'running', 'stopped').
   * @param {object} metadata - Optional extra data like IP address or server name.
   * @returns {object} The data for the tracked/updated instance.
   */
  trackInstance: function(instanceId, userId, username, status, metadata = {}) {
    const timestamp = new Date(); // Record the current time.
    // Check if we are already tracking an instance with this ID.
    const existingIndex = this.instances.findIndex(i => i.id === instanceId);
    
    // Prepare the data structure for the instance.
    const instanceData = {
      id: instanceId,
      creator: {
        id: userId,
        username
      },
      createdAt: timestamp.toISOString(), // Store creation time in a standard format.
      status: status || 'creating', // Default status to 'creating' if not provided.
      ip: metadata.ip || null, // Store IP if available.
      name: metadata.name || `${username}'s Server`, // Use provided name or create a default.
      lastUpdated: timestamp.toISOString() // Record the time of the last update.
    };

    // If the instance already exists in our list, update it.
    if (existingIndex >= 0) {
      this.instances[existingIndex] = {
        ...this.instances[existingIndex], // Keep existing data
        ...instanceData // Overwrite with new data
      };
    } else {
      // If it's a new instance, add it to the end of the `instances` array.
      this.instances.push(instanceData);
    }
    
    // Return the final data for the instance.
    return instanceData;
  },
  
  /**
   * Updates the status and/or metadata of an already tracked instance.
   * @param {string} instanceId - The ID of the instance to update.
   * @param {string} status - The new status.
   * @param {object} metadata - Optional new metadata (like IP address).
   * @returns {object|null} The updated instance data, or null if not found.
   */
  updateInstance: function(instanceId, status, metadata = {}) {
    // Find the index of the instance in the `instances` array.
    const instanceIndex = this.instances.findIndex(i => i.id === instanceId);
    
    // If the instance is found (index is 0 or greater)...
    if (instanceIndex >= 0) {
      // Update the instance's data in the array.
      this.instances[instanceIndex] = {
        ...this.instances[instanceIndex], // Keep the old data
        status, // Update the status
        lastUpdated: new Date().toISOString(), // Update the last updated time
        ...metadata // Add or overwrite any provided metadata
      };

      // Return the updated instance object.
      return this.instances[instanceIndex];
    }
    
    // If the instance wasn't found, return null.
    return null;
  },
  
  /**
   * Gets a list of all instances that are not considered terminated or destroyed.
   * @returns {Array<object>} An array of active instance objects.
   */
  getActiveInstances: function() {
    // Filter the `instances` array, keeping only those whose status
    // is NOT 'terminated' and NOT 'destroyed'.
    return this.instances.filter(i => 
      i.status !== 'terminated' && i.status !== 'destroyed'
    );
  },
  
  /**
   * Finds and returns a single instance by its ID.
   * @param {string} instanceId - The ID of the instance to find.
   * @returns {object|undefined} The instance object if found, or undefined otherwise.
   */
  getInstance: function(instanceId) {
    // Search the `instances` array for the first element with a matching ID.
    return this.instances.find(i => i.id === instanceId);
  },
  
  /**
   * Gets a list of all instances created by a specific Discord user.
   * @param {string} userId - The Discord user ID to filter by.
   * @returns {Array<object>} An array of instance objects created by that user.
   */
  getUserInstances: function(userId) {
    // Filter the `instances` array, keeping only those where the creator's ID matches.
    return this.instances.filter(i => i.creator.id === userId);
  },

  // Set to store IDs of protected instances
  // Using Set because it automatically handles duplicates and has fast lookups
  protectedInstances: new Set(),
  
  // Method to mark an instance as protected
  // This prevents regular users from destroying it
  protectInstance: function(instanceId) {
    this.protectedInstances.add(instanceId);
  },
  
  // Method to remove protection from an instance
  // This allows regular users to destroy it again
  unprotectInstance: function(instanceId) {
    this.protectedInstances.delete(instanceId);
  },
  
  // Method to check if an instance is protected
  // Returns true if protected, false if not
  isProtected: function(instanceId) {
    return this.protectedInstances.has(instanceId);
  }
};

// ================ VULTR API FUNCTIONS ================ //
// This section contains functions that wrap the Vultr API calls.
// These functions make it easier to interact with Vultr from other parts of the bot.
// They handle making the requests and processing the responses (or errors).

/**
 * Get detailed information about a specific Vultr instance (server).
 * @param {string} instanceId - The unique ID of the instance to fetch.
 * @returns {Promise<Object>} A promise that resolves with the instance details object from Vultr.
 * @throws Will throw an error if the API call fails.
 */
async function getInstance(instanceId) {
  try {
    // Use the Vultr client library to call the 'getInstance' endpoint.
    const response = await vultr.instances.getInstance({ 
      "instance-id": instanceId // Pass the required instance ID parameter.
    });
    // The actual instance data is usually nested within the response.
    return response.instance;
  } catch (error) {
    // Log any errors that occur during the API call.
    console.error('Error getting instance:', error);
    // Re-throw the error so the calling function knows something went wrong.
    throw error;
  }
}

/**
 * List all instances in the Vultr account
 */
async function listInstances() {
  try {
    console.log('Making Vultr API request to list instances...');
    // Log the API key length for debugging (don't log the actual key!)
    console.log('API Key length:', process.env.VULTR_API_KEY?.length || 'not set');
    
    // Add more detailed request logging
    console.log('Request details:', {
      method: 'GET',
      endpoint: '/instances',
      headers: {
        'Authorization': `Bearer ${process.env.VULTR_API_KEY ? 'PRESENT' : 'MISSING'}`
      }
    });

    const response = await vultr.instances.listInstances();
    
    // Log more response details
    console.log('Full Vultr Response:', {
      status: 'success',
      hasInstances: !!response.instances,
      instanceCount: response.instances?.length || 0,
      rawResponse: JSON.stringify(response, null, 2)
    });

    if (!response.instances) {
      console.warn('Warning: Vultr response missing instances array:', response);
    }
    
    return response.instances || [];
  } catch (error) {
    console.error('Detailed error listing instances:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers,
      stack: error.stack
    });
    
    // Check for specific error conditions
    if (error.response?.status === 401) {
      console.error('Authentication error - check API key permissions');
    } else if (error.response?.status === 403) {
      console.error('Authorization error - API key may not have required permissions');
    }
    
    throw error;
  }
}

/**
 * Send a command to Vultr to start a stopped instance.
 * @param {string} instanceId - The ID of the instance to start.
 * @returns {Promise<boolean>} A promise that resolves with true if the instance started successfully (within a timeout), false otherwise.
 * @throws Will throw an error if the initial API call fails.
 */
async function startInstance(instanceId) {
  try {
    // Call the 'startInstance' endpoint.
    await vultr.instances.startInstance({
      "instance-id": instanceId
    });
    
    // After telling Vultr to start, we need to wait and check if it actually becomes 'running'.
    // 'checkInstanceStatus' will poll the API until the desired status is reached or it times out.
    return await checkInstanceStatus(instanceId, 'active', 'running');
  } catch (error) {
    console.error('Error starting instance:', error);
    throw error;
  }
}

/**
 * Send a command to Vultr to stop (halt) a running instance.
 * @param {string} instanceId - The ID of the instance to stop.
 * @returns {Promise<boolean>} A promise that resolves with true if the instance stopped successfully (within a timeout), false otherwise.
 * @throws Will throw an error if the initial API call fails.
 */
async function stopInstance(instanceId) {
  try {
    // Call the 'haltInstance' endpoint.
    await vultr.instances.haltInstance({
      "instance-id": instanceId
    });
    
    // Similar to starting, we wait and check if the instance actually becomes 'stopped'.
    return await checkInstanceStatus(instanceId, 'active', 'stopped');
  } catch (error) {
    console.error('Error stopping instance:', error);
    throw error;
  }
}

/**
 * Periodically checks the status of a Vultr instance until it reaches a desired state or times out.
 * This is used after start/stop commands to confirm the action completed.
 * @param {string} instanceId - The ID of the instance to check.
 * @param {string} expectedStatus - The expected 'status' field (e.g., 'active').
 * @param {string} expectedPowerStatus - The expected 'power_status' field (e.g., 'running', 'stopped').
 * @param {number} [maxAttempts=20] - How many times to check before giving up.
 * @returns {Promise<boolean>} True if the expected status is reached, false if it times out.
 */
async function checkInstanceStatus(instanceId, expectedStatus, expectedPowerStatus, maxAttempts = 20) {
  // Loop up to `maxAttempts` times.
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Get the current details of the instance.
      const instance = await getInstance(instanceId);
      // Log the progress for debugging.
      console.log(`Status check (${i+1}/${maxAttempts}): status=${instance.status}, power_status=${instance.power_status}`);
      
      // Check if the current status matches the expected status.
      // Special case for 'stopped': only check power_status.
      if (expectedPowerStatus === 'stopped' && instance.power_status === 'stopped') {
        return true; // Target state reached.
      } else if (instance.status === expectedStatus && instance.power_status === expectedPowerStatus) {
        return true; // Target state reached.
      }
      
      // If not the target state yet, wait for 3 seconds before the next check.
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3000 milliseconds = 3 seconds
    } catch (error) {
      // Log errors during status check but continue trying.
      console.error(`Error checking instance status (attempt ${i+1}/${maxAttempts}):`, error);
    }
  }
  
  // If the loop finishes without reaching the target state, return false (timed out).
  console.log(`Instance ${instanceId} did not reach state ${expectedStatus}/${expectedPowerStatus} after ${maxAttempts} attempts.`);
  return false;
}

/**
 * Get a list of all available snapshots in the Vultr account.
 * @returns {Promise<Array>} A promise that resolves with an array of snapshot objects, sorted by creation date (newest first).
 * @throws Will throw an error if the API call fails.
 */
async function getSnapshots() {
  try {
    // Call the 'listSnapshots' endpoint.
    const response = await vultr.snapshots.listSnapshots();
    // Get the array of snapshots, or an empty array if none exist.
    const snapshots = response.snapshots || [];
    // Sort the snapshots so the most recent one is first in the list.
    snapshots.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
    return snapshots;
  } catch (error) {
    console.error('Error getting snapshots:', error);
    throw error;
  }
}

/**
 * Create a new Vultr instance from a specified snapshot.
 * @param {string} snapshotId - The ID of the snapshot to deploy the new server from.
 * @param {string} label - The name (label) to give the new instance.
 * @returns {Promise<Object>} A promise that resolves with the details of the newly created instance.
 * @throws Will throw an error if the API call fails.
 */
async function createInstanceFromSnapshot(snapshotId, label) {
  try {
    // Log the parameters being used to create the instance for debugging.
    console.log(`Creating instance with params:`, {
      snapshot_id: snapshotId, // Note: Vultr API uses snake_case here
      label, // The desired name for the server
      // Read region and plan from .env file, or use defaults if not set.
      region: process.env.VULTR_REGION || "dfw", // Default region (Dallas)
      plan: process.env.VULTR_PLAN || "vc2-1c-1gb" // Default plan (1 CPU, 1GB RAM)
    });

    // Call the 'createInstance' endpoint with the required parameters.
    const response = await vultr.instances.createInstance({
      "snapshot_id": snapshotId, // The snapshot to build from
      "label": label, // The server name
      "region": process.env.VULTR_REGION || "ewr", // Use environment variable or default (New Jersey)
      "plan": process.env.VULTR_PLAN || "vc2-1c-1gb" // Use environment variable or default plan
    });

    // Log the full response from Vultr for debugging purposes.
    console.log("Create instance response:", JSON.stringify(response, null, 2));
    
    // Return the details of the instance that was created.
    return response.instance;
  } catch (error) {
    console.error('Error creating instance from snapshot:', error);
    throw error;
  }
}

/**
 * Attempt to retrieve billing history related to a specific instance.
 * NOTE: Vultr billing API might not directly link all costs to an instance ID easily.
 * This function provides a basic estimate by searching descriptions.
 * @param {string} instanceId - The ID of the instance to check billing for.
 * @returns {Promise<number>} A promise that resolves with the estimated total cost found for the instance (or 0).
 */
async function getInstanceBilling(instanceId) {
  try {
    // Get the billing history using the correct endpoint
    const response = await vultr.billing.getBillingHistory();
    
    let totalCost = 0;
    if (response && response.billing) {
      // Filter the history entries where the description includes the instance ID
      const instanceCharges = response.billing.filter(charge => 
        charge.description.toLowerCase().includes(instanceId.toLowerCase())
      );
      // Sum up the 'amount' for the filtered charges
      totalCost = instanceCharges.reduce((sum, charge) => sum + parseFloat(charge.amount), 0);
    }
    
    return totalCost;
  } catch (error) {
    console.error('Error getting billing information:', error);
    return 0;
  }
}

/**
 * Send a command to Vultr to permanently delete an instance.
 * @param {string} instanceId - The ID of the instance to delete.
 * @returns {Promise<boolean>} A promise that resolves with true if the delete command was sent successfully.
 * @throws Will throw an error if the API call fails.
 */
async function deleteInstance(instanceId) {
  try {
    // Call the 'deleteInstance' endpoint.
    await vultr.instances.deleteInstance({
      "instance-id": instanceId
    });
    // If the call doesn't throw an error, assume it was successful.
    return true;
  } catch (error) {
    console.error('Error deleting instance:', error);
    throw error;
  }
}

// ================ UTILITY FUNCTIONS ================ //
// This section contains helper functions that format data into readable messages
// for Discord. These functions take raw data about servers and turn it into
// nicely formatted text with emojis and proper spacing.

/**
 * Format the status of a server instance with an appropriate emoji.
 * This makes it easy to quickly see the server's status in Discord.
 * 
 * @param {Object} instance - The server instance object to format
 * @returns {Object} An object containing an emoji and label for the status
 * 
 * Emoji meanings:
 * 🟢 = Server is running
 * 🔴 = Server is stopped
 * 🟡 = Server is in a pending state
 * ⚪ = Unknown/other status
 */
function formatStatus(instance) {
  let statusEmoji = '⚪'; // Default to white circle for unknown status
  
  // Choose the appropriate emoji based on the server's power status
  if (instance.power_status === 'running') {
    statusEmoji = '🟢'; // Green circle for running
  } else if (instance.power_status === 'stopped') {
    statusEmoji = '🔴'; // Red circle for stopped
  } else if (instance.status === 'pending') {
    statusEmoji = '🟡'; // Yellow circle for pending
  }
  
  return {
    emoji: statusEmoji,
    label: instance.power_status || instance.status
  };
}

/**
 * Format detailed information about a single server instance.
 * This creates a comprehensive view of a server's status and configuration.
 * 
 * @param {Object} instance - The tracked instance object from our bot
 * @param {Object} vultrInstance - The instance object from Vultr's API (optional)
 * @returns {string} A formatted message ready to send to Discord
 * 
 * Example output:
 * 🖥️ Server Details
 * 
 * 🟢 MyServer
 * > Status: running
 * > Region: NYC
 * > Plan: vc2-1c-1gb
 * > CPU: 1 cores
 * > RAM: 1024 MB
 * > Disk: 25 GB
 * > IP: 123.456.789.0
 * > Created by: Username
 * > Created: 1/1/2024, 12:00:00 PM
 */
function formatInstanceDetails(instance, vultrInstance = null) {
  // Get the status emoji and label
  const status = formatStatus(vultrInstance || instance);
  // Start building the message with a header
  let message = `🖥️ **Server Details**\n`;
  
  // Use the server label/name, with fallbacks if not available
  const serverName = (vultrInstance?.label || instance?.label || instance?.name || 'Unnamed Server');
  message += `\n${status.emoji} **${serverName}**`;
  message += `\n> Status: ${status.label}`;
  
  // If we have detailed Vultr instance data, add it
  if (vultrInstance) {
    message += `\n> Region: ${vultrInstance.region}`;
    message += `\n> Plan: ${vultrInstance.plan}`;
    message += `\n> CPU: ${vultrInstance.vcpu_count} cores`;
    message += `\n> RAM: ${vultrInstance.ram} MB`;
    message += `\n> Disk: ${vultrInstance.disk} GB`;
    
    // Add IP if available from Vultr data
    if (vultrInstance.main_ip) {
      message += `\n> IP: \`${vultrInstance.main_ip}\``;
    }
  } else if (instance?.ip) {
    // If no Vultr data but we have an IP in our tracking data, use that
    message += `\n> IP: \`${instance.ip}\``;
  }
  
  // Add creator info if available from our tracking data
  if (instance?.creator?.username) {
    message += `\n> Created by: ${instance.creator.username}`;
  }
  
  // Add creation date if available
  if (instance?.createdAt) {
    message += `\n> Created: ${new Date(instance.createdAt).toLocaleString()}`;
  }
  
  return message;
}

// ================ ENHANCED PERMISSION SYSTEM ================ //
/**
 * Checks if a user has permission to perform a specific command
 * This function handles all permission logic in one place
 * 
 * @param {Interaction} interaction - The Discord interaction object (contains user info)
 * @param {string} command - The command being attempted
 * @param {string} instanceId - Optional: The ID of the instance being acted upon
 * @returns {boolean} - True if the user has permission, false if not
 */
function checkPermissions(interaction, command, instanceId = null) {
  // Get the member object which contains their roles
  const member = interaction.member;
  // Check if the user has the admin role
  const isAdmin = member.roles.cache.has(ADMIN_ROLE_ID);
  
  // Define which roles can use which commands
  // This makes it easy to modify permissions in one place
  const commandPermissions = {
    'list': ['USER_ROLE_ID'],     // Everyone can list servers
    'status': ['USER_ROLE_ID'],   // Everyone can check status
    'create': ['USER_ROLE_ID'],   // Everyone can create servers
    'destroy': ['USER_ROLE_ID'],  // Everyone can destroy (with conditions)
    'stop': ['USER_ROLE_ID'],     // Everyone can stop servers
    'start': ['USER_ROLE_ID'],    // Everyone can start servers
    'protect': ['ADMIN_ROLE_ID'], // Only admins can protect
    'unprotect': ['ADMIN_ROLE_ID'], // Only admins can unprotect
    'snapshot': ['ADMIN_ROLE_ID'] // Only admins can create snapshots
  };

  // Check if the user has any of the roles required for this command
  const hasPermission = member.roles.cache.some(role => 
    commandPermissions[command].includes(role.id)
  );

  // Special handling for the destroy command
  if (command === 'destroy' && instanceId) {
    const instance = instanceState.getInstance(instanceId);
    if (instance) {
      // If user is admin, they can destroy unless instance is protected
      if (isAdmin) return !instanceState.isProtected(instanceId);
      
      // Regular users can only destroy their own unprotected instances
      return instance.creator.id === member.id && !instanceState.isProtected(instanceId);
    }
    return false; // Instance not found
  }

  return hasPermission;
}

// ================ NEW ADMIN COMMANDS ================ //
/**
 * Command to protect an instance from being destroyed by regular users
 * Only administrators can use this command
 */
const protectCommand = {
  data: new SlashCommandBuilder()
    .setName('protect')
    .setDescription('Protect a server from being destroyed by users'),
  
  async execute(interaction) {
    // First, check if the user is an admin
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      return interaction.reply({ 
        content: '❌ Only administrators can use this command.', 
        ephemeral: true // Only the user sees this message
      });
    }

    // Tell Discord we're working on it
    await interaction.deferReply();
    
    try {
      // Get list of all instances from Vultr
      const vultrInstances = await listInstances();
      // Filter out any destroyed instances
      const activeInstances = vultrInstances.filter(instance => 
        instance.status !== 'destroyed'
      );
      
      // If no active instances found, let the user know
      if (!activeInstances?.length) {
        return interaction.editReply('No active servers found to protect.');
      }

      // Create options for the dropdown menu
      // Each option shows the server name and protection status
      const options = activeInstances.map(instance => ({
        label: instance.label || 'Unnamed Server',
        description: `Status: ${instance.power_status} | Protected: ${instanceState.isProtected(instance.id) ? 'Yes' : 'No'}`,
        value: instance.id
      }));

      // Create a dropdown menu component
      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('protect_server')
            .setPlaceholder('Select a server to protect')
            .addOptions(options)
        );

      // Show the dropdown menu to the user
      return interaction.editReply({
        content: 'Select a server to protect:',
        components: [row]
      });
    } catch (error) {
      console.error('Error executing protect command:', error);
      return interaction.editReply('❌ There was an error listing servers.');
    }
  }
};

// ================ SNAPSHOT COMMAND ================ //
/**
 * Command to create a snapshot of an existing server
 * Only administrators can use this command
 * Requires a name for the snapshot
 */
const snapshotCommand = {
  data: new SlashCommandBuilder()
    .setName('snapshot')
    .setDescription('Create a snapshot of a server')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Name for the snapshot')
        .setRequired(true)), // User must provide a name
  
  async execute(interaction) {
    // Check admin permissions
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      return interaction.reply({ 
        content: '❌ Only administrators can use this command.',
        ephemeral: true 
      });
    }

    await interaction.deferReply();
    
    try {
      // Get the name the user provided for the snapshot
      const snapshotName = interaction.options.getString('name');
      
      // Get list of running instances
      const vultrInstances = await listInstances();
      // Only show instances that are running (can't snapshot stopped instances)
      const activeInstances = vultrInstances.filter(instance => 
        instance.status === 'active' && instance.power_status === 'running'
      );
      
      if (!activeInstances?.length) {
        return interaction.editReply('No running servers found to snapshot.');
      }

      // Create dropdown options
      const options = activeInstances.map(instance => ({
        label: instance.label || 'Unnamed Server',
        description: `Status: ${instance.power_status} | Region: ${instance.region}`,
        value: instance.id
      }));

      // Create dropdown menu
      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`create_snapshot_${snapshotName}`) // Include snapshot name in the ID
            .setPlaceholder('Select a server to snapshot')
            .addOptions(options)
        );

      return interaction.editReply({
        content: 'Select a server to create snapshot:',
        components: [row]
      });
    } catch (error) {
      console.error('Error executing snapshot command:', error);
      return interaction.editReply('❌ There was an error listing servers.');
    }
  }
};

// ================ INSTANCE CREATION ENHANCEMENT ================ //
/**
 * Waits for a newly created instance to become ready
 * Checks the instance status repeatedly until it's running
 * 
 * @param {string} instanceId - The ID of the instance to check
 * @param {number} maxAttempts - How many times to check before giving up
 * @returns {Object|null} - The instance object if ready, null if timed out
 */
async function waitForInstanceReady(instanceId, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Get the current state of the instance
      const instance = await getInstance(instanceId);
      // Check if it's fully ready
      if (instance.status === 'active' && instance.power_status === 'running') {
        return instance;
      }
      // Wait 10 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error) {
      console.error(`Error checking instance status (attempt ${i+1}):`, error);
    }
  }
  // If we tried maxAttempts times and it's still not ready, return null
  return null;
}

/**
 * Handles the creation of a new instance and provides feedback to the user
 * Waits for the instance to be ready and provides connection information
 */
async function handleInstanceCreation(interaction, instance) {
  try {
    await interaction.editReply('🔄 Server created! Waiting for it to be ready...');
    
    // Wait for the instance to be fully ready
    const readyInstance = await waitForInstanceReady(instance.id);
    if (readyInstance) {
      // Prepare a detailed message with connection information
      const accessInfo = `
✅ Server "${readyInstance.label}" is ready!

📋 Connection Information:
> IP Address: \`${readyInstance.main_ip}\`
> Username: \`${process.env.SERVER_USERNAME || 'game'}\`
> Password: Check your DMs for the password

⚡ Quick Actions:
• Use \`/status\` to check server status
• Use \`/stop\` to pause the server (billing continues)
• Use \`/destroy\` to permanently remove the server (billing stops)

Need help? Contact an admin!
`;
      
      // Try to send the password via DM for security
      if (process.env.SERVER_PASSWORD) {
        try {
          await interaction.user.send(
            `🔑 Password for "${readyInstance.label}": \`${process.env.SERVER_PASSWORD}\``
          );
        } catch (error) {
          console.error('Could not send DM to user:', error);
          accessInfo += '\n⚠️ Could not send password via DM. Please contact an admin for the password.';
        }
      }
      
      return interaction.editReply(accessInfo);
    } else {
      // Instance is taking longer than expected
      return interaction.editReply(
        '⚠️ Server created but taking longer than usual to be ready. ' +
        'Check status in a few minutes with `/status`'
      );
    }
  } catch (error) {
    console.error('Error in handleInstanceCreation:', error);
    return interaction.editReply(
      '❌ Error while waiting for server to be ready. ' +
      'Use `/status` to check its status.'
    );
  }
}

// ================ INTERACTION HANDLERS ================ //
// Add these to your existing interaction handlers
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu()) return;

  // Handle protecting servers
  if (interaction.customId === 'protect_server') {
    await interaction.deferUpdate();
    const selectedId = interaction.values[0];
    
    try {
      // Add the instance to the protected list
      instanceState.protectInstance(selectedId);
      // Get the instance details to show the server name
      const instance = await getInstance(selectedId);
      return interaction.editReply({
        content: `✅ Server "${instance.label}" is now protected from user destruction.`,
        components: [] // Remove the dropdown after selection
      });
    } catch (error) {
      console.error('Error protecting server:', error);
      return interaction.editReply({
        content: '❌ There was an error protecting the server.',
        components: []
      });
    }
  }

  // Handle snapshot creation
  if (interaction.customId.startsWith('create_snapshot_')) {
    await interaction.deferUpdate();
    // Extract the instance ID and snapshot name from the interaction
    const selectedId = interaction.values[0];
    const snapshotName = interaction.customId.replace('create_snapshot_', '');
    
    try {
      // Let the user know we're working on it
      await interaction.editReply({
        content: '🔄 Creating snapshot... This may take several minutes...',
        components: []
      });

      // Call Vultr API to create the snapshot
      const snapshot = await vultr.snapshots.createSnapshot({
        instance_id: selectedId,
        description: snapshotName
      });

      // Confirm success and provide the snapshot ID
      return interaction.editReply(
        `✅ Snapshot "${snapshotName}" created successfully!\n` +
        `Snapshot ID: \`${snapshot.snapshot.id}\``
      );
    } catch (error) {
      console.error('Error creating snapshot:', error);
      return interaction.editReply({
        content: '❌ There was an error creating the snapshot.',
        components: []
      });
    }
  }
});

// ================ COMMAND DEFINITIONS ================ //
// This section defines all the slash commands that users can use in Discord.
// Each command (like /list, /status, etc.) is defined with its functionality.

// Collection to store command handlers
// This is like a special Map that Discord.js provides to store our commands
client.commands = new Collection();

/**
 * /status Command
 * Shows detailed information about a specific server.
 * Users can select which server they want to check from a dropdown menu.
 */
const statusCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check the status of a game server'),
  
  async execute(interaction) {
    console.log('Status command: Starting execution');
    await interaction.deferReply();
    console.log('Status command: Reply deferred');
    
    try {
      console.log('Status command: Attempting to list instances from Vultr...');
      const vultrInstances = await listInstances();
      console.log('Status command: Vultr API Response:', JSON.stringify(vultrInstances, null, 2));
      
      if (!vultrInstances || vultrInstances.length === 0) {
        console.log('Status command: No instances found in Vultr response');
        return interaction.editReply('No servers found.');
      }

      // Create dropdown menu options for each server
      const options = vultrInstances.map(instance => ({
        label: instance.label || 'Unnamed Server',
        description: `Status: ${instance.power_status} | IP: ${instance.main_ip} | Region: ${instance.region}`,
        value: instance.id
      }));

      // Create the dropdown menu component
      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_server')
            .setPlaceholder('Select a server to check')
            .addOptions(options)
        );

      // Send the message with the dropdown menu
      return interaction.editReply({
        content: 'Choose a server to check its status:',
        components: [row]
      });
    } catch (error) {
      console.error('Status command: Error during execution:', error);
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
      
      // Instead of just saying "check /status", let's wait and notify
      await interaction.editReply(
        `✅ Hey <@${interaction.user.id}>, server "${serverName}" creation started!\n` +
        `Waiting for server to be ready...`
      );

      // Wait for the server to be ready
      const readyInstance = await waitForInstanceReady(instance.id);
      
      if (readyInstance) {
      return interaction.editReply(
          `🎉 <@${interaction.user.id}>, your server "${serverName}" is ready!\n` +
          `IP Address: \`${readyInstance.main_ip}\``
        );
      } else {
        return interaction.editReply(
          `⚠️ <@${interaction.user.id}>, server "${serverName}" started but taking longer than usual.\n` +
          `Use \`/status\` to check when it's ready.`
        );
      }
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
        // Filter out destroyed instances AND the Discord bot instance
        instance.status !== 'destroyed' && 
        instance.power_status !== 'destroyed' &&
        instance.label !== 'DISCORD-BOT' // Add this condition to protect the bot
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

// Add all commands to the collection so Discord can use them
client.commands.set(statusCommand.data.name, statusCommand);
client.commands.set(startCommand.data.name, startCommand);
client.commands.set(stopCommand.data.name, stopCommand);
client.commands.set(createCommand.data.name, createCommand);
client.commands.set(destroyCommand.data.name, destroyCommand);
client.commands.set(protectCommand.data.name, protectCommand);
client.commands.set(snapshotCommand.data.name, snapshotCommand);

// ================ EVENT HANDLERS ================ //
// This section defines how the bot responds to various events,
// such as when it starts up or receives commands from users.

/**
 * Bot Ready Event Handler
 * This runs once when the bot successfully connects to Discord.
 * It registers all our commands with Discord so they show up in the slash command menu.
 */
client.once('ready', async () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
  
  try {
    // Convert our commands into a format Discord understands
    const commands = [...client.commands.values()].map(command => command.data.toJSON());
    
    // Create a REST API client to talk to Discord
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    console.log(`Registering ${commands.length} application commands...`);
    
    // Send our commands to Discord to register them globally
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    
    console.log(`Successfully registered ${commands.length} application commands!`);
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

/**
 * Command Interaction Handler
 * This runs every time someone uses a slash command.
 * It figures out which command was used and runs the appropriate code.
 */
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) {
    console.log('Received non-command interaction:', interaction.type);
    return;
  }
  
  console.log('=== Command Execution Start ===');
  console.log(`Command received: /${interaction.commandName} from ${interaction.user.tag}`);
  
  const command = client.commands.get(interaction.commandName);
  
  if (!command) {
    console.error(`Command ${interaction.commandName} not found in registered commands`);
    console.log('Currently registered commands:', Array.from(client.commands.keys()));
    return interaction.reply({
      content: 'Sorry, this command is not available.',
      ephemeral: true
    });
  }
  
  try {
    console.log(`Executing command: ${interaction.commandName}`);
    await command.execute(interaction);
    console.log(`Command ${interaction.commandName} executed successfully`);
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);
    console.error('Full error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    const replyMethod = interaction.replied || interaction.deferred
      ? interaction.followUp
      : interaction.reply;
    
    replyMethod.call(interaction, {
      content: 'There was an error while executing this command.',
      ephemeral: true
    }).catch(console.error);
  }
  console.log('=== Command Execution End ===');
});

/**
 * Select Menu Interaction Handler
 * This runs when someone uses one of our dropdown menus in Discord.
 * It handles showing detailed server information when a server is selected.
 */
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu()) return;

  // Handle the 'select_server' dropdown menu
  if (interaction.customId === 'select_server') {
    await interaction.deferUpdate();
    const selectedId = interaction.values[0];

    try {
      // Get detailed information about the selected server
      const instance = await getInstance(selectedId);
      const trackedInstance = instanceState.getInstance(selectedId);
      
      // Format and send the detailed server information
      const formattedStatus = formatInstanceDetails(trackedInstance, instance);
      return interaction.editReply({
        content: formattedStatus,
        components: [] // Remove the dropdown menu after selection
      });
    } catch (error) {
      console.error('Error handling server selection:', error);
      return interaction.editReply({
        content: '❌ There was an error getting the server status.',
        components: [] // Remove the dropdown menu
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
      
      // Add protection for the bot instance
      if (instance.label === 'DISCORD-BOT') {
        return interaction.editReply({
          content: '❌ This server cannot be destroyed as it runs the Discord bot.',
          components: [] // Remove the select menu
        });
      }
      
      const serverName = instance.label || 'Unnamed Server';
      
      // Check instance status first
      if (instance.status === 'pending' || instance.power_status === 'restoring') {
        return interaction.editReply({
          content: `⚠️ Cannot destroy "${serverName}" right now because it's ${instance.status === 'pending' ? 'still being set up' : 'being restored'}.\n\nPlease wait for the server to finish ${instance.status === 'pending' ? 'setting up' : 'restoring'} and try again.\n\nUse \`/status\` to check when it's ready.`,
          components: [] // Remove the select menu
        });
      }

      // Confirm destruction
      await interaction.editReply({
        content: `🔄 Attempting to destroy server "${serverName}"...`,
        components: [] // Remove the select menu
      });

      // Attempt to destroy the instance
      await vultr.instances.deleteInstance({
        "instance-id": selectedId
      });

      // Wait a moment and verify the instance is actually gone
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
      
      try {
        const checkInstance = await getInstance(selectedId);
        if (checkInstance) {
          return interaction.editReply(
            `⚠️ Server "${serverName}" destruction initiated but may take a few minutes to complete.\n` +
            `Use \`/status\` to check server status.`
          );
        }
      } catch (error) {
        // If getInstance throws an error, the instance is probably gone
        // This is actually what we want!
      }

      // Update our state
      instanceState.updateInstance(selectedId, 'destroyed');

      return interaction.editReply(
        `✅ Server "${serverName}" has been destroyed successfully!\n` +
        `Thanks for being a Real One! 🙏`
      );

    } catch (error) {
      console.error('Error destroying server:', error);
      return interaction.editReply({
        content: '❌ There was an error destroying the server. Please try again in a few minutes or contact an admin if the problem persists.',
        components: [] // Remove the select menu
      });
    }
  }
});

// ================ START THE BOT ================ //
// Finally, connect to Discord using our bot token
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('Bot is connecting to Discord...'))
  .catch(error => console.error('Failed to login:', error));
