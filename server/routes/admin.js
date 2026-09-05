'use strict';
// Usuarios, configuración, DGII, reportes
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, getConfig, setConfig, allConfig } = require('../db');
const { hashPassword, verifyPassword, requireRole } = require('../auth');
const firma = require('../dgii/firma');
const cliente = require('../dgii/cliente');
const dgii = require('../dgii');
const ncf = require('../dgii/ncf');
const r = express.Router();
const admin = requireRole('administrador');

// ---------- Usuarios ----------
r.get('/usuarios', requireRole('administrador', 'supervisor'), (req, res) => res.json(db.prepare('SELECT id, usuario, nombre, rol, activo, creado, (SELECT MAX(fecha) FROM facturas f WHERE f.usuario_id=u.id) ultima_venta FROM usuarios u ORDER BY nombre').all()));
r.post('/usuarios', admin, (req, res) => {
  const { usuario, nombre, clave, rol } = req.body || {};
  if (!usuario || !nombre || !clave) return res.status(400).json({ error: 'Usuario, nombre y contraseña son requeridos' });
  if (String(clave).length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
  try {
    const info = db.prepare('INSERT INTO usuarios(usuario,nombre,clave_hash,rol) VALUES(?,?,?,?)').run(String(usuario).trim().toLowerCase(), nombre.trim(), hashPassword(clave), ['administrador', 'supervisor', 'cajero'].includes(rol) ? rol : 'cajero');
    res.status(201).json(db.prepare('SELECT id, usuario, nombre, rol, activo FROM usuarios WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) { res.status(400).json({ error: e.message.includes('UNIQUE') ? 'Ese nombre de usuario ya existe' : e.message }); }
});
r.put('/usuarios/:id', admin, (req, res) => {
  const { nombre, clave, rol, activo } = req.body || {};
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (u.id === req.user.id && activo === 0) return res.status(400).json({ error: 'No puede desactivar su propio usuario' });
  db.prepare('UPDATE usuarios SET nombre=COALESCE(?,nombre), rol=COALESCE(?,rol), activo=COALESCE(?,activo), clave_hash=COALESCE(?,clave_hash) WHERE id=?')
    .run(nombre, rol, activo == null ? null : (activo ? 1 : 0), clave ? hashPassword(clave) : null, u.id);
  res.json(db.prepare('SELECT id, usuario, nombre, rol, activo FROM usuarios WHERE id = ?').get(u.id));
});
r.post('/usuarios/cambiar-clave', (req, res) => {
  const { actual, nueva } = req.body || {};
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.id);
  if (!verifyPassword(actual, u.clave_hash)) return res.status(400).json({ error: 'La contraseña actual es incorrecta' });
  if (!nueva || String(nueva).length < 4) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres' });
  db.prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?').run(hashPassword(nueva), u.id);
  res.json({ ok: true });
});

// ---------- Configuración ----------
const OCULTAS = ['dgii_cert_clave', 'dgii_token', 'dgii_token_expira'];
r.get('/configuracion', (req, res) => {
  const cfg = allConfig();
  for (const k of OCULTAS) delete cfg[k];
  cfg.certificado = null;
  try { const c = firma.obtenerCertificado(); if (c) cfg.certificado = { archivo: c.archivo, subject: c.subject, vence: c.notAfter, vigente: c.notAfter > new Date() }; } catch (e) { cfg.certificado = { archivo: getConfig('dgii_cert_archivo'), error: e.message }; }
  cfg.secuencias = db.prepare('SELECT * FROM secuencias_ecf ORDER BY tipo').all().map((s) => ({ ...s, disponibles: ncf.disponibles(s.tipo) }));
  res.json(cfg);
});
r.put('/configuracion', admin, (req, res) => {
  const b = req.body || {};
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(b)) {
      if (['secuencias', 'certificado', 'dgii_token', 'dgii_token_expira'].includes(k)) continue;
      if (k === 'dgii_cert_clave' && !v) continue;
      setConfig(k, v);
    }
    if (b.dgii_ambiente !== undefined || b.dgii_cert_clave) { setConfig('dgii_token', ''); setConfig('dgii_token_expira', ''); firma.invalidarCache(); }
  });
  tx();
  res.json({ ok: true });
});
r.put('/configuracion/secuencias/:tipo', admin, (req, res) => {
  const { desde, hasta, actual, vence, activo } = req.body || {};
  const s = db.prepare('SELECT * FROM secuencias_ecf WHERE tipo = ?').get(req.params.tipo);
  if (!s) return res.status(404).json({ error: 'Tipo no encontrado' });
  db.prepare('UPDATE secuencias_ecf SET desde=COALESCE(?,desde), hasta=COALESCE(?,hasta), actual=COALESCE(?,actual), vence=COALESCE(?,vence), activo=COALESCE(?,activo) WHERE tipo=?')
    .run(desde != null ? Number(desde) : null, hasta != null ? Number(hasta) : null, actual != null ? Number(actual) : null, vence || null, activo == null ? null : (activo ? 1 : 0), s.tipo);
  res.json({ ...db.prepare('SELECT * FROM secuencias_ecf WHERE tipo = ?').get(s.tipo), disponibles: ncf.disponibles(s.tipo) });
});

