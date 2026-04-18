import { SHARD_NODES } from '../config/sharding.js';
import { executeMysqlQuery } from './mysql-pool.js';

/**
 * Cross-Shard Integrity Check
 * Ensures a value (like Email) is unique across all shards before insertion.
 */
export async function checkGlobalUniqueness(tableName, column, value) {
  const sql = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${column} = ?`;
  const params = [value];

  const results = await Promise.all(
    SHARD_NODES.map(async (node) => {
      try {
        const data = await executeMysqlQuery(node.id, 'get', sql, params);
        return data || { count: 0 };
      } catch (e) {
        return { count: 0 };
      }
    })
  );

  const totalCount = results.reduce((sum, r) => sum + (r.count || 0), 0);
  return totalCount === 0;
}
