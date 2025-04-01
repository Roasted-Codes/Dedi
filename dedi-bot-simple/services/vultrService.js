/**
 * Vultr Service
 * 
 * This service provides an interface to interact with the Vultr API.
 * It abstracts the details of making API calls and provides methods
 * for common operations like creating instances, managing snapshots, etc.
 */

const VultrNode = require('@vultr/vultr-node');
require('dotenv').config();

// Initialize Vultr client with API key from .env file
const vultr = VultrNode.initialize({
  apiKey: process.env.VULTR_API_KEY
});

/**
 * Get information about a specific instance
 * 
 * @param {string} instanceId - The ID of the instance to get
 * @returns {Promise<Object>} - The instance details
 */
async function getInstance(instanceId) {
  try {
    const response = await vultr.instances.getInstance({ 
      "instance-id": instanceId 
    });
    return response.instance;
  } catch (error) {
    console.error('Error getting instance:', error);
    throw error;
  }
}

/**
 * List all instances in the Vultr account
 * 
 * @returns {Promise<Array>} - Array of instance objects
 */
async function listInstances() {
  try {
    const response = await vultr.instances.listInstances();
    return response.instances || [];
  } catch (error) {
    console.error('Error listing instances:', error);
    throw error;
  }
}

/**
 * Start an instance
 * 
 * @param {string} instanceId - The ID of the instance to start
 * @returns {Promise<boolean>} - True if the instance started successfully
 */
async function startInstance(instanceId) {
  try {
    await vultr.instances.startInstance({
      "instance-id": instanceId
    });
    
    // Wait for the instance to be fully started
    return await checkInstanceStatus(instanceId, 'active', 'running');
  } catch (error) {
    console.error('Error starting instance:', error);
    throw error;
  }
}

/**
 * Stop an instance
 * 
 * @param {string} instanceId - The ID of the instance to stop
 * @returns {Promise<boolean>} - True if the instance stopped successfully
 */
async function stopInstance(instanceId) {
  try {
    await vultr.instances.haltInstance({
      "instance-id": instanceId
    });
    
    // Wait for the instance to be fully stopped
    return await checkInstanceStatus(instanceId, 'active', 'stopped');
  } catch (error) {
    console.error('Error stopping instance:', error);
    throw error;
  }
}

/**
 * Check the status of an instance
 * 
 * @param {string} instanceId - The ID of the instance to check
 * @param {string} expectedStatus - The expected status
 * @param {string} expectedPowerStatus - The expected power status
 * @param {number} maxAttempts - Maximum number of status check attempts
 * @returns {Promise<boolean>} - True if the instance reached the expected status
 */
async function checkInstanceStatus(instanceId, expectedStatus, expectedPowerStatus, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const instance = await getInstance(instanceId);
      console.log(`Status check (${i+1}/${maxAttempts}): status=${instance.status}, power_status=${instance.power_status}`);
      
      if (expectedPowerStatus === 'stopped' && instance.power_status === 'stopped') {
        return true;
      } else if (instance.status === expectedStatus && instance.power_status === expectedPowerStatus) {
        return true;
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`Error checking instance status (attempt ${i+1}/${maxAttempts}):`, error);
    }
  }
  
  return false;
}

/**
 * Get all snapshots
 * 
 * @returns {Promise<Array>} - Array of snapshot objects
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
 * Get a specific snapshot
 * 
 * @param {string} snapshotId - The ID of the snapshot to get
 * @returns {Promise<Object>} - The snapshot details
 */
async function getSnapshot(snapshotId) {
  try {
    const response = await vultr.snapshots.getSnapshot({ 
      'snapshot-id': snapshotId 
    });
    return response.snapshot;
  } catch (error) {
    console.error('Error getting snapshot:', error);
    throw error;
  }
}

/**
 * Create a snapshot from an instance
 * 
 * @param {string} instanceId - The ID of the instance to snapshot
 * @param {string} description - Description for the snapshot
 * @returns {Promise<Object>} - The created snapshot
 */
async function createSnapshot(instanceId, description) {
  try {
    // Use snake_case parameter format as required by the snapshots API
    const snapshot = await vultr.snapshots.createSnapshot({
      "instance_id": instanceId,
      "description": description
    });
    
    return snapshot.snapshot;
  } catch (error) {
    console.error('Error creating snapshot:', error);
    throw error;
  }
}

/**
 * Monitor snapshot creation status
 * 
 * @param {string} snapshotId - The ID of the snapshot to monitor
 * @param {Function} statusCallback - Callback function to receive status updates
 * @param {number} maxAttempts - Maximum number of status check attempts
 * @returns {Promise<string>} - Final status of the snapshot
 */
async function monitorSnapshotStatus(snapshotId, statusCallback, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const snapshot = await getSnapshot(snapshotId);
      const status = snapshot.status;
      
      // Call the status callback with current status
      if (statusCallback) {
        statusCallback(status, i, maxAttempts);
      }
      
      if (status === 'complete') {
        return status;
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 30000));
    } catch (error) {
      console.error(`Error checking snapshot status (attempt ${i+1}/${maxAttempts}):`, error);
    }
  }
  
  return 'unknown';
}

/**
 * Create a new instance from a snapshot
 * 
 * @param {string} snapshotId - The ID of the snapshot to use
 * @param {string} label - Label for the new instance
 * @returns {Promise<Object>} - The created instance
 */
async function createInstanceFromSnapshot(snapshotId, label) {
  try {
    // Get snapshot info to verify it exists
    const snapshot = await getSnapshot(snapshotId);
    
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }
    
    // Create a new instance from the snapshot
    // Using snake_case format for consistency with the Vultr API
    console.log(`Creating instance with params:`, {
      snapshot_id: snapshotId,
      label,
      region: process.env.VULTR_REGION || "ewr",
      plan: process.env.VULTR_PLAN || "vc2-1c-1gb"
    });
    
    const response = await vultr.instances.createInstance({
      "snapshot_id": snapshotId, // Changed from snapshot-id to snapshot_id
      "label": label,
      "region": process.env.VULTR_REGION || "ewr", // Default to New Jersey
      "plan": process.env.VULTR_PLAN || "vc2-1c-1gb" // Default to 1 CPU, 1GB RAM
    });
    
    // Added detailed response logging for debugging
    console.log("Create instance response:", JSON.stringify(response, null, 2));
    
    return response.instance;
  } catch (error) {
    console.error('Error creating instance from snapshot:', error);
    throw error;
  }
}

/**
 * Restore an instance from a snapshot
 * 
 * @param {string} instanceId - The ID of the instance to restore
 * @param {string} snapshotId - The ID of the snapshot to restore from
 * @returns {Promise<boolean>} - True if the restore was successful
 */
async function restoreInstance(instanceId, snapshotId) {
  try {
    await vultr.instances.restoreInstance({
      "instance-id": instanceId,
      "snapshot-id": snapshotId
    });
    
    // Wait for the instance to be fully restored
    return await checkInstanceStatus(instanceId, 'active', 'running', 40);
  } catch (error) {
    console.error('Error restoring instance:', error);
    throw error;
  }
}

module.exports = {
  getInstance,
  listInstances,
  startInstance,
  stopInstance,
  getSnapshots,
  getSnapshot,
  createSnapshot,
  monitorSnapshotStatus,
  createInstanceFromSnapshot,
  restoreInstance
};
