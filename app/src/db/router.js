import { getShardId, SHARD_NODES, GLOBAL_TABLES, SHARDED_TABLES } from '../config/sharding.js';
import { getDB } from './database.js';
import { executeMysqlQuery } from './mysql-pool.js';

/**
 * Main Database Router
 */
export async function executeQuery(options) {
  const { sql, params = [], shardKey = null, type = 'all' } = options;

  // 1. Determine if this is a Global or Sharded table
  const tableName = extractTableName(sql);

  if (GLOBAL_TABLES.includes(tableName)) {
    // Level 1: Global Query
    const db = getDB();
    if (type === 'all') return await db.all(sql, params);
    if (type === 'get') return await db.get(sql, params);
    if (type === 'run') return await db.run(sql, params);
  }

  // 2. Sharded Query
  if (shardKey) {
    // Level 2: Targeted Shard Query
    const shardId = getShardId(shardKey);
    return await executeMysqlQuery(shardId, type, sql, params);
  } else {
    // Scatter-Gather: Query ALL shards and merge
    const results = await Promise.all(
      SHARD_NODES.map(node => executeMysqlQuery(node.id, type, sql, params))
    );
    
    if (type === 'run') return results[0]; // Multi-insert usually not handled this way
    
    // Merge results for 'all' or 'get'
    if (type === 'get') {
      // Check if it's an aggregation query (COUNT, SUM, etc.)
      const isAggregation = /COUNT|SUM|AVG|MIN|MAX/i.test(sql);
      if (isAggregation) {
        // Simple aggregation: sum up the totals (works for COUNT and SUM)
        return { 
          total: results.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0),
          active: results.reduce((acc, curr) => acc + (Number(curr.active) || 0), 0),
          available: results.reduce((acc, curr) => acc + (Number(curr.available) || 0), 0),
          open: results.reduce((acc, curr) => acc + (Number(curr.open) || 0), 0),
          pending: results.reduce((acc, curr) => acc + (Number(curr.pending) || 0), 0),
          count: results.reduce((acc, curr) => acc + (Number(curr.count) || 0), 0),
        };
      }
      return results.find(r => r) || null;
    }
    return results.flat();
  }
}

function extractTableName(sql) {
  // Very basic extraction logic for simulation
  const match = sql.match(/FROM\s+(\w+)/i) || 
                sql.match(/INSERT\s+INTO\s+(\w+)/i) || 
                sql.match(/UPDATE\s+(\w+)/i) || 
                sql.match(/DELETE\s+FROM\s+(\w+)/i);
  return match ? match[1] : null;
}
