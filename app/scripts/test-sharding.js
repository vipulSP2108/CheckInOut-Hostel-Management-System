import { executeQuery } from '../sharding/router.js';

async function test() {
  console.log('--- Testing Sharded Queries ---');
  
  try {
    // 1. Get all members (Scatter-Gather)
    console.log('Fetching all members (Scatter-Gather)...');
    const allMembers = await executeQuery({
      sql: 'SELECT * FROM Member',
      type: 'all'
    });
    console.log(`Total members found across all shards: ${allMembers.length}`);

    if (allMembers.length > 0) {
      const testMember = allMembers[0];
      console.log(`Testing lookup for member: ${testMember.IdentificationNumber}`);

      // 2. Targeted lookup
      const found = await executeQuery({
        sql: 'SELECT * FROM Member WHERE IdentificationNumber = ?',
        params: [testMember.IdentificationNumber],
        shardKey: testMember.IdentificationNumber,
        type: 'get'
      });
      
      if (found && found.IdentificationNumber === testMember.IdentificationNumber) {
        console.log('SUCCESS: Targeted lookup worked!');
      } else {
        console.log('FAILURE: Targeted lookup failed or returned wrong data.');
      }
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

test();
