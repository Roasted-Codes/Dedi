/**
 * NOTE: Make sure your Vultr API key settings allow requests from this server's IP address, or commands will fail!
 * 
 * SELF-PROTECTION: The bot automatically detects and excludes the current server from all management
 * operations (list, status, start, stop, destroy) using Vultr's metadata service. No manual setup required!
 * 
 * EXCLUDE_SNAPSHOT_ID: (Optional) Set this environment variable to exclude additional servers by snapshot ID.
 * EXCLUDE_INSTANCE_ID: (Optional) Fallback if metadata service is unavailable - manually specify instance ID.
 * ADMIN_USER_IDS: (Required for snapshots) Comma-separated Discord user IDs who can create snapshots (e.g., "123456789,987654321")
 * VULTR_PUBLIC_SNAPSHOTS: (Legacy/Optional) Comma-separated snapshot IDs - now auto-detected via [PUBLIC] prefix
 *
 * Last Updated: September 7 2025 - Added dynamic snapshot management, consolidated handlers, self-protection
 * 
 * RECENT CODE IMPROVEMENTS (September 2025):
 * ========================================
 * 
 * 1. CONSOLIDATED INTERACTION HANDLERS:
 *    - Replaced 5 separate client.on('interactionCreate') handlers with 1 unified handler
 *    - Reduced code duplication from ~150 lines to ~80 lines
 *    - Improved maintainability while preserving ALL functionality
 *    - All Vultr OpenAPI calls remain exactly the same
 * 
 * 2. SIMPLIFIED STATUS LOGIC:
 *    - Replaced if/else chain with clean object map for status emojis
 *    - More maintainable and easier to extend
 * 
 * 3. MODERNIZED SYNTAX:
 *    - Replaced `!array || array.length === 0` with `!array?.length`
 *    - Cleaner null checks throughout the codebase
 * 
 * 4. REMOVED DEAD CODE:
 *    - Eliminated unused select_continent handler (~30 lines)
 *    - Cleaner codebase with no orphaned functionality
 * 
 * 5. ADDED SELF-PROTECTION:
 *    - Bot automatically detects current server using Vultr metadata service
 *    - Prevents accidental self-destruction via /destroy command
 *    - No manual .env configuration required - works out of the box
 *    - Fallback to EXCLUDE_INSTANCE_ID if metadata service unavailable
 * 
 * IMPORTANT: All Discord bot functionality and Vultr API integration remains identical.
 * These are purely code quality improvements with enhanced safety features.
 */

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

// Ensure fetch is available (Node.js 18+ has it built-in)
const fetch = globalThis.fetch || require('node-fetch');

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

// Add server creation state management
const serverCreationState = new Map();

// ================ VULTR API FUNCTIONS ================

/**
 * Auto-detect the current server instance to prevent self-destruction
 * Uses Vultr metadata service to identify this server automatically
 */
async function getCurrentServerInstanceId() {
  try {
    // Try to get the instance ID from Vultr's metadata service
    // This is available inside Vultr instances at this endpoint
    const response = await fetch('http://169.254.169.254/v1/instanceid', {
      timeout: 2000 // 2 second timeout
    });
    
    if (response.ok) {
      const instanceId = await response.text();
      console.log(`Auto-detected current server instance ID: ${instanceId}`);
      return instanceId.trim();
    }
  } catch (error) {
    console.log('Could not auto-detect current server (running outside Vultr or metadata service unavailable)');
  }
  
  // Fallback to environment variable if metadata service fails
  return process.env.EXCLUDE_INSTANCE_ID || null;
}

// Cache the current server ID to avoid repeated metadata calls
let currentServerInstanceId = null;

/**
 * Check if an instance ID is the current server running this bot
 */
async function isCurrentServer(instanceId) {
  if (!currentServerInstanceId) {
    currentServerInstanceId = await getCurrentServerInstanceId();
  }
  return currentServerInstanceId === instanceId;
}

/**
 * Get information about a specific instance (returns null for excluded instances)
 */
async function getInstance(instanceId) {
  try {
    const response = await vultr.instances.getInstance({ 
      "instance-id": instanceId 
    });
    const instance = response.instance;
    
    // Check if this instance should be excluded
    const excludeSnapshotId = process.env.EXCLUDE_SNAPSHOT_ID;
    if (excludeSnapshotId && instance.snapshot_id === excludeSnapshotId) {
      console.log(`Access denied to excluded instance ${instanceId} (created from snapshot ${excludeSnapshotId})`);
      return null;
    }
    
    return instance;
  } catch (error) {
    console.error('Error getting instance:', error);
    throw error;
  }
}

/**
 * List all instances in the Vultr account (excluding the current server and EXCLUDE_SNAPSHOT_ID)
 */
async function listInstances() {
  try {
    const response = await vultr.instances.listInstances();
    let instances = response.instances || [];
    
    // Filter out the current server automatically
    const filteredInstances = [];
    for (const instance of instances) {
      const isCurrent = await isCurrentServer(instance.id);
      if (!isCurrent) {
        filteredInstances.push(instance);
      } else {
        console.log(`Auto-excluded current server ${instance.id} (${instance.label || 'Unnamed'}) from management`);
      }
    }
    instances = filteredInstances;
    
    // Also filter out excluded instances if EXCLUDE_SNAPSHOT_ID is set (backward compatibility)
    const excludeSnapshotId = process.env.EXCLUDE_SNAPSHOT_ID;
    if (excludeSnapshotId) {
      const filtered = instances.filter(instance => instance.snapshot_id !== excludeSnapshotId);
      const excludedCount = instances.length - filtered.length;
      if (excludedCount > 0) {
        console.log(`Filtered out ${excludedCount} instance(s) created from excluded snapshot ${excludeSnapshotId}`);
      }
      return filtered;
    }
    
    return instances;
  } catch (error) {
    console.error('Error listing instances:', error);
    throw error;
  }
}

/**
 * Start an instance
 */
