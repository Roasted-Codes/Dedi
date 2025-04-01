/**
 * Create Snapshot Command
 * 
 * Creates a snapshot of a server instance.
 * This is an admin-only command used to prepare snapshots for users.
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const instanceTracker = require('../../services/instanceTracker');
const vultrWrapper = require('../../services/vultrWrapper');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('create-snapshot')
    .setDescription('Create a snapshot of a server (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Restrict to admin users
    .addStringOption(option => 
      option.setName('instance-id')
        .setDescription('ID of the server to snapshot')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('description')
        .setDescription('Description for the snapshot')
        .setRequired(true)),
  
  // Command execution
  async execute(interaction) {
    // Check if the user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'You need administrator permissions to use this command.',
        ephemeral: true
      });
    }
    
    // Defer reply immediately to prevent timeout
    await interaction.deferReply();
    
    try {
      // Get the instance ID and description from options
      const instanceId = interaction.options.getString('instance-id');
      const description = interaction.options.getString('description');
      
      // Get the instance from our tracker
      let instance = instanceTracker.getInstance(instanceId);
      
      if (!instance) {
        return interaction.editReply(`❌ No server found with ID \`${instanceId}\`. Use \`/list\` to see available servers.`);
      }
      
      // Make sure the instance is stopped before taking a snapshot
      if (instance.status !== 'stopped') {
        return interaction.editReply(`⚠️ The server must be stopped before taking a snapshot. Use \`/stop ${instanceId}\` first.`);
      }
      
      // Let the user know we're starting the snapshot process
      await interaction.editReply(`⏳ Starting to create a snapshot of server: **${instance.name}**\nDescription: ${description}\nThis will take several minutes...`);
      
      try {
        // Create the snapshot
        const snapshot = await vultrWrapper.createSnapshot(instanceId, description);
        
        // Start monitoring the snapshot creation
        await interaction.editReply(`
🔄 Snapshot creation has been initiated!

**Snapshot Details**
\`\`\`
Description: ${description}
Server: ${instance.name}
Status: ${snapshot.status}
ID: ${snapshot.id}
\`\`\`

This process will take 10-30 minutes to complete. I'll update you when it's done.
`);
        
        // Start monitoring snapshot status
        monitorSnapshot(snapshot.id, interaction);
        
      } catch (error) {
        console.error('Error creating snapshot:', error);
        await interaction.editReply(`❌ Failed to create snapshot: ${error.message}\nPlease try again later or contact an administrator.`);
      }
    } catch (error) {
      console.error('Error executing create-snapshot command:', error);
      await interaction.editReply('❌ There was an error trying to create the snapshot. Please try again later.');
    }
  }
};

/**
 * Monitor the status of a snapshot
 * This sends follow-up messages as the snapshot status changes
 * 
 * @param {string} snapshotId - ID of the snapshot to monitor
 * @param {Object} interaction - Discord interaction
 */
async function monitorSnapshot(snapshotId, interaction) {
  // Setup the callback for status updates
  const statusCallback = async (status, attempt, maxAttempts) => {
    if (attempt === 0) {
      // First status check, no need to update yet
      return;
    }
    
    if (attempt === Math.floor(maxAttempts / 2)) {
      // Mid-way update
      await interaction.followUp(`
⏳ Snapshot creation is in progress...

**Status**: ${status}
**Progress**: ~50% complete

This may take another 5-15 minutes to complete.
`);
    }
  };
  
  try {
    // Monitor the snapshot status
    const finalStatus = await vultrWrapper.monitorSnapshotStatus(snapshotId, statusCallback, 30);
    
    if (finalStatus === 'complete') {
      // Get the snapshot details
      const snapshot = await vultrWrapper.getSnapshot(snapshotId);
      
      await interaction.followUp(`
✅ Snapshot creation is complete!

**Snapshot Details**
\`\`\`
Description: ${snapshot.description}
Status: ${snapshot.status}
ID: ${snapshot.id}
Created: ${new Date(snapshot.date_created).toLocaleString()}
Size: ${snapshot.size_gb} GB
\`\`\`

This snapshot is now available for creating new servers using \`/create\`.
`);
    } else {
      await interaction.followUp(`
⚠️ Snapshot creation may still be in progress.

**Status**: ${finalStatus}

You can check its status later with \`/list-snapshots\`.
`);
    }
  } catch (error) {
    console.error(`Error monitoring snapshot ${snapshotId}:`, error);
    await interaction.followUp(`❌ There was an error monitoring the snapshot creation: ${error.message}`);
  }
}
