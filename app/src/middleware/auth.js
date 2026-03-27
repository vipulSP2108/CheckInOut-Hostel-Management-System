import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

export function authenticateToken(req, res, next) {
  // Read JWT from HttpOnly Cookie (set at login) instead of Authorization header
  const token = req.cookies?.token;

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;

    next();
  });
}

export function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'Admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
}

export function requireOwnershipOrAdmin(req, res, next) {
  if (!req.user) return res.sendStatus(401);
  if (req.user.role === 'Admin') return next();
  
  if (req.params.id && req.user.identificationNumber === req.params.id) {
    return next();
  }
  
  return res.status(403).json({ error: 'Access denied: You can only view your own data.' });
}
