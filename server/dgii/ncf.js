'use strict';
/**
 * Manejo de secuencias de comprobantes fiscales.
 *  e-NCF (electrónico): E + tipo(2) + secuencia(10)  -> 13 caracteres. Ej: E320000000001
 *  NCF tradicional:     B + tipo(2) + secuencia(8)   -> 11 caracteres. Ej: B0200000001
 */
const { db } = require('../db');

const TIPOS_ECF = {
  '31': 'Factura de Crédito Fiscal Electrónica',
  '32': 'Factura de Consumo Electrónica',
  '33': 'Nota de Débito Electrónica',
  '34': 'Nota de Crédito Electrónica',
  '41': 'Compras Electrónico',
  '43': 'Gastos Menores Electrónico',
  '44': 'Regímenes Especiales Electrónico',
  '45': 'Gubernamental Electrónico',
  '46': 'Exportaciones Electrónico',
  '47': 'Pagos al Exterior Electrónico',
  'B01': 'Factura de Crédito Fiscal',
  'B02': 'Factura de Consumo',
  'B04': 'Nota de Crédito',
};

function formatear(tipo, numero) {
  if (tipo.startsWith('B')) return `${tipo}${String(numero).padStart(8, '0')}`;
  return `E${tipo}${String(numero).padStart(10, '0')}`;
}

function esElectronico(tipo) { return !String(tipo).startsWith('B'); }

/** Reserva y devuelve el próximo comprobante del tipo indicado (transaccional). */
const siguiente = db.transaction((tipo) => {
  const seq = db.prepare('SELECT * FROM secuencias_ecf WHERE tipo = ?').get(tipo);
  if (!seq) throw new Error(`Tipo de comprobante ${tipo} no configurado`);
  if (!seq.activo) throw new Error(`La secuencia ${tipo} (${seq.descripcion}) está inactiva`);
  if (seq.vence && new Date(seq.vence + 'T23:59:59') < new Date()) throw new Error(`La secuencia ${tipo} venció el ${seq.vence}. Solicite una nueva a la DGII.`);
  const prox = Math.max(seq.actual + 1, seq.desde);
  if (prox > seq.hasta) throw new Error(`Se agotó la secuencia ${tipo} (${seq.descripcion}). Solicite un nuevo rango a la DGII.`);
  db.prepare('UPDATE secuencias_ecf SET actual = ? WHERE tipo = ?').run(prox, tipo);
  return { encf: formatear(tipo, prox), numero: prox, vence: seq.vence, tipo };
});

function disponibles(tipo) {
  const seq = db.prepare('SELECT * FROM secuencias_ecf WHERE tipo = ?').get(tipo);
  if (!seq) return 0;
  return Math.max(0, seq.hasta - Math.max(seq.actual, seq.desde - 1));
}

module.exports = { TIPOS_ECF, formatear, esElectronico, siguiente, disponibles };
