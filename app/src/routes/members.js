import express from 'express';
import { authenticateToken, requireOwnershipOrAdmin, requireAdmin } from '../middleware/auth.js';
import { getDB, executeQuery } from '../db/database.js';
import { checkGlobalUniqueness } from '../../sharding/integrity.js';

const router = express.Router();

router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const members = await executeQuery({
      sql: 'SELECT * FROM Member ORDER BY AllocatedDate DESC',
      type: 'all'
    });
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const identificationNumber = req.params.id;
    
    if (req.user.role !== 'Admin' && req.user.identificationNumber !== identificationNumber) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const member = await executeQuery({
      sql: 'SELECT * FROM Member WHERE IdentificationNumber = ?',
      params: [identificationNumber],
      shardKey: identificationNumber,
      type: 'get'
    });

    if (!member) return res.status(404).json({ error: 'Member not found' });
    
    res.json(member);
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { Name, Age, Email, ContactNumber, IdentificationNumber, AllocatedDate, PurposeOfStay, Gender, DateOfBirth, QRCode, Department, YearOfStudy } = req.body;
    
    // Cross-Shard Integrity Check
    const isEmailUnique = await checkGlobalUniqueness('Member', 'Email', Email);
    const isIdUnique = await checkGlobalUniqueness('Member', 'IdentificationNumber', IdentificationNumber);
    
    if (!isEmailUnique || !isIdUnique) {
      return res.status(400).json({ error: 'Email or IdentificationNumber already exists in the sharded cluster' });
    }

    await executeQuery({
      sql: `INSERT INTO Member (Name,Age,Email,ContactNumber,IdentificationNumber,AllocatedDate,PurposeOfStay,Gender,DateOfBirth,QRCode,Department,YearOfStudy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [Name, Age, Email, ContactNumber, IdentificationNumber, AllocatedDate, PurposeOfStay, Gender, DateOfBirth, QRCode, Department || null, YearOfStudy || null],
      shardKey: IdentificationNumber,
      type: 'run'
    });
    res.status(201).json({ id: IdentificationNumber });
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { Name, Age, Email, ContactNumber, Department, YearOfStudy, IsActive } = req.body;
    await executeQuery({
      sql: 'UPDATE Member SET Name=?,Age=?,Email=?,ContactNumber=?,Department=?,YearOfStudy=?,IsActive=?,UpdatedAt=CURRENT_TIMESTAMP WHERE IdentificationNumber=?',
      params: [Name, Age, Email, ContactNumber, Department || null, YearOfStudy || null, IsActive !== undefined ? IsActive : 1, req.params.id],
      shardKey: req.params.id,
      type: 'run'
    });
    res.json({ message: 'Updated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id; // IdentificationNumber
    
    // Annihilate all data in the specific shard
    await executeQuery({ sql: 'DELETE FROM Users WHERE IdentificationNumber = ?', params: [id], shardKey: id, type: 'run' });
    await executeQuery({ sql: 'DELETE FROM Allocation WHERE IdentificationNumber = ?', params: [id], shardKey: id, type: 'run' });
    await executeQuery({ sql: 'DELETE FROM FeePayment WHERE IdentificationNumber = ?', params: [id], shardKey: id, type: 'run' });
    await executeQuery({ sql: 'DELETE FROM Complaint WHERE IdentificationNumber = ?', params: [id], shardKey: id, type: 'run' });
    await executeQuery({ sql: 'DELETE FROM Visitor WHERE IdentificationNumber = ?', params: [id], shardKey: id, type: 'run' });
    await executeQuery({ sql: 'DELETE FROM QRScanLog WHERE IdentificationNumber = ?', params: [id], shardKey: id, type: 'run' });
    await executeQuery({ sql: 'DELETE FROM MaintenanceRequest WHERE RequestedBy = ?', params: [id], shardKey: id, type: 'run' });
    
    // Annihilate the core member row
    await executeQuery({ sql: 'DELETE FROM Member WHERE IdentificationNumber = ?', params: [id], shardKey: id, type: 'run' });
    
    res.json({ message: 'Member and traces annihilated across shards' });
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

export default router;
