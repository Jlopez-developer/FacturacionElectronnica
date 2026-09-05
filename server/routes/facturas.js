'use strict';
const express = require('express');
const QRCode = require('qrcode');
const { db, getConfig, allConfig } = require('../db');
const ncf = require('../dgii/ncf');
const { calcularTotales } = require('../dgii/ecf');
const dgii = require('../dgii');
const { requireRole } = require('../auth');
const r = express.Router();

const cajaAbierta = () => db.prepare("SELECT * FROM caja_sesiones WHERE estado='abierta' ORDER BY id DESC LIMIT 1").get();
const siguienteNumero = () => {
  const n = db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(numero, 3) AS INTEGER)),0)+1 n FROM facturas").get().n;
  return `F-${String(n).padStart(6, '0')}`;
};

/** Resuelve qué tipo de comprobante usar según configuración y cliente. */
function tipoComprobante(solicitado, cliente) {
  const modo = getConfig('dgii_modo', 'electronico');
  if (modo === 'ninguno') return null;
  const credito = solicitado === 'credito_fiscal' || solicitado === '31' || solicitado === 'B01';
  if (credito && !(cliente && cliente.identificacion && cliente.tipo_id === 'RNC')) throw new Error('Para Crédito Fiscal el cliente debe tener un RNC válido');
  if (modo === 'tradicional') return credito ? 'B01' : 'B02';
  return credito ? '31' : '32';
}

