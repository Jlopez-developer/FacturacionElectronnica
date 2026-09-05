'use strict';
/**
 * Firma digital XMLDSig (enveloped, RSA-SHA256, C14N) de los documentos que se
 * envían a la DGII, usando el certificado digital (.p12/.pfx) del contribuyente.
 */
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');
const { getConfig, DATA_DIR } = require('../db');

const CERT_DIR = path.join(DATA_DIR, 'certificados');
fs.mkdirSync(CERT_DIR, { recursive: true });

let cache = null; // { archivo, clave, privateKey, certPem, notAfter, subject }

function cargarCertificado(archivo, clave) {
  const p12Path = path.join(CERT_DIR, path.basename(archivo));
  const der = fs.readFileSync(p12Path, 'binary');
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, clave || '');
  let key = null, cert = null;
  for (const safeContents of p12.safeContents) {
    for (const bag of safeContents.safeBags) {
      if ((bag.type === forge.pki.oids.pkcs8ShroudedKeyBag || bag.type === forge.pki.oids.keyBag) && bag.key) key = key || bag.key;
      if (bag.type === forge.pki.oids.certBag && bag.cert) {
        // preferimos el certificado que tiene clave privada (no los de la cadena)
        if (!cert || bag.cert.getExtension('basicConstraints')?.cA !== true) cert = bag.cert;
      }
    }
  }
  if (!key || !cert) throw new Error('El archivo .p12 no contiene clave privada y certificado');
  return {
    privateKey: forge.pki.privateKeyToPem(key),
    certPem: forge.pki.certificateToPem(cert),
    notAfter: cert.validity.notAfter,
    notBefore: cert.validity.notBefore,
    subject: cert.subject.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(', '),
  };
}

function obtenerCertificado() {
  const archivo = getConfig('dgii_cert_archivo');
  const clave = getConfig('dgii_cert_clave') || '';
  if (!archivo) return null;
  if (cache && cache.archivo === archivo && cache.clave === clave) return cache;
  const c = cargarCertificado(archivo, clave);
  cache = { archivo, clave, ...c };
  return cache;
}
function invalidarCache() { cache = null; }

function certificadoDisponible() {
  try { return !!obtenerCertificado(); } catch { return false; }
}

/** Firma un XML (enveloped signature como último hijo del elemento raíz). */
function firmarXml(xml) {
  const c = obtenerCertificado();
  if (!c) throw new Error('Certificado digital no configurado. Cárguelo en Configuración → DGII.');
  if (c.notAfter < new Date()) throw new Error(`El certificado digital venció el ${c.notAfter.toLocaleDateString('es-DO')}`);
  const sig = new SignedXml({
    privateKey: c.privateKey,
    publicCert: c.certPem,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  });
  sig.addReference({
    xpath: '/*',
    uri: '',
    // Enveloped + C14N explícito: xml-crypto no canonicaliza al firmar si el último
    // transform no es de canonicalización (rompe la firma cuando el elemento raíz
    // tiene varias declaraciones xmlns, como la semilla de la DGII).
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    isEmptyUri: true,
  });
  sig.computeSignature(xml, { location: { reference: '/*', action: 'append' } });
  const firmado = sig.getSignedXml();
  const m = firmado.match(/<SignatureValue[^>]*>([\s\S]*?)<\/SignatureValue>/);
  const signatureValue = m ? m[1].replace(/\s+/g, '') : '';
  return { xml: firmado, signatureValue, codigoSeguridad: signatureValue.slice(0, 6) };
}

module.exports = { firmarXml, obtenerCertificado, certificadoDisponible, invalidarCache, cargarCertificado, CERT_DIR };
