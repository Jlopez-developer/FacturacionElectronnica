'use strict';
const path = require('path');
const express = require('express');
const { db } = require('./db');
const { requireAuth } = require('./auth');
const { hashPassword } = require('./auth');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Usuario administrador inicial
if (db.prepare('SELECT COUNT(*) n FROM usuarios').get().n === 0) {
  db.prepare('INSERT INTO usuarios(usuario,nombre,clave_hash,rol) VALUES(?,?,?,?)').run('admin', 'Administrador', hashPassword(process.env.ADMIN_PASSWORD || 'admin123'), 'administrador');
  console.log('Usuario inicial creado: admin / ' + (process.env.ADMIN_PASSWORD || 'admin123'));
}

app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', requireAuth, require('./routes/dashboard'));
app.use('/api', requireAuth, require('./routes/catalogos'));
app.use('/api/facturas', requireAuth, require('./routes/facturas'));
app.use('/api', requireAuth, require('./routes/operaciones'));
app.use('/api', requireAuth, require('./routes/admin'));
app.get('/api/salud', (req, res) => res.json({ ok: true, hora: new Date().toISOString() }));

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

// Reintento periódico de e-CF pendientes (cada 10 minutos)
const dgii = require('./dgii');
const { getConfig } = require('./db');
setInterval(() => {
  if (getConfig('dgii_modo') === 'electronico' && getConfig('dgii_envio_automatico', '1') === '1' && getConfig('dgii_cert_archivo')) {
    dgii.reprocesarPendientes(10).catch((e) => console.error('Reproceso DGII:', e.message));
  }
}, 10 * 60 * 1000).unref();

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Mi Colmado - Sistema de Facturación escuchando en http://localhost:${PORT}`));
}
module.exports = app;
