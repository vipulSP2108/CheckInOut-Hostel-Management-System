import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDB } from '../db/database.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Admin-only: create a new user account for a member
router.post('/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, role, identificationNumber } = req.body;
    const db = getDB();
    const hash = await bcrypt.hash(password, 10);
    await db.run('INSERT INTO Users (Username,PasswordHash,Role,IdentificationNumber) VALUES(?,?,?,?)', [username, hash, role || 'Regular', identificationNumber || null]);
    res.status(201).json({ message: 'User created' });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});


router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = getDB();
    
    const user = await db.get('SELECT * FROM Users WHERE Username = ?', [username]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.PasswordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const JWT_SECRET_LOCAL = process.env.JWT_SECRET || 'your-secret-key-here';
    const token = jwt.sign(
      { userId: user.UserID, username: user.Username, role: user.Role, identificationNumber: user.IdentificationNumber },
      JWT_SECRET_LOCAL,
      { expiresIn: '24h' }
    );

    // Set secure HttpOnly cookie — browser attaches it automatically to every request
    res.cookie('token', token, {
      httpOnly: true,       // JS cannot read this cookie (XSS protection)
      sameSite: 'Strict',   // only sent to same origin (CSRF protection)
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      // secure: true,  // uncomment in production (HTTPS only)
    });

    res.json({ role: user.Role, identificationNumber: user.IdentificationNumber, username: user.Username });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const db = getDB();
    
    const user = await db.get('SELECT * FROM Users WHERE UserID = ?', [req.user.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(oldPassword, user.PasswordHash);
    if (!validPassword) return res.status(401).json({ error: 'Incorrect current password' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE Users SET PasswordHash = ? WHERE UserID = ?', [hash, req.user.userId]);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { sameSite: 'Strict' });
  res.json({ message: 'Logged out successfully' });
});

export default router;
