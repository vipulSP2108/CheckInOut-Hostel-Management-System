import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import mysql from 'mysql2/promise';
import { DB_CONSTANTS } from './src/config/constants.js';

async function test() {
  const sourceDb = await open({ filename: 'hostel.db', driver: sqlite3.Database });
  const pool = mysql.createPool({ host: DB_CONSTANTS.MYSQL_HOST, user: DB_CONSTANTS.MYSQL_USER, password: DB_CONSTANTS.MYSQL_PASSWORD, port: 3307, database: DB_CONSTANTS.MYSQL_DATABASE });
  
  const members = await sourceDb.all('SELECT * FROM Member');
  let success = 0, failed = 0;
  for (const member of members) {
    const mKeys = Object.keys(member);
    try {
      await pool.query('INSERT INTO Member (' + mKeys.join(',') + ') VALUES (' + mKeys.map(() => '?').join(',') + ')', Object.values(member));
      success++;
    } catch(e) {
      if (failed < 5) console.error(`Error on ID ${member.IdentificationNumber}:`, e.message);
      failed++;
    }
  }
  console.log(`Success: ${success}, Failed: ${failed}`);
  pool.end();
  process.exit(0);
}
test();
