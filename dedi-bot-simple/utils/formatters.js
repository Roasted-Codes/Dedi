/**
 * Formatters Utility
 * 
 * This module provides formatting functions for Discord messages.
 * It helps create consistent, well-formatted messages across commands.
 */

/**
 * Format a list of instances for Discord display
 * 
 * @param {Array} instances - Array of instance objects
 * @returns {string} - Formatted message for Discord
 */
function formatInstanceList(instances) {
  if (!instances || instances.length === 0) {
    return '📋 **No Active Servers**\n\nThere are currently no game servers running. Use `/create` to start one!';
  }
  
  const sections = instances.map((instance, index) => {
    const createdAt = new Date(instance.createdAt).toLocaleString();
    const statusEmoji = getStatusEmoji(instance.status);
    
    return `${index + 1}. ${statusEmoji} **${instance.name || 'Unnamed Server'}**
   Created by: ${instance.creator.username}
   Created at: ${createdAt}
   Status: ${formatStatus(instance.status)}
   IP: ${instance.ip || 'Not available yet'}
   Command: \`/status instance-id:${instance.id}\``;
  });
  
  return `📋 **Active Game Servers** (${instances.length})

${sections.join('\n\n')}`;
}

/**
 * Format a single instance for Discord display
 * 
 * @param {Object} instance - Instance object
 * @returns {string} - Formatted message for Discord
 */
function formatInstanceDetails(instance) {
  if (!instance) {
    return '❌ **Server Not Found**\n\nThis server does not exist or has been terminated.';
  }
  
  const createdAt = new Date(instance.createdAt).toLocaleString();
  const lastUpdated = instance.lastUpdated ? new Date(instance.lastUpdated).toLocaleString() : 'N/A';
  const statusEmoji = getStatusEmoji(instance.status);
  
  return `${statusEmoji} **${instance.name || 'Unnamed Server'}**

📋 **Server Details**
\`\`\`
Created by: ${instance.creator.username}
Created at: ${createdAt}
Last updated: ${lastUpdated}
Status: ${formatStatus(instance.status)}
IP Address: ${instance.ip || 'Not available yet'}
Server Name: ${instance.name || 'Unnamed'}
Instance ID: ${instance.id}
\`\`\`

Use \`/status instance-id:${instance.id}\` to check for updates.

${instance.status === 'running' ? '✅ This server is ready to use!' : '⏳ This server is not yet ready for connection.'}`;
}

/**
 * Format a list of snapshots for Discord display
 * 
 * @param {Array} snapshots - Array of snapshot objects
 * @returns {string} - Formatted message for Discord
 */
function formatSnapshotList(snapshots) {
  if (!snapshots || snapshots.length === 0) {
    return '📋 **No Snapshots Available**\n\nThere are currently no snapshots available.';
  }
  
  const sections = snapshots.map((snapshot, index) => {
    const createdAt = new Date(snapshot.date_created).toLocaleString();
    const statusEmoji = snapshot.status === 'complete' ? '✅' : '⏳';
    
    return `${index + 1}. ${statusEmoji} **${snapshot.description || 'Unnamed Snapshot'}**
   Created: ${createdAt}
   Status: ${snapshot.status}
   ID: \`${snapshot.id}\``;
  });
  
  return `📋 **Available Snapshots** (${snapshots.length})

${sections.join('\n\n')}`;
}

/**
 * Get an emoji representing the instance status
 * 
 * @param {string} status - Instance status
 * @returns {string} - Emoji representing the status
 */
function getStatusEmoji(status) {
  switch (status) {
    case 'running':
      return '🟢';
    case 'stopped':
      return '🔴';
    case 'creating':
    case 'starting':
      return '⏳';
    case 'stopping':
      return '🟠';
    case 'terminated':
    case 'destroyed':
      return '⚫';
    default:
      return '❓';
  }
}

/**
 * Format status text for display
 * 
 * @param {string} status - Raw status
 * @returns {string} - Formatted status
 */
function formatStatus(status) {
  if (!status) return 'Unknown';
  
  // Capitalize first letter and replace underscores with spaces
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
}

/**
 * Format error messages for Discord display
 * 
 * @param {Error} error - Error object
 * @returns {string} - Formatted error message
 */
function formatError(error) {
  return `❌ **Error**\n\n${error.message || 'An unknown error occurred.'}\n\nPlease try again or contact an administrator.`;
}

module.exports = {
  formatInstanceList,
  formatInstanceDetails,
  formatSnapshotList,
  formatError
};