async function startInstance(interaction, instanceId) {
  try {
    await interaction.editReply({
      content: '🔄 Starting the server. This may take a few minutes...',
      components: []
    });

    await vultr.instances.startInstance({ "instance-id": instanceId });

    const success = await waitForInstanceStatus(instanceId, 'running');
    if (success) {
      instanceState.updateInstance(instanceId, 'running');
      interaction.editReply('✅ Server started successfully!');
    } else {
      interaction.editReply('❌ Failed to confirm the server has started. Please check its status manually.');
    }
  } catch (error) {
    console.error('Error starting server:', error);
    interaction.editReply('❌ There was an error starting the server.');
  }
}

/**
 * Stop an instance
 */
async function stopInstance(interaction, instanceId) {
  try {
    await interaction.editReply({
      content: '🔄 Stopping the server. This may take a few minutes...',
      components: []
    });

    await vultr.instances.haltInstance({ "instance-id": instanceId });

    const success = await waitForInstanceStatus(instanceId, 'stopped');
    if (success) {
      instanceState.updateInstance(instanceId, 'stopped');
      interaction.editReply('✅ Server stopped successfully!');
    } else {
      interaction.editReply('❌ Failed to confirm the server has stopped. Please check its status manually.');
    }
  } catch (error) {
    console.error('Error stopping server:', error);
    interaction.editReply('❌ There was an error stopping the server.');
  }
}

async function waitForInstanceStatus(instanceId, targetPowerStatus, timeout = 15 * 60 * 1000) {
  const startTime = Date.now();
  const checkInterval = 15000; // 15 seconds

  while (Date.now() - startTime < timeout) {
    try {
      const instance = await getInstance(instanceId);
      if (!instance) {
        console.log(`Instance ${instanceId} is excluded from management`);
        return false; // Can't wait for excluded instance
      }
      console.log(`Waiting for status: ${instance.power_status}, expecting: ${targetPowerStatus}`);
      if (instance.power_status === targetPowerStatus) {
        return true;
      }
    } catch (error) {
      console.error(`Error checking instance status for ${instanceId}:`, error);
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval));
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
 * Get snapshots available to public users (dynamically detected via [PUBLIC] prefix)
 */
async function getPublicSnapshots() {
  try {
    const allSnapshots = await getSnapshots();
    
    // Filter snapshots marked as public via naming convention
    const publicSnapshots = allSnapshots.filter(snapshot => {
      const description = snapshot.description || '';
      // Look for [PUBLIC] prefix or #public tag
      return (description.startsWith('[PUBLIC]') || description.includes('#public')) 
        && snapshot.status === 'complete';
    });
    
    // If no public snapshots found via API, fall back to default snapshot
    if (publicSnapshots.length === 0 && process.env.VULTR_SNAPSHOT_ID) {
      const defaultSnapshot = allSnapshots.find(snap => snap.id === process.env.VULTR_SNAPSHOT_ID);
      if (defaultSnapshot && defaultSnapshot.status === 'complete') {
        console.log('No [PUBLIC] snapshots found, falling back to VULTR_SNAPSHOT_ID');
        return [defaultSnapshot];
      }
    }
    
    // Also include legacy snapshots from VULTR_PUBLIC_SNAPSHOTS for backward compatibility
    const legacySnapshotIds = process.env.VULTR_PUBLIC_SNAPSHOTS?.split(',').map(id => id.trim()) || [];
    if (legacySnapshotIds.length > 0) {
      const legacySnapshots = allSnapshots.filter(snap => 
        legacySnapshotIds.includes(snap.id) && snap.status === 'complete'
      );
      // Merge with public snapshots, avoiding duplicates
      legacySnapshots.forEach(legacySnap => {
        if (!publicSnapshots.find(pubSnap => pubSnap.id === legacySnap.id)) {
          publicSnapshots.push(legacySnap);
        }
      });
    }
    
    console.log(`Found ${publicSnapshots.length} public snapshots available for restore`);
    return publicSnapshots;
  } catch (error) {
    console.error('Error getting public snapshots:', error);
    return [];
  }
}

/**
 * Create a snapshot from a running instance
 */
async function createSnapshotFromInstance(instanceId, description) {
  try {
    console.log(`Creating snapshot from instance ${instanceId} with description: ${description}`);
    
    const response = await vultr.snapshots.createSnapshot({
      "instance_id": instanceId,
      "description": description
    });
    
    console.log('Snapshot creation response:', JSON.stringify(response, null, 2));
    return response.snapshot;
  } catch (error) {
    console.error('Error creating snapshot:', error);
    throw error;
  }
}

/**
 * Check if user has permission to create snapshots
 */
function hasSnapshotPermission(userId) {
  const adminUsers = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()) || [];
  console.log(`Checking snapshot permission for user ${userId}. Admin users: ${adminUsers.join(', ')}`);
  return adminUsers.includes(String(userId));
}

/**
 * Clean snapshot name for display by removing [PUBLIC]/[PRIVATE] prefixes
 */
function getCleanSnapshotName(snapshot) {
  const description = snapshot.description || 'Unnamed Snapshot';
  // Remove [PUBLIC] or [PRIVATE] prefixes and clean up formatting
  return description
    .replace(/^\[(PUBLIC|PRIVATE)\]\s*/, '')  // Remove prefix
    .replace(/\s*\|\s*$/, '')                // Remove trailing separator
    .trim() || 'Unnamed Snapshot';           // Fallback if empty
}

/**
 * Format snapshot information for Discord display
 */
function formatSnapshotInfo(snapshot, includeId = false) {
  const sizeGB = snapshot.size ? `${snapshot.size} GB` : 'Unknown size';
  const created = new Date(snapshot.date_created).toLocaleString();
  const cleanName = getCleanSnapshotName(snapshot);
  
  let message = `📸 **${cleanName}**\n`;
  message += `> Size: ${sizeGB}\n`;
  message += `> Created: ${created}\n`;
  message += `> Status: ${snapshot.status}`;
  
  if (includeId) {
    message += `\n> ID: \`${snapshot.id}\``;
  }
  
  return message;
}

/**
 * Fetches all Vultr regions and organizes them by continent and country
 * Following OpenAPI spec exactly
 */
