import express from 'express';
import { authenticateToken, requireOwnershipOrAdmin, requireAdmin } from '../middleware/auth.js';
import { getDB } from '../db/database.js';

const router = express.Router();

router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const cats = await db.all('SELECT * FROM FeeCategory ORDER BY CategoryName');
    res.json(cats);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const fees = await db.all(`
      SELECT fp.*, m.Name as MemberName, fc.CategoryName 
      FROM FeePayment fp
      JOIN Member m ON fp.IdentificationNumber = m.IdentificationNumber
      JOIN FeeCategory fc ON fp.FeeCategoryID = fc.FeeCategoryID
      ORDER BY fp.PaymentDate DESC
    `);
    res.json(fees);
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

    const fees = await db.all(`
      SELECT fp.*, fc.CategoryName 
      FROM FeePayment fp
      JOIN FeeCategory fc ON fp.FeeCategoryID = fc.FeeCategoryID
      WHERE fp.IdentificationNumber = ?
    `, [identificationNumber]);
    res.json(fees);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { IdentificationNumber, FeeCategoryID, AmountPaid, Status, PaymentDate } = req.body;
    const result = await db.run(
      'INSERT INTO FeePayment (IdentificationNumber,FeeCategoryID,AmountPaid,Status,PaymentDate) VALUES(?,?,?,?,?)',
      [IdentificationNumber, FeeCategoryID, AmountPaid, Status || 'Paid', PaymentDate || new Date().toISOString()]
    );
    res.status(201).json({ id: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