// Certificado digital (.p12/.pfx)
const upload = multer({ storage: multer.diskStorage({ destination: firma.CERT_DIR, filename: (req, f, cb) => cb(null, `certificado${path.extname(f.originalname || '.p12').toLowerCase() || '.p12'}`) }), limits: { fileSize: 2 * 1024 * 1024 } });
r.post('/configuracion/certificado', admin, upload.single('certificado'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo .p12/.pfx requerido' });
  const clave = req.body?.clave || '';
  try {
    const c = firma.cargarCertificado(req.file.filename, clave);
    setConfig('dgii_cert_archivo', req.file.filename); setConfig('dgii_cert_clave', clave); setConfig('dgii_cert_vence', c.notAfter.toISOString());
    setConfig('dgii_token', ''); firma.invalidarCache();
    res.json({ ok: true, subject: c.subject, vence: c.notAfter });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    res.status(400).json({ error: `No se pudo leer el certificado: ${e.message.includes('Invalid password') || e.message.includes('MAC') ? 'contraseña incorrecta' : e.message}` });
  }
});
r.delete('/configuracion/certificado', admin, (req, res) => {
  const a = getConfig('dgii_cert_archivo');
  if (a) { try { fs.unlinkSync(path.join(firma.CERT_DIR, a)); } catch { /* ignore */ } }
  setConfig('dgii_cert_archivo', ''); setConfig('dgii_cert_clave', ''); setConfig('dgii_cert_vence', ''); firma.invalidarCache();
  res.json({ ok: true });
});

