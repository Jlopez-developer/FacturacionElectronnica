'use strict';
// Productos, categorías, clientes y proveedores
const express = require('express');
const { db } = require('../db');
const { identificar } = require('../dgii/rnc');
const { requireRole } = require('../auth');
const r = express.Router();
const admin = requireRole('administrador', 'supervisor');

// ---------- Categorías ----------
r.get('/categorias', (req, res) => res.json(db.prepare('SELECT c.*, (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id AND p.activo=1) productos FROM categorias c ORDER BY nombre').all()));
r.post('/categorias', admin, (req, res) => {
  const { nombre, color } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const info = db.prepare('INSERT INTO categorias(nombre, color) VALUES(?,?)').run(nombre.trim(), color || '#1e88f5');
  res.status(201).json(db.prepare('SELECT * FROM categorias WHERE id = ?').get(info.lastInsertRowid));
});
r.put('/categorias/:id', admin, (req, res) => {
  const { nombre, color } = req.body || {};
  db.prepare('UPDATE categorias SET nombre = COALESCE(?, nombre), color = COALESCE(?, color) WHERE id = ?').run(nombre, color, req.params.id);
  res.json(db.prepare('SELECT * FROM categorias WHERE id = ?').get(req.params.id));
});
r.delete('/categorias/:id', admin, (req, res) => {
  db.prepare('UPDATE productos SET categoria_id = NULL WHERE categoria_id = ?').run(req.params.id);
  db.prepare('DELETE FROM categorias WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Productos ----------
r.get('/productos', (req, res) => {
  const { q = '', categoria, activo = '1', page = 1, limit = 50, bajo_stock } = req.query;
  const where = []; const args = [];
  if (activo !== 'todos') { where.push('p.activo = ?'); args.push(Number(activo)); }
  if (q) { where.push('(p.nombre LIKE ? OR p.codigo LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  if (categoria) { where.push('p.categoria_id = ?'); args.push(categoria); }
  if (bajo_stock === '1') where.push('p.stock <= p.stock_minimo');
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM productos p ${w}`).get(...args).n;
  const lim = Math.min(Number(limit) || 50, 500); const off = (Math.max(Number(page), 1) - 1) * lim;
  const rows = db.prepare(`SELECT p.*, c.nombre categoria, c.color categoria_color FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id ${w} ORDER BY p.nombre LIMIT ? OFFSET ?`).all(...args, lim, off);
  res.json({ total, page: Number(page), limit: lim, datos: rows });
});
r.get('/productos/buscar', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const exacto = db.prepare('SELECT p.*, c.nombre categoria FROM productos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.activo=1 AND p.codigo = ?').get(q);
  if (exacto) return res.json([exacto]);
  res.json(db.prepare('SELECT p.*, c.nombre categoria FROM productos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.activo=1 AND (p.nombre LIKE ? OR p.codigo LIKE ?) ORDER BY p.nombre LIMIT 12').all(`%${q}%`, `${q}%`));
});
r.get('/productos/:id', (req, res) => {
  const p = db.prepare('SELECT p.*, c.nombre categoria FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id WHERE p.id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(p);
});
const prodBody = (b) => ({
  codigo: b.codigo ? String(b.codigo).trim() : null, nombre: String(b.nombre || '').trim(), categoria_id: b.categoria_id || null,
  precio: Number(b.precio) || 0, costo: Number(b.costo) || 0, itbis: [18, 16, 0].includes(Number(b.itbis)) ? Number(b.itbis) : 18,
  stock: Number(b.stock) || 0, stock_minimo: Number(b.stock_minimo) || 0, unidad: b.unidad || 'UND', imagen: b.imagen || null, activo: b.activo === undefined ? 1 : (b.activo ? 1 : 0),
});
r.post('/productos', admin, (req, res) => {
  const p = prodBody(req.body || {});
  if (!p.nombre) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const info = db.prepare('INSERT INTO productos(codigo,nombre,categoria_id,precio,costo,itbis,stock,stock_minimo,unidad,imagen,activo) VALUES(@codigo,@nombre,@categoria_id,@precio,@costo,@itbis,@stock,@stock_minimo,@unidad,@imagen,@activo)').run(p);
    res.status(201).json(db.prepare('SELECT * FROM productos WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) { res.status(400).json({ error: e.message.includes('UNIQUE') ? 'Ya existe un producto con ese código' : e.message }); }
});
r.put('/productos/:id', admin, (req, res) => {
  const cur = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Producto no encontrado' });
  const p = prodBody({ ...cur, ...req.body });
  try {
    db.prepare('UPDATE productos SET codigo=@codigo,nombre=@nombre,categoria_id=@categoria_id,precio=@precio,costo=@costo,itbis=@itbis,stock=@stock,stock_minimo=@stock_minimo,unidad=@unidad,imagen=@imagen,activo=@activo WHERE id=@id').run({ ...p, id: cur.id });
    res.json(db.prepare('SELECT * FROM productos WHERE id = ?').get(cur.id));
  } catch (e) { res.status(400).json({ error: e.message.includes('UNIQUE') ? 'Ya existe un producto con ese código' : e.message }); }
});
r.delete('/productos/:id', admin, (req, res) => { db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(req.params.id); res.json({ ok: true }); });
r.post('/productos/:id/ajuste', admin, (req, res) => {
  const { cantidad } = req.body || {};
  db.prepare('UPDATE productos SET stock = stock + ? WHERE id = ?').run(Number(cantidad) || 0, req.params.id);
  res.json(db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id));
});

// ---------- Clientes ----------
r.get('/clientes', (req, res) => {
  const { q = '', page = 1, limit = 50, activo = '1' } = req.query;
  const where = []; const args = [];
  if (activo !== 'todos') { where.push('c.activo = ?'); args.push(Number(activo)); }
  if (q) { where.push('(c.nombre LIKE ? OR c.identificacion LIKE ? OR c.telefono LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM clientes c ${w}`).get(...args).n;
  const lim = Math.min(Number(limit) || 50, 500); const off = (Math.max(Number(page), 1) - 1) * lim;
  const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM facturas f WHERE f.cliente_id=c.id AND f.estado='emitida') compras, (SELECT COALESCE(SUM(total),0) FROM facturas f WHERE f.cliente_id=c.id AND f.estado='emitida' AND tipo_ecf NOT IN ('34','B04')) total_comprado FROM clientes c ${w} ORDER BY c.nombre LIMIT ? OFFSET ?`).all(...args, lim, off);
  res.json({ total, page: Number(page), limit: lim, datos: rows });
});
r.get('/clientes/validar', (req, res) => res.json(identificar(req.query.id)));
const cliBody = (b) => {
  const idn = b.identificacion ? identificar(b.identificacion) : { tipo: null, valor: null, valido: true };
  return { nombre: String(b.nombre || '').trim(), tipo_id: b.tipo_id || idn.tipo, identificacion: idn.valor || null, telefono: b.telefono || null, email: b.email || null, direccion: b.direccion || null, activo: b.activo === undefined ? 1 : (b.activo ? 1 : 0), _valido: idn.valido };
};
r.post('/clientes', (req, res) => {
  const c = cliBody(req.body || {});
  if (!c.nombre) return res.status(400).json({ error: 'Nombre requerido' });
  if (c.identificacion && !c._valido) return res.status(400).json({ error: `${c.tipo_id === 'RNC' ? 'RNC' : 'Cédula'} inválida: verifique el dígito verificador` });
  delete c._valido;
  const info = db.prepare('INSERT INTO clientes(nombre,tipo_id,identificacion,telefono,email,direccion,activo) VALUES(@nombre,@tipo_id,@identificacion,@telefono,@email,@direccion,@activo)').run(c);
  res.status(201).json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid));
});
r.put('/clientes/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Cliente no encontrado' });
  const c = cliBody({ ...cur, ...req.body });
  if (c.identificacion && !c._valido) return res.status(400).json({ error: 'Identificación inválida' });
  delete c._valido;
  db.prepare('UPDATE clientes SET nombre=@nombre,tipo_id=@tipo_id,identificacion=@identificacion,telefono=@telefono,email=@email,direccion=@direccion,activo=@activo WHERE id=@id').run({ ...c, id: cur.id });
  res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(cur.id));
});
r.delete('/clientes/:id', admin, (req, res) => { db.prepare('UPDATE clientes SET activo = 0 WHERE id = ?').run(req.params.id); res.json({ ok: true }); });

// ---------- Proveedores ----------
r.get('/proveedores', (req, res) => res.json(db.prepare('SELECT * FROM proveedores WHERE activo = 1 ORDER BY nombre').all()));
r.post('/proveedores', (req, res) => {
  const { nombre, rnc, telefono, direccion } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const info = db.prepare('INSERT INTO proveedores(nombre,rnc,telefono,direccion) VALUES(?,?,?,?)').run(nombre.trim(), rnc || null, telefono || null, direccion || null);
  res.status(201).json(db.prepare('SELECT * FROM proveedores WHERE id = ?').get(info.lastInsertRowid));
});
r.put('/proveedores/:id', (req, res) => {
  const { nombre, rnc, telefono, direccion } = req.body || {};
  db.prepare('UPDATE proveedores SET nombre=COALESCE(?,nombre), rnc=?, telefono=?, direccion=? WHERE id=?').run(nombre, rnc || null, telefono || null, direccion || null, req.params.id);
  res.json(db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id));
});
r.delete('/proveedores/:id', admin, (req, res) => { db.prepare('UPDATE proveedores SET activo = 0 WHERE id = ?').run(req.params.id); res.json({ ok: true }); });

module.exports = r;
