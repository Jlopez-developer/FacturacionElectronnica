'use strict';
/**
 * Orquestación: genera XML del e-CF, lo firma y lo envía a la DGII,
 * registrando el resultado en la factura.
 */
const { db, getConfig } = require('../db');
const ecf = require('./ecf');
const firma = require('./firma');
const cliente = require('./cliente');
const ncf = require('./ncf');

const log = (facturaId, accion, detalle, exito) =>
  db.prepare('INSERT INTO dgii_log(factura_id, accion, detalle, exito) VALUES(?,?,?,?)').run(facturaId, accion, typeof detalle === 'string' ? detalle.slice(0, 4000) : JSON.stringify(detalle).slice(0, 4000), exito ? 1 : 0);

const emisor = () => ({
  rnc: getConfig('negocio_rnc'),
  razon_social: getConfig('negocio_razon_social') || getConfig('negocio_nombre'),
  nombre_comercial: getConfig('negocio_nombre'),
  direccion: getConfig('negocio_direccion'),
});

function cargarFactura(id) {
  const f = db.prepare('SELECT f.*, c.nombre AS cliente_nombre, c.identificacion AS cliente_identificacion, c.tipo_id AS cliente_tipo_id FROM facturas f LEFT JOIN clientes c ON c.id = f.cliente_id WHERE f.id = ?').get(id);
  if (!f) throw new Error('Factura no encontrada');
  f.items = db.prepare('SELECT * FROM factura_items WHERE factura_id = ? ORDER BY id').all(id);
  return f;
}

function paramsDesdeFactura(f) {
  const ref = f.referencia_id ? db.prepare('SELECT encf, fecha FROM facturas WHERE id = ?').get(f.referencia_id) : null;
  return {
    tipo: f.tipo_ecf, encf: f.encf, vence: f.ncf_vence, fecha: new Date(f.fecha.replace(' ', 'T')), metodo_pago: f.metodo_pago,
    emisor: emisor(),
    comprador: f.cliente_id && f.cliente_identificacion ? { rnc: f.cliente_identificacion, nombre: f.cliente_nombre } : (f.cliente_nombre && f.cliente_nombre !== 'Cliente general' ? { nombre: f.cliente_nombre } : null),
    items: f.items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, itbis_tasa: i.itbis_tasa })),
    referencia: ref ? { encf: ref.encf, fecha: new Date(ref.fecha.replace(' ', 'T')), codigo: 1 } : null,
  };
}

/** Genera XML, firma y guarda en la factura. Devuelve { xml, codigoSeguridad, totales } */
function firmarFactura(facturaId) {
  const f = cargarFactura(facturaId);
  const p = paramsDesdeFactura(f);
  const { xml, totales } = ecf.construirECF(p);
  const firmado = firma.firmarXml(xml);
  const fechaFirma = new Date();
  db.prepare("UPDATE facturas SET xml = ?, codigo_seguridad = ?, fecha_firma = ? WHERE id = ?")
    .run(firmado.xml, firmado.codigoSeguridad, fechaFirma.toISOString().slice(0, 19).replace('T', ' '), facturaId);
  log(facturaId, 'firma', `e-CF ${f.encf} firmado. Código de seguridad ${firmado.codigoSeguridad}`, true);
  return { xml: firmado.xml, codigoSeguridad: firmado.codigoSeguridad, totales, p, f };
}

/**
 * Procesa una factura: firma + envío a DGII. Nunca lanza; deja el resultado en la factura.
 * Devuelve el estado resultante.
 */
async function procesarFactura(facturaId) {
  const f0 = cargarFactura(facturaId);
  const modo = getConfig('dgii_modo', 'electronico');
  if (modo !== 'electronico' || !ncf.esElectronico(f0.tipo_ecf)) {
    return { estado: 'no_enviada', mensaje: 'Comprobante tradicional: no requiere envío electrónico' };
  }
  if (!getConfig('negocio_rnc')) {
    setEstado(facturaId, 'no_enviada', 'Configure el RNC del negocio antes de emitir e-CF');
    return { estado: 'no_enviada', mensaje: 'Falta RNC del negocio' };
  }
  if (!firma.certificadoDisponible()) {
    const xml = ecf.construirECF(paramsDesdeFactura(f0)).xml;
    db.prepare('UPDATE facturas SET xml = ? WHERE id = ?').run(xml, facturaId);
    setEstado(facturaId, 'no_enviada', 'Certificado digital no configurado: el e-CF quedó pendiente de firma y envío');
    log(facturaId, 'pendiente', 'Sin certificado digital. XML generado sin firma.', false);
    return { estado: 'no_enviada', mensaje: 'Certificado digital no configurado' };
  }
  let firmado;
  try { firmado = firmarFactura(facturaId); }
  catch (e) { setEstado(facturaId, 'error', `Error al firmar: ${e.message}`); log(facturaId, 'firma', e.message, false); return { estado: 'error', mensaje: e.message }; }

  if (getConfig('dgii_envio_automatico', '1') !== '1') {
    setEstado(facturaId, 'pendiente', 'Firmado. Envío manual pendiente');
    return { estado: 'pendiente', mensaje: 'Firmado, pendiente de envío' };
  }
  return enviarFactura(facturaId, firmado);
}

