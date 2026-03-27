import express from 'express';
import { authenticateToken, requireOwnershipOrAdmin, requireAdmin } from '../middleware/auth.js';
import { getDB } from '../db/database.js';

const router = express.Router();

router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const requests = await db.all(`
      SELECT mr.*, m.Name as RequestedByName, r.RoomNumber 
      FROM MaintenanceRequest mr
      JOIN Member m ON mr.RequestedBy = m.IdentificationNumber
      JOIN Room r ON mr.RoomID = r.RoomID
      ORDER BY 
        CASE WHEN Status = 'Pending' THEN 1 WHEN Status = 'In Progress' THEN 2 ELSE 3 END,
        CASE WHEN Status IN ('Pending', 'In Progress') THEN RequestDate ELSE CompletedDate END DESC
    `);
    res.json(requests);
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

    const requests = await db.all(`
      SELECT mr.*, r.RoomNumber 
      FROM MaintenanceRequest mr
      JOIN Room r ON mr.RoomID = r.RoomID
      WHERE mr.RequestedBy = ?
    `, [identificationNumber]);
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const { RoomID, Description } = req.body;
    const RequestedBy = req.user.role === 'Admin' ? req.body.RequestedBy : req.user.identificationNumber;
    const result = await db.run('INSERT INTO MaintenanceRequest (RoomID,RequestedBy,Description) VALUES(?,?,?)', [RoomID, RequestedBy, Description]);
    res.status(201).json({ id: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { Status, AssignedTo, CompletedDate } = req.body;

    // Check current status
    const current = await db.get('SELECT Status FROM MaintenanceRequest WHERE RequestID = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Work order not found' });
    if (['Completed', 'Rejected'].includes(current.Status)) {
      return res.status(403).json({ error: `Action not allowed on a ${current.Status.toLowerCase()} maintenance work order` });
    }

    // Restrict Admin to certain statuses
    if (Status && !['Pending', 'In Progress', 'Rejected'].includes(Status)) {
      return res.status(400).json({ error: 'Admin can only set status to Pending, In Progress, or Rejected' });
    }

    await db.run(
      `UPDATE MaintenanceRequest SET Status=?, AssignedTo=?, CompletedDate=CASE WHEN ? IN ('Completed','Rejected') THEN COALESCE(?,CURRENT_TIMESTAMP) ELSE NULL END WHERE RequestID=?`,
      [Status, AssignedTo || null, Status, CompletedDate || null, req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
