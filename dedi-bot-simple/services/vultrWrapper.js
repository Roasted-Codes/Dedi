/**
 * Vultr API Wrapper
 * 
 * A more robust wrapper around the Vultr API client that:
 * - Provides consistent parameter handling (kebab-case vs snake_case)
 * - Offers better error handling and logging
 * - Implements retries for transient failures
 * - Validates responses before returning them
 */

const VultrNode = require('@vultr/vultr-node');
require('dotenv').config();

// Initialize Vultr client with API key from .env file
let vultrClient = null;

/**
 * Get or initialize the Vultr client
 * 
 * @returns {Object} - The initialized Vultr client
 */
function getClient() {
  if (!vultrClient) {
    if (!process.env.VULTR_API_KEY) {
      throw new Error('VULTR_API_KEY is not set in the environment variables');
    }
    
    vultrClient = VultrNode.initialize({
      apiKey: process.env.VULTR_API_KEY
    });
  }
  
  return vultrClient;
}

/**
 * Execute an API call with retries and error handling
 * 
 * @param {Function} apiCall - The API call function to execute
 * @param {Object} params - The parameters for the API call
 * @param {Object} options - Options for the API call execution
 * @returns {Promise<*>} - The result of the API call
 */
async function executeWithRetry(apiCall, params = {}, options = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    retryMultiplier = 2,
    validateResponse = null,
    logResponse = false,
    logRequest = false,
    propertyPath = null, // Path to extract from response, e.g., 'instance' for response.instance
  } = options;
  
  if (logRequest) {
    console.log(`[API Request] ${apiCall.name || 'API call'} params:`, JSON.stringify(params, null, 2));
  }
  
  let lastError = null;
  let retryCount = 0;
  let delay = retryDelay;
  
  while (retryCount <= maxRetries) {
    try {
      // Execute the API call
      const response = await apiCall(params);
      
      if (logResponse) {
        console.log(`[API Response] ${apiCall.name || 'API call'} result:`, JSON.stringify(response, null, 2));
      }
      
      // Validate the response if a validator was provided
      if (validateResponse && !validateResponse(response)) {
        throw new Error(`API response validation failed: ${JSON.stringify(response)}`);
      }
      
      // Extract the specified property if needed
      if (propertyPath) {
        const extracted = propertyPath.split('.').reduce((obj, key) => (obj && obj[key] !== undefined) ? obj[key] : undefined, response);
        
        if (extracted === undefined) {
          throw new Error(`Failed to extract '${propertyPath}' from API response: ${JSON.stringify(response)}`);
        }
        
        return extracted;
      }
      
      return response;
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (retryCount >= maxRetries) {
        break;
      }
      
      // Log the retry
      console.warn(`[API Retry] ${apiCall.name || 'API call'} attempt ${retryCount + 1}/${maxRetries} failed:`, error.message);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Increase delay for next retry (exponential backoff)
      delay *= retryMultiplier;
      retryCount++;
    }
  }
  
  // If we reached here, all retries failed
  console.error(`[API Error] ${apiCall.name || 'API call'} failed after ${maxRetries} retries:`, lastError);
  throw lastError;
}

// INSTANCES

/**
 * Get information about a specific instance
 * 
 * @param {string} instanceId - The ID of the instance to get
 * @returns {Promise<Object>} - The instance details
 */
async function getInstance(instanceId) {
  const client = getClient();
  
  return executeWithRetry(
    (params) => client.instances.getInstance(params),
    { "instance-id": instanceId },
    {
      propertyPath: 'instance',
      validateResponse: (response) => response && response.instance
    }
  );
}

/**
 * List all instances in the Vultr account
 * 
 * @returns {Promise<Array>} - Array of instance objects
 */
async function listInstances() {
  const client = getClient();
  
  return executeWithRetry(
    (params) => client.instances.listInstances(params),
    {},
    {
      propertyPath: 'instances',
      validateResponse: (response) => response && Array.isArray(response.instances)
    }
  ) || [];
}

/**
 * Start an instance
 * 
 * @param {string} instanceId - The ID of the instance to start
 * @returns {Promise<boolean>} - True if the instance started successfully
 */
async function startInstance(instanceId) {
  const client = getClient();
  
  await executeWithRetry(
    (params) => client.instances.startInstance(params),
    { "instance-id": instanceId }
  );
  
  // Wait for the instance to reach running state
  return await checkInstanceStatus(instanceId, 'active', 'running');
}

