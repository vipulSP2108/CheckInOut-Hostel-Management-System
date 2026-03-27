import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { getDB } from '../db/database.js';

const router = express.Router();

router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const scans = await db.all(`
      SELECT * FROM QRScanLog 
      ORDER BY ScanDateTime DESC
    `);
    res.json(scans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/gate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { qrCode } = req.body;
    const db = getDB();
    
    // Find member by their unique ID or QR string
    const member = await db.get('SELECT * FROM Member WHERE QRCode = ? OR IdentificationNumber = ?', [qrCode, qrCode]);
    if (!member) {
      return res.status(404).json({ error: 'Invalid QR Code. Member not found.' });
    }
    
    // Find active room info to return
    const alloc = await db.get('SELECT r.RoomNumber, h.Name FROM Allocation a JOIN Room r ON a.RoomID = r.RoomID JOIN Hostel h ON r.HostelID = h.HostelID WHERE a.IdentificationNumber = ? AND a.AllocationStatus="Active"', [member.IdentificationNumber]);

    // Log the scan
    await db.run('INSERT INTO QRScanLog (ScanType, QRCode, ScannedBy, Location, IdentificationNumber) VALUES (?, ?, ?, ?, ?)', ['Member', qrCode, req.user.username, 'Main Gate', member.IdentificationNumber]);

    res.json({
      valid: true,
      member: {
        Name: member.Name,
        Department: member.Department,
        Room: alloc ? alloc.RoomNumber : 'Unassigned',
        Hostel: alloc ? alloc.Name : 'N/A'
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/maintenance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { qrCode } = req.body;
    const db = getDB();
    
    // 1. Validate as a Member QR code
    let member = await db.get('SELECT * FROM Member WHERE QRCode = ? OR IdentificationNumber = ?', [qrCode, qrCode]);
    if (member) {
      const pendingTickets = await db.all('SELECT * FROM MaintenanceRequest WHERE RequestedBy = ? AND Status IN ("Pending", "In Progress")', [member.IdentificationNumber]);
      const pendingComplaints = await db.all('SELECT * FROM Complaint WHERE IdentificationNumber = ? AND Status NOT IN ("Resolved", "Closed")', [member.IdentificationNumber]);
      
      if (pendingTickets.length === 0 && pendingComplaints.length === 0) {
        return res.status(404).json({ error: `Resident ${member.Name} has no pending work orders or complaints waiting for closure!` });
      }

      // Close maintenance requests
      for (const t of pendingTickets) {
        await db.run('UPDATE MaintenanceRequest SET Status = "Completed", CompletedDate = CURRENT_TIMESTAMP WHERE RequestID = ?', [t.RequestID]);
      }
      // Close complaints
      for (const c of pendingComplaints) {
        await db.run('UPDATE Complaint SET Status = "Closed", ResolvedDate = CURRENT_TIMESTAMP WHERE ComplaintID = ?', [c.ComplaintID]);
      }
      
      await db.run('INSERT INTO QRScanLog (ScanType, QRCode, ScannedBy, Location) VALUES (?, ?, ?, ?)', ['Member', qrCode, req.user.username, 'Resident QR - Unified Verification']);

      return res.json({ 
        success: true, 
        message: `Validated Resident ${member.Name}. Successfully closed ${pendingTickets.length} ticket(s) and ${pendingComplaints.length} complaint(s).` 
      });
    }

    // 2. Validate as a Room QR code
    let room = await db.get('SELECT * FROM Room WHERE QRCode = ?', [qrCode]);
    if (room) {
      if (room.CurrentOccupancy > 0) {
        return res.status(403).json({ error: `Room ${room.RoomNumber} is currently occupied! Policy strictly requires you scan the resident's personal QR to authorize closure, not the generic Room QR.` });
      }

      const pendingTickets = await db.all('SELECT * FROM MaintenanceRequest WHERE RoomID = ? AND Status IN ("Pending", "In Progress")', [room.RoomID]);
      const pendingComplaints = await db.all('SELECT * FROM Complaint WHERE RoomID = ? AND Status NOT IN ("Resolved", "Closed")', [room.RoomID]);
      
      if (pendingTickets.length === 0 && pendingComplaints.length === 0) {
        return res.status(404).json({ error: `Vacant Room ${room.RoomNumber} has no pending work orders or complaints waiting for closure!` });
      }

      // Close maintenance requests
      for (const t of pendingTickets) {
        await db.run('UPDATE MaintenanceRequest SET Status = "Completed", CompletedDate = CURRENT_TIMESTAMP WHERE RequestID = ?', [t.RequestID]);
      }
      // Close complaints
      for (const c of pendingComplaints) {
        await db.run('UPDATE Complaint SET Status = "Closed", ResolvedDate = CURRENT_TIMESTAMP WHERE ComplaintID = ?', [c.ComplaintID]);
      }

      await db.run('INSERT INTO QRScanLog (ScanType, QRCode, ScannedBy, Location) VALUES (?, ?, ?, ?)', ['Room', qrCode, req.user.username, 'Room QR - Unified Verification']);

      return res.json({ 
        success: true, 
        message: `Validated Vacant Room ${room.RoomNumber}. Successfully closed ${pendingTickets.length} ticket(s) and ${pendingComplaints.length} complaint(s).` 
      });
    }

    // 3. Fallback invalid response
    return res.status(404).json({ error: 'Scanned QR is unrecognized! It matches neither an active Resident nor a registered Room.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;