async function enviarFactura(facturaId, firmado) {
  const f = cargarFactura(facturaId);
  if (!f.xml || !f.codigo_seguridad) {
    try { firmado = firmarFactura(facturaId); } catch (e) { setEstado(facturaId, 'error', e.message); return { estado: 'error', mensaje: e.message }; }
  }
  const p = firmado?.p || paramsDesdeFactura(f);
  const totales = firmado?.totales || ecf.calcularTotales(p.items);
  const rnc = getConfig('negocio_rnc');
  try {
    if (f.tipo_ecf === '32' && totales.total < 250000) {
      const rfce = ecf.construirRFCE(p, totales, f.codigo_seguridad || firmado.codigoSeguridad);
      const rfceFirmado = firma.firmarXml(rfce);
      const r = await cliente.enviarRFCE({ xmlFirmado: rfceFirmado.xml, rnc, encf: f.encf });
      setEstado(facturaId, r.estado, r.mensaje || `DGII: ${r.estado}`, r.trackId);
      log(facturaId, 'envio_rfce', r.raw, r.estado.startsWith('aceptada'));
      return r;
    }
    const r = await cliente.enviarECF({ xmlFirmado: f.xml || firmado.xml, rnc, encf: f.encf });
    setEstado(facturaId, 'en_proceso', r.mensaje || 'Recibido por la DGII, en proceso', r.trackId);
    log(facturaId, 'envio_ecf', r.raw, true);
    // consulta inmediata del resultado
    try {
      const est = await cliente.consultarEstado(r.trackId);
      setEstado(facturaId, est.estado, est.mensaje || `DGII: ${est.estado}`, r.trackId);
      log(facturaId, 'consulta', est.raw, est.estado.startsWith('aceptada'));
      return est;
    } catch { return { estado: 'en_proceso', trackId: r.trackId, mensaje: r.mensaje }; }
  } catch (e) {
    setEstado(facturaId, 'error', e.message);
    log(facturaId, 'envio', e.message, false);
    return { estado: 'error', mensaje: e.message };
  }
}

async function consultarFactura(facturaId) {
  const f = cargarFactura(facturaId);
  if (!f.dgii_trackid) return enviarFactura(facturaId);
  try {
    const est = await cliente.consultarEstado(f.dgii_trackid);
    setEstado(facturaId, est.estado, est.mensaje || `DGII: ${est.estado}`, f.dgii_trackid);
    log(facturaId, 'consulta', est.raw, est.estado.startsWith('aceptada'));
    return est;
  } catch (e) {
    log(facturaId, 'consulta', e.message, false);
    return { estado: f.dgii_estado, mensaje: e.message };
  }
}

function setEstado(id, estado, mensaje, trackId) {
  db.prepare('UPDATE facturas SET dgii_estado = ?, dgii_mensaje = ?, dgii_trackid = COALESCE(?, dgii_trackid) WHERE id = ?').run(estado, mensaje ? String(mensaje).slice(0, 1000) : null, trackId || null, id);
}

/** Reintenta las facturas que quedaron sin enviar / con error. */
async function reprocesarPendientes(limite = 20) {
  const rows = db.prepare("SELECT id FROM facturas WHERE estado = 'emitida' AND dgii_estado IN ('no_enviada','pendiente','error','en_proceso') AND tipo_ecf NOT LIKE 'B%' ORDER BY id LIMIT ?").all(limite);
  const res = [];
  for (const r of rows) {
    const f = cargarFactura(r.id);
    res.push({ id: r.id, ...(f.dgii_trackid ? await consultarFactura(r.id) : await procesarFactura(r.id)) });
  }
  return res;
}

function urlQR(f) {
  return ecf.urlConsulta({
    ambiente: cliente.ambiente(), tipo: f.tipo_ecf, total: f.total, rncEmisor: getConfig('negocio_rnc'),
    rncComprador: f.cliente_identificacion, encf: f.encf, fecha: new Date(f.fecha.replace(' ', 'T')),
    fechaFirma: f.fecha_firma ? new Date(f.fecha_firma.replace(' ', 'T')) : new Date(f.fecha.replace(' ', 'T')), codigoSeguridad: f.codigo_seguridad || '',
  });
}

module.exports = { procesarFactura, enviarFactura, consultarFactura, reprocesarPendientes, firmarFactura, cargarFactura, urlQR, log };
