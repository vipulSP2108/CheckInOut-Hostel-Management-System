import mysql from 'mysql2/promise';

const dbConfig = {
  host: '10.0.116.184',
  user: 'ACID_Alliance',
  password: 'password@123',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
};

let shardPools = null;

export function getShardPools() {
  if (!shardPools) {
    shardPools = [
      mysql.createPool({ ...dbConfig, port: 3307, database: 'ACID_Alliance' }),
      mysql.createPool({ ...dbConfig, port: 3308, database: 'ACID_Alliance' }),
      mysql.createPool({ ...dbConfig, port: 3309, database: 'ACID_Alliance' }),
    ];
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
