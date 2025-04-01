/**
 * Create Command
 * 
 * Creates a new server instance from a snapshot.
 * This allows users to quickly spin up a new game server.
 */

const { SlashCommandBuilder } = require('discord.js');
const instanceTracker = require('../../services/instanceTracker');
const vultrWrapper = require('../../services/vultrWrapper');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('create')
    .setDescription('Create a new game server from the latest snapshot')
    .addStringOption(option => 
      option.setName('name')
        .setDescription('Give your server a name (optional)')
        .setRequired(false)),
  
  // Command execution
  async execute(interaction) {
    // Defer reply immediately to prevent timeout
    await interaction.deferReply();
    
    try {
      // Check if user already has an active instance
      const userInstances = instanceTracker.getActiveUserInstances(interaction.user.id);
      
      if (userInstances.length > 0) {
        return interaction.editReply(`⚠️ You already have an active server! Use \`/status\` to check its details or \`/list\` to see all servers.`);
      }
      
      // Get server name from options or use default
      const serverName = interaction.options.getString('name') || 
        `${interaction.user.username}'s Server`;
      
      // Get the latest snapshot for creating the server
      const snapshots = await vultrWrapper.getSnapshots();
      
      if (!snapshots || snapshots.length === 0) {
        return interaction.editReply('❌ No snapshots are available to create a server from. Please contact an administrator.');
      }
      
      // Use the most recent snapshot (already sorted by date)
      const latestSnapshot = snapshots[0];
      
      // Let the user know we're starting the creation process
      await interaction.editReply(`⏳ Starting to create your game server: **${serverName}**\nThis will take a few minutes...`);
      
      try {
        console.log(`User ${interaction.user.username} is creating a server with name: ${serverName}`);
        console.log(`Using snapshot ID: ${latestSnapshot.id}`);
        
        // Create a new instance from the snapshot
        const instance = await vultrWrapper.createInstanceFromSnapshot(
          latestSnapshot.id,
          serverName
        );
        
        // Check if instance object is valid
        if (!instance || !instance.id) {
          throw new Error('Failed to create instance - received invalid response from Vultr API');
        }
        
        console.log(`Instance created successfully with ID: ${instance.id}`);
        
        // Log the creation in our tracker
        const trackedInstance = instanceTracker.logInstanceCreation(
          instance.id,
          interaction.user.id,
          interaction.user.username,
          {
            name: serverName,
            ip: instance.main_ip || 'pending'
          }
        );
        
        // Update the message to reflect creation is in progress
        await interaction.editReply(`
🚀 Your game server is being created!

**Server Details**
\`\`\`
Name: ${serverName}
Created by: ${interaction.user.username}
Status: Creating
\`\`\`

This process may take 5-10 minutes. Use \`/status\` to check when your server is ready.
`);
        
        // Start monitoring the instance status
        monitorInstanceStatus(instance.id, interaction);
        
      } catch (error) {
        console.error('Error creating instance:', error);
        await interaction.editReply(`❌ Failed to create your server: ${error.message}\nPlease try again later or contact an administrator.`);
      }
    } catch (error) {
      console.error('Error executing create command:', error);
      await interaction.editReply('❌ There was an error trying to create your server. Please try again later.');
    }
  }
};

/**
 * Monitor the status of a newly created instance
 * This sends follow-up messages as the instance status changes
 * 
 * @param {string} instanceId - ID of the instance to monitor
 * @param {Object} interaction - Discord interaction
 */
async function monitorInstanceStatus(instanceId, interaction) {
  let attempts = 0;
  const maxAttempts = 20; // About 2 minutes of monitoring
  
  const checkStatus = async () => {
    try {
      if (attempts >= maxAttempts) {
        // Stop checking after max attempts
        return;
      }
      
      attempts++;
      
      // Get instance info from Vultr API
      const instance = await vultrWrapper.getInstance(instanceId);
      
      if (!instance) {
        // Instance not found
        instanceTracker.updateInstance(instanceId, 'terminated');
        return;
      }
      
      // Update our tracker with latest status
      instanceTracker.updateInstance(instanceId, instance.power_status, {
        ip: instance.main_ip
      });
      
      // If the instance is running, send a final update
      if (instance.status === 'active' && instance.power_status === 'running') {
        await interaction.followUp(`
✅ Your game server is now ready!

**Server Details**
\`\`\`
Name: ${instance.label}
Status: Running
IP Address: ${instance.main_ip}
\`\`\`

You can connect to your server using the IP address above.
`);
        return;
      }
      
      // Check again after a delay
      setTimeout(checkStatus, 6000);
    } catch (error) {
      console.error(`Error monitoring instance ${instanceId}:`, error);
      // Continue checking despite errors
      setTimeout(checkStatus, 6000);
    }
  };
  
  // Start checking
  setTimeout(checkStatus, 10000); // First check after 10 seconds
}
