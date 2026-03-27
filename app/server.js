import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { initDB, getDB } from './src/db/database.js';
import { authenticateToken, requireAdmin } from './src/middleware/auth.js';
import authRoutes from './src/routes/auth.js';
import memberRoutes from './src/routes/members.js';
import allocationRoutes from './src/routes/allocations.js';
import complaintRoutes from './src/routes/complaints.js';
import visitorRoutes from './src/routes/visitors.js';
import maintenanceRoutes from './src/routes/maintenance.js';
import roomRoutes from './src/routes/rooms.js';
import feeRoutes from './src/routes/fees.js';
import furnitureRoutes from './src/routes/furniture.js';
import scanRoutes from './src/routes/scans.js';
import hostelRoutes from './src/routes/hostels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true, // allow cookies to be sent with cross-origin requests
  }));
  app.use(cookieParser());
  app.use(express.json());
  
  const auditLogStream = fs.createWriteStream(path.join(__dirname, 'logs', 'audit.log'), { flags: 'a' });
  const accessLogStream = fs.createWriteStream(path.join(__dirname, 'logs', 'access.log'), { flags: 'a' });
  app.use(morgan((tokens, req, res) => {
    const user = req.user ? req.user.username : 'anonymous';
    const method = tokens.method(req, res);
    const url = tokens.url(req, res);
    const status = tokens.status(req, res);
    const time = new Date().toISOString();
    
    if (status === '403' || status === '401') {
      const alertLog = `${time} | User: ${user} | UNAUTHORIZED DATA ACCESS ATTEMPT On ${url}\n`;
      auditLogStream.write(alertLog);
      accessLogStream.write(alertLog);
    } else if (method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const logEntry = `${time} | User: ${user} | Action: ${method} ${url} | Status: ${status}\n`;
      auditLogStream.write(logEntry);
    }
    
    const msg = [
      time,
      user,
      method,
      url,
      status,
      tokens.res(req, res, 'content-length'), '-',
      tokens['response-time'](req, res), 'ms'
    ].join(' ');
    
    accessLogStream.write(msg + '\n');
    return msg;
  }));

  await initDB();

  app.use('/api/auth', authRoutes);
  app.use('/api/members', memberRoutes);
  app.use('/api/allocations', allocationRoutes);
  app.use('/api/complaints', complaintRoutes);
  app.use('/api/visitors', visitorRoutes);
  app.use('/api/maintenance', maintenanceRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/fees', feeRoutes);
  app.use('/api/furniture', furnitureRoutes);
  app.use('/api/scans', scanRoutes);
  app.use('/api/hostels', hostelRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const db = getDB();
      const [members, rooms, allocations, complaints, maintenance, visitors] = await Promise.all([
        db.get("SELECT COUNT(*) as total, SUM(IsActive) as active FROM Member"),
        db.get("SELECT COUNT(*) as total, SUM(CASE WHEN RoomStatus='Available' THEN 1 ELSE 0 END) as available FROM Room"),
        db.get("SELECT COUNT(*) as total, SUM(CASE WHEN AllocationStatus='Active' THEN 1 ELSE 0 END) as active FROM Allocation"),
        db.get("SELECT COUNT(*) as total, SUM(CASE WHEN Status='Open' THEN 1 ELSE 0 END) as open FROM Complaint"),
        db.get("SELECT COUNT(*) as total, SUM(CASE WHEN Status='Pending' THEN 1 ELSE 0 END) as pending FROM MaintenanceRequest"),
        db.get("SELECT COUNT(*) as total FROM Visitor"),
      ]);
      res.json({ members, rooms, allocations, complaints, maintenance, visitors });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