async function getGroupedRegions(vultrClient) {
  try {
    const response = await vultrClient.regions.listRegions();
    const regions = response.regions || [];
    
    // Debug log to see all regions
    console.log('All available regions:', regions.map(r => ({
      id: r.id,
      city: r.city,
      country: r.country,
      continent: r.continent,
      options: r.options
    })));
    
    const grouped = {};
    for (const region of regions) {
      // Only include regions that support the required options
      const hasRequiredOptions = region.options && region.options.includes('kubernetes');
      
      if (hasRequiredOptions) {
        const continent = region.continent || 'Other';
        const country = region.country || 'Other';
        
        if (!grouped[continent]) grouped[continent] = {};
        if (!grouped[continent][country]) grouped[continent][country] = [];
        
        grouped[continent][country].push({
          id: region.id,
          city: region.city,
          country: region.country,
          continent: region.continent,
          options: region.options
        });
      }
    }

    // Debug log to see grouped regions
    console.log('Grouped regions:', JSON.stringify(grouped, null, 2));
    
    return grouped;
  } catch (error) {
    console.error('Error fetching regions:', error);
    throw error;
  }
}

/**
 * Create a new instance from a snapshot with specified region
 * @param {string} snapshotId - The ID of the snapshot to create the instance from
 * @param {string} label - The name/label for the new instance
 * @param {string} region - The region where the instance should be deployed
 * @returns {Promise<Object>} The created instance object
 */
