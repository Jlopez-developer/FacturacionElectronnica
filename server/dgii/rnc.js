'use strict';
/**
 * Validación de identificadores dominicanos.
 *  - RNC: 9 dígitos, dígito verificador módulo 11 con pesos 7,9,8,6,5,4,3,2
 *  - Cédula: 11 dígitos, verificación tipo Luhn (pesos alternos 1,2)
 */
const soloDigitos = (v) => String(v || '').replace(/\D/g, '');

function validarRNC(rnc) {
  const d = soloDigitos(rnc);
  if (d.length !== 9) return false;
  const pesos = [7, 9, 8, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 8; i++) suma += parseInt(d[i], 10) * pesos[i];
  const resto = suma % 11;
  let dv;
  if (resto === 0) dv = 2;
  else if (resto === 1) dv = 1;
  else dv = 11 - resto;
  return dv === parseInt(d[8], 10);
}

function validarCedula(ced) {
  const d = soloDigitos(ced);
  if (d.length !== 11) return false;
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    let n = parseInt(d[i], 10) * (i % 2 === 0 ? 1 : 2);
    if (n > 9) n = Math.floor(n / 10) + (n % 10);
    suma += n;
  }
  const dv = (10 - (suma % 10)) % 10;
  return dv === parseInt(d[10], 10);
}

/** Detecta el tipo de identificación y valida. Devuelve { tipo, valor, valido } */
function identificar(valor) {
  const d = soloDigitos(valor);
  if (d.length === 9) return { tipo: 'RNC', valor: d, valido: validarRNC(d) };
  if (d.length === 11) return { tipo: 'CEDULA', valor: d, valido: validarCedula(d) };
  if (valor && String(valor).trim().length >= 5) return { tipo: 'PASAPORTE', valor: String(valor).trim().toUpperCase(), valido: true };
  return { tipo: null, valor: d, valido: false };
}

module.exports = { validarRNC, validarCedula, identificar, soloDigitos };
