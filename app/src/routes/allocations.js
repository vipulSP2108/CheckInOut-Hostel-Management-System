import express from 'express';
import { authenticateToken, requireOwnershipOrAdmin, requireAdmin } from '../middleware/auth.js';
import { getDB } from '../db/database.js';

const router = express.Router();

router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const allocations = await db.all(`
      SELECT a.*, 
             m.Name as MemberName, m.ContactNumber as MemberContact, m.Department, m.YearOfStudy, m.Email,
             r.RoomNumber, 
             h.Name as HostelName, h.WardenName, h.WardenContact
      FROM Allocation a
      JOIN Member m ON a.IdentificationNumber = m.IdentificationNumber
      JOIN Room r ON a.RoomID = r.RoomID
      JOIN Hostel h ON r.HostelID = h.HostelID
      ORDER BY 
        CASE WHEN a.AllocationStatus = 'Active' THEN 1 ELSE 2 END,
        CASE WHEN a.AllocationStatus = 'Active' THEN a.CheckInDate ELSE a.CheckOutDate END DESC
    `);
    res.json(allocations);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/member/:id', authenticateToken, requireOwnershipOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    const identificationNumber = req.params.id;
    
    if (req.user.role !== 'Admin' && req.user.identificationNumber !== identificationNumber) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const allocations = await db.all(`
      SELECT a.*, r.RoomNumber, h.Name as HostelName, h.WardenName, h.WardenContact
      FROM Allocation a
      JOIN Room r ON a.RoomID = r.RoomID
      JOIN Hostel h ON r.HostelID = h.HostelID
      WHERE a.IdentificationNumber = ?
    `, [identificationNumber]);
    
    res.json(allocations);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { IdentificationNumber, RoomID, CheckInDate, AllocatedBy } = req.body;
    
    // Check if member already has an active allocation
    const activeAlloc = await db.get('SELECT * FROM Allocation WHERE IdentificationNumber = ? AND AllocationStatus = "Active"', [IdentificationNumber]);
    if (activeAlloc) {
      return res.status(400).json({ error: 'User already has an active allocation' });
    }

    // Check room capacity
    const room = await db.get('SELECT MaxCapacity, CurrentOccupancy, RoomStatus FROM Room WHERE RoomID = ?', [RoomID]);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    
    if (room.RoomStatus !== 'Available') {
      return res.status(400).json({ error: 'Room is not available (Status: ' + room.RoomStatus + ')' });
    }

    if (room.CurrentOccupancy >= room.MaxCapacity) {
      return res.status(400).json({ error: 'Room is already at full capacity' });
    }

    const result = await db.run(
      `INSERT INTO Allocation (IdentificationNumber, RoomID, CheckInDate, AllocatedBy, CreatedBy) VALUES (?, ?, ?, ?, ?)`,
      [IdentificationNumber, RoomID, CheckInDate, AllocatedBy || null, req.user.username]
    );

    const newOccupancy = room.CurrentOccupancy + 1;
    const newStatus = newOccupancy >= room.MaxCapacity ? 'Occupied' : 'Available';

    await db.run('UPDATE Room SET CurrentOccupancy = ?, RoomStatus = ? WHERE RoomID = ?', [newOccupancy, newStatus, RoomID]);
    
    res.json({ id: result.lastID });
  } catch (error) {
    console.error('Allocation Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { CheckOutDate, AllocationStatus } = req.body;
    const alloc = await db.get('SELECT * FROM Allocation WHERE AllocationID=?', [req.params.id]);
    if (!alloc) return res.status(404).json({ error: 'Not found' });
    await db.run('UPDATE Allocation SET CheckOutDate=?, AllocationStatus=? WHERE AllocationID=?',
      [CheckOutDate || new Date().toISOString().split('T')[0], AllocationStatus || 'Completed', req.params.id]);
    
    // Decrement occupancy and always set status to Available since it now has space
    await db.run('UPDATE Room SET CurrentOccupancy = MAX(0, CurrentOccupancy - 1), RoomStatus = "Available" WHERE RoomID = ?', [alloc.RoomID]);
    
    res.json({ message: 'Checked out successfully' });
  } catch (error) {
    console.error('Checkout Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
