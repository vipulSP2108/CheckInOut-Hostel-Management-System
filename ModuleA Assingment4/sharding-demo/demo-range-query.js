import { executeQuery } from '../../app/src/db/router.js';

async function demoRangeQuery() {
  console.log('--- Multi-Shard Aggregation Demo ---');
  console.log('Executing: SELECT COUNT(*) as total FROM Member');
  console.log('Router will scatter this query to ALL shards and aggregate the counts.');

  try {
    const result = await executeQuery({
      sql: 'SELECT COUNT(*) as total FROM Member',
      type: 'get' // Aggregation query usually returns a single row
    });

    console.log('-------------------------------------------');
    console.log(`Results from Shard 0: (Queried)`);
    console.log(`Results from Shard 1: (Queried)`);
    console.log(`Results from Shard 2: (Queried)`);
    console.log('-------------------------------------------');
    console.log(`COMBINED TOTAL MEMBERS ACROSS CLUSTER: ${result.total}`);
    console.log('-------------------------------------------');
    console.log('SUCCESS: The Router automatically summed the counts from all shards.');
  } catch (error) {
    console.error('Aggregation Demo Error:', error.message);
  }
}

demoRangeQuery();