/**
 * Stop an instance
 * 
 * @param {string} instanceId - The ID of the instance to stop
 * @returns {Promise<boolean>} - True if the instance stopped successfully
 */
async function stopInstance(instanceId) {
  const client = getClient();
  
  await executeWithRetry(
    (params) => client.instances.haltInstance(params),
    { "instance-id": instanceId }
  );
  
  // Wait for the instance to reach stopped state
  return await checkInstanceStatus(instanceId, 'active', 'stopped');
}

/**
 * Create a new instance from a snapshot
 * 
 * @param {string} snapshotId - The ID of the snapshot to use
 * @param {string} label - Label for the new instance
 * @returns {Promise<Object>} - The created instance
 */
async function createInstanceFromSnapshot(snapshotId, label) {
  const client = getClient();
  
  // First verify the snapshot exists
  await getSnapshot(snapshotId);
  
  // Prepare parameters - trying both formats if needed
  const params = {
    "snapshot_id": snapshotId,
    "label": label,
    "region": process.env.VULTR_REGION || "ewr",
    "plan": process.env.VULTR_PLAN || "vc2-1c-1gb"
  };
  
  console.log(`[Create Instance] Creating instance from snapshot ${snapshotId} with label "${label}"`);
  console.log(`[Create Instance] Parameters:`, JSON.stringify(params, null, 2));
  
  try {
    // First try with snake_case (snapshot_id)
    const instance = await executeWithRetry(
      (p) => client.instances.createInstance(p),
      params,
      {
        propertyPath: 'instance',
        logResponse: true,
        validateResponse: (response) => response && response.instance && response.instance.id
      }
    );
    
    console.log(`[Create Instance] Success! Created instance ${instance.id}`);
    return instance;
  } catch (error) {
    console.error(`[Create Instance] Failed with snake_case format: ${error.message}`);
    
    // If snake_case fails, try with kebab-case
    const kebabParams = {
      "snapshot-id": snapshotId,
      "label": label,
      "region": process.env.VULTR_REGION || "ewr",
      "plan": process.env.VULTR_PLAN || "vc2-1c-1gb"
    };
    
    console.log(`[Create Instance] Retrying with kebab-case parameters:`, JSON.stringify(kebabParams, null, 2));
    
    try {
      const instance = await executeWithRetry(
        (p) => client.instances.createInstance(p),
        kebabParams,
        {
          propertyPath: 'instance',
          logResponse: true,
          validateResponse: (response) => response && response.instance && response.instance.id
        }
      );
      
      console.log(`[Create Instance] Success with kebab-case! Created instance ${instance.id}`);
      return instance;
    } catch (secondError) {
      console.error(`[Create Instance] Both formats failed. Original error: ${error.message}, Second error: ${secondError.message}`);
      
      // Combine errors for more informative message
      throw new Error(`Failed to create instance: ${error.message}. Also tried alternative format: ${secondError.message}`);
    }
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
  console.log(`[Status Check] Checking instance ${instanceId} for status=${expectedStatus}, power_status=${expectedPowerStatus}`);
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const instance = await getInstance(instanceId);
      console.log(`[Status Check] Attempt ${i+1}/${maxAttempts}: status=${instance.status}, power_status=${instance.power_status}`);
      
      if (expectedPowerStatus === 'stopped' && instance.power_status === 'stopped') {
        console.log(`[Status Check] Success! Instance ${instanceId} reached stopped state`);
        return true;
      } else if (instance.status === expectedStatus && instance.power_status === expectedPowerStatus) {
        console.log(`[Status Check] Success! Instance ${instanceId} reached status=${expectedStatus}, power_status=${expectedPowerStatus}`);
        return true;
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`[Status Check] Error checking instance ${instanceId} (attempt ${i+1}/${maxAttempts}):`, error.message);
      
      // Continue trying despite errors
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.warn(`[Status Check] Failed to reach status=${expectedStatus}, power_status=${expectedPowerStatus} after ${maxAttempts} attempts`);
  return false;
}

// SNAPSHOTS

/**
 * Get all snapshots
 * 
 * @returns {Promise<Array>} - Array of snapshot objects
 */
async function getSnapshots() {
  const client = getClient();
  
  const snapshots = await executeWithRetry(
    (params) => client.snapshots.listSnapshots(params),
    {},
    {
      propertyPath: 'snapshots',
      validateResponse: (response) => response && Array.isArray(response.snapshots)
    }
  ) || [];
  
  // Sort snapshots by date (newest first)
  snapshots.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
  
  return snapshots;
}

/**
 * Get a specific snapshot
 * 
 * @param {string} snapshotId - The ID of the snapshot to get
 * @returns {Promise<Object>} - The snapshot details
 */
async function getSnapshot(snapshotId) {
  const client = getClient();
  
  return executeWithRetry(
    (params) => client.snapshots.getSnapshot(params),
    { 'snapshot-id': snapshotId },
    {
      propertyPath: 'snapshot',
      validateResponse: (response) => response && response.snapshot
    }
  );
}

/**
 * Create a snapshot from an instance
 * 
 * @param {string} instanceId - The ID of the instance to snapshot
 * @param {string} description - Description for the snapshot
 * @returns {Promise<Object>} - The created snapshot
 */
async function createSnapshot(instanceId, description) {
  const client = getClient();
  
  console.log(`[Create Snapshot] Creating snapshot of instance ${instanceId} with description "${description}"`);
  
  // Use snake_case as it's confirmed to work for this API
  const params = {
    "instance_id": instanceId,
    "description": description
  };
  
  console.log(`[Create Snapshot] Parameters:`, JSON.stringify(params, null, 2));
  
  const snapshot = await executeWithRetry(
    (p) => client.snapshots.createSnapshot(p),
    params,
    {
      propertyPath: 'snapshot',
      logResponse: true,
      validateResponse: (response) => response && response.snapshot && response.snapshot.id
    }
  );
  
  console.log(`[Create Snapshot] Success! Created snapshot ${snapshot.id}`);
  return snapshot;
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
  console.log(`[Snapshot Monitor] Monitoring status of snapshot ${snapshotId}`);
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const snapshot = await getSnapshot(snapshotId);
      const status = snapshot.status;
      
      console.log(`[Snapshot Monitor] Attempt ${i+1}/${maxAttempts}: status=${status}`);
      
      // Call the status callback with current status
      if (statusCallback) {
        statusCallback(status, i, maxAttempts);
      }
      
      if (status === 'complete') {
        console.log(`[Snapshot Monitor] Success! Snapshot ${snapshotId} is complete`);
        return status;
      }
      
      // Wait before checking again (snapshots take longer)
      await new Promise(resolve => setTimeout(resolve, 30000));
    } catch (error) {
      console.error(`[Snapshot Monitor] Error checking snapshot ${snapshotId} (attempt ${i+1}/${maxAttempts}):`, error.message);
      
      // Continue checking despite errors
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
  
  console.warn(`[Snapshot Monitor] Failed to reach 'complete' status after ${maxAttempts} attempts`);
  return 'unknown';
}

/**
 * Delete a snapshot
 * 
 * @param {string} snapshotId - The ID of the snapshot to delete
 * @returns {Promise<boolean>} - True if deletion was successful
 */
async function deleteSnapshot(snapshotId) {
  const client = getClient();
  
  console.log(`[Delete Snapshot] Deleting snapshot ${snapshotId}`);
  
  try {
    await executeWithRetry(
      (params) => client.snapshots.deleteSnapshot(params),
      { 'snapshot-id': snapshotId }
    );
    
    console.log(`[Delete Snapshot] Success! Deleted snapshot ${snapshotId}`);
    return true;
  } catch (error) {
    console.error(`[Delete Snapshot] Failed to delete snapshot ${snapshotId}:`, error.message);
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
  const client = getClient();
  
  console.log(`[Restore Instance] Restoring instance ${instanceId} from snapshot ${snapshotId}`);
  
  try {
    await executeWithRetry(
      (params) => client.instances.restoreInstance(params),
      {
        "instance-id": instanceId,
        "snapshot-id": snapshotId
      }
    );
    
    // Wait for the instance to be fully restored
    const success = await checkInstanceStatus(instanceId, 'active', 'running', 40);
    
    if (success) {
      console.log(`[Restore Instance] Success! Instance ${instanceId} restored from snapshot ${snapshotId}`);
    } else {
      console.error(`[Restore Instance] Restore initiated, but instance didn't reach running state in time`);
    }
    
    return success;
  } catch (error) {
    console.error(`[Restore Instance] Failed to restore instance ${instanceId} from snapshot ${snapshotId}:`, error.message);
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
  deleteSnapshot,
  monitorSnapshotStatus,
  createInstanceFromSnapshot,
  restoreInstance
};
