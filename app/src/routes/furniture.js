import express from 'express';
import { authenticateToken, requireOwnershipOrAdmin, requireAdmin } from '../middleware/auth.js';
import { getDB } from '../db/database.js';

const router = express.Router();

// Admin: Get all furniture across all rooms
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const items = await db.all(`
      SELECT f.*, t.TypeName, r.RoomNumber, h.Name as HostelName
      FROM FurnitureItem f
      JOIN FurnitureType t ON f.FurnitureTypeID = t.FurnitureTypeID
      JOIN Room r ON f.RoomNumber = r.RoomNumber
      JOIN Hostel h ON r.ShortCode = h.ShortCode
    `);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Member: Get furniture assigned to their room
router.get('/member/:id', authenticateToken, requireOwnershipOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    const identificationNumber = req.params.id;
    
    if (req.user.role !== 'Admin' && req.user.identificationNumber !== identificationNumber) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const alloc = await db.get(`SELECT RoomNumber FROM Allocation WHERE IdentificationNumber = ? AND AllocationStatus='Active' ORDER BY AllocationID DESC LIMIT 1`, [identificationNumber]);
    if (!alloc) return res.json([]);
    
    const items = await db.all(`
      SELECT fi.*, ft.TypeName 
      FROM FurnitureItem fi
      JOIN FurnitureType ft ON fi.FurnitureTypeID = ft.FurnitureTypeID
      WHERE fi.RoomNumber = ?
    `, [alloc.RoomNumber]);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

export default router;
