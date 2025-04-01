/**
 * List Command
 * 
 * Shows all active server instances to the user.
 * This allows users to see if there are already servers running.
 */

const { SlashCommandBuilder } = require('discord.js');
const instanceTracker = require('../../services/instanceTracker');
const vultrService = require('../../services/vultrService');
const { formatInstanceList } = require('../../utils/formatters');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('List all active game servers'),
  
  // Command execution
  async execute(interaction) {
    // Defer reply immediately to prevent timeout
    await interaction.deferReply();
    
    try {
      // Get instances from both our tracker and the Vultr API to ensure data is in sync
      const trackedInstances = instanceTracker.getActiveInstances();
      
      // Try to get instances from Vultr API to ensure our tracking is up to date
      try {
        const vultrInstances = await vultrService.listInstances();
        
        // Update our tracked instance status based on Vultr's data
        vultrInstances.forEach(vultrInstance => {
          const trackedInstance = trackedInstances.find(i => i.id === vultrInstance.id);
          
          if (trackedInstance) {
            // Update existing instance with real-time data
            instanceTracker.updateInstance(vultrInstance.id, vultrInstance.power_status, {
              ip: vultrInstance.main_ip
            });
          } else if (vultrInstance.power_status === 'running') {
            // Add new instance we're not tracking yet
            // Since we don't know who created it, set creator to 'Unknown'
            instanceTracker.logInstanceCreation(
              vultrInstance.id,
              'unknown',
              'Unknown',
              {
                ip: vultrInstance.main_ip,
                name: vultrInstance.label || 'Unknown Server'
              },
              new Date(vultrInstance.date_created)
            );
          }
        });
        
        // Mark tracked instances that don't exist in Vultr as terminated
        trackedInstances.forEach(trackedInstance => {
          const vultrInstance = vultrInstances.find(i => i.id === trackedInstance.id);
          if (!vultrInstance) {
            instanceTracker.updateInstance(trackedInstance.id, 'terminated');
          }
        });
      } catch (error) {
        console.error('Error syncing with Vultr API:', error);
        // Continue with local data if Vultr API fails
      }
      
      // Get the refreshed list of active instances
      const activeInstances = instanceTracker.getActiveInstances();
      
      // Format and send the response
      const formattedList = formatInstanceList(activeInstances);
      return interaction.editReply(formattedList);
    } catch (error) {
      console.error('Error executing list command:', error);
      return interaction.editReply('❌ There was an error trying to list the servers. Please try again later.');
    }
  }
};
