/**
 * Status Command
 * 
 * Shows the detailed status of a server instance.
 * If no server ID is provided, it will show the user's own servers.
 */

const { SlashCommandBuilder } = require('discord.js');
const instanceTracker = require('../../services/instanceTracker');
const vultrWrapper = require('../../services/vultrWrapper');
const { formatInstanceDetails } = require('../../utils/formatters');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check the status of a game server')
    .addStringOption(option => 
      option.setName('instance-id')
        .setDescription('ID of the server to check (optional)')
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
          // User has no instances, but let's check if there are any active instances
          const activeInstances = instanceTracker.getActiveInstances();
          
          if (activeInstances.length > 0) {
            // There are active instances, but none belong to this user
            const instances = activeInstances.map((instance, index) => 
              `${index + 1}. **${instance.name}** (Created by: ${instance.creator.username})\n   To check status: \`/status instance-id:${instance.id}\``
            ).join('\n\n');
            
            return interaction.editReply(`You don't have any active servers, but there are ${activeInstances.length} server(s) available:\n\n${instances}\n\nUse the command shown above to check a specific server's status.`);
          } else {
            // No instances at all
            return interaction.editReply("❌ There are no active servers. Use `/create` to create one.");
          }
        } else if (userInstances.length === 1) {
          // User has exactly one instance, use that
          instanceId = userInstances[0].id;
        } else {
          // User has multiple instances, show a list
          const instances = userInstances.map((instance, index) => 
            `${index + 1}. **${instance.name}** (ID: \`${instance.id}\`)`
          ).join('\n');
          
          return interaction.editReply(`You have multiple active servers. Please specify one with \`/status instance-id:[ID]\`:\n\n${instances}`);
        }
      }
      
      // Get the instance from our tracker
      let instance = instanceTracker.getInstance(instanceId);
      
      // Try to get the most up-to-date data from Vultr API
      try {
        const vultrInstance = await vultrWrapper.getInstance(instanceId);
        
        if (vultrInstance) {
          // Update our tracker with the most recent data
          instance = instanceTracker.updateInstance(instanceId, vultrInstance.power_status, {
            ip: vultrInstance.main_ip
          });
        } else if (instance) {
          // If we can't find it in Vultr but it's in our tracker, mark it as terminated
          instance = instanceTracker.updateInstance(instanceId, 'terminated');
        }
      } catch (error) {
        console.error(`Error getting instance ${instanceId} from Vultr:`, error);
        // Continue with local data if Vultr API fails
      }
      
      if (!instance) {
        return interaction.editReply(`❌ No server found with ID \`${instanceId}\`. Use \`/list\` to see available servers.`);
      }
      
      // Format and send the response
      const formattedDetails = formatInstanceDetails(instance);
      return interaction.editReply(formattedDetails);
    } catch (error) {
      console.error('Error executing status command:', error);
      return interaction.editReply('❌ There was an error trying to check the server status. Please try again later.');
    }
  }
};