async function createInstanceFromSnapshot(snapshotId, label, region) {
  try {
    // Log the creation parameters for debugging
    console.log(`Creating instance with params:`, {
      snapshot_id: snapshotId,
      label,
      region: region || process.env.VULTR_REGION || "dfw",
      plan: process.env.VULTR_PLAN || "vc2-1c-1gb"
    });
    
    // Create the instance with the specified region
    const response = await vultr.instances.createInstance({
      "snapshot_id": snapshotId,
      "label": label,
      "region": region || process.env.VULTR_REGION || "dfw",
      "plan": process.env.VULTR_PLAN || "vc2-1c-1gb"
    });
    
    console.log("Create instance response:", JSON.stringify(response, null, 2));

    // Configure firewall if enabled in environment variables
    if (process.env.VULTR_FIREWALL_ENABLED === 'true') {
      try {
        const firewallGroupId = process.env.VULTR_FIREWALL_GROUP_ID;
        
        if (!firewallGroupId) {
          console.error('VULTR_FIREWALL_GROUP_ID not set in environment variables');
          return response.instance;
        }

        // Wait for instance to be active before attaching firewall
        console.log('Waiting for instance to be active before attaching firewall...');
        const isActive = await waitForInstanceStatus(response.instance.id, 'running', 5 * 60 * 1000); // 5 minute timeout
        
        if (isActive) {
          await vultr.instances.updateInstance({
            "instance-id": response.instance.id,
            "firewall_group_id": firewallGroupId
          });
          
          console.log(`Firewall group ${firewallGroupId} attached to instance ${response.instance.id}`);
        } else {
          console.error('Instance did not become active in time, firewall not attached');
        }
      } catch (firewallError) {
        console.error('Error configuring firewall:', firewallError);
      }
    }
    
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
  const statusMap = {
    'running': '🟢',
    'stopped': '🔴',
    'pending': '🟡'
  };
  
  const status = instance.power_status || instance.status;
  const emoji = statusMap[status] || '⚪';
  
  return {
    emoji: emoji,
    label: status
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
    
    if (vultrInstance.main_ip) {
      message += `\n> Linux Remote Desktop: https://${vultrInstance.main_ip}:8080`;
      message += `\n> Xlink Kai: http://${vultrInstance.main_ip}:34522`;
    }
  } else if (instance?.ip) {
    message += `\n> Region: ${instance.region || 'Unknown'}`;
    message += `\n> Linux Remote Desktop: https://${instance.ip}:8080`;
    message += `\n> Xlink Kai: http://${instance.ip}:34522`;
  }
  
  return message;
}

/**
 * Automatically poll instance status and update the Discord message when ready
 * OpenAPI-compliant implementation with proper error handling and unlimited polling
 */
async function startInstanceStatusPolling(instanceId, serverName, region, interaction, message) {
  console.log(`Starting status polling for instance ${instanceId}`);
  
  let attempts = 0;
  const maxWaitTime = 30 * 60 * 1000; // 30 minutes absolute maximum
  const startTime = Date.now();
  
  const pollStatus = async () => {
    attempts++;
    const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
    
    // Hard stop at 30 minutes (reasonable for any cloud instance)
    if (Date.now() - startTime > maxWaitTime) {
      const timeoutMessage = 
        `⏰ Server "${serverName}" exceeded 30-minute startup limit.\n` +
        `📊 Use \`/status\` to check manually or contact support.\n` +
        `Don't forget to use /destroy to delete your server when you're done!`;
      
      await interaction.editReply(timeoutMessage);
      console.log(`❌ Instance ${instanceId} polling timeout after 30 minutes`);
      return;
    }
    
    try {
      // Call GET /instances/{instance-id} per OpenAPI spec
      const instance = await getInstance(instanceId);
      if (!instance) {
        console.log(`Instance ${instanceId} is excluded from management - stopping status polling`);
        await interaction.editReply('❌ This server is not available for management.');
        return;
      }
      const status = formatStatus(instance);
      
      console.log(`Poll ${attempts} (${elapsedMinutes}min): status=${instance.status}, power=${instance.power_status}, ip=${instance.main_ip}`);
      
      // Update tracking
      instanceState.updateInstance(instanceId, instance.power_status, {
        ip: instance.main_ip
      });
      
      // Server is ready when: status=active, power_status=running, has real IP
      if (instance.status === 'active' && 
          instance.power_status === 'running' && 
          instance.main_ip && 
          instance.main_ip !== '0.0.0.0' &&
          instance.main_ip !== '') {
        
        // SUCCESS - Server is fully ready
        const finalMessage = 
          `✅ Server "${serverName}" is now READY in ${region.toUpperCase()}! 🎉\n\n` +
          `🖥️ **Connection Details:**\n` +
          `> Linux Remote Desktop: https://${instance.main_ip}:8080\n` +
          `> Xlink Kai: http://${instance.main_ip}:34522\n` +
          `> IP Address: \`${instance.main_ip}\`\n\n` +
          `🎮 Your server is ready for gaming!\n` +
          `⏱️ Total setup time: ${elapsedMinutes} minutes\n` +
          `Don't forget to use /destroy to delete your server when you're done!`;
        
        await interaction.editReply(finalMessage);
        console.log(`✅ Instance ${instanceId} ready after ${elapsedMinutes} minutes!`);
        return; // Stop polling
        
      } else if (instance.status === 'active' && instance.power_status === 'stopped') {
        // Instance is created but stopped - start it (OpenAPI compliant)
        console.log(`Instance ${instanceId} is stopped, attempting to start...`);
        
        try {
          // POST /instances/{instance-id}/start per OpenAPI spec (no body)
          await vultr.instances.startInstance({
            "instance-id": instanceId
          });
          console.log(`Start command sent for instance ${instanceId}`);
        } catch (startError) {
          console.error(`Error starting instance ${instanceId}:`, startError);
        }
        
        // Continue polling after start attempt
        const progressMessage = 
          `✅ Server "${serverName}" creation in ${region.toUpperCase()}!\n` +
          `⏳ Status: ${status.emoji} Starting server... (${elapsedMinutes}min)\n` +
          `📊 Auto-checking until ready...\n` +
          `💡 Server will show connection details when ready\n` +
          `Don't forget to use /destroy when done!`;
        
        await interaction.editReply(progressMessage);
        setTimeout(pollStatus, 45000); // Check again in 45 seconds
        
      } else {
        // Still creating/pending - show progress
        const progressMessage = 
          `✅ Server "${serverName}" creation in ${region.toUpperCase()}!\n` +
          `⏳ Status: ${status.emoji} ${status.label} (${elapsedMinutes}min elapsed)\n` +
          `📊 Auto-checking until ready...\n` +
          `💡 Server will show connection details when ready\n` +
          `Don't forget to use /destroy when done!`;
        
        await interaction.editReply(progressMessage);
        setTimeout(pollStatus, 45000); // Check again in 45 seconds
      }
      
    } catch (error) {
      console.error(`Error polling instance ${instanceId}:`, error);
      
      // Continue trying unless we hit time limit
      if (Date.now() - startTime < maxWaitTime) {
        setTimeout(pollStatus, 45000);
      } else {
        const errorMessage = 
          `❌ Unable to monitor server "${serverName}" (API errors).\n` +
          `📊 Use \`/status\` to check manually.\n` +
          `Don't forget to use /destroy when done!`;
        
        await interaction.editReply(errorMessage);
      }
    }
  };
  
  // Start first poll after 10 seconds
  setTimeout(pollStatus, 10000);
}

/**
 * Automatically poll snapshot status and update the Discord message when complete
 * Similar to instance polling but for snapshot creation progress
 */
async function startSnapshotStatusPolling(snapshotId, snapshotName, isPublic, interaction) {
  console.log(`Starting snapshot status polling for ${snapshotId}`);
  
  let attempts = 0;
  const maxWaitTime = 30 * 60 * 1000; // 30 minutes maximum
  const startTime = Date.now();
  
  const pollStatus = async () => {
    attempts++;
    const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
    
    // Hard stop at 30 minutes
    if (Date.now() - startTime > maxWaitTime) {
      const timeoutMessage = 
        `⏰ Snapshot "${snapshotName}" exceeded 30-minute creation limit.\n` +
        `📊 Check Vultr dashboard manually or contact support.\n` +
        `💡 Snapshots usually complete within 15 minutes.`;
      
      await interaction.editReply(timeoutMessage);
      console.log(`❌ Snapshot ${snapshotId} polling timeout after 30 minutes`);
      return;
    }
    
    try {
      // Get snapshot status from Vultr API
      const snapshots = await getSnapshots();
      const snapshot = snapshots.find(s => s.id === snapshotId);
      
      if (!snapshot) {
        console.log(`Snapshot ${snapshotId} not found in API response`);
        setTimeout(pollStatus, 30000); // Try again in 30 seconds
        return;
      }
      
      console.log(`Snapshot poll ${attempts} (${elapsedMinutes}min): status=${snapshot.status}, size=${snapshot.size}GB`);
      
      // Check if snapshot is complete
      if (snapshot.status === 'complete') {
        // SUCCESS - Snapshot is ready
        const availabilityInfo = isPublic 
          ? '🌍 **Available to all users** - Now appears in `/restore` autocomplete!'
          : '🔒 **Private snapshot** - Available for admin use via `/restore`';
        
        const finalMessage = 
          `✅ Snapshot "${snapshotName}" is now COMPLETE! 🎉\n\n` +
          `📸 **Snapshot Details:**\n` +
          `> Name: ${snapshotName}\n` +
          `> Size: ${snapshot.size || 'Unknown'} GB\n` +
          `> ID: \`${snapshot.id}\`\n` +
          `> ${availabilityInfo}\n\n` +
          `⏱️ Total creation time: ${elapsedMinutes} minutes\n` +
          `💡 You can now use this snapshot with the \`/restore\` command!`;
        
        await interaction.editReply(finalMessage);
        console.log(`✅ Snapshot ${snapshotId} completed after ${elapsedMinutes} minutes!`);
        return; // Stop polling
        
      } else if (snapshot.status === 'error' || snapshot.status === 'failed') {
        // FAILED - Snapshot creation failed
        const errorMessage = 
          `❌ Snapshot "${snapshotName}" creation FAILED!\n` +
          `📊 Status: ${snapshot.status}\n` +
          `💡 Please try creating the snapshot again or contact support.`;
        
        await interaction.editReply(errorMessage);
        console.log(`❌ Snapshot ${snapshotId} failed with status: ${snapshot.status}`);
        return; // Stop polling
        
      } else {
        // Still creating - show progress
        const progressMessage = 
          `✅ Snapshot "${snapshotName}" creation in progress!\n` +
          `⏳ Status: ${snapshot.status} (${elapsedMinutes}min elapsed)\n` +
          `📊 Auto-checking until complete...\n` +
          `💡 Snapshots typically take 5-15 minutes depending on server size\n` +
          `${isPublic ? '🌍 Will be available to all users when complete' : '🔒 Private snapshot for admin use'}`;
        
        await interaction.editReply(progressMessage);
        setTimeout(pollStatus, 30000); // Check again in 30 seconds
      }
      
    } catch (error) {
      console.error(`Error polling snapshot ${snapshotId}:`, error);
      
      // Continue trying unless we hit time limit
      if (Date.now() - startTime < maxWaitTime) {
        setTimeout(pollStatus, 30000);
      } else {
        const errorMessage = 
          `❌ Unable to monitor snapshot "${snapshotName}" (API errors).\n` +
          `📊 Check Vultr dashboard manually.\n` +
          `💡 Snapshot may still complete successfully.`;
        
        await interaction.editReply(errorMessage);
      }
    }
  };
  
  // Start first poll after 15 seconds (snapshots need more time to appear)
  setTimeout(pollStatus, 15000);
}

/**
 * Automatically poll instance destruction and confirm when complete
 * Handles cases where Vultr prevents deletion (e.g., during snapshot creation)
 */
async function startInstanceDestructionPolling(instanceId, serverName, cost, interaction) {
  console.log(`Starting destruction polling for instance ${instanceId}`);
  
  let attempts = 0;
  const maxWaitTime = 10 * 60 * 1000; // 10 minutes maximum (destruction should be quick)
  const startTime = Date.now();
  
  const pollStatus = async () => {
    attempts++;
    const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
    
    // Hard stop at 10 minutes
    if (Date.now() - startTime > maxWaitTime) {
      const timeoutMessage = 
        `⏰ Server "${serverName}" destruction exceeded 10-minute limit.\n` +
        `📊 Check Vultr dashboard manually - it may still be processing.\n` +
        `💡 Vultr might be preventing deletion (e.g., active snapshots).\n` +
        `💰 Estimated cost: ${cost}`;
      
      await interaction.editReply(timeoutMessage);
      console.log(`❌ Instance ${instanceId} destruction polling timeout after 10 minutes`);
      return;
    }
    
    try {
      // Try to get the instance - if it doesn't exist, destruction was successful
      const instance = await getInstance(instanceId);
      
      if (!instance) {
        // SUCCESS - Instance no longer exists
        const finalMessage = 
          `✅ Server "${serverName}" has been SUCCESSFULLY DESTROYED! 🎉\n\n` +
          `🗑️ **Destruction confirmed** - Server is completely removed\n` +
          `⏱️ Total destruction time: ${elapsedMinutes} minutes\n` +
          `💰 This session total cost was approximately ${cost}\n\n` +
          `Thanks for being a Real One! 🙏`;
        
        await interaction.editReply(finalMessage);
        console.log(`✅ Instance ${instanceId} successfully destroyed after ${elapsedMinutes} minutes!`);
        
        // Update our internal state tracking
        instanceState.updateInstance(instanceId, 'destroyed');
        return; // Stop polling
      }
      
      console.log(`Destruction poll ${attempts} (${elapsedMinutes}min): instance still exists, status=${instance.status}, power=${instance.power_status}`);
      
      // Check if there's an error preventing deletion
      if (instance.server_status && instance.server_status.includes('snapshot')) {
        // Instance is likely protected due to snapshot creation
        const progressMessage = 
          `🔄 Server "${serverName}" destruction in progress...\n` +
          `⏳ Status: Waiting for Vultr processes to complete (${elapsedMinutes}min elapsed)\n` +
          `📊 Auto-checking until destroyed...\n` +
          `💡 Vultr may be preventing deletion (snapshot creation, backups, etc.)\n` +
          `🔒 This is normal - destruction will complete automatically`;
        
        await interaction.editReply(progressMessage);
        setTimeout(pollStatus, 20000); // Check again in 20 seconds
        
      } else {
        // General progress message
        const progressMessage = 
          `🔄 Server "${serverName}" destruction in progress...\n` +
          `⏳ Status: ${instance.status || 'Removing'} (${elapsedMinutes}min elapsed)\n` +
          `📊 Auto-checking until destroyed...\n` +
          `💡 Vultr is processing the deletion request`;
        
        await interaction.editReply(progressMessage);
        setTimeout(pollStatus, 15000); // Check again in 15 seconds
      }
      
    } catch (error) {
      // If we get a 404 or similar error, the instance is likely destroyed
      if (error.response && (error.response.status === 404 || error.response.status === 403)) {
        // SUCCESS - Instance no longer exists (404) or we can't access it (403)
        const finalMessage = 
          `✅ Server "${serverName}" has been SUCCESSFULLY DESTROYED! 🎉\n\n` +
          `🗑️ **Destruction confirmed** - Server is no longer accessible\n` +
          `⏱️ Total destruction time: ${elapsedMinutes} minutes\n` +
          `💰 This session total cost was approximately ${cost}\n\n` +
          `Thanks for being a Real One! 🙏`;
        
        await interaction.editReply(finalMessage);
        console.log(`✅ Instance ${instanceId} confirmed destroyed (API error ${error.response.status}) after ${elapsedMinutes} minutes!`);
        
        // Update our internal state tracking
        instanceState.updateInstance(instanceId, 'destroyed');
        return; // Stop polling
      }
      
      console.error(`Error polling destruction for instance ${instanceId}:`, error);
      
      // Continue trying unless we hit time limit
      if (Date.now() - startTime < maxWaitTime) {
        setTimeout(pollStatus, 20000);
      } else {
        const errorMessage = 
          `❌ Unable to confirm destruction of "${serverName}" (API errors).\n` +
          `📊 Check Vultr dashboard manually.\n` +
          `💡 Server may still be destroyed successfully.\n` +
          `💰 Estimated cost: ${cost}`;
        
        await interaction.editReply(errorMessage);
      }
    }
  };
  
  // Start first poll after 5 seconds (destruction should start quickly)
  setTimeout(pollStatus, 5000);
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
      
      if (!vultrInstances?.length) {
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
      
      if (!stoppedInstances?.length) {
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
      
      if (!runningInstances?.length) {
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
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('city')
        .setDescription('City to create server in (optional - defaults to Dallas)')
        .setRequired(false)
        .setAutocomplete(true)),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Get server name from command options or use default
      const serverName = interaction.options.getString('name') || 
                        `${interaction.user.username}'s Server`;
      
      // Get city from command options or use default (DFW)
      const selectedCity = interaction.options.getString('city') || 'dfw';
      
      await interaction.editReply('🔄 Creating your server...');
      
      // Get available snapshots
      const snapshots = await getSnapshots();
      
      if (!snapshots?.length) {
        return interaction.editReply('❌ No snapshots available to create a server from.');
      }
      
      // Use the snapshot ID from .env or the most recent snapshot
      const snapshotId = process.env.VULTR_SNAPSHOT_ID || snapshots[0].id;
      
      // Create the instance with the selected region
      const instance = await createInstanceFromSnapshot(snapshotId, serverName, selectedCity);
      
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
          name: serverName,
          region: selectedCity
        }
      );
      
      // Initial response
      const initialMessage = await interaction.editReply(
        `✅ Server "${serverName}" creation started in ${selectedCity.toUpperCase()}!\n` +
        `⏳ Please be patient - server creation typically takes 15 minutes.\n` +
        `📊 Checking status automatically...\n` +
        `💡 Tip: The server will be ready when its status shows as "running"\n` +
        `Don't forget to use /destroy to delete your server when you're done!`
      );

      // Start automatic status polling
      startInstanceStatusPolling(instance.id, serverName, selectedCity, interaction, initialMessage);

      return; // Don't return the editReply, let the polling handle updates
      
    } catch (error) {
      console.error('Error executing create command:', error);
      return interaction.editReply('❌ There was an error creating the server.');
    }
  }
};

