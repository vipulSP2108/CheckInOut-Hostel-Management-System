import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';

async function seed() {
  const db = await open({ filename: './hostel.db', driver: sqlite3.Database });
  
  const schema = fs.readFileSync('./sql/hostel.sql', 'utf8');
  const seed = fs.readFileSync('./sql/seed.sql', 'utf8');

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

  console.log('Applying schema...');
  await db.exec(transpile(schema));
  console.log('Seeding data...');
  await db.exec(transpile(seed));
  
  console.log('Seeding completed!');
  await db.close();
}

seed().catch(console.error);
