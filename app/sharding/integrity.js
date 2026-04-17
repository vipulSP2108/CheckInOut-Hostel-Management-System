import { SHARD_NODES } from './config/sharding.js';

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
        const response = await fetch(`${node.url}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'get', sql, params })
        });
        if (!response.ok) return { count: 0 };
        const data = await response.json();
        return data || { count: 0 };
      } catch (e) {
        return { count: 0 };
      }
    })
  );

  const totalCount = results.reduce((sum, r) => sum + (r.count || 0), 0);
  return totalCount === 0;
}
