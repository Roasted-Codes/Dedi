/**
 * Start Command
 * 
 * Starts a server instance that has been stopped.
 * If no server ID is provided, it will start the user's own server.
 */

const { SlashCommandBuilder } = require('discord.js');
const instanceTracker = require('../../services/instanceTracker');
const vultrWrapper = require('../../services/vultrWrapper');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('Start a game server')
    .addStringOption(option => 
      option.setName('instance-id')
        .setDescription('ID of the server to start (optional)')
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
          return interaction.editReply("❌ You don't have any servers to start. Use `/create` to create one, or use `/list` to see available servers.");
        } else if (userInstances.length === 1) {
          // User has exactly one instance, use that
          instanceId = userInstances[0].id;
        } else {
          // User has multiple instances, show a list
          const instances = userInstances.map((instance, index) => 
            `${index + 1}. **${instance.name}** (ID: \`${instance.id}\`)`
          ).join('\n');
          
          return interaction.editReply(`You have multiple servers. Please specify which one to start with \`/start instance-id:[ID]\`:\n\n${instances}`);
        }
      }
      
      // Get the instance from our tracker
      let instance = instanceTracker.getInstance(instanceId);
      
      if (!instance) {
        return interaction.editReply(`❌ No server found with ID \`${instanceId}\`. Use \`/list\` to see available servers.`);
      }
      
      // Check if user is the creator of this instance
      if (instance.creator.id !== interaction.user.id && instance.creator.id !== 'unknown') {
        return interaction.editReply(`❌ You can only start servers that you created. This server was created by ${instance.creator.username}.`);
      }
      
      // Check if instance is already running
      if (instance.status === 'running') {
        return interaction.editReply(`⚠️ This server is already running! Use \`/status\` to check its details.`);
      }
      
      // Update status to starting
      instanceTracker.updateInstance(instanceId, 'starting');
      
      await interaction.editReply(`⏳ Starting server: **${instance.name}**\nThis may take a minute...`);
      
      try {
        // Attempt to start the instance
        const startSuccess = await vultrWrapper.startInstance(instanceId);
        
        if (startSuccess) {
          // Get the updated instance details
          const updatedInstance = await vultrWrapper.getInstance(instanceId);
          
          // Update our tracker with the latest data
          instanceTracker.updateInstance(instanceId, 'running', {
            ip: updatedInstance.main_ip
          });
          
          return interaction.editReply(`
✅ Server **${instance.name}** has been successfully started!

**Server Details**
\`\`\`
Status: Running
IP Address: ${updatedInstance.main_ip}
\`\`\`

You can now connect to your server using the IP address above.
`);
        } else {
          // Start command was sent, but server didn't reach running state
          return interaction.editReply(`⚠️ Start command was sent, but the server may still be starting. Use \`/status\` to check its progress.`);
        }
      } catch (error) {
        console.error(`Error starting instance ${instanceId}:`, error);
        instanceTracker.updateInstance(instanceId, 'stopped'); // Revert status
        return interaction.editReply(`❌ Failed to start the server: ${error.message}\nPlease try again later.`);
      }
    } catch (error) {
      console.error('Error executing start command:', error);
      return interaction.editReply('❌ There was an error trying to start the server. Please try again later.');
    }
  }
};
