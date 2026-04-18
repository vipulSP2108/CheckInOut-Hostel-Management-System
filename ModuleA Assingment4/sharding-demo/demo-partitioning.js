import { getShardId } from '../../app/src/config/sharding.js';

const testIds = [
  '22110189'
];

console.log('--- Sharding Partitioning Logic Demo ---');
console.log('Logic: Math.abs(hash(IdentificationNumber)) % SHARD_COUNT');
console.log('-------------------------------------------');

testIds.forEach(id => {
  const shardId = getShardId(id);
  console.log(`IdentificationNumber: ${id.padEnd(10)} => Routed to Shard ${shardId}`);
});

console.log('-------------------------------------------');
console.log('This consistent hashing ensures that the same IdentificationNumber');
console.log('always maps to the same shard, allowing for targeted lookups.');
