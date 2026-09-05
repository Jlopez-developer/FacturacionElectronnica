'use strict';
const express = require('express');
const { db } = require('../db');
const { verifyPassword, createSession, destroySession, getToken, requireAuth } = require('../auth');
const r = express.Router();

r.post('/login', (req, res) => {
  const { usuario, clave } = req.body || {};
  const u = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1').get(String(usuario || '').trim().toLowerCase());
  if (!u || !verifyPassword(clave, u.clave_hash)) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  const token = createSession(u.id);
  res.cookie('mc_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 3600 * 1000 });
  res.json({ token, usuario: { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol } });
});
r.post('/logout', (req, res) => {
  const t = getToken(req);
  if (t) destroySession(t);
  res.clearCookie('mc_token');
  res.json({ ok: true });
});
r.get('/me', requireAuth, (req, res) => res.json(req.user));
module.exports = r;
