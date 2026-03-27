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
      JOIN Hostel h ON r.ShortCode = h.ShortCode
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
  const { HostelID, ShortCode, RoomTypeID, RoomNumber, Floor } = req.body;
  if ((!HostelID && !ShortCode) || !RoomTypeID || Floor === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const db = getDB();
    const [hostel, rt] = await Promise.all([
      db.get('SELECT ShortCode FROM Hostel WHERE HostelID = ? OR ShortCode = ?', [HostelID, ShortCode]),
      db.get('SELECT TypeName, BaseCapacity FROM RoomType WHERE RoomTypeID = ?', [RoomTypeID])
    ]);

    if (!hostel || !rt) return res.status(404).json({ error: 'Hostel or Room Type not found' });

    // Generate RoomNumber format (A-Z)(0-9)(0-9)(0-9) if not correctly formatted
    // (ShortCode)(Floor)(RoomNo)
    let finalRoomNumber = RoomNumber;
    if (!finalRoomNumber || !/^[A-Z][0-9]{3}$/.test(finalRoomNumber)) {
        // Auto-generate: find next room number for this floor
        const lastRoom = await db.get('SELECT RoomNumber FROM Room WHERE ShortCode = ? AND Floor = ? ORDER BY RoomNumber DESC LIMIT 1', [hostel.ShortCode, Floor]);
        let nextNo = 1;
        if (lastRoom) {
            const match = lastRoom.RoomNumber.match(/(\d{2})$/);
            if (match) nextNo = parseInt(match[1]) + 1;
        }
        const roomNoStr = nextNo.toString().padStart(2, '0');
        finalRoomNumber = `${hostel.ShortCode}${Floor}${roomNoStr}`;
    }

    const QRCode = `ROOM-${hostel.ShortCode}-${finalRoomNumber}-${Math.random().toString(36).slice(7).toUpperCase()}`;

    await db.run('BEGIN TRANSACTION');
    try {
      await db.run(
        `INSERT INTO Room (ShortCode, RoomTypeID, RoomNumber, Floor, MaxCapacity, CurrentOccupancy, QRCode, RoomStatus) 
         VALUES (?, ?, ?, ?, ?, 0, ?, 'Available')`,
        [hostel.ShortCode, RoomTypeID, finalRoomNumber, Floor, rt.BaseCapacity, QRCode]
      );

      const col = {
        'Single': 'NumSingleRooms',
        'Double': 'NumDoubleRooms',
        'Triple': 'NumTripleRooms',
        'Quad': 'NumQuadRooms'
      }[rt.TypeName] || 'NumSingleRooms';

      await db.run(
        `UPDATE Hostel SET ${col} = ${col} + 1, TotalRooms = TotalRooms + 1, TotalCapacity = TotalCapacity + ? WHERE ShortCode = ?`,
        [rt.BaseCapacity, hostel.ShortCode]
      );

      await db.run('COMMIT');
      res.status(201).json({ message: 'Room created successfully', RoomNumber: finalRoomNumber });
    } catch (e) {
      await db.run('ROLLBACK');
      throw e;
    }
  } catch (error) {
    res.status(500).json({ error: error.message.includes('UNIQUE') ? 'Room number already exists' : 'Server error: ' + error.message });
  }
});

export default router;
