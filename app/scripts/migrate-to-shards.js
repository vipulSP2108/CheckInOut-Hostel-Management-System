import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { getShardId, GLOBAL_TABLES } from '../src/config/sharding.js';
import { executeMysqlQuery, getShardPools } from '../src/db/mysql-pool.js';

const ORIGINAL_DB_PATH = './hostel.db';
const GLOBAL_DB_PATH = './global_hostel.db';

async function migrate() {
  console.log('--- Starting Migration to MySQL Cluster ---');

  // 1. Clean up SQLite Global Database
  if (fs.existsSync(GLOBAL_DB_PATH)) fs.unlinkSync(GLOBAL_DB_PATH);
  
  const sourceDb = await open({ filename: ORIGINAL_DB_PATH, driver: sqlite3.Database });
  const globalDb = await open({ filename: GLOBAL_DB_PATH, driver: sqlite3.Database });

  const schema = fs.readFileSync('./sql/hostel.sql', 'utf8');
  
  const APP_SCHEMA_SQLITE = `
    CREATE TABLE IF NOT EXISTS FeeCategory (
      FeeCategoryID INTEGER PRIMARY KEY AUTOINCREMENT,
      CategoryName TEXT NOT NULL UNIQUE,
      DefaultAmount REAL NOT NULL,
      Description TEXT
    );
    CREATE TABLE IF NOT EXISTS Users (
      UserID INTEGER PRIMARY KEY AUTOINCREMENT,
      Username TEXT NOT NULL UNIQUE,
      PasswordHash TEXT NOT NULL,
      Role TEXT NOT NULL DEFAULT 'Regular',
      IdentificationNumber TEXT,
      CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const transpile = (s) => {
    let t = s;
    t = t.replace(/--.*$/gm, '');
    t = t.replace(/\/\*[\s\S]*?\*\//g, '');
    t = t.replace(/CREATE DATABASE[^;]+;/gi, '');
    t = t.replace(/DROP DATABASE[^;]+;/gi, '');
    t = t.replace(/^\s*USE\s+[^;]+;/gim, '');
    t = t.replace(/AUTO_INCREMENT/gi, ''); 
    t = t.replace(/ENUM\([\s\S]*?\)/gi, 'TEXT'); 
    t = t.replace(/ON UPDATE CURRENT_TIMESTAMP/gi, '');
    t = t.replace(/INT\s+PRIMARY KEY/gi, 'INTEGER PRIMARY KEY'); 
    t = t.replace(/CREATE\s+TABLE\s+(if\s+not\s+exists\s+)?/gi, 'CREATE TABLE IF NOT EXISTS ');
    t = t.replace(/INSERT\s+INTO/gi, 'INSERT OR IGNORE INTO'); 
    return t;
  };

  // Initialize Global DB (SQLite)
  await globalDb.exec(transpile(schema));
  await globalDb.exec(APP_SCHEMA_SQLITE);

  // Initialize MySQL Shards
  const tableMatches = schema.match(/CREATE\s+TABLE[\s\S]*?\);/gi) || [];
  const rawMysqlSchema = tableMatches.join('\n\n')
    .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'INT AUTO_INCREMENT PRIMARY KEY')
    .replace(/CREATE\s+TABLE\s+(if\s+not\s+exists\s+)?/gi, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/ENUM\([\s\S]*?\)/gi, 'VARCHAR(255)');
  const APP_SCHEMA_MYSQL = `
    CREATE TABLE IF NOT EXISTS FeePayment (
      PaymentID INT AUTO_INCREMENT PRIMARY KEY,
      IdentificationNumber VARCHAR(50) NOT NULL,
      FeeCategoryID INT NOT NULL,
      AmountPaid FLOAT NOT NULL,
      PaymentDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      Status VARCHAR(50) NOT NULL DEFAULT 'Paid'
    );
  `;

  console.log('Provisioning External MySQL Schemas...');
  for (let i = 0; i < 3; i++) {
    // Drop key tables to ensure idempotency
    const drops = ['FeePayment', 'MaintenanceRequest', 'QRScanLog', 'Visitor', 'Complaint', 'Allocation', 'Member'];
    for (const d of drops) {
      await executeMysqlQuery(i, 'run', `DROP TABLE IF EXISTS ${d}`);
    }
    await executeMysqlQuery(i, 'run', rawMysqlSchema);
    await executeMysqlQuery(i, 'run', APP_SCHEMA_MYSQL);
  }

  // 2. Migrate Global Tables to global_hostel.db AND MySQL shards
  const globalsToMigrate = ['RoomType', 'Hostel', 'Room', 'FurnitureType', 'ComplaintCategory', 'FeeCategory'];
  for (const table of globalsToMigrate) {
    if (table === 'AuditLog' || table === 'Users') continue; 
    console.log(`Migrating Global Table (Local): ${table}`);
    try {
      const rows = await sourceDb.all(`SELECT * FROM ${table}`);
      for (const row of rows) {
         if (table === 'FeeCategory') continue; // was not in original DB
         const keys = Object.keys(row);
         const placeholders = keys.map(() => '?').join(',');
         await globalDb.run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`, Object.values(row));
         
         // Replicate to all MySQL shards to satisfy Foreign Key constraints
         for (let i = 0; i < 3; i++) {
           await executeMysqlQuery(i, 'run', `INSERT IGNORE INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`, Object.values(row));
         }
      }
    } catch (e) {
      console.warn(`Skipping ${table}: ${e.message}`);
    }
  }

  // 3. Migrate Sharded Data to MySQL
  console.log('Migrating Member Data Over Network to MySQL...');
  const members = await sourceDb.all('SELECT * FROM Member');
  let migratedCount = 0;

  for (const member of members) {
    const shardId = getShardId(member.IdentificationNumber);
    const id = member.IdentificationNumber;

    // Insert Member
    const mKeys = Object.keys(member);
    await executeMysqlQuery(shardId, 'run', `INSERT INTO Member (${mKeys.join(',')}) VALUES (${mKeys.map(() => '?').join(',')})`, Object.values(member));

    // Provision User account iteratively
    const password = member.ContactNumber || 'password123';
    const passwordHash = await bcrypt.hash(password, 10);
    await globalDb.run(
      'INSERT OR IGNORE INTO Users (Username, PasswordHash, Role, IdentificationNumber) VALUES (?, ?, ?, ?)',
      [member.IdentificationNumber, passwordHash, 'Regular', member.IdentificationNumber]
    );

    // Allocations
    const allocations = await sourceDb.all('SELECT * FROM Allocation WHERE IdentificationNumber = ?', [id]);
    for (const a of allocations) {
      const aKeys = Object.keys(a);
      await executeMysqlQuery(shardId, 'run', `INSERT INTO Allocation (${aKeys.join(',')}) VALUES (${aKeys.map(() => '?').join(',')})`, Object.values(a));
    }

    // Complaints
    const complaints = await sourceDb.all('SELECT * FROM Complaint WHERE IdentificationNumber = ?', [id]);
    for (const c of complaints) {
      const cKeys = Object.keys(c);
      await executeMysqlQuery(shardId, 'run', `INSERT INTO Complaint (${cKeys.join(',')}) VALUES (${cKeys.map(() => '?').join(',')})`, Object.values(c));
    }

    // Visitors
    const visitors = await sourceDb.all('SELECT * FROM Visitor WHERE IdentificationNumber = ?', [id]);
    for (const v of visitors) {
      const vKeys = Object.keys(v);
      await executeMysqlQuery(shardId, 'run', `INSERT INTO Visitor (${vKeys.join(',')}) VALUES (${vKeys.map(() => '?').join(',')})`, Object.values(v));
    }
    
    // Maintenance
    const maintenance = await sourceDb.all('SELECT * FROM MaintenanceRequest WHERE RequestedBy = ?', [id]);
    for (const m of maintenance) {
      const mKeys = Object.keys(m);
      await executeMysqlQuery(shardId, 'run', `INSERT INTO MaintenanceRequest (${mKeys.join(',')}) VALUES (${mKeys.map(() => '?').join(',')})`, Object.values(m));
    }
    
    migratedCount++;
    if (migratedCount % 25 === 0) console.log(`  Migrated ${migratedCount}/${members.length} members...`);
  }

  // Provision Admin
  const adminHash = await bcrypt.hash('admin123', 10);
  await globalDb.run('INSERT OR IGNORE INTO Users (Username, PasswordHash, Role) VALUES (?, ?, ?)', ['admin', adminHash, 'Admin']);

  console.log(`--- MySQL Migration Completed Successfully (${members.length} Records Sent) ---`);
  await sourceDb.close();
  await globalDb.close();
  const pools = getShardPools();
  for (const pool of pools) await pool.end();
}

migrate().catch((e) => {
  console.error("Migration Fatal:", e);
  process.exit(1);
});