r.get('/', (req, res) => {
  const { q = '', desde, hasta, estado, dgii_estado, cliente_id, page = 1, limit = 50 } = req.query;
  const where = []; const args = [];
  if (q) { where.push('(f.numero LIKE ? OR f.encf LIKE ? OR c.nombre LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (desde) { where.push('date(f.fecha) >= ?'); args.push(desde); }
  if (hasta) { where.push('date(f.fecha) <= ?'); args.push(hasta); }
  if (estado) { where.push('f.estado = ?'); args.push(estado); }
  if (dgii_estado) { where.push('f.dgii_estado = ?'); args.push(dgii_estado); }
  if (cliente_id) { where.push('f.cliente_id = ?'); args.push(cliente_id); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM facturas f LEFT JOIN clientes c ON c.id=f.cliente_id ${w}`).get(...args).n;
  const sum = db.prepare(`SELECT COALESCE(SUM(CASE WHEN f.estado='emitida' AND f.tipo_ecf NOT IN ('34','B04') THEN f.total ELSE 0 END),0) t FROM facturas f LEFT JOIN clientes c ON c.id=f.cliente_id ${w}`).get(...args).t;
  const lim = Math.min(Number(limit) || 50, 500); const off = (Math.max(Number(page), 1) - 1) * lim;
  const rows = db.prepare(`SELECT f.id,f.numero,f.tipo_ecf,f.encf,f.fecha,f.subtotal,f.itbis,f.total,f.metodo_pago,f.estado,f.dgii_estado,f.dgii_trackid,f.dgii_mensaje,f.referencia_id, COALESCE(c.nombre,'Cliente general') cliente, c.identificacion cliente_identificacion, u.nombre usuario
    FROM facturas f LEFT JOIN clientes c ON c.id=f.cliente_id LEFT JOIN usuarios u ON u.id=f.usuario_id ${w} ORDER BY f.id DESC LIMIT ? OFFSET ?`).all(...args, lim, off);
  res.json({ total, suma: sum, page: Number(page), limit: lim, datos: rows });
});

r.get('/:id', (req, res) => {
  try {
    const f = dgii.cargarFactura(req.params.id);
    f.usuario = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(f.usuario_id)?.nombre;
    f.log = db.prepare('SELECT * FROM dgii_log WHERE factura_id = ? ORDER BY id DESC LIMIT 20').all(f.id);
    f.notas_credito = db.prepare('SELECT id, numero, encf, total, fecha FROM facturas WHERE referencia_id = ?').all(f.id);
    f.qr_url = f.encf && f.codigo_seguridad && ncf.esElectronico(f.tipo_ecf) ? dgii.urlQR(f) : null;
    res.json(f);
  } catch (e) { res.status(404).json({ error: e.message }); }
});

r.get('/:id/xml', (req, res) => {
  const f = db.prepare('SELECT xml, encf FROM facturas WHERE id = ?').get(req.params.id);
  if (!f || !f.xml) return res.status(404).json({ error: 'XML no disponible' });
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="${getConfig('negocio_rnc') || 'RNC'}${f.encf}.xml"`);
  res.send(f.xml);
});

/** Representación impresa (ticket 80mm o carta). */
r.get('/:id/imprimir', async (req, res) => {
  let f;
  try { f = dgii.cargarFactura(req.params.id); } catch (e) { return res.status(404).send(e.message); }
  const cfg = allConfig();
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const m = (v) => `${cfg.moneda || 'RD$'} ${Number(v || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const electronico = f.encf && ncf.esElectronico(f.tipo_ecf);
  let qr = '';
  if (electronico) { try { qr = await QRCode.toString(dgii.urlQR(f), { type: 'svg', margin: 0, width: 140 }); } catch { /* sin qr */ } }
  const fecha = new Date(f.fecha.replace(' ', 'T'));
  const ancho = (req.query.formato || (cfg.impresora_ancho === '58' ? '58' : '80'));
  const w = ancho === '58' ? '58mm' : ancho === 'carta' ? '190mm' : '80mm';
  const tipoNombre = ncf.TIPOS_ECF[f.tipo_ecf] || 'Comprobante';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(f.numero)}</title>
<style>
 body{font-family:'Courier New',monospace;font-size:${ancho === '58' ? '11px' : '12px'};margin:0;padding:8px;color:#000;background:#fff}
 .t{width:${w};margin:0 auto}
 .c{text-align:center}.b{font-weight:bold}.r{text-align:right}
 hr{border:0;border-top:1px dashed #000;margin:6px 0}
 table{width:100%;border-collapse:collapse}td{padding:1px 0;vertical-align:top}
 h1{font-size:15px;margin:2px 0}.small{font-size:10px}
 .qr{display:flex;justify-content:center;margin:6px 0}.qr svg{width:120px;height:120px}
 @media print{body{padding:0}@page{margin:4mm}}
</style></head><body><div class="t">
 <div class="c"><h1>${esc(cfg.negocio_nombre)}</h1><div>${esc(cfg.negocio_razon_social)}</div>${cfg.negocio_rnc ? `<div>RNC: ${esc(cfg.negocio_rnc)}</div>` : ''}<div class="small">${esc(cfg.negocio_direccion)}</div>${cfg.negocio_telefono ? `<div class="small">Tel: ${esc(cfg.negocio_telefono)}</div>` : ''}</div>
 <hr>
 <div class="c b">${esc(tipoNombre.toUpperCase())}</div>
 ${f.encf ? `<div class="c b">${electronico ? 'e-NCF' : 'NCF'}: ${esc(f.encf)}</div>` : ''}
 ${f.ncf_vence ? `<div class="c small">Vence: ${esc(f.ncf_vence.split('-').reverse().join('/'))}</div>` : ''}
 <div>Factura: ${esc(f.numero)}</div>
 <div>Fecha: ${fecha.toLocaleDateString('es-DO')} ${fecha.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</div>
 <div>Cliente: ${esc(f.cliente_nombre || 'Cliente general')}</div>
 ${f.cliente_identificacion ? `<div>${f.cliente_tipo_id === 'RNC' ? 'RNC' : 'Cédula'}: ${esc(f.cliente_identificacion)}</div>` : ''}
 <div>Cajero: ${esc(db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(f.usuario_id)?.nombre || '')}</div>
 <hr>
 <table>${f.items.map((i) => `<tr><td colspan="3">${esc(i.nombre)}</td></tr><tr><td>${i.cantidad} x ${m(i.precio)}</td><td class="small">${Number(i.itbis_tasa) === 0 ? 'E' : ''}</td><td class="r">${m(i.total)}</td></tr>`).join('')}</table>
 <hr>
 <table>
  <tr><td>Subtotal</td><td class="r">${m(f.subtotal)}</td></tr>
  ${f.descuento > 0 ? `<tr><td>Descuento</td><td class="r">-${m(f.descuento)}</td></tr>` : ''}
  <tr><td>ITBIS (18%)</td><td class="r">${m(f.itbis)}</td></tr>
  <tr class="b"><td>TOTAL</td><td class="r">${m(f.total)}</td></tr>
  ${f.metodo_pago === 'efectivo' ? `<tr><td>Efectivo</td><td class="r">${m(f.monto_recibido)}</td></tr><tr><td>Cambio</td><td class="r">${m(f.cambio)}</td></tr>` : `<tr><td>Pago</td><td class="r">${esc(f.metodo_pago)}</td></tr>`}
 </table>
 <hr>
 ${electronico ? `<div class="qr">${qr}</div><div class="c small">Código de seguridad: ${esc(f.codigo_seguridad || 'pendiente de firma')}</div>${f.fecha_firma ? `<div class="c small">Fecha firma: ${esc(f.fecha_firma)}</div>` : ''}<div class="c small">Consulte este e-CF en dgii.gov.do</div>` : ''}
 ${f.estado === 'anulada' ? '<div class="c b">*** ANULADA ***</div>' : ''}
 <div class="c" style="margin-top:8px">${esc(cfg.ticket_pie)}</div>
 ${f.items.some((i) => Number(i.itbis_tasa) === 0) ? '<div class="small">E = Exento de ITBIS</div>' : ''}
</div><script>if(location.search.includes('auto=1')){window.onload=()=>{window.print();}}</script></body></html>`;
  res.send(html);
});

/** Emitir factura (POS). */
r.post('/', async (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return res.status(400).json({ error: 'La factura no tiene productos' });
  const caja = cajaAbierta();
  if (!caja) return res.status(400).json({ error: 'Debe abrir la caja antes de facturar' });
  const cliente = b.cliente_id ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(b.cliente_id) : null;

  let tipo;
  try { tipo = tipoComprobante(b.tipo_comprobante || 'consumo', cliente); } catch (e) { return res.status(400).json({ error: e.message }); }

  const lineas = [];
  for (const it of items) {
    const p = it.producto_id ? db.prepare('SELECT * FROM productos WHERE id = ?').get(it.producto_id) : null;
    const cantidad = Number(it.cantidad) || 0;
    if (cantidad <= 0) return res.status(400).json({ error: 'Cantidad inválida' });
    lineas.push({ producto_id: p ? p.id : null, nombre: p ? p.nombre : String(it.nombre || 'Artículo'), cantidad, precio: it.precio != null ? Number(it.precio) : (p ? p.precio : 0), itbis_tasa: p ? p.itbis : Number(it.itbis_tasa ?? 18), descuento: Number(it.descuento) || 0 });
  }
  const tot = calcularTotales(lineas);
  const metodo = ['efectivo', 'tarjeta', 'transferencia', 'credito', 'mixto'].includes(b.metodo_pago) ? b.metodo_pago : 'efectivo';
  const recibido = metodo === 'efectivo' ? Number(b.monto_recibido ?? tot.total) : tot.total;
  if (metodo === 'efectivo' && recibido + 0.001 < tot.total) return res.status(400).json({ error: 'El monto recibido es menor que el total' });
  if (metodo === 'credito' && !cliente) return res.status(400).json({ error: 'Para ventas a crédito seleccione un cliente' });

  let facturaId;
  try {
    const tx = db.transaction(() => {
      const comp = tipo ? ncf.siguiente(tipo) : { encf: null, vence: null };
      const numero = siguienteNumero();
      const info = db.prepare(`INSERT INTO facturas(numero,tipo_ecf,encf,ncf_vence,cliente_id,usuario_id,caja_id,subtotal,descuento,itbis,total,metodo_pago,monto_recibido,cambio,notas,dgii_estado)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(numero, tipo || '32', comp.encf, comp.vence, cliente ? cliente.id : null, req.user.id, caja.id, tot.subtotal, tot.descuento, tot.itbis, tot.total, metodo, recibido, Math.max(0, +(recibido - tot.total).toFixed(2)), b.notas || null, tipo && ncf.esElectronico(tipo) ? 'pendiente' : 'no_enviada');
      const id = info.lastInsertRowid;
      const insItem = db.prepare('INSERT INTO factura_items(factura_id,producto_id,nombre,cantidad,precio,itbis_tasa,itbis_monto,total) VALUES(?,?,?,?,?,?,?,?)');
      const updStock = db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?');
      for (const l of tot.lineas) { insItem.run(id, l.producto_id, l.nombre, l.cantidad, l.precio, l.tasa, l.itbis, l.monto); if (l.producto_id) updStock.run(l.cantidad, l.producto_id); }
      return id;
    });
    facturaId = tx();
  } catch (e) { return res.status(400).json({ error: e.message }); }

  const resultado = await dgii.procesarFactura(facturaId);
  const f = dgii.cargarFactura(facturaId);
  res.status(201).json({ ...f, dgii: resultado });
});

/** Anular: emite Nota de Crédito electrónica (34) referenciando la factura. */
r.post('/:id/anular', requireRole('administrador', 'supervisor'), async (req, res) => {
  const f = db.prepare('SELECT * FROM facturas WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Factura no encontrada' });
  if (f.estado === 'anulada') return res.status(400).json({ error: 'La factura ya está anulada' });
  if (['34', 'B04'].includes(f.tipo_ecf)) return res.status(400).json({ error: 'No se puede anular una nota de crédito' });
  const caja = cajaAbierta();
  const items = db.prepare('SELECT * FROM factura_items WHERE factura_id = ?').all(f.id);
  let ncId;
  try {
    const tx = db.transaction(() => {
      const tipoNC = f.tipo_ecf.startsWith('B') ? 'B04' : '34';
      const comp = f.encf ? ncf.siguiente(tipoNC) : { encf: null, vence: null };
      const info = db.prepare(`INSERT INTO facturas(numero,tipo_ecf,encf,ncf_vence,cliente_id,usuario_id,caja_id,subtotal,descuento,itbis,total,metodo_pago,monto_recibido,cambio,referencia_id,notas,dgii_estado)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(siguienteNumero(), tipoNC, comp.encf, comp.vence, f.cliente_id, req.user.id, caja ? caja.id : null, f.subtotal, f.descuento, f.itbis, f.total, f.metodo_pago, 0, 0, f.id, `Anula ${f.numero}: ${req.body?.motivo || 'sin motivo'}`, tipoNC === '34' ? 'pendiente' : 'no_enviada');
      const id = info.lastInsertRowid;
      const ins = db.prepare('INSERT INTO factura_items(factura_id,producto_id,nombre,cantidad,precio,itbis_tasa,itbis_monto,total) VALUES(?,?,?,?,?,?,?,?)');
      const upd = db.prepare('UPDATE productos SET stock = stock + ? WHERE id = ?');
      for (const i of items) { ins.run(id, i.producto_id, i.nombre, i.cantidad, i.precio, i.itbis_tasa, i.itbis_monto, i.total); if (i.producto_id) upd.run(i.cantidad, i.producto_id); }
      db.prepare("UPDATE facturas SET estado = 'anulada' WHERE id = ?").run(f.id);
      return id;
    });
    ncId = tx();
  } catch (e) { return res.status(400).json({ error: e.message }); }
  const resultado = await dgii.procesarFactura(ncId);
  res.json({ ok: true, nota_credito: dgii.cargarFactura(ncId), dgii: resultado });
});

r.post('/:id/enviar', async (req, res) => {
  const f = db.prepare('SELECT id, dgii_trackid FROM facturas WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Factura no encontrada' });
  const resultado = f.dgii_trackid ? await dgii.consultarFactura(f.id) : await dgii.procesarFactura(f.id);
  res.json({ ...resultado, factura: db.prepare('SELECT id, dgii_estado, dgii_mensaje, dgii_trackid, codigo_seguridad FROM facturas WHERE id = ?').get(f.id) });
});

module.exports = r;
