'use strict';
/**
 * Construcción del XML del Comprobante Fiscal Electrónico (e-CF) según el
 * formato ECF v1.0 de la DGII y del Resumen de Factura de Consumo (RFCE)
 * usado para facturas de consumo menores a RD$250,000.
 */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n2 = (v) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
const tag = (name, val) => (val === undefined || val === null || val === '' ? '' : `<${name}>${esc(val)}</${name}>`);

/** dd-MM-yyyy */
function fechaDGII(d) {
  const x = d instanceof Date ? d : new Date(d);
  const p = (v) => String(v).padStart(2, '0');
  return `${p(x.getDate())}-${p(x.getMonth() + 1)}-${x.getFullYear()}`;
}
/** dd-MM-yyyy HH:mm:ss */
function fechaHoraDGII(d) {
  const x = d instanceof Date ? d : new Date(d);
  const p = (v) => String(v).padStart(2, '0');
  return `${fechaDGII(x)} ${p(x.getHours())}:${p(x.getMinutes())}:${p(x.getSeconds())}`;
}

const FORMA_PAGO = { efectivo: '1', transferencia: '2', tarjeta: '3', credito: '4', mixto: '8', otro: '8' };

/** Indicador de facturación por tasa de ITBIS: 1=18%, 2=16%, 3=0%, 4=exento */
function indicadorFacturacion(tasa) {
  const t = Number(tasa);
  if (t === 18) return 1;
  if (t === 16) return 2;
  if (t === 0) return 4; // exento (E) — para tasa cero gravada se usaría 3
  return 1;
}

/**
 * Calcula totales a partir de las líneas.
 * Cada línea: { nombre, cantidad, precio, itbis_tasa, descuento }
 * Los precios se manejan SIN ITBIS incluido (IndicadorMontoGravado = 0).
 */
function calcularTotales(items) {
  const t = { gravado1: 0, gravado2: 0, gravado3: 0, exento: 0, itbis1: 0, itbis2: 0, itbis3: 0, descuento: 0 };
  const lineas = items.map((it, i) => {
    const cant = Number(it.cantidad) || 0;
    const precio = Number(it.precio) || 0;
    const desc = Number(it.descuento) || 0;
    const tasa = Number(it.itbis_tasa ?? it.itbis ?? 18);
    const monto = Math.round((cant * precio - desc) * 100) / 100;
    const ind = indicadorFacturacion(tasa);
    let itbis = 0;
    if (ind === 1) { t.gravado1 += monto; itbis = monto * 0.18; t.itbis1 += itbis; }
    else if (ind === 2) { t.gravado2 += monto; itbis = monto * 0.16; t.itbis2 += itbis; }
    else if (ind === 3) { t.gravado3 += monto; }
    else { t.exento += monto; }
    t.descuento += desc;
    return { linea: i + 1, indicador: ind, nombre: it.nombre, cantidad: cant, precio, descuento: desc, monto, itbis: Math.round(itbis * 100) / 100, tasa, producto_id: it.producto_id };
  });
  const gravadoTotal = t.gravado1 + t.gravado2 + t.gravado3;
  const totalItbis = t.itbis1 + t.itbis2 + t.itbis3;
  const subtotal = gravadoTotal + t.exento;
  return {
    lineas,
    subtotal: +n2(subtotal), descuento: +n2(t.descuento), itbis: +n2(totalItbis), total: +n2(subtotal + totalItbis),
    gravadoTotal: +n2(gravadoTotal), gravado1: +n2(t.gravado1), gravado2: +n2(t.gravado2), gravado3: +n2(t.gravado3), exento: +n2(t.exento),
    itbis1: +n2(t.itbis1), itbis2: +n2(t.itbis2), itbis3: +n2(t.itbis3),
  };
}

/**
 * Construye el XML e-CF (sin firmar).
 * @param {object} p
 *  p.tipo '31'|'32'|'34'..., p.encf, p.vence (YYYY-MM-DD), p.fecha (Date), p.metodo_pago,
 *  p.emisor {rnc, razon_social, nombre_comercial, direccion}
 *  p.comprador {rnc, nombre} (opcional para 32)
 *  p.items [...], p.referencia {encf, fecha, codigo} (para 33/34)
 */
