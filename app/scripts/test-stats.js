import { executeQuery } from '../sharding/router.js';

async function testStats() {
  console.log('--- Testing Stats Aggregation ---');
  
  try {
    const members = await executeQuery({ 
      sql: "SELECT COUNT(*) as total, SUM(IsActive) as active FROM Member", 
      type: 'get' 
    });
    
    console.log('Stats Result:', members);
    
    if (members.total === 150) {
      console.log('SUCCESS: Stats aggregation correctly summed to 150!');
    } else {
      console.log(`FAILURE: Expected 150 total members, but got ${members.total}`);
    }

  } catch (error) {
    console.error('Stats test failed:', error.message);
  }
}

testStats();
