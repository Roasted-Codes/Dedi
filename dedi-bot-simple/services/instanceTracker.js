/**
 * Instance Tracker Service
 * 
 * This service manages tracking of instance metadata, including who created each instance,
 * when it was created, and its current status. This allows users to see if other users
 * already have running instances.
 */

const fs = require('fs');
const path = require('path');

const INSTANCE_LOG_PATH = path.join(__dirname, '../config/instanceLog.json');

/**
 * Initialize the instance log file if it doesn't exist
 */
function initializeLogIfNeeded() {
  try {
    if (!fs.existsSync(path.dirname(INSTANCE_LOG_PATH))) {
      fs.mkdirSync(path.dirname(INSTANCE_LOG_PATH), { recursive: true });
    }
    
    if (!fs.existsSync(INSTANCE_LOG_PATH)) {
      fs.writeFileSync(INSTANCE_LOG_PATH, JSON.stringify({ instances: [] }, null, 2));
    }
  } catch (error) {
    console.error('Error initializing instance log:', error);
    // Create an empty log if there was an error
    fs.writeFileSync(INSTANCE_LOG_PATH, JSON.stringify({ instances: [] }, null, 2));
  }
}

/**
 * Log a new instance creation
 * 
 * @param {string} instanceId - Vultr instance ID
 * @param {string} userId - Discord user ID who created the instance
 * @param {string} username - Discord username who created the instance
 * @param {Date} timestamp - Creation timestamp (defaults to now)
 * @param {Object} metadata - Additional metadata about the instance
 */
function logInstanceCreation(instanceId, userId, username, metadata = {}, timestamp = new Date()) {
  initializeLogIfNeeded();
  
  const logData = JSON.parse(fs.readFileSync(INSTANCE_LOG_PATH));
  
  // Check if this instance already exists, and if so, update it instead
  const existingIndex = logData.instances.findIndex(instance => instance.id === instanceId);
  
  const instanceData = {
    id: instanceId,
    creator: {
      id: userId,
      username
    },
    createdAt: timestamp.toISOString(),
    status: 'creating',
    ip: metadata.ip || null,
    name: metadata.name || `${username}'s Server`,
    lastUpdated: timestamp.toISOString()
  };
  
  if (existingIndex >= 0) {
    logData.instances[existingIndex] = {
      ...logData.instances[existingIndex],
      ...instanceData
    };
  } else {
    logData.instances.push(instanceData);
  }
  
  fs.writeFileSync(INSTANCE_LOG_PATH, JSON.stringify(logData, null, 2));
  return instanceData;
}

/**
 * Get all tracked instances
 */
function getAllInstances() {
  initializeLogIfNeeded();
  
  const logData = JSON.parse(fs.readFileSync(INSTANCE_LOG_PATH));
  return logData.instances;
}

/**
 * Get all active instances (not terminated)
 */
function getActiveInstances() {
  const instances = getAllInstances();
  return instances.filter(instance => instance.status !== 'terminated' && instance.status !== 'destroyed');
}

/**
 * Get a specific instance by ID
 * 
 * @param {string} instanceId - Vultr instance ID
 */
function getInstance(instanceId) {
  const instances = getAllInstances();
  return instances.find(instance => instance.id === instanceId);
}

/**
 * Update instance status and metadata
 * 
 * @param {string} instanceId - Vultr instance ID
 * @param {string} status - New status
 * @param {Object} metadata - Additional metadata to update
 */
function updateInstance(instanceId, status, metadata = {}) {
  initializeLogIfNeeded();
  
  const logData = JSON.parse(fs.readFileSync(INSTANCE_LOG_PATH));
  const instanceIndex = logData.instances.findIndex(i => i.id === instanceId);
  
  if (instanceIndex >= 0) {
    logData.instances[instanceIndex] = {
      ...logData.instances[instanceIndex],
      status,
      lastUpdated: new Date().toISOString(),
      ...metadata
    };
    
    fs.writeFileSync(INSTANCE_LOG_PATH, JSON.stringify(logData, null, 2));
    return logData.instances[instanceIndex];
  }
  
  return null;
}

/**
 * Remove an instance from tracking
 * 
 * @param {string} instanceId - Vultr instance ID
 */
function removeInstance(instanceId) {
  initializeLogIfNeeded();
  
  const logData = JSON.parse(fs.readFileSync(INSTANCE_LOG_PATH));
  logData.instances = logData.instances.filter(i => i.id !== instanceId);
  
  fs.writeFileSync(INSTANCE_LOG_PATH, JSON.stringify(logData, null, 2));
}

/**
 * Get instances created by a specific user
 * 
 * @param {string} userId - Discord user ID
 */
function getUserInstances(userId) {
  const instances = getAllInstances();
  return instances.filter(instance => instance.creator.id === userId);
}

/**
 * Get active instances created by a specific user
 * 
 * @param {string} userId - Discord user ID
 */
function getActiveUserInstances(userId) {
  const instances = getActiveInstances();
  return instances.filter(instance => instance.creator.id === userId);
}

module.exports = {
  logInstanceCreation,
  getAllInstances,
  getActiveInstances,
  getInstance,
  updateInstance,
  removeInstance,
  getUserInstances,
  getActiveUserInstances
};
