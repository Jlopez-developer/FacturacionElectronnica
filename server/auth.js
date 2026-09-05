'use strict';
const crypto = require('crypto');
const { db } = require('./db');

const hashPassword = (clave) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(clave), salt, 64).toString('hex');
  return `${salt}:${hash}`;
};
const verifyPassword = (clave, stored) => {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(String(clave), salt, 64);
  const orig = Buffer.from(hash, 'hex');
  return calc.length === orig.length && crypto.timingSafeEqual(calc, orig);
};

const SESSION_HOURS = 12;
const createSession = (usuarioId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sesiones(token, usuario_id, expira) VALUES(?,?,?)').run(token, usuarioId, expira);
  return token;
};
const destroySession = (token) => db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);

const userFromToken = (token) => {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.usuario, u.nombre, u.rol, u.activo, s.expira
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?`).get(token);
  if (!row || !row.activo) return null;
  if (new Date(row.expira) < new Date()) { destroySession(token); return null; }
  return { id: row.id, usuario: row.usuario, nombre: row.nombre, rol: row.rol };
};

const getToken = (req) => {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)mc_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

const requireAuth = (req, res, next) => {
  const user = userFromToken(getToken(req));
  if (!user) return res.status(401).json({ error: 'No autenticado' });
  req.user = user;
  next();
};
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.rol)) return res.status(403).json({ error: 'Sin permiso para esta acción' });
  next();
};

module.exports = { hashPassword, verifyPassword, createSession, destroySession, userFromToken, getToken, requireAuth, requireRole };
