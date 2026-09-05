'use strict';
/**
 * Cliente HTTP de los servicios web de facturación electrónica de la DGII.
 *
 *  Ambientes: TesteCF (pruebas) | CerteCF (certificación) | eCF (producción)
 *  Flujo:
 *   1. GET  /autenticacion/api/Autenticacion/Semilla          -> XML semilla
 *   2. POST /autenticacion/api/Autenticacion/ValidarSemilla   -> token (semilla firmada)
 *   3. POST /recepcion/api/FacturasElectronicas               -> trackId (e-CF firmado)
 *      o    POST fc.dgii.gov.do/{amb}/recepcionfc/api/recepcion/ecf (RFCE consumo < 250,000, respuesta inmediata)
 *   4. GET  /consultaresultado/api/Consultas/Estado?TrackId=  -> estado del e-CF
 */
const { getConfig, setConfig } = require('../db');
const { firmarXml } = require('./firma');

const HOSTS = {
  TesteCF: { base: 'https://ecf.dgii.gov.do/testecf', fc: 'https://fc.dgii.gov.do/testecf' },
  CerteCF: { base: 'https://ecf.dgii.gov.do/certecf', fc: 'https://fc.dgii.gov.do/certecf' },
  eCF: { base: 'https://ecf.dgii.gov.do/ecf', fc: 'https://fc.dgii.gov.do/ecf' },
};

function ambiente() {
  const a = getConfig('dgii_ambiente', 'TesteCF');
  return HOSTS[a] ? a : 'TesteCF';
}
const urls = () => HOSTS[ambiente()];
const TIMEOUT = 30000;

async function http(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* no es json */ }
    return { ok: res.ok, status: res.status, text, json };
  } finally { clearTimeout(t); }
}

/** Obtiene (o reutiliza) el token de sesión de la DGII. */
async function obtenerToken(forzar = false) {
  const tok = getConfig('dgii_token');
  const exp = getConfig('dgii_token_expira');
  if (!forzar && tok && exp && new Date(exp) > new Date(Date.now() + 60000)) return tok;

  const { base } = urls();
  const semilla = await http(`${base}/autenticacion/api/Autenticacion/Semilla`);
  if (!semilla.ok) throw new Error(`DGII no devolvió la semilla (HTTP ${semilla.status}): ${semilla.text.slice(0, 200)}`);
  const { xml } = firmarXml(semilla.text);

  const fd = new FormData();
  fd.append('xml', new Blob([xml], { type: 'text/xml' }), 'semilla.xml');
  const r = await http(`${base}/autenticacion/api/Autenticacion/ValidarSemilla`, { method: 'POST', body: fd });
  if (!r.ok || !r.json || !r.json.token) throw new Error(`No se pudo autenticar con la DGII (HTTP ${r.status}): ${r.text.slice(0, 300)}`);
  setConfig('dgii_token', r.json.token);
  setConfig('dgii_token_expira', r.json.expira || new Date(Date.now() + 55 * 60000).toISOString());
  return r.json.token;
}

async function conToken(fn) {
  let token = await obtenerToken();
  let r = await fn(token);
  if (r.status === 401) { token = await obtenerToken(true); r = await fn(token); }
  return r;
}

/** Envía un e-CF firmado. Devuelve { trackId, mensaje, raw }. */
async function enviarECF({ xmlFirmado, rnc, encf }) {
  const { base } = urls();
  const r = await conToken((token) => {
    const fd = new FormData();
    fd.append('xml', new Blob([xmlFirmado], { type: 'text/xml' }), `${rnc}${encf}.xml`);
    return http(`${base}/recepcion/api/FacturasElectronicas`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  });
  if (!r.ok) throw new Error(`Recepción rechazó la solicitud (HTTP ${r.status}): ${r.text.slice(0, 300)}`);
  const j = r.json || {};
  if (j.error) throw new Error(j.mensaje || j.error);
  return { trackId: j.trackId, mensaje: j.mensaje || '', raw: r.text };
}

/** Envía el Resumen de Factura de Consumo (RFCE). Respuesta síncrona. */
async function enviarRFCE({ xmlFirmado, rnc, encf }) {
  const { fc } = urls();
  const r = await conToken((token) => {
    const fd = new FormData();
    fd.append('xml', new Blob([xmlFirmado], { type: 'text/xml' }), `${rnc}${encf}.xml`);
    return http(`${fc}/recepcionfc/api/recepcion/ecf`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  });
  if (!r.ok) throw new Error(`RecepciónFC rechazó la solicitud (HTTP ${r.status}): ${r.text.slice(0, 300)}`);
  return normalizarEstado(r.json || {}, r.text);
}

/** Consulta el estado de un e-CF por TrackId. */
async function consultarEstado(trackId) {
  const { base } = urls();
  const r = await conToken((token) => http(`${base}/consultaresultado/api/Consultas/Estado?TrackId=${encodeURIComponent(trackId)}`, { headers: { Authorization: `Bearer ${token}` } }));
  if (!r.ok) throw new Error(`Consulta de estado falló (HTTP ${r.status}): ${r.text.slice(0, 300)}`);
  return normalizarEstado(r.json || {}, r.text);
}

/** Consulta de TrackIds asociados a un e-NCF. */
async function consultarTrackIds(rnc, encf) {
  const { base } = urls();
  const r = await conToken((token) => http(`${base}/consultatrackids/api/TrackIds/Consulta?RncEmisor=${rnc}&Encf=${encf}`, { headers: { Authorization: `Bearer ${token}` } }));
  return r.json || [];
}

function normalizarEstado(j, raw) {
  const est = String(j.estado || '').toLowerCase().replace(/\s+/g, '');
  let estado = 'en_proceso';
  if (est.includes('aceptadocondicional')) estado = 'aceptada_condicional';
  else if (est.includes('aceptado')) estado = 'aceptada';
  else if (est.includes('rechazado') || est.includes('noencontrado')) estado = 'rechazada';
  else if (est.includes('enproceso')) estado = 'en_proceso';
  const mensajes = Array.isArray(j.mensajes) ? j.mensajes.map((m) => (typeof m === 'string' ? m : `${m.codigo ? `[${m.codigo}] ` : ''}${m.valor || ''}`)).join(' | ') : '';
  return { estado, codigo: j.codigo, trackId: j.trackId, encf: j.encf, mensaje: mensajes, raw };
}

/** Estado de los servicios de la DGII para el ambiente configurado. */
async function estadoServicios() {
  const { base } = urls();
  const r = await http(`${base}/estatusservicios/api/estatusservicios/obtenerestatus`);
  return { ok: r.ok, ambiente: ambiente(), servicios: r.json || [], raw: r.text.slice(0, 500) };
}

module.exports = { obtenerToken, enviarECF, enviarRFCE, consultarEstado, consultarTrackIds, estadoServicios, ambiente, HOSTS };
