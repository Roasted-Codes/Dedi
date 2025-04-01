/**
 * Debug Command
 * 
 * This is an admin-only command for debugging purposes.
 * It provides detailed information about the current state of tracked instances.
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const instanceTracker = require('../../services/instanceTracker');
const fs = require('fs');
const path = require('path');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('debug')
    .setDescription('Debug the instance tracking system (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Restrict to admin users
  
  // Command execution
  async execute(interaction) {
    // Check if the user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'You need administrator permissions to use this command.',
        ephemeral: true
      });
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
      // Get all tracked instances
      const allInstances = instanceTracker.getAllInstances();
      const activeInstances = instanceTracker.getActiveInstances();
      
      // Get raw JSON file content for comparison
      const logPath = path.join(__dirname, '../../config/instanceLog.json');
      let rawJson = 'File not found';
      
      try {
        if (fs.existsSync(logPath)) {
          rawJson = fs.readFileSync(logPath, 'utf8');
        }
      } catch (error) {
        console.error('Error reading instance log file:', error);
        rawJson = `Error reading file: ${error.message}`;
      }
      
      // Build debug report
      const debugReport = [
        `# Debug Report - ${new Date().toLocaleString()}`,
        '',
        `## Tracked Instances: ${allInstances.length} (${activeInstances.length} active)`,
        '',
        ...allInstances.map((instance, index) => (
          `### ${index + 1}. Instance ${instance.id}
- Name: ${instance.name || 'Unnamed'}
- Status: ${instance.status}
- Creator: ${instance.creator.username} (ID: ${instance.creator.id})
- Created: ${new Date(instance.createdAt).toLocaleString()}
- Last Updated: ${instance.lastUpdated ? new Date(instance.lastUpdated).toLocaleString() : 'Never'}
- IP: ${instance.ip || 'None'}`
        )),
        '',
        '## Raw JSON File Content',
        '```json',
        rawJson,
        '```'
      ].join('\n');
      
      // Send debug report in chunks if it's too long
      if (debugReport.length > 1900) {
        const chunks = [];
        let currentChunk = '';
        
        // Split by lines
        const lines = debugReport.split('\n');
        for (const line of lines) {
          if (currentChunk.length + line.length + 1 > 1900) {
            chunks.push(currentChunk);
            currentChunk = line;
          } else {
            currentChunk += (currentChunk ? '\n' : '') + line;
          }
        }
        
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        
        // Send first chunk as a reply
        await interaction.editReply(`${chunks[0]}\n\n[Part 1/${chunks.length}]`);
        
        // Send remaining chunks as follow-ups
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp({
            content: `${chunks[i]}\n\n[Part ${i+1}/${chunks.length}]`,
            ephemeral: true
          });
        }
      } else {
        await interaction.editReply(debugReport);
      }
    } catch (error) {
      console.error('Error executing debug command:', error);
      await interaction.editReply('❌ An error occurred while generating the debug report.');
    }
  }
};
