import express from 'express';
import { authenticateToken, requireOwnershipOrAdmin, requireAdmin } from '../middleware/auth.js';
import { getDB } from '../db/database.js';

const router = express.Router();

router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const categories = await db.all('SELECT * FROM ComplaintCategory ORDER BY CategoryName');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const complaints = await db.all(`
      SELECT c.*, m.Name as MemberName, r.RoomNumber, cat.CategoryName 
      FROM Complaint c
      JOIN Member m ON c.IdentificationNumber = m.IdentificationNumber
      LEFT JOIN Room r ON c.RoomID = r.RoomID
      JOIN ComplaintCategory cat ON c.CategoryID = cat.CategoryID
      ORDER BY 
        CASE WHEN Status = 'Open' THEN 1 WHEN Status = 'In Progress' THEN 2 ELSE 3 END,
        CASE WHEN Status IN ('Open', 'In Progress') THEN RaisedDate ELSE ResolvedDate END DESC
    `);
    res.json(complaints);
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

    const complaints = await db.all(`
      SELECT c.*, r.RoomNumber, cat.CategoryName 
      FROM Complaint c
      LEFT JOIN Room r ON c.RoomID = r.RoomID
      JOIN ComplaintCategory cat ON c.CategoryID = cat.CategoryID
      WHERE c.IdentificationNumber = ?
    `, [identificationNumber]);
    
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const { RoomID, CategoryID, Description, Severity } = req.body;
    const IdentificationNumber = req.user.role === 'Admin' ? req.body.IdentificationNumber : req.user.identificationNumber;
    const result = await db.run(
      `INSERT INTO Complaint (IdentificationNumber, RoomID, CategoryID, Description, Severity) VALUES (?, ?, ?, ?, ?)`,
      [IdentificationNumber, RoomID || null, CategoryID, Description, Severity || 'Medium']
    );
    res.status(201).json({ id: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { Status, AssignedTo, ResolutionRemarks } = req.body;
    
    // Check current status
    const current = await db.get('SELECT Status FROM Complaint WHERE ComplaintID = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Complaint not found' });
    if (['Resolved', 'Closed', 'Rejected'].includes(current.Status)) {
      return res.status(403).json({ error: `Action not allowed on a ${current.Status.toLowerCase()} complaint` });
    }

    // Restrict Admin to certain statuses
    if (Status && !['Open', 'In Progress', 'Rejected'].includes(Status)) {
      return res.status(400).json({ error: 'Admin can only set status to Open, In Progress, or Rejected' });
    }

    await db.run(
      `UPDATE Complaint SET Status=?, AssignedTo=?, ResolutionRemarks=?, ResolvedDate=CASE WHEN ? IN ('Resolved','Closed','Rejected') THEN CURRENT_TIMESTAMP ELSE NULL END WHERE ComplaintID=?`,
      [Status, AssignedTo || null, ResolutionRemarks || null, Status, req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
