import express from 'express';
import { authenticateToken, requireOwnershipOrAdmin, requireAdmin } from '../middleware/auth.js';
import { getDB } from '../db/database.js';

const router = express.Router();

router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const members = await db.all('SELECT * FROM Member ORDER BY AllocatedDate DESC');
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const identificationNumber = req.params.id;
    
    if (req.user.role !== 'Admin' && req.user.identificationNumber !== identificationNumber) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const member = await db.get('SELECT * FROM Member WHERE IdentificationNumber = ?', [identificationNumber]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    
    res.json(member);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { Name, Age, Email, ContactNumber, IdentificationNumber, AllocatedDate, PurposeOfStay, Gender, DateOfBirth, QRCode, Department, YearOfStudy } = req.body;
    await db.run(
      `INSERT INTO Member (Name,Age,Email,ContactNumber,IdentificationNumber,AllocatedDate,PurposeOfStay,Gender,DateOfBirth,QRCode,Department,YearOfStudy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [Name, Age, Email, ContactNumber, IdentificationNumber, AllocatedDate, PurposeOfStay, Gender, DateOfBirth, QRCode, Department || null, YearOfStudy || null]
    );
    res.status(201).json({ id: IdentificationNumber });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email or ID already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { Name, Age, Email, ContactNumber, Department, YearOfStudy, IsActive } = req.body;
    await db.run(
      'UPDATE Member SET Name=?,Age=?,Email=?,ContactNumber=?,Department=?,YearOfStudy=?,IsActive=?,UpdatedAt=CURRENT_TIMESTAMP WHERE IdentificationNumber=?',
      [Name, Age, Email, ContactNumber, Department || null, YearOfStudy || null, IsActive !== undefined ? IsActive : 1, req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const id = req.params.id; // IdentificationNumber
    
    // Explicitly delete relational data securely to bypass PRAGMA constraints
    await db.run('DELETE FROM Users WHERE IdentificationNumber = ?', [id]);
    await db.run('DELETE FROM Allocation WHERE IdentificationNumber = ?', [id]);
    await db.run('DELETE FROM FeePayment WHERE IdentificationNumber = ?', [id]);
    await db.run('DELETE FROM Complaint WHERE IdentificationNumber = ?', [id]);
    await db.run('DELETE FROM Visitor WHERE IdentificationNumber = ?', [id]);
    await db.run('DELETE FROM QRScanLog WHERE IdentificationNumber = ?', [id]);
    await db.run('DELETE FROM MaintenanceRequest WHERE RequestedBy = ?', [id]);
    
    // Annihilate the core member row
    await db.run('DELETE FROM Member WHERE IdentificationNumber = ?', [id]);
    
    res.json({ message: 'Member and traces annihilated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
