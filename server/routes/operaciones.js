'use strict';
// Compras, gastos, caja
const express = require('express');
const net = require('net');
const { db, getConfig } = require('../db');
const { requireRole } = require('../auth');
const r = express.Router();
const admin = requireRole('administrador', 'supervisor');

const cajaAbierta = () => db.prepare("SELECT cs.*, u.nombre usuario FROM caja_sesiones cs JOIN usuarios u ON u.id = cs.usuario_id WHERE cs.estado='abierta' ORDER BY cs.id DESC LIMIT 1").get();

// ---------- Compras ----------
r.get('/compras', (req, res) => {
  const { desde, hasta, q = '', page = 1, limit = 50 } = req.query;
  const where = []; const args = [];
  if (desde) { where.push('date(c.fecha) >= ?'); args.push(desde); }
  if (hasta) { where.push('date(c.fecha) <= ?'); args.push(hasta); }
  if (q) { where.push('(c.numero LIKE ? OR c.ncf LIKE ? OR p.nombre LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM compras c LEFT JOIN proveedores p ON p.id=c.proveedor_id ${w}`).get(...args).n;
  const suma = db.prepare(`SELECT COALESCE(SUM(c.total),0) t FROM compras c LEFT JOIN proveedores p ON p.id=c.proveedor_id ${w}`).get(...args).t;
  const lim = Math.min(Number(limit) || 50, 500); const off = (Math.max(Number(page), 1) - 1) * lim;
  const rows = db.prepare(`SELECT c.*, p.nombre proveedor, (SELECT COUNT(*) FROM compra_items i WHERE i.compra_id=c.id) articulos FROM compras c LEFT JOIN proveedores p ON p.id=c.proveedor_id ${w} ORDER BY c.id DESC LIMIT ? OFFSET ?`).all(...args, lim, off);
  res.json({ total, suma, datos: rows });
});
r.get('/compras/:id', (req, res) => {
  const c = db.prepare('SELECT c.*, p.nombre proveedor FROM compras c LEFT JOIN proveedores p ON p.id=c.proveedor_id WHERE c.id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Compra no encontrada' });
  c.items = db.prepare('SELECT * FROM compra_items WHERE compra_id = ?').all(c.id);
  res.json(c);
});
r.post('/compras', (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return res.status(400).json({ error: 'La compra no tiene artículos' });
  try {
    const tx = db.transaction(() => {
      let subtotal = 0, itbis = 0;
      const lineas = items.map((it) => {
        const p = it.producto_id ? db.prepare('SELECT * FROM productos WHERE id = ?').get(it.producto_id) : null;
        const cantidad = Number(it.cantidad) || 0; const costo = Number(it.costo) || 0; const tasa = Number(it.itbis_tasa ?? (p ? p.itbis : 18));
        const monto = +(cantidad * costo).toFixed(2);
        subtotal += monto; itbis += monto * (tasa / 100);
        return { producto_id: p ? p.id : null, nombre: p ? p.nombre : String(it.nombre || 'Artículo'), cantidad, costo, tasa, total: monto, actualizar_costo: it.actualizar_costo !== false };
      });
      const n = db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(numero, 3) AS INTEGER)),0)+1 n FROM compras").get().n;
      const info = db.prepare('INSERT INTO compras(numero,proveedor_id,ncf,fecha,subtotal,itbis,total,metodo_pago,usuario_id,notas) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(`C-${String(n).padStart(6, '0')}`, b.proveedor_id || null, b.ncf || null, b.fecha || new Date().toISOString().slice(0, 19).replace('T', ' '), +subtotal.toFixed(2), +itbis.toFixed(2), +(subtotal + itbis).toFixed(2), b.metodo_pago || 'efectivo', req.user.id, b.notas || null);
      const id = info.lastInsertRowid;
      const ins = db.prepare('INSERT INTO compra_items(compra_id,producto_id,nombre,cantidad,costo,itbis_tasa,total) VALUES(?,?,?,?,?,?,?)');
      for (const l of lineas) {
        ins.run(id, l.producto_id, l.nombre, l.cantidad, l.costo, l.tasa, l.total);
        if (l.producto_id) db.prepare('UPDATE productos SET stock = stock + ?, costo = CASE WHEN ? THEN ? ELSE costo END WHERE id = ?').run(l.cantidad, l.actualizar_costo ? 1 : 0, l.costo, l.producto_id);
      }
      const caja = cajaAbierta();
      if (caja && (b.metodo_pago || 'efectivo') === 'efectivo' && b.pagar_desde_caja) db.prepare("INSERT INTO caja_movimientos(caja_id,tipo,monto,concepto,usuario_id) VALUES(?,?,?,?,?)").run(caja.id, 'salida', +(subtotal + itbis).toFixed(2), `Compra C-${String(n).padStart(6, '0')}`, req.user.id);
      return id;
    });
    const id = tx();
    res.status(201).json(db.prepare('SELECT * FROM compras WHERE id = ?').get(id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
r.delete('/compras/:id', admin, (req, res) => {
  const tx = db.transaction(() => {
    const items = db.prepare('SELECT * FROM compra_items WHERE compra_id = ?').all(req.params.id);
    for (const i of items) if (i.producto_id) db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?').run(i.cantidad, i.producto_id);
    db.prepare('DELETE FROM compras WHERE id = ?').run(req.params.id);
  });
  tx(); res.json({ ok: true });
});

// ---------- Gastos ----------
r.get('/gastos', (req, res) => {
  const { desde, hasta, q = '', categoria, page = 1, limit = 50 } = req.query;
  const where = []; const args = [];
  if (desde) { where.push('date(g.fecha) >= ?'); args.push(desde); }
  if (hasta) { where.push('date(g.fecha) <= ?'); args.push(hasta); }
  if (q) { where.push('(g.descripcion LIKE ? OR g.proveedor LIKE ? OR g.ncf LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (categoria) { where.push('g.categoria = ?'); args.push(categoria); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM gastos g ${w}`).get(...args).n;
  const suma = db.prepare(`SELECT COALESCE(SUM(g.monto),0) t FROM gastos g ${w}`).get(...args).t;
  const lim = Math.min(Number(limit) || 50, 500); const off = (Math.max(Number(page), 1) - 1) * lim;
  const rows = db.prepare(`SELECT g.*, u.nombre usuario FROM gastos g LEFT JOIN usuarios u ON u.id=g.usuario_id ${w} ORDER BY g.fecha DESC, g.id DESC LIMIT ? OFFSET ?`).all(...args, lim, off);
  const categorias = db.prepare('SELECT categoria, SUM(monto) total FROM gastos GROUP BY categoria ORDER BY total DESC').all();
  res.json({ total, suma, datos: rows, categorias });
});
r.post('/gastos', (req, res) => {
  const b = req.body || {};
  if (!b.descripcion || !(Number(b.monto) > 0)) return res.status(400).json({ error: 'Descripción y monto son requeridos' });
  const caja = cajaAbierta();
  const info = db.prepare('INSERT INTO gastos(descripcion,categoria,monto,fecha,ncf,proveedor,metodo_pago,usuario_id,caja_id) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(b.descripcion.trim(), b.categoria || 'General', Number(b.monto), b.fecha || new Date().toISOString().slice(0, 19).replace('T', ' '), b.ncf || null, b.proveedor || null, b.metodo_pago || 'efectivo', req.user.id, caja && (b.metodo_pago || 'efectivo') === 'efectivo' ? caja.id : null);
  res.status(201).json(db.prepare('SELECT * FROM gastos WHERE id = ?').get(info.lastInsertRowid));
});
r.put('/gastos/:id', admin, (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE gastos SET descripcion=COALESCE(?,descripcion), categoria=COALESCE(?,categoria), monto=COALESCE(?,monto), fecha=COALESCE(?,fecha), ncf=?, proveedor=?, metodo_pago=COALESCE(?,metodo_pago) WHERE id=?')
    .run(b.descripcion, b.categoria, b.monto != null ? Number(b.monto) : null, b.fecha, b.ncf || null, b.proveedor || null, b.metodo_pago, req.params.id);
  res.json(db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id));
});
r.delete('/gastos/:id', admin, (req, res) => { db.prepare('DELETE FROM gastos WHERE id = ?').run(req.params.id); res.json({ ok: true }); });

// ---------- Caja ----------
function resumenCaja(caja) {
  const q = (sql, ...a) => db.prepare(sql).get(caja.id, ...a).t;
  const ventasEf = q("SELECT COALESCE(SUM(CASE WHEN tipo_ecf IN ('34','B04') THEN -total ELSE total END),0) t FROM facturas WHERE caja_id = ? AND estado='emitida' AND metodo_pago='efectivo'");
  const ventasTar = q("SELECT COALESCE(SUM(CASE WHEN tipo_ecf IN ('34','B04') THEN -total ELSE total END),0) t FROM facturas WHERE caja_id = ? AND estado='emitida' AND metodo_pago='tarjeta'");
  const ventasTra = q("SELECT COALESCE(SUM(CASE WHEN tipo_ecf IN ('34','B04') THEN -total ELSE total END),0) t FROM facturas WHERE caja_id = ? AND estado='emitida' AND metodo_pago='transferencia'");
  const ventasCre = q("SELECT COALESCE(SUM(CASE WHEN tipo_ecf IN ('34','B04') THEN -total ELSE total END),0) t FROM facturas WHERE caja_id = ? AND estado='emitida' AND metodo_pago='credito'");
  const entradas = q("SELECT COALESCE(SUM(monto),0) t FROM caja_movimientos WHERE caja_id = ? AND tipo='entrada'");
  const salidas = q("SELECT COALESCE(SUM(monto),0) t FROM caja_movimientos WHERE caja_id = ? AND tipo='salida'");
  const gastos = q("SELECT COALESCE(SUM(monto),0) t FROM gastos WHERE caja_id = ? AND metodo_pago='efectivo'");
  const facturas = db.prepare("SELECT COUNT(*) n FROM facturas WHERE caja_id = ? AND estado='emitida' AND tipo_ecf NOT IN ('34','B04')").get(caja.id).n;
  return { ...caja, ventas_efectivo: ventasEf, ventas_tarjeta: ventasTar, ventas_transferencia: ventasTra, ventas_credito: ventasCre, ventas_total: ventasEf + ventasTar + ventasTra + ventasCre, entradas, salidas, gastos, facturas, esperado: +(caja.monto_inicial + ventasEf + entradas - salidas - gastos).toFixed(2) };
}
r.get('/caja/actual', (req, res) => {
  const caja = cajaAbierta();
  if (!caja) return res.json(null);
  const rs = resumenCaja(caja);
  rs.movimientos = db.prepare('SELECT m.*, u.nombre usuario FROM caja_movimientos m LEFT JOIN usuarios u ON u.id=m.usuario_id WHERE caja_id = ? ORDER BY m.id DESC').all(caja.id);
  res.json(rs);
});
r.get('/caja/historial', (req, res) => {
  const rows = db.prepare("SELECT cs.*, u.nombre usuario FROM caja_sesiones cs JOIN usuarios u ON u.id=cs.usuario_id ORDER BY cs.id DESC LIMIT 60").all();
  res.json(rows.map(resumenCaja));
});
r.post('/caja/abrir', (req, res) => {
  if (cajaAbierta()) return res.status(400).json({ error: 'Ya hay una caja abierta' });
  const info = db.prepare('INSERT INTO caja_sesiones(usuario_id, monto_inicial, notas) VALUES(?,?,?)').run(req.user.id, Number(req.body?.monto_inicial) || 0, req.body?.notas || null);
  res.status(201).json(resumenCaja(db.prepare('SELECT cs.*, u.nombre usuario FROM caja_sesiones cs JOIN usuarios u ON u.id=cs.usuario_id WHERE cs.id = ?').get(info.lastInsertRowid)));
});
r.post('/caja/cerrar', (req, res) => {
  const caja = cajaAbierta();
  if (!caja) return res.status(400).json({ error: 'No hay caja abierta' });
  const rs = resumenCaja(caja);
  const contado = req.body?.monto_cierre != null ? Number(req.body.monto_cierre) : rs.esperado;
  db.prepare("UPDATE caja_sesiones SET estado='cerrada', cierre=datetime('now','localtime'), monto_cierre=?, notas=COALESCE(?, notas) WHERE id=?").run(contado, req.body?.notas || null, caja.id);
  res.json({ ...resumenCaja(db.prepare('SELECT cs.*, u.nombre usuario FROM caja_sesiones cs JOIN usuarios u ON u.id=cs.usuario_id WHERE cs.id = ?').get(caja.id)), diferencia: +(contado - rs.esperado).toFixed(2) });
});
r.post('/caja/movimiento', (req, res) => {
  const caja = cajaAbierta();
  if (!caja) return res.status(400).json({ error: 'No hay caja abierta' });
  const { tipo, monto, concepto } = req.body || {};
  if (!['entrada', 'salida'].includes(tipo) || !(Number(monto) > 0) || !concepto) return res.status(400).json({ error: 'Datos del movimiento inválidos' });
  db.prepare('INSERT INTO caja_movimientos(caja_id,tipo,monto,concepto,usuario_id) VALUES(?,?,?,?,?)').run(caja.id, tipo, Number(monto), concepto.trim(), req.user.id);
  res.status(201).json(resumenCaja(caja));
});
/** Abrir cajón de dinero: pulso ESC/POS a impresora de red. */
r.post('/caja/abrir-cajon', async (req, res) => {
  if (getConfig('cajon_habilitado', '1') !== '1') return res.status(400).json({ error: 'El cajón está deshabilitado en Configuración' });
  const ip = getConfig('impresora_ip'); const puerto = Number(getConfig('impresora_puerto', '9100')) || 9100;
  if (getConfig('impresora_tipo') !== 'red' || !ip) return res.json({ ok: true, modo: 'navegador', mensaje: 'Sin impresora de red configurada: use el pulso desde el navegador/impresora local' });
  const pulso = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  await new Promise((resolve) => {
    const s = net.createConnection({ host: ip, port: puerto, timeout: 3000 });
    s.on('connect', () => s.end(pulso, () => { res.json({ ok: true, modo: 'red' }); resolve(); }));
    s.on('error', (e) => { res.status(502).json({ error: `No se pudo conectar con la impresora ${ip}:${puerto} (${e.message})` }); resolve(); });
    s.on('timeout', () => { s.destroy(); res.status(504).json({ error: 'Tiempo de espera agotado con la impresora' }); resolve(); });
  });
});

module.exports = r;
