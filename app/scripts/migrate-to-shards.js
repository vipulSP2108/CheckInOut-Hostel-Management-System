import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { getShardId, GLOBAL_TABLES, SHARDED_TABLES } from '../sharding/config/sharding.js';

const ORIGINAL_DB_PATH = './hostel.db';
const GLOBAL_DB_PATH = './global_hostel.db';
const SHARD_DATA_DIR = './sharding/data';

async function migrate() {
  console.log('--- Starting Migration ---');

  // 0. Clean up existing target databases
  if (fs.existsSync(GLOBAL_DB_PATH)) fs.unlinkSync(GLOBAL_DB_PATH);
  for (let i = 0; i < 3; i++) {
    const shardDbDir = path.join(SHARD_DATA_DIR, `shard${i}`);
    const shardDbPath = path.join(shardDbDir, 'shard.db');
    if (fs.existsSync(shardDbPath)) fs.unlinkSync(shardDbPath);
    if (!fs.existsSync(shardDbDir)) fs.mkdirSync(shardDbDir, { recursive: true });
  }

  const sourceDb = await open({ filename: ORIGINAL_DB_PATH, driver: sqlite3.Database });
  const globalDb = await open({ filename: GLOBAL_DB_PATH, driver: sqlite3.Database });

  const schema = fs.readFileSync('./sql/hostel.sql', 'utf8');
  
  const APP_SCHEMA = `
    CREATE TABLE IF NOT EXISTS FeeCategory (
      FeeCategoryID INTEGER PRIMARY KEY AUTOINCREMENT,
      CategoryName TEXT NOT NULL UNIQUE,
      DefaultAmount REAL NOT NULL,
      Description TEXT
    );
    CREATE TABLE IF NOT EXISTS FeePayment (
      PaymentID INTEGER PRIMARY KEY AUTOINCREMENT,
      IdentificationNumber TEXT NOT NULL,
      FeeCategoryID INTEGER NOT NULL,
      AmountPaid REAL NOT NULL,
      PaymentDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      Status TEXT NOT NULL DEFAULT 'Paid',
      FOREIGN KEY (IdentificationNumber) REFERENCES Member(IdentificationNumber),
      FOREIGN KEY (FeeCategoryID) REFERENCES FeeCategory(FeeCategoryID)
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

  // Improved transpile for SQLite (borrowed from database.js)
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

  await globalDb.exec(transpile(schema));
  await globalDb.exec(APP_SCHEMA);
  
  const shardDbs = [];
  for (let i = 0; i < 3; i++) {
    const shardPath = path.join(SHARD_DATA_DIR, `shard${i}`, 'shard.db');
    if (!fs.existsSync(path.dirname(shardPath))) fs.mkdirSync(path.dirname(shardPath), { recursive: true });
    const sDb = await open({ filename: shardPath, driver: sqlite3.Database });
    await sDb.exec(transpile(schema));
    await sDb.exec(APP_SCHEMA);
    shardDbs.push(sDb);
  }

  // 2. Migrate Global Tables
  for (const table of [...GLOBAL_TABLES, 'Users', 'FeeCategory']) {
    if (table === 'AuditLog') continue; // Skip logs for now
    console.log(`Migrating Global Table: ${table}`);
    try {
      const rows = await sourceDb.all(`SELECT * FROM ${table}`);
      for (const row of rows) {
        const keys = Object.keys(row);
        const placeholders = keys.map(() => '?').join(',');
        await globalDb.run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`, Object.values(row));
      }
    } catch (e) {
      console.warn(`Skipping ${table}: ${e.message}`);
    }
  }

  // 3. Migrate Sharded Tables (Member focused)
  console.log('Migrating Sharded Tables...');
  const members = await sourceDb.all('SELECT * FROM Member');
  for (const member of members) {
    const shardId = getShardId(member.IdentificationNumber);
    const targetDb = shardDbs[shardId];

    // Insert Member
    const mKeys = Object.keys(member);
    await targetDb.run(`INSERT INTO Member (${mKeys.join(',')}) VALUES (${mKeys.map(() => '?').join(',')})`, Object.values(member));

    // Move related data
    const id = member.IdentificationNumber;
    
    // Provision User account in Global DB
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
      await targetDb.run(`INSERT INTO Allocation (${aKeys.join(',')}) VALUES (${aKeys.map(() => '?').join(',')})`, Object.values(a));
    }

    // Complaints
    const complaints = await sourceDb.all('SELECT * FROM Complaint WHERE IdentificationNumber = ?', [id]);
    for (const c of complaints) {
      const cKeys = Object.keys(c);
      await targetDb.run(`INSERT INTO Complaint (${cKeys.join(',')}) VALUES (${cKeys.map(() => '?').join(',')})`, Object.values(c));
    }

    // Visitors
    const visitors = await sourceDb.all('SELECT * FROM Visitor WHERE IdentificationNumber = ?', [id]);
    for (const v of visitors) {
      const vKeys = Object.keys(v);
      await targetDb.run(`INSERT INTO Visitor (${vKeys.join(',')}) VALUES (${vKeys.map(() => '?').join(',')})`, Object.values(v));
    }
    
    // Maintenance
    const maintenance = await sourceDb.all('SELECT * FROM MaintenanceRequest WHERE RequestedBy = ?', [id]);
    for (const m of maintenance) {
      const mKeys = Object.keys(m);
      await targetDb.run(`INSERT INTO MaintenanceRequest (${mKeys.join(',')}) VALUES (${mKeys.map(() => '?').join(',')})`, Object.values(m));
    }
  }

  console.log('--- Migration Completed Successfully ---');
  await sourceDb.close();
  await globalDb.close();
  for (const s of shardDbs) await s.close();
}

migrate().catch(console.error);