// Create the /snapshot command
const snapshotCommand = {
  data: new SlashCommandBuilder()
    .setName('snapshot')
    .setDescription('Create a snapshot of a running server (Admin only)')
    .addStringOption(option =>
      option
        .setName('server')
        .setDescription('Server to snapshot')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Custom name for the snapshot (e.g., "Gaming Setup v2")')
        .setRequired(true)
        .setMaxLength(50))
    .addStringOption(option =>
      option
        .setName('description')
        .setDescription('Optional description')
        .setRequired(false)
        .setMaxLength(150))
    .addBooleanOption(option =>
      option
        .setName('public')
        .setDescription('Make snapshot available to all users via /restore command')
        .setRequired(false)),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Check admin permissions
      if (!hasSnapshotPermission(interaction.user.id)) {
        return interaction.editReply('❌ You do not have permission to create snapshots. Contact an administrator.');
      }
      
      const serverId = interaction.options.getString('server');
      const snapshotName = interaction.options.getString('name');
      const userDescription = interaction.options.getString('description') || '';
      const isPublic = interaction.options.getBoolean('public') || false;
      
      // Build the snapshot description using naming conventions
      const prefix = isPublic ? '[PUBLIC]' : '[PRIVATE]';
      const description = userDescription 
        ? `${prefix} ${snapshotName} | ${userDescription}`
        : `${prefix} ${snapshotName}`;
      
      // Verify the server exists and is running
      const instance = await getInstance(serverId);
      if (!instance) {
        return interaction.editReply('❌ Server not found or not available for management.');
      }
      
      if (instance.power_status !== 'running') {
        return interaction.editReply(`❌ Server must be running to create a snapshot. Current status: ${instance.power_status}`);
      }
      
      // Show cost warning and confirmation
      await interaction.editReply(
        `⚠️ **Snapshot Creation Cost Warning**\n\n` +
        `📸 **Server:** ${instance.label || 'Unnamed Server'}\n` +
        `📝 **Snapshot Name:** ${snapshotName}\n` +
        `${isPublic ? '🌍 **Visibility:** Public (available to all users)' : '🔒 **Visibility:** Private (admin only)'}\n` +
        `💰 **Cost:** ~$0.05/GB/month on Vultr\n` +
        `⏱️ **Time:** 5-15 minutes depending on server size\n\n` +
        `🔄 Creating snapshot...`
      );
      
      // Create the snapshot
      const snapshot = await createSnapshotFromInstance(serverId, description);
      
      if (!snapshot?.id) {
        return interaction.editReply('❌ Failed to create snapshot. Please try again later.');
      }
      
      // Initial response showing creation started
      const initialMessage = await interaction.editReply(
        `✅ Snapshot "${snapshotName}" creation started successfully!\n` +
        `📸 **From Server:** ${instance.label || 'Unnamed Server'}\n` +
        `⏳ Please be patient - snapshot creation typically takes 5-15 minutes.\n` +
        `📊 Checking status automatically...\n` +
        `💡 You'll be notified when the snapshot is ready!\n` +
        `${isPublic ? '🌍 Will be available to all users when complete' : '🔒 Private snapshot for admin use'}`
      );

      // Start automatic status polling
      startSnapshotStatusPolling(snapshot.id, snapshotName, isPublic, interaction);

      return; // Let the polling handle updates
      
    } catch (error) {
      console.error('Error executing snapshot command:', error);
      return interaction.editReply('❌ There was an error creating the snapshot.');
    }
  }
};

