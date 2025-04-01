/**
 * Stop Command
 * 
 * Stops a running server instance.
 * If no server ID is provided, it will stop the user's own server.
 */

const { SlashCommandBuilder } = require('discord.js');
const instanceTracker = require('../../services/instanceTracker');
const vultrWrapper = require('../../services/vultrWrapper');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop a game server')
    .addStringOption(option => 
      option.setName('instance-id')
        .setDescription('ID of the server to stop (optional)')
        .setRequired(false)),
  
  // Command execution
  async execute(interaction) {
    // Defer reply immediately to prevent timeout
    await interaction.deferReply();
    
    try {
      // Get the instance ID from options, or try to find the user's instance
      let instanceId = interaction.options.getString('instance-id');
      
      if (!instanceId) {
        // No instance ID provided, look for user's own instance
        const userInstances = instanceTracker.getActiveUserInstances(interaction.user.id);
        
        if (userInstances.length === 0) {
          // User has no instances
          return interaction.editReply("❌ You don't have any servers to stop. Use `/list` to see available servers.");
        } else if (userInstances.length === 1) {
          // User has exactly one instance, use that
          instanceId = userInstances[0].id;
        } else {
          // User has multiple instances, show a list
          const instances = userInstances.map((instance, index) => 
            `${index + 1}. **${instance.name}** (ID: \`${instance.id}\`)`
          ).join('\n');
          
          return interaction.editReply(`You have multiple servers. Please specify which one to stop with \`/stop instance-id:[ID]\`:\n\n${instances}`);
        }
      }
      
      // Get the instance from our tracker
      let instance = instanceTracker.getInstance(instanceId);
      
      if (!instance) {
        return interaction.editReply(`❌ No server found with ID \`${instanceId}\`. Use \`/list\` to see available servers.`);
      }
      
      // Check if user is the creator of this instance
      if (instance.creator.id !== interaction.user.id && instance.creator.id !== 'unknown') {
        return interaction.editReply(`❌ You can only stop servers that you created. This server was created by ${instance.creator.username}.`);
      }
      
      // Check if instance is already stopped
      if (instance.status === 'stopped') {
        return interaction.editReply(`⚠️ This server is already stopped! Use \`/start\` to start it.`);
      }
      
      // Update status to stopping
      instanceTracker.updateInstance(instanceId, 'stopping');
      
      await interaction.editReply(`⏳ Stopping server: **${instance.name}**\nThis may take a minute...`);
      
      try {
        // Attempt to stop the instance
        const stopSuccess = await vultrWrapper.stopInstance(instanceId);
        
        if (stopSuccess) {
          // Update our tracker with the status
          instanceTracker.updateInstance(instanceId, 'stopped');
          
          return interaction.editReply(`
✅ Server **${instance.name}** has been successfully stopped!

The server is now powered off and won't incur compute charges, but the data is still preserved.
Use \`/start\` when you want to use it again.
`);
        } else {
          // Stop command was sent, but server didn't reach stopped state
          return interaction.editReply(`⚠️ Stop command was sent, but the server may still be shutting down. Use \`/status\` to check its progress.`);
        }
      } catch (error) {
        console.error(`Error stopping instance ${instanceId}:`, error);
        instanceTracker.updateInstance(instanceId, 'running'); // Revert status
        return interaction.editReply(`❌ Failed to stop the server: ${error.message}\nPlease try again later.`);
      }
    } catch (error) {
      console.error('Error executing stop command:', error);
      return interaction.editReply('❌ There was an error trying to stop the server. Please try again later.');
    }
  }
};
