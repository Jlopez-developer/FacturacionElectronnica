'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

// Base de datos temporal para las pruebas
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'colmado-test-'));

const rnc = require('../server/dgii/rnc');
const ncf = require('../server/dgii/ncf');
const ecf = require('../server/dgii/ecf');
const firma = require('../server/dgii/firma');
const { setConfig } = require('../server/db');

test('valida RNC con dígito verificador módulo 11', () => {
  assert.equal(rnc.validarRNC('131793916'), true);
  assert.equal(rnc.validarRNC('101003561'), true);
  assert.equal(rnc.validarRNC('131793917'), false);
  assert.equal(rnc.validarRNC('12345'), false);
});
test('valida cédula (Luhn) e identifica tipo', () => {
  assert.equal(rnc.validarCedula('00100000001'), false);
  assert.deepEqual(rnc.identificar('131-79391-6'), { tipo: 'RNC', valor: '131793916', valido: true });
  assert.equal(rnc.identificar('AB123456').tipo, 'PASAPORTE');
});
test('formatea e-NCF y NCF tradicional', () => {
  assert.equal(ncf.formatear('32', 47), 'E320000000047');
  assert.equal(ncf.formatear('31', 1), 'E310000000001');
  assert.equal(ncf.formatear('B02', 47), 'B0200000047');
  assert.equal(ncf.esElectronico('32'), true);
  assert.equal(ncf.esElectronico('B02'), false);
});
test('reserva secuencias consecutivas y respeta el rango', () => {
  const a = ncf.siguiente('32'); const b = ncf.siguiente('32');
  assert.equal(b.numero, a.numero + 1);
  assert.equal(b.encf.length, 13);
});
test('calcula totales con ITBIS 18% y exentos', () => {
  const t = ecf.calcularTotales([{ nombre: 'Arroz', cantidad: 2, precio: 50, itbis_tasa: 0 }, { nombre: 'Refresco', cantidad: 1, precio: 100, itbis_tasa: 18 }]);
  assert.equal(t.exento, 100);
  assert.equal(t.gravado1, 100);
  assert.equal(t.itbis, 18);
  assert.equal(t.total, 218);
  assert.equal(t.lineas[0].indicador, 4);
  assert.equal(t.lineas[1].indicador, 1);
});
test('construye XML e-CF tipo 32 con la estructura de la DGII', () => {
  const { xml } = ecf.construirECF({ tipo: '32', encf: 'E320000000001', vence: '2026-12-31', fecha: new Date('2026-09-03T10:00:00'), metodo_pago: 'efectivo', emisor: { rnc: '131793916', razon_social: 'Mi Colmado SRL', nombre_comercial: 'Mi Colmado', direccion: 'Calle 1' }, items: [{ nombre: 'Arroz', cantidad: 1, precio: 50, itbis_tasa: 0 }] });
  assert.match(xml, /^<\?xml version="1.0" encoding="utf-8"\?><ECF /);
  assert.match(xml, /<TipoeCF>32<\/TipoeCF><eNCF>E320000000001<\/eNCF><FechaVencimientoSecuencia>31-12-2026<\/FechaVencimientoSecuencia>/);
  assert.match(xml, /<FechaEmision>03-09-2026<\/FechaEmision>/);
  assert.match(xml, /<MontoExento>50.00<\/MontoExento><MontoTotal>50.00<\/MontoTotal>/);
  assert.match(xml, /<IndicadorFacturacion>4<\/IndicadorFacturacion>/);
  assert.doesNotMatch(xml, /<Comprador>/);
});
test('nota de crédito incluye InformacionReferencia', () => {
  const { xml } = ecf.construirECF({ tipo: '34', encf: 'E340000000001', fecha: new Date(), metodo_pago: 'efectivo', emisor: { rnc: '131793916', razon_social: 'X' }, items: [{ nombre: 'A', cantidad: 1, precio: 10, itbis_tasa: 18 }], referencia: { encf: 'E320000000001', fecha: new Date('2026-09-01T00:00:00'), codigo: 1 } });
  assert.match(xml, /<InformacionReferencia><NCFModificado>E320000000001<\/NCFModificado><FechaNCFModificado>01-09-2026<\/FechaNCFModificado><CodigoModificacion>1<\/CodigoModificacion><\/InformacionReferencia>/);
});
test('URL de consulta QR para consumo < 250,000 usa fc.dgii.gov.do', () => {
  const u = ecf.urlConsulta({ ambiente: 'eCF', tipo: '32', total: 218, rncEmisor: '131793916', encf: 'E320000000001', fecha: new Date(), fechaFirma: new Date(), codigoSeguridad: 'abc123' });
  assert.match(u, /^https:\/\/fc\.dgii\.gov\.do\/ecf\/ConsultaTimbreFC\?RncEmisor=131793916&ENCF=E320000000001&MontoTotal=218\.00&CodigoSeguridad=abc123$/);
  const u2 = ecf.urlConsulta({ ambiente: 'TesteCF', tipo: '31', total: 218, rncEmisor: '131793916', rncComprador: '101003561', encf: 'E310000000001', fecha: new Date('2026-09-03T10:00:00'), fechaFirma: new Date('2026-09-03T10:00:05'), codigoSeguridad: 'abc123' });
  assert.match(u2, /^https:\/\/ecf\.dgii\.gov\.do\/testecf\/ConsultaTimbre\?RncEmisor=131793916&RncComprador=101003561&ENCF=E310000000001&FechaEmision=03-09-2026&MontoTotal=218\.00&FechaFirma=03-09-2026%2010%3A00%3A05&CodigoSeguridad=abc123$/);
});

