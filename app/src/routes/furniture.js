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
      JOIN Room r ON f.RoomID = r.RoomID
      JOIN Hostel h ON r.HostelID = h.HostelID
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

    const alloc = await db.get(`SELECT RoomID FROM Allocation WHERE IdentificationNumber = ? AND AllocationStatus='Active' ORDER BY AllocationID DESC LIMIT 1`, [identificationNumber]);
    if (!alloc) return res.json([]);
    
    const items = await db.all(`
      SELECT fi.*, ft.TypeName 
      FROM FurnitureItem fi
      JOIN FurnitureType ft ON fi.TypeID = ft.TypeID
      WHERE fi.RoomID = ?
    `, [alloc.RoomID]);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
