'use strict';
const express = require('express');
const { db, getConfig } = require('../db');
const r = express.Router();

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0));

r.get('/', (req, res) => {
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  const inicioMes = `${iso(hoy).slice(0, 7)}-01`;
  const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const inicioMesPasado = iso(mesPasado);
  const finMesPasado = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0));

  const ventasDia = db.prepare("SELECT COALESCE(SUM(total),0) t, COUNT(*) n FROM facturas WHERE estado='emitida' AND tipo_ecf NOT IN ('34','B04') AND date(fecha)=?");
  const ventasRango = db.prepare("SELECT COALESCE(SUM(total),0) t, COUNT(*) n FROM facturas WHERE estado='emitida' AND tipo_ecf NOT IN ('34','B04') AND date(fecha) BETWEEN ? AND ?");

  const vHoy = ventasDia.get(iso(hoy));
  const vAyer = ventasDia.get(iso(ayer));
  const vMes = ventasRango.get(inicioMes, iso(hoy));
  const vMesPasado = ventasRango.get(inicioMesPasado, finMesPasado);

  const productos = db.prepare('SELECT COUNT(*) n FROM productos WHERE activo = 1').get().n;
  const clientes = db.prepare('SELECT COUNT(*) n FROM clientes WHERE activo = 1').get().n;

  const ultimos7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoy); d.setDate(hoy.getDate() - i);
    const v = ventasDia.get(iso(d));
    ultimos7.push({ fecha: iso(d), etiqueta: i === 0 ? `Hoy ${String(d.getDate()).padStart(2, '0')}` : `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}`, total: v.t, facturas: v.n, hoy: i === 0 });
  }

  const topProductos = db.prepare(`
    SELECT fi.producto_id id, fi.nombre, p.imagen, SUM(fi.cantidad) unidades, SUM(fi.total) total
    FROM factura_items fi JOIN facturas f ON f.id = fi.factura_id LEFT JOIN productos p ON p.id = fi.producto_id
    WHERE f.estado='emitida' AND f.tipo_ecf NOT IN ('34','B04') AND date(f.fecha) BETWEEN ? AND ?
    GROUP BY fi.producto_id, fi.nombre ORDER BY total DESC LIMIT 5`).all(inicioMes, iso(hoy));

  const porCategoria = db.prepare(`
    SELECT COALESCE(c.nombre,'Otros') nombre, COALESCE(c.color,'#9ca3af') color, SUM(fi.total) total
    FROM factura_items fi JOIN facturas f ON f.id = fi.factura_id LEFT JOIN productos p ON p.id = fi.producto_id LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE f.estado='emitida' AND f.tipo_ecf NOT IN ('34','B04') AND date(f.fecha) BETWEEN ? AND ?
    GROUP BY COALESCE(c.nombre,'Otros') ORDER BY total DESC`).all(inicioMes, iso(hoy));
  const totalCat = porCategoria.reduce((s, c) => s + c.total, 0) || 1;
  porCategoria.forEach((c) => { c.porcentaje = Math.round((c.total / totalCat) * 100); });

  const ultimasFacturas = db.prepare(`
    SELECT f.id, f.numero, f.encf, f.total, f.fecha, f.dgii_estado, COALESCE(c.nombre,'Cliente general') cliente
    FROM facturas f LEFT JOIN clientes c ON c.id = f.cliente_id WHERE f.estado='emitida' ORDER BY f.id DESC LIMIT 5`).all();

  const caja = db.prepare("SELECT cs.*, u.nombre usuario FROM caja_sesiones cs JOIN usuarios u ON u.id = cs.usuario_id WHERE cs.estado='abierta' ORDER BY cs.id DESC LIMIT 1").get();
  let cajaInfo = null;
  if (caja) {
    const ventasEf = db.prepare("SELECT COALESCE(SUM(CASE WHEN tipo_ecf IN ('34','B04') THEN -total ELSE total END),0) t FROM facturas WHERE caja_id = ? AND estado='emitida' AND metodo_pago='efectivo'").get(caja.id).t;
    const mov = db.prepare("SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN monto ELSE -monto END),0) t FROM caja_movimientos WHERE caja_id = ?").get(caja.id).t;
    const gastos = db.prepare("SELECT COALESCE(SUM(monto),0) t FROM gastos WHERE caja_id = ? AND metodo_pago='efectivo'").get(caja.id).t;
    cajaInfo = { id: caja.id, apertura: caja.apertura, usuario: caja.usuario, monto_inicial: caja.monto_inicial, total: caja.monto_inicial + ventasEf + mov - gastos };
  }

  const dgii = db.prepare(`SELECT
      SUM(CASE WHEN dgii_estado IN ('aceptada','aceptada_condicional') THEN 1 ELSE 0 END) aceptadas,
      SUM(CASE WHEN dgii_estado IN ('no_enviada','pendiente','en_proceso','error') THEN 1 ELSE 0 END) pendientes,
      SUM(CASE WHEN dgii_estado = 'rechazada' THEN 1 ELSE 0 END) rechazadas
    FROM facturas WHERE estado='emitida' AND tipo_ecf NOT LIKE 'B%'`).get();

  res.json({
    fecha: { iso: iso(hoy), texto: `Hoy: ${hoy.getDate()} de ${MESES[hoy.getMonth()]}, ${hoy.getFullYear()}` },
    moneda: getConfig('moneda', 'RD$'),
    ventas_hoy: { total: vHoy.t, variacion: pct(vHoy.t, vAyer.t) },
    ventas_mes: { total: vMes.t, variacion: pct(vMes.t, vMesPasado.t) },
    facturas_hoy: { total: vHoy.n, variacion: pct(vHoy.n, vAyer.n) },
    productos, clientes,
    ultimos7, top_productos: topProductos, por_categoria: porCategoria, ultimas_facturas: ultimasFacturas,
    caja: cajaInfo, dgii,
  });
});
module.exports = r;