// ---------- DGII ----------
r.get('/dgii/estado', async (req, res) => {
  const resumen = db.prepare(`SELECT dgii_estado, COUNT(*) n FROM facturas WHERE estado='emitida' AND tipo_ecf NOT LIKE 'B%' GROUP BY dgii_estado`).all();
  let servicios = null;
  if (req.query.servicios === '1') { try { servicios = await cliente.estadoServicios(); } catch (e) { servicios = { ok: false, error: e.message }; } }
  res.json({ ambiente: cliente.ambiente(), modo: getConfig('dgii_modo'), certificado: firma.certificadoDisponible(), rnc: getConfig('negocio_rnc'), resumen, servicios });
});
r.post('/dgii/probar', admin, async (req, res) => {
  try { const token = await cliente.obtenerToken(true); res.json({ ok: true, mensaje: `Autenticación exitosa en ${cliente.ambiente()}`, token: token.slice(0, 12) + '…' }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
r.post('/dgii/reprocesar', requireRole('administrador', 'supervisor'), async (req, res) => {
  try { res.json(await dgii.reprocesarPendientes(Number(req.body?.limite) || 20)); } catch (e) { res.status(500).json({ error: e.message }); }
});
r.get('/dgii/log', (req, res) => res.json(db.prepare('SELECT l.*, f.numero, f.encf FROM dgii_log l LEFT JOIN facturas f ON f.id=l.factura_id ORDER BY l.id DESC LIMIT 200').all()));

// ---------- Reportes ----------
const hoyIso = () => new Date().toISOString().slice(0, 10);
r.get('/reportes/ventas', (req, res) => {
  const desde = req.query.desde || `${hoyIso().slice(0, 7)}-01`; const hasta = req.query.hasta || hoyIso();
  const base = "FROM facturas f WHERE f.estado='emitida' AND date(f.fecha) BETWEEN ? AND ?";
  const porDia = db.prepare(`SELECT date(f.fecha) fecha, COUNT(*) facturas, SUM(CASE WHEN tipo_ecf IN ('34','B04') THEN -total ELSE total END) total, SUM(CASE WHEN tipo_ecf IN ('34','B04') THEN -itbis ELSE itbis END) itbis ${base} GROUP BY date(f.fecha) ORDER BY fecha`).all(desde, hasta);
  const porPago = db.prepare(`SELECT metodo_pago, COUNT(*) facturas, SUM(CASE WHEN tipo_ecf IN ('34','B04') THEN -total ELSE total END) total ${base} GROUP BY metodo_pago`).all(desde, hasta);
  const porTipo = db.prepare(`SELECT tipo_ecf, COUNT(*) facturas, SUM(total) total ${base} GROUP BY tipo_ecf`).all(desde, hasta);
  const porUsuario = db.prepare(`SELECT u.nombre usuario, COUNT(*) facturas, SUM(CASE WHEN tipo_ecf IN ('34','B04') THEN -total ELSE total END) total FROM facturas f JOIN usuarios u ON u.id=f.usuario_id WHERE f.estado='emitida' AND date(f.fecha) BETWEEN ? AND ? GROUP BY u.id ORDER BY total DESC`).all(desde, hasta);
  const productos = db.prepare(`SELECT fi.nombre, SUM(fi.cantidad) unidades, SUM(fi.total) total, SUM(fi.total - fi.cantidad*COALESCE(p.costo,0)) ganancia FROM factura_items fi JOIN facturas f ON f.id=fi.factura_id LEFT JOIN productos p ON p.id=fi.producto_id WHERE f.estado='emitida' AND f.tipo_ecf NOT IN ('34','B04') AND date(f.fecha) BETWEEN ? AND ? GROUP BY fi.producto_id, fi.nombre ORDER BY total DESC LIMIT 50`).all(desde, hasta);
  const categorias = db.prepare(`SELECT COALESCE(c.nombre,'Otros') nombre, COALESCE(c.color,'#9ca3af') color, SUM(fi.total) total FROM factura_items fi JOIN facturas f ON f.id=fi.factura_id LEFT JOIN productos p ON p.id=fi.producto_id LEFT JOIN categorias c ON c.id=p.categoria_id WHERE f.estado='emitida' AND f.tipo_ecf NOT IN ('34','B04') AND date(f.fecha) BETWEEN ? AND ? GROUP BY COALESCE(c.nombre,'Otros') ORDER BY total DESC`).all(desde, hasta);
  const tot = porDia.reduce((a, d) => ({ facturas: a.facturas + d.facturas, total: a.total + d.total, itbis: a.itbis + d.itbis }), { facturas: 0, total: 0, itbis: 0 });
  const compras = db.prepare('SELECT COALESCE(SUM(total),0) t, COUNT(*) n FROM compras WHERE date(fecha) BETWEEN ? AND ?').get(desde, hasta);
  const gastos = db.prepare('SELECT COALESCE(SUM(monto),0) t, COUNT(*) n FROM gastos WHERE date(fecha) BETWEEN ? AND ?').get(desde, hasta);
  const costo = db.prepare(`SELECT COALESCE(SUM(fi.cantidad*COALESCE(p.costo,0)),0) t FROM factura_items fi JOIN facturas f ON f.id=fi.factura_id LEFT JOIN productos p ON p.id=fi.producto_id WHERE f.estado='emitida' AND f.tipo_ecf NOT IN ('34','B04') AND date(f.fecha) BETWEEN ? AND ?`).get(desde, hasta).t;
  res.json({ desde, hasta, totales: { ...tot, compras: compras.t, n_compras: compras.n, gastos: gastos.t, n_gastos: gastos.n, costo_ventas: costo, ganancia_bruta: tot.total - tot.itbis - costo, resultado: tot.total - tot.itbis - costo - gastos.t }, por_dia: porDia, por_pago: porPago, por_tipo: porTipo.map((t) => ({ ...t, nombre: ncf.TIPOS_ECF[t.tipo_ecf] || t.tipo_ecf })), por_usuario: porUsuario, productos, categorias });
});
/** Reporte 607 (ventas) en CSV para la DGII. */
r.get('/reportes/607', (req, res) => {
  const desde = req.query.desde || `${hoyIso().slice(0, 7)}-01`; const hasta = req.query.hasta || hoyIso();
  const rows = db.prepare(`SELECT f.*, c.identificacion, c.tipo_id FROM facturas f LEFT JOIN clientes c ON c.id=f.cliente_id WHERE f.estado <> 'anulada' AND f.encf IS NOT NULL AND date(f.fecha) BETWEEN ? AND ? ORDER BY f.id`).all(desde, hasta);
  const tipoId = (t) => (t === 'RNC' ? '1' : t === 'CEDULA' ? '2' : t === 'PASAPORTE' ? '3' : '');
  const lineas = ['RNC/Cédula;Tipo Id;NCF;NCF Modificado;Tipo Ingreso;Fecha Comprobante;Monto Facturado;ITBIS Facturado;Efectivo;Cheque/Transferencia;Tarjeta;Crédito'];
  for (const f of rows) {
    const ref = f.referencia_id ? db.prepare('SELECT encf FROM facturas WHERE id = ?').get(f.referencia_id)?.encf : '';
    const fecha = f.fecha.slice(0, 10).replace(/-/g, '');
    const pago = { efectivo: '', transferencia: '', tarjeta: '', credito: '' }; if (pago[f.metodo_pago] !== undefined) pago[f.metodo_pago] = f.total.toFixed(2);
    lineas.push([f.identificacion || '', tipoId(f.tipo_id), f.encf, ref || '', '01', fecha, f.subtotal.toFixed(2), f.itbis.toFixed(2), pago.efectivo, pago.transferencia, pago.tarjeta, pago.credito].join(';'));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="607_${getConfig('negocio_rnc') || 'RNC'}_${desde.slice(0, 7).replace('-', '')}.csv"`);
  res.send('﻿' + lineas.join('\r\n'));
});
/** Reporte 606 (compras y gastos con NCF) en CSV. */
r.get('/reportes/606', (req, res) => {
  const desde = req.query.desde || `${hoyIso().slice(0, 7)}-01`; const hasta = req.query.hasta || hoyIso();
  const compras = db.prepare('SELECT c.*, p.rnc FROM compras c LEFT JOIN proveedores p ON p.id=c.proveedor_id WHERE c.ncf IS NOT NULL AND date(c.fecha) BETWEEN ? AND ?').all(desde, hasta);
  const gastos = db.prepare('SELECT * FROM gastos WHERE ncf IS NOT NULL AND date(fecha) BETWEEN ? AND ?').all(desde, hasta);
  const lineas = ['RNC/Cédula;Tipo Id;Tipo Bienes/Servicios;NCF;Fecha Comprobante;Monto Facturado;ITBIS Facturado;Forma de Pago'];
  for (const c of compras) lineas.push([c.rnc || '', c.rnc && c.rnc.length === 9 ? '1' : '2', '09', c.ncf, c.fecha.slice(0, 10).replace(/-/g, ''), c.subtotal.toFixed(2), c.itbis.toFixed(2), c.metodo_pago].join(';'));
  for (const g of gastos) lineas.push(['', '', '02', g.ncf, g.fecha.slice(0, 10).replace(/-/g, ''), (g.monto / 1.18).toFixed(2), (g.monto - g.monto / 1.18).toFixed(2), g.metodo_pago].join(';'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="606_${getConfig('negocio_rnc') || 'RNC'}_${desde.slice(0, 7).replace('-', '')}.csv"`);
  res.send('﻿' + lineas.join('\r\n'));
});
r.get('/reportes/inventario', (req, res) => {
  const rows = db.prepare('SELECT p.*, c.nombre categoria FROM productos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.activo=1 ORDER BY p.nombre').all();
  const valor = rows.reduce((s, p) => s + p.stock * p.costo, 0);
  res.json({ productos: rows, valor_costo: valor, valor_venta: rows.reduce((s, p) => s + p.stock * p.precio, 0), bajo_stock: rows.filter((p) => p.stock <= p.stock_minimo) });
});

module.exports = r;
