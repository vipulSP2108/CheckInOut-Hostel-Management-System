import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5000;
const DB_PATH = process.env.DB_PATH || './shard.db';

let db;

async function init() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  await db.exec('PRAGMA foreign_keys = ON');
  console.log(`Shard node initialized with DB: ${DB_PATH}`);
}

app.post('/query', async (req, res) => {
  const { type, sql, params } = req.body;
  try {
    let result;
    if (type === 'all') {
      result = await db.all(sql, params);
    } else if (type === 'get') {
      result = await db.get(sql, params);
    } else if (type === 'run') {
      result = await db.run(sql, params);
    } else {
      return res.status(400).json({ error: 'Invalid query type' });
    }
    res.json(result);
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', db: DB_PATH });
});

init().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Shard node listening on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to init shard node:', err);
  process.exit(1);
});