test('firma XMLDSig con certificado .p12 y la firma es verificable', (t) => {
  let hasOpenssl = true;
  try { execSync('openssl version', { stdio: 'ignore' }); } catch { hasOpenssl = false; }
  if (!hasOpenssl) return t.skip('openssl no disponible');
  const dir = firma.CERT_DIR;
  execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${dir}/k.pem" -out "${dir}/c.pem" -days 30 -nodes -subj "/CN=PRUEBA/C=DO" 2>/dev/null`);
  try { execSync(`openssl pkcs12 -export -out "${dir}/t.p12" -inkey "${dir}/k.pem" -in "${dir}/c.pem" -passout pass:1234 -legacy 2>/dev/null`); }
  catch { execSync(`openssl pkcs12 -export -out "${dir}/t.p12" -inkey "${dir}/k.pem" -in "${dir}/c.pem" -passout pass:1234`); }
  setConfig('dgii_cert_archivo', 't.p12'); setConfig('dgii_cert_clave', '1234'); firma.invalidarCache();
  assert.equal(firma.certificadoDisponible(), true);
  const { xml } = ecf.construirECF({ tipo: '32', encf: 'E320000000009', fecha: new Date(), metodo_pago: 'efectivo', emisor: { rnc: '131793916', razon_social: 'X' }, items: [{ nombre: 'A', cantidad: 1, precio: 10, itbis_tasa: 18 }] });
  const r = firma.firmarXml(xml);
  assert.equal(r.codigoSeguridad.length, 6);
  assert.match(r.xml, /<Signature xmlns="http:\/\/www.w3.org\/2000\/09\/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http:\/\/www.w3.org\/TR\/2001\/REC-xml-c14n-20010315"\/><SignatureMethod Algorithm="http:\/\/www.w3.org\/2001\/04\/xmldsig-more#rsa-sha256"\/>/);
  assert.match(r.xml, /<X509Certificate>/);
  assert.match(r.xml, /<\/Signature><\/ECF>$/);
  // verificación
  const { SignedXml } = require('xml-crypto');
  const { DOMParser } = require('@xmldom/xmldom');
  const doc = new DOMParser().parseFromString(r.xml, 'text/xml');
  const sigNode = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
  const v = new SignedXml({ publicCert: fs.readFileSync(`${dir}/c.pem`) });
  v.loadSignature(sigNode);
  assert.equal(v.checkSignature(r.xml), true);
  // clave incorrecta
  setConfig('dgii_cert_clave', 'mala'); firma.invalidarCache();
  assert.throws(() => firma.firmarXml(xml));
});