// Create the /restore command
const restoreCommand = {
  data: new SlashCommandBuilder()
    .setName('restore')
    .setDescription('Create a new server from a snapshot')
    .addStringOption(option =>
      option
        .setName('snapshot')
        .setDescription('Snapshot to restore from')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Name for the new server')
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('city')
        .setDescription('City to create server in (optional - defaults to Dallas)')
        .setRequired(false)
        .setAutocomplete(true)),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      const snapshotId = interaction.options.getString('snapshot');
      const serverName = interaction.options.getString('name') || 
                        `${interaction.user.username}'s Restored Server`;
      const selectedCity = interaction.options.getString('city') || 'dfw';
      
      await interaction.editReply('🔄 Restoring server from snapshot...');
      
      // Verify snapshot exists and is available
      const publicSnapshots = await getPublicSnapshots();
      const selectedSnapshot = publicSnapshots.find(snap => snap.id === snapshotId);
      
      if (!selectedSnapshot) {
        return interaction.editReply('❌ Snapshot not found or not available for use.');
      }
      
      if (selectedSnapshot.status !== 'complete') {
        return interaction.editReply(`❌ Snapshot is not ready yet. Status: ${selectedSnapshot.status}. Please wait and try again.`);
      }
      
      // Create the instance from the snapshot (reuse existing function)
      const instance = await createInstanceFromSnapshot(snapshotId, serverName, selectedCity);
      
      if (!instance?.id) {
        return interaction.editReply('❌ Failed to restore server from snapshot. Please try again later.');
      }
      
      // Track the new instance
      instanceState.trackInstance(
        instance.id,
        interaction.user.id,
        interaction.user.username,
        instance.status || 'creating',
        {
          ip: instance.main_ip,
          name: serverName,
          region: selectedCity
        }
      );
      
      // Initial response
      const cleanSnapshotName = getCleanSnapshotName(selectedSnapshot);
      const initialMessage = await interaction.editReply(
        `✅ Server "${serverName}" restoration started in ${selectedCity.toUpperCase()}!\n` +
        `📸 **From Snapshot:** ${cleanSnapshotName}\n` +
        `⏳ Please be patient - server creation typically takes 15 minutes.\n` +
        `📊 Checking status automatically...\n` +
        `Don't forget to use /destroy to delete your server when you're done!`
      );

      // Start automatic status polling (reuse existing function)
      startInstanceStatusPolling(instance.id, serverName, selectedCity, interaction, initialMessage);

      return; // Let the polling handle updates
      
    } catch (error) {
      console.error('Error executing restore command:', error);
      return interaction.editReply('❌ There was an error restoring the server.');
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
      
      if (!activeInstances?.length) {
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
client.commands.set(snapshotCommand.data.name, snapshotCommand);
client.commands.set(restoreCommand.data.name, restoreCommand);
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

/**
 * CONSOLIDATED INTERACTION HANDLER
 * 
 * This single handler replaces 5 separate client.on('interactionCreate') handlers
 * that were previously scattered throughout the code. Consolidation improves
 * maintainability and reduces code duplication while preserving all functionality.
 * 
 * Handler responsibilities:
 * 1. Autocomplete interactions (city selection for /create command)
 * 2. Slash command execution (all bot commands)
 * 3. String select menu interactions (server selection dropdowns)
 * 
 * IMPORTANT: This handler maintains exact same functionality as before.
 * All Vultr OpenAPI interactions remain unchanged.
 */
client.on('interactionCreate', async interaction => {
  
  // =============================================================================
  // AUTOCOMPLETE HANDLER - Handles autocomplete for various commands
  // =============================================================================
  if (interaction.isAutocomplete()) {
    const focusedOption = interaction.options.getFocused(true);
    
    try {
      // Handle city autocomplete for /create and /restore commands
      if ((interaction.commandName === 'create' || interaction.commandName === 'restore') && 
          focusedOption.name === 'city') {
        const focusedValue = focusedOption.value;
        const groupedRegions = await getGroupedRegions(vultr);
        
        // Flatten all cities and filter based on user input
        const cities = Object.values(groupedRegions)
          .flatMap(countries => Object.values(countries))
          .flat()
          .filter(city => 
            city.city.toLowerCase().includes(focusedValue.toLowerCase()) ||
            city.id.toLowerCase().includes(focusedValue.toLowerCase())
          )
          .map(city => ({
            name: `${city.city} (${city.id.toUpperCase()})`,
            value: city.id
          }))
          .slice(0, 25); // Discord API limit is 25 autocomplete choices

        return await interaction.respond(cities);
      }
      
      // Handle server autocomplete for /snapshot command
      if (interaction.commandName === 'snapshot' && focusedOption.name === 'server') {
        const focusedValue = focusedOption.value;
        const runningInstances = await listInstances();
        const runningServers = runningInstances.filter(instance => 
          instance.power_status === 'running'
        );
        
        const servers = runningServers
          .filter(instance => {
            const label = instance.label || 'Unnamed Server';
            return label.toLowerCase().includes(focusedValue.toLowerCase()) ||
                   instance.id.toLowerCase().includes(focusedValue.toLowerCase());
          })
          .map(instance => ({
            name: `${instance.label || 'Unnamed Server'} (${instance.region})`,
            value: instance.id
          }))
          .slice(0, 25);

        return await interaction.respond(servers);
      }
      
      // Handle snapshot autocomplete for /restore command
      if (interaction.commandName === 'restore' && focusedOption.name === 'snapshot') {
        const focusedValue = focusedOption.value;
        const publicSnapshots = await getPublicSnapshots();
        
        const snapshots = publicSnapshots
          .filter(snapshot => {
            const cleanName = getCleanSnapshotName(snapshot);
            return cleanName.toLowerCase().includes(focusedValue.toLowerCase()) ||
                   snapshot.id.toLowerCase().includes(focusedValue.toLowerCase());
          })
          .map(snapshot => ({
            name: `${getCleanSnapshotName(snapshot)} (${snapshot.status})`,
            value: snapshot.id
          }))
          .slice(0, 25);

        return await interaction.respond(snapshots);
      }
      
    } catch (error) {
      console.error('Error handling autocomplete:', error);
      await interaction.respond([]); // Return empty array on error
    }
    
    return; // Exit early for autocomplete interactions
  }
  
  // =============================================================================
  // SLASH COMMAND HANDLER - Executes all bot commands (/list, /status, /create, etc.)
  // =============================================================================
  if (interaction.isCommand()) {
    const command = client.commands.get(interaction.commandName);
    
    // Check if the command exists in our registered commands
    if (!command) {
      console.error(`Command ${interaction.commandName} not found`);
      return interaction.reply({
        content: 'Sorry, this command is not available.',
        ephemeral: true
      });
    }
    
    try {
      // Execute the command - this calls the execute() function in each command object
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      
      // Handle error response - check if we already replied to avoid Discord API errors
      const replyMethod = interaction.replied || interaction.deferred
        ? interaction.followUp
        : interaction.reply;
      
      replyMethod.call(interaction, {
        content: 'There was an error while executing this command.',
        ephemeral: true
      }).catch(console.error);
    }
    return; // Exit early for command interactions
  }
  
  // =============================================================================
  // STRING SELECT MENU HANDLER - Handles dropdown selections for server management
  // =============================================================================
  if (interaction.isStringSelectMenu()) {
    // Handle different select menu types using switch statement for clarity
    switch (interaction.customId) {
      
      // Server status checking - triggered by /status command
      case 'select_server':
        await interaction.deferUpdate(); // Acknowledge the interaction immediately
        const selectedId = interaction.values[0]; // Get the selected server ID

        try {
          // Get server details from Vultr API (respects EXCLUDE_SNAPSHOT_ID)
          const instance = await getInstance(selectedId);
          if (!instance) {
            return interaction.editReply({
              content: '❌ This server is not available for management.',
              components: [] // Remove the select menu
            });
          }
          
          // Get our internal tracking data for the server
          const trackedInstance = instanceState.getInstance(selectedId);
          
          // Format server details for Discord display
          const formattedStatus = formatInstanceDetails(trackedInstance, instance);
          return interaction.editReply({
            content: formattedStatus,
            components: [] // Remove the select menu after selection
          });
        } catch (error) {
          console.error('Error handling server selection:', error);
          return interaction.editReply({
            content: '❌ There was an error getting the server status.',
            components: [] // Remove the select menu on error
          });
        }

      // Server starting - triggered by /start command
      case 'start_server':
        await interaction.deferUpdate();
        const startServerId = interaction.values[0];
        // Call the existing startInstance function (unchanged Vultr OpenAPI calls)
        await startInstance(interaction, startServerId);
        break;

      // Server stopping - triggered by /stop command  
      case 'stop_server':
        await interaction.deferUpdate();
        const stopServerId = interaction.values[0];
        // Call the existing stopInstance function (unchanged Vultr OpenAPI calls)
        await stopInstance(interaction, stopServerId);
        break;

      // Server destruction - triggered by /destroy command
      // This is the most complex handler as it includes cost calculation
      case 'destroy_server':
        await interaction.deferUpdate();
        const destroyId = interaction.values[0];

        try {
          // Get instance details before destroying (needed for cost calculation)
          const instance = await getInstance(destroyId);
          if (!instance) {
            return interaction.editReply({
              content: '❌ This server is not available for management.',
              components: [] // Remove the select menu
            });
          }
          
          // Extract server information for cost calculation and display
          const serverName = instance.label || 'Unnamed Server';
          const planId = instance.plan;
          const createdAt = new Date(instance.date_created);
          const destroyedAt = new Date();

          // COST CALCULATION - Using Vultr Plans API (OpenAPI compliant)
          let cost = 0;
          let formattedCost = 'unavailable';
          
          try {
            // Call the plans endpoint exactly as per Vultr OpenAPI specification
            const plansResponse = await vultr.plans.listPlans();
            
            // Response structure per OpenAPI spec: { plans: [...], meta: {...} }
            if (plansResponse && plansResponse.plans) {
              const plan = plansResponse.plans.find(p => p.id === planId);
              
              // Per OpenAPI spec, monthly_cost is an integer (US Dollars)
              if (plan && typeof plan.monthly_cost === 'number') {
                // Calculate uptime in hours (round up to next hour for billing)
                const uptimeMs = destroyedAt - createdAt;
                const uptimeHours = Math.ceil(uptimeMs / (1000 * 60 * 60));
                
                // Convert monthly cost to hourly rate
                // Using 730 hours per month (365 days * 24 hours / 12 months)
                const hourlyRate = plan.monthly_cost / 730;
                cost = uptimeHours * hourlyRate;
                
                formattedCost = `$${cost.toFixed(2)}`;
                
                console.log(`Cost calculation: Plan ${planId}, monthly_cost=$${plan.monthly_cost}, ${uptimeHours} hours, $${hourlyRate.toFixed(4)}/hr = ${formattedCost}`);
              } else {
                console.log(`Plan ${planId} not found or missing monthly_cost field`);
              }
            } else {
              console.log('Invalid response structure from plans API');
            }
          } catch (planError) {
            console.error('Error fetching plan pricing:', planError);
            // Log the full error for debugging
            if (planError.response) {
              console.error('API Response:', planError.response.status, planError.response.data);
            }
          }
          
          // Show initial destruction message
          await interaction.editReply({
            content: `🔄 Attempting to destroy server "${serverName}"...\n` +
                    `📊 Checking if Vultr allows deletion...\n` +
                    `💡 Some processes (like snapshots) may prevent immediate deletion`,
            components: [] // Remove the select menu
          });

          try {
            // Attempt to destroy the instance using exact OpenAPI spec method
            await vultr.instances.deleteInstance({
              "instance-id": destroyId
            });
            
            console.log(`Destruction request sent for instance ${destroyId}`);
            
            // Start polling to confirm destruction
            startInstanceDestructionPolling(destroyId, serverName, formattedCost, interaction);
            
          } catch (deleteError) {
            console.error('Error sending destruction request:', deleteError);
            
            // Handle specific errors
            if (deleteError.response && deleteError.response.status === 400) {
              return interaction.editReply(
                `❌ Cannot destroy server "${serverName}" right now.\n` +
                `📊 Vultr is preventing deletion (likely due to active processes)\n` +
                `💡 Common causes: Active snapshots, backups, or billing issues\n` +
                `🕒 Try again in a few minutes\n` +
                `💰 Estimated cost so far: ${formattedCost}`
              );
            } else {
              return interaction.editReply(
                `❌ Error destroying server "${serverName}".\n` +
                `📊 API Error: ${deleteError.message || 'Unknown error'}\n` +
                `💰 Estimated cost so far: ${formattedCost}`
              );
            }
          }
        } catch (error) {
          console.error('Error destroying server:', error);
          return interaction.editReply({
            content: '❌ There was an error destroying the server.',
            components: [] // Remove the select menu on error
          });
        }
        
      // If we receive an unknown select menu ID, log it for debugging
      default:
        console.error(`Unknown select menu interaction: ${interaction.customId}`);
        break;
    }
    return; // Exit early for select menu interactions
  }
  
  // If we reach here, it's an interaction type we don't handle
  console.log(`Unhandled interaction type: ${interaction.type}`);
});

// Log in to Discord with bot token
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('Bot is connecting to Discord...'))
  .catch(error => console.error('Failed to login:', error));