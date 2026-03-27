import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { getDB } from '../db/database.js';

const router = express.Router();

// Get all rooms
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const rooms = await db.all(`
      SELECT r.*, h.Name as HostelName, rt.TypeName, rt.BaseCapacity 
      FROM Room r
      JOIN Hostel h ON r.HostelID = h.HostelID
      JOIN RoomType rt ON r.RoomTypeID = rt.RoomTypeID
    `);
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get room types
router.get('/types', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const types = await db.all('SELECT * FROM RoomType');
    res.json(types);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add a new room
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { HostelID, RoomTypeID, RoomNumber, Floor } = req.body;
  if (!HostelID || !RoomTypeID || !RoomNumber || Floor === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const db = getDB();
    const [hostel, rt] = await Promise.all([
      db.get('SELECT ShortCode FROM Hostel WHERE HostelID = ?', [HostelID]),
      db.get('SELECT TypeName, BaseCapacity FROM RoomType WHERE RoomTypeID = ?', [RoomTypeID])
    ]);

    if (!hostel || !rt) return res.status(404).json({ error: 'Hostel or Room Type not found' });

    const QRCode = `ROOM-${hostel.ShortCode}-${RoomNumber}-${Math.random().toString(36).slice(7).toUpperCase()}`;

    await db.run('BEGIN TRANSACTION');
    try {
      const result = await db.run(
        `INSERT INTO Room (HostelID, RoomTypeID, RoomNumber, Floor, MaxCapacity, CurrentOccupancy, QRCode, RoomStatus) 
         VALUES (?, ?, ?, ?, ?, 0, ?, 'Available')`,
        [HostelID, RoomTypeID, RoomNumber, Floor, rt.BaseCapacity, QRCode]
      );

      const col = {
        'Single': 'NumSingleRooms',
        'Double': 'NumDoubleRooms',
        'Triple': 'NumTripleRooms',
        'Quad': 'NumQuadRooms'
      }[rt.TypeName] || 'NumSingleRooms';

      await db.run(
        `UPDATE Hostel SET ${col} = ${col} + 1, TotalRooms = TotalRooms + 1, TotalCapacity = TotalCapacity + ? WHERE HostelID = ?`,
        [rt.BaseCapacity, HostelID]
      );

      await db.run('COMMIT');
      res.status(201).json({ message: 'Room created successfully', RoomID: result.lastID });
    } catch (e) {
      await db.run('ROLLBACK');
      throw e;
    }
  } catch (error) {
    res.status(500).json({ error: error.message.includes('UNIQUE') ? 'Room number already exists' : 'Server error' });
  }
});

export default router;