function construirECF(p) {
  const tot = calcularTotales(p.items);
  const fecha = p.fecha || new Date();
  const formaPago = FORMA_PAGO[p.metodo_pago] || '1';
  const tipoPago = p.metodo_pago === 'credito' ? '2' : '1';

  const comprador = p.comprador && (p.comprador.rnc || p.comprador.nombre)
    ? `<Comprador>${tag('RNCComprador', p.comprador.rnc)}${tag('RazonSocialComprador', p.comprador.nombre)}</Comprador>` : '';

  const totales = [
    tot.gravadoTotal > 0 ? tag('MontoGravadoTotal', n2(tot.gravadoTotal)) : '',
    tot.gravado1 > 0 ? tag('MontoGravadoI1', n2(tot.gravado1)) : '',
    tot.gravado2 > 0 ? tag('MontoGravadoI2', n2(tot.gravado2)) : '',
    tot.gravado3 > 0 ? tag('MontoGravadoI3', n2(tot.gravado3)) : '',
    tot.exento > 0 ? tag('MontoExento', n2(tot.exento)) : '',
    tot.gravado1 > 0 ? tag('ITBIS1', '18') : '',
    tot.gravado2 > 0 ? tag('ITBIS2', '16') : '',
    tot.gravado3 > 0 ? tag('ITBIS3', '0') : '',
    tot.gravadoTotal > 0 ? tag('TotalITBIS', n2(tot.itbis)) : '',
    tot.gravado1 > 0 ? tag('TotalITBIS1', n2(tot.itbis1)) : '',
    tot.gravado2 > 0 ? tag('TotalITBIS2', n2(tot.itbis2)) : '',
    tot.gravado3 > 0 ? tag('TotalITBIS3', '0.00') : '',
    tag('MontoTotal', n2(tot.total)),
  ].join('');

  const items = tot.lineas.map((l) => `<Item>${tag('NumeroLinea', l.linea)}${tag('IndicadorFacturacion', l.indicador)}${tag('NombreItem', String(l.nombre).slice(0, 80))}${tag('IndicadorBienoServicio', 1)}${tag('CantidadItem', n2(l.cantidad))}${tag('UnidadMedida', 43)}${tag('PrecioUnitarioItem', n2(l.precio))}${l.descuento > 0 ? tag('DescuentoMonto', n2(l.descuento)) : ''}${tag('MontoItem', n2(l.monto))}</Item>`).join('');

  const referencia = p.referencia
    ? `<InformacionReferencia>${tag('NCFModificado', p.referencia.encf)}${tag('FechaNCFModificado', fechaDGII(p.referencia.fecha))}${tag('CodigoModificacion', p.referencia.codigo || 1)}</InformacionReferencia>` : '';

  const xml = `<?xml version="1.0" encoding="utf-8"?>` +
    `<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
    `<Encabezado>` +
    `<Version>1.0</Version>` +
    `<IdDoc>${tag('TipoeCF', p.tipo)}${tag('eNCF', p.encf)}${p.vence ? tag('FechaVencimientoSecuencia', fechaDGII(p.vence + 'T00:00:00')) : ''}` +
    `${p.tipo === '32' ? tag('IndicadorMontoGravado', 0) : ''}${tag('TipoIngresos', '01')}${tag('TipoPago', tipoPago)}` +
    `${tipoPago === '1' ? `<TablaFormasPago><FormaDePago>${tag('FormaPago', formaPago)}${tag('MontoPago', n2(tot.total))}</FormaDePago></TablaFormasPago>` : ''}` +
    `</IdDoc>` +
    `<Emisor>${tag('RNCEmisor', p.emisor.rnc)}${tag('RazonSocialEmisor', p.emisor.razon_social)}${tag('NombreComercial', p.emisor.nombre_comercial)}${tag('DireccionEmisor', p.emisor.direccion)}${tag('FechaEmision', fechaDGII(fecha))}</Emisor>` +
    comprador +
    `<Totales>${totales}</Totales>` +
    `</Encabezado>` +
    `<DetallesItems>${items}</DetallesItems>` +
    referencia +
    `</ECF>`;
  return { xml, totales: tot };
}

/**
 * Resumen de Factura de Consumo Electrónica (RFCE) — se envía a la DGII en lugar
 * del e-CF completo cuando es tipo 32 y el monto es menor a RD$250,000.
 */
function construirRFCE(p, totales, codigoSeguridad) {
  const fecha = p.fecha || new Date();
  const tot = totales;
  const totalesXml = [
    tot.gravadoTotal > 0 ? tag('MontoGravadoTotal', n2(tot.gravadoTotal)) : '',
    tot.gravado1 > 0 ? tag('MontoGravadoI1', n2(tot.gravado1)) : '',
    tot.gravado2 > 0 ? tag('MontoGravadoI2', n2(tot.gravado2)) : '',
    tot.gravado3 > 0 ? tag('MontoGravadoI3', n2(tot.gravado3)) : '',
    tot.exento > 0 ? tag('MontoExento', n2(tot.exento)) : '',
    tot.gravadoTotal > 0 ? tag('TotalITBIS', n2(tot.itbis)) : '',
    tot.gravado1 > 0 ? tag('TotalITBIS1', n2(tot.itbis1)) : '',
    tot.gravado2 > 0 ? tag('TotalITBIS2', n2(tot.itbis2)) : '',
    tot.gravado3 > 0 ? tag('TotalITBIS3', '0.00') : '',
    tag('MontoTotal', n2(tot.total)),
    tag('CodigoSeguridadeCF', codigoSeguridad),
  ].join('');
  const comprador = p.comprador && (p.comprador.rnc || p.comprador.nombre)
    ? `<Comprador>${tag('RNCComprador', p.comprador.rnc)}${tag('RazonSocialComprador', p.comprador.nombre)}</Comprador>` : '';
  return `<?xml version="1.0" encoding="utf-8"?>` +
    `<RFCE xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
    `<Encabezado><Version>1.0</Version>` +
    `<IdDoc>${tag('TipoeCF', p.tipo)}${tag('eNCF', p.encf)}${tag('TipoIngresos', '01')}${tag('TipoPago', p.metodo_pago === 'credito' ? 2 : 1)}</IdDoc>` +
    `<Emisor>${tag('RNCEmisor', p.emisor.rnc)}${tag('RazonSocialEmisor', p.emisor.razon_social)}${tag('FechaEmision', fechaDGII(fecha))}</Emisor>` +
    comprador +
    `<Totales>${totalesXml}</Totales>` +
    `</Encabezado></RFCE>`;
}

/** URL de consulta (código QR) que se imprime en la representación impresa. */
function urlConsulta({ ambiente, tipo, total, rncEmisor, rncComprador, encf, fecha, fechaFirma, codigoSeguridad }) {
  const amb = { TesteCF: 'testecf', CerteCF: 'certecf', eCF: 'ecf' }[ambiente] || 'testecf';
  const q = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  if (tipo === '32' && Number(total) < 250000) {
    return `https://fc.dgii.gov.do/${amb}/ConsultaTimbreFC?` + q({ RncEmisor: rncEmisor, ENCF: encf, MontoTotal: n2(total), CodigoSeguridad: codigoSeguridad });
  }
  return `https://ecf.dgii.gov.do/${amb}/ConsultaTimbre?` + q({ RncEmisor: rncEmisor, RncComprador: rncComprador, ENCF: encf, FechaEmision: fechaDGII(fecha), MontoTotal: n2(total), FechaFirma: fechaHoraDGII(fechaFirma), CodigoSeguridad: codigoSeguridad });
}

module.exports = { construirECF, construirRFCE, calcularTotales, urlConsulta, fechaDGII, fechaHoraDGII, indicadorFacturacion };
