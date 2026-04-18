import mysql from 'mysql2/promise';
import { DB_CONSTANTS } from '../config/constants.js';

const dbConfig = {
  host: DB_CONSTANTS.MYSQL_HOST,
  user: DB_CONSTANTS.MYSQL_USER,
  password: DB_CONSTANTS.MYSQL_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
};

let shardPools = null;

export function getShardPools() {
  if (!shardPools) {
    shardPools = DB_CONSTANTS.SHARDS.map(shard => 
      mysql.createPool({ ...dbConfig, port: shard.port, database: DB_CONSTANTS.MYSQL_DATABASE })
    );
  }
  return shardPools;
}

export async function executeMysqlQuery(shardId, type, sql, params = []) {
  const pools = getShardPools();
  const pool = pools[shardId];
  
  if (!pool) throw new Error(`Invalid MySQL Shard ID: ${shardId}`);
  
  try {
    // MySQL uses the same '?' parameterization pattern as standard SQLite
    const [result] = await pool.query(sql, params);
    
    if (type === 'get') {
      return Array.isArray(result) ? (result[0] || null) : null;
    }
    
    if (type === 'run') {
      // Map MySQL RowDataPacket metrics to SQLite signature
      return { 
        changes: result.affectedRows || 0, 
        lastID: result.insertId || 0 
      };
    }
    
    // type === 'all'
    return result;
    
  } catch (error) {
    console.error(`MySQL Shard ${shardId} Execution Error on port ${3307 + shardId}:`, error.message);
    throw error;
  }
}
