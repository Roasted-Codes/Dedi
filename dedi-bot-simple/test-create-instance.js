/**
 * Test script for creating an instance from a snapshot
 * 
 * This script directly tests the Vultr API for creating an instance from a snapshot
 * without going through the Discord bot. It can be used to debug API issues.
 */

require('dotenv').config();
const vultrService = require('./services/vultrService');

async function testCreateInstance() {
  try {
    console.log('Starting test: createInstanceFromSnapshot');
    console.log('Using API Key:', process.env.VULTR_API_KEY ? '✅ Set' : '❌ Not set');
    
    // Get the first available snapshot
    console.log('Fetching available snapshots...');
    const snapshots = await vultrService.getSnapshots();
    
    if (!snapshots || snapshots.length === 0) {
      console.error('❌ No snapshots available to test with');
      return;
    }
    
    console.log(`Found ${snapshots.length} snapshots`);
    const snapshot = snapshots[0];
    console.log(`Using snapshot: ${snapshot.id} - ${snapshot.description}`);
    
    // Try to create an instance
    console.log('Attempting to create a test instance...');
    try {
      const instance = await vultrService.createInstanceFromSnapshot(
        snapshot.id,
        'Test Instance from Script'
      );
      
      console.log('✅ Instance created successfully!');
      console.log('Instance details:', JSON.stringify(instance, null, 2));
    } catch (createError) {
      console.error('❌ Failed to create instance:', createError);
      console.error('Error details:', createError.message);
      
      // Try with different parameter format as a fallback
      console.log('\nTrying with alternative parameter format...');
      try {
        // Raw API call to test different parameter formats
        const VultrNode = require('@vultr/vultr-node');
        const vultr = VultrNode.initialize({
          apiKey: process.env.VULTR_API_KEY
        });
        
        // Try with both formats to see which one works
        console.log('Testing with kebab-case parameters...');
        const kebabCaseParams = {
          "snapshot-id": snapshot.id,
          "label": 'Test with kebab-case',
          "region": process.env.VULTR_REGION || "ewr",
          "plan": process.env.VULTR_PLAN || "vc2-1c-1gb"
        };
        console.log('Parameters:', kebabCaseParams);
        
        try {
          const kebabResponse = await vultr.instances.createInstance(kebabCaseParams);
          console.log('✅ kebab-case format worked!');
          console.log('Response:', JSON.stringify(kebabResponse, null, 2));
        } catch (kebabError) {
          console.error('❌ kebab-case format failed:', kebabError.message);
          
          // Try snake_case
          console.log('\nTesting with snake_case parameters...');
          const snakeCaseParams = {
            "snapshot_id": snapshot.id,
            "label": 'Test with snake_case',
            "region": process.env.VULTR_REGION || "ewr",
            "plan": process.env.VULTR_PLAN || "vc2-1c-1gb"
          };
          console.log('Parameters:', snakeCaseParams);
          
          try {
            const snakeResponse = await vultr.instances.createInstance(snakeCaseParams);
            console.log('✅ snake_case format worked!');
            console.log('Response:', JSON.stringify(snakeResponse, null, 2));
          } catch (snakeError) {
            console.error('❌ snake_case format failed:', snakeError.message);
          }
        }
      } catch (alternativeError) {
        console.error('❌ Alternative format test failed:', alternativeError);
      }
    }
  } catch (error) {
    console.error('❌ Test failed with an unexpected error:', error);
  }
}

testCreateInstance().catch(console.error);
