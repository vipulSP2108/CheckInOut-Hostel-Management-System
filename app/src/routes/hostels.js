import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { getDB } from '../db/database.js';

const router = express.Router();

// Get all hostels
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const hostels = await db.all('SELECT * FROM Hostel ORDER BY Name ASC');
    res.json(hostels);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add a new hostel
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { Name, ShortCode, WardenName, WardenContact, Address } = req.body;
  
  if (!Name || !ShortCode || !WardenName || !WardenContact || !Address) {
    return res.status(400).json({ error: 'Missing required fields (Warden info is mandatory)' });
  }

  try {
    const db = getDB();
    await db.run(
      `INSERT INTO Hostel (Name, ShortCode, WardenName, WardenContact, Address, NumSingleRooms, NumDoubleRooms, NumTripleRooms, NumQuadRooms, TotalRooms, TotalCapacity) 
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0)`,
      [Name, ShortCode, WardenName, WardenContact, Address]
    );
    res.status(201).json({ message: 'Hostel created successfully' });
  } catch (error) {
    console.error('Add Hostel Error:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Hostel ShortCode or Name already exists in database.' });
    }
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get all wardens
router.get('/wardens', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const wardens = await db.all('SELECT Name as HostelName, WardenName, WardenContact FROM Hostel WHERE IsActive = 1 ORDER BY Name ASC');
    res.json(wardens);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
