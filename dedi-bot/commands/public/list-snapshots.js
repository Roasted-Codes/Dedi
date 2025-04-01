/**
 * List Snapshots Command
 * 
 * Shows all available snapshots that can be used to create servers.
 * This helps users and admins see what snapshots are available.
 */

const { SlashCommandBuilder } = require('discord.js');
const vultrWrapper = require('../../services/vultrWrapper');
const { formatSnapshotList } = require('../../utils/formatters');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('list-snapshots')
    .setDescription('List all available snapshots for creating servers'),
  
  // Command execution
  async execute(interaction) {
    // Defer reply immediately to prevent timeout
    await interaction.deferReply();
    
    try {
      // Get all snapshots
      const snapshots = await vultrWrapper.getSnapshots();
      
      // Format the list for display
      const formattedList = formatSnapshotList(snapshots);
      
      // Send the response
      return interaction.editReply(formattedList);
    } catch (error) {
      console.error('Error executing list-snapshots command:', error);
      return interaction.editReply('❌ There was an error trying to list the snapshots. Please try again later.');
    }
  }
};
