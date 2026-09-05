'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'colmado.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  clave_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'cajero',          -- administrador | cajero | supervisor
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expira TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#1e88f5'
);
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE,
  nombre TEXT NOT NULL,
  categoria_id INTEGER REFERENCES categorias(id),
  precio REAL NOT NULL DEFAULT 0,
  costo REAL NOT NULL DEFAULT 0,
  itbis REAL NOT NULL DEFAULT 18,               -- 18 | 16 | 0 (exento)
  stock REAL NOT NULL DEFAULT 0,
  stock_minimo REAL NOT NULL DEFAULT 5,
  unidad TEXT NOT NULL DEFAULT 'UND',
  imagen TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo_id TEXT,                                  -- RNC | CEDULA | PASAPORTE
  identificacion TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS secuencias_ecf (
  tipo TEXT PRIMARY KEY,                         -- 31,32,33,34,41,43,44,45,46,47 (o B01,B02 tradicional)
  descripcion TEXT NOT NULL,
  desde INTEGER NOT NULL DEFAULT 1,
  hasta INTEGER NOT NULL DEFAULT 10000000,
  actual INTEGER NOT NULL DEFAULT 0,
  vence TEXT,                                    -- YYYY-MM-DD
  activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS caja_sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  apertura TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  cierre TEXT,
  monto_inicial REAL NOT NULL DEFAULT 0,
  monto_cierre REAL,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'abierta'         -- abierta | cerrada
);
CREATE TABLE IF NOT EXISTS caja_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caja_id INTEGER NOT NULL REFERENCES caja_sesiones(id),
  tipo TEXT NOT NULL,                            -- entrada | salida
  monto REAL NOT NULL,
  concepto TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  usuario_id INTEGER REFERENCES usuarios(id)
);
CREATE TABLE IF NOT EXISTS facturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,                   -- F-000047
  tipo_ecf TEXT NOT NULL DEFAULT '32',
  encf TEXT,                                     -- E320000000047 / B0200000047
  ncf_vence TEXT,
  cliente_id INTEGER REFERENCES clientes(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  caja_id INTEGER REFERENCES caja_sesiones(id),
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  subtotal REAL NOT NULL DEFAULT 0,
  descuento REAL NOT NULL DEFAULT 0,
  itbis REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  metodo_pago TEXT NOT NULL DEFAULT 'efectivo',  -- efectivo | tarjeta | transferencia | credito | mixto
  monto_recibido REAL NOT NULL DEFAULT 0,
  cambio REAL NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'emitida',        -- emitida | anulada
  dgii_estado TEXT NOT NULL DEFAULT 'no_enviada',-- no_enviada | pendiente | en_proceso | aceptada | aceptada_condicional | rechazada | error
  dgii_trackid TEXT,
  dgii_mensaje TEXT,
  codigo_seguridad TEXT,
  fecha_firma TEXT,
  xml TEXT,
  referencia_id INTEGER REFERENCES facturas(id),
  notas TEXT
);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha);
CREATE TABLE IF NOT EXISTS factura_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  factura_id INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id),
  nombre TEXT NOT NULL,
  cantidad REAL NOT NULL,
  precio REAL NOT NULL,
  itbis_tasa REAL NOT NULL DEFAULT 18,
  itbis_monto REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_factura ON factura_items(factura_id);
CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  rnc TEXT,
  telefono TEXT,
  direccion TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  proveedor_id INTEGER REFERENCES proveedores(id),
  ncf TEXT,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  subtotal REAL NOT NULL DEFAULT 0,
  itbis REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
  estado TEXT NOT NULL DEFAULT 'registrada',
  usuario_id INTEGER REFERENCES usuarios(id),
  notas TEXT
);
CREATE TABLE IF NOT EXISTS compra_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id),
  nombre TEXT NOT NULL,
  cantidad REAL NOT NULL,
  costo REAL NOT NULL,
  itbis_tasa REAL NOT NULL DEFAULT 18,
  total REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descripcion TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'General',
  monto REAL NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ncf TEXT,
  proveedor TEXT,
  metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
  usuario_id INTEGER REFERENCES usuarios(id),
  caja_id INTEGER REFERENCES caja_sesiones(id)
);
CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT
);
CREATE TABLE IF NOT EXISTS dgii_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  factura_id INTEGER REFERENCES facturas(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  accion TEXT NOT NULL,
  detalle TEXT,
  exito INTEGER NOT NULL DEFAULT 0
);
`;

db.exec(SCHEMA);

// ---------- helpers ----------
const getConfig = (clave, def = null) => {
  const r = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
  return r ? r.valor : def;
};
const setConfig = (clave, valor) =>
  db.prepare('INSERT INTO configuracion(clave, valor) VALUES(?,?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
    .run(clave, valor == null ? null : String(valor));
const allConfig = () => Object.fromEntries(db.prepare('SELECT clave, valor FROM configuracion').all().map(r => [r.clave, r.valor]));

const DEFAULT_CONFIG = {
  negocio_nombre: 'Mi Colmado',
  negocio_razon_social: 'Mi Colmado SRL',
  negocio_rnc: '',
  negocio_direccion: 'Calle Principal #1, Santo Domingo',
  negocio_telefono: '',
  negocio_email: '',
  negocio_eslogan: 'Fácil, rápido y seguro.',
  moneda: 'RD$',
  itbis_defecto: '18',
  // DGII
  dgii_ambiente: 'TesteCF',            // TesteCF | CerteCF | eCF
  dgii_modo: 'electronico',            // electronico (e-CF) | tradicional (NCF B01/B02) | ninguno
  dgii_envio_automatico: '1',
  dgii_cert_archivo: '',
  dgii_cert_clave: '',
  dgii_cert_vence: '',
  dgii_token: '',
  dgii_token_expira: '',
  // Impresión
  impresora_tipo: 'navegador',          // navegador | red (ESC/POS 9100)
  impresora_ip: '',
  impresora_puerto: '9100',
  impresora_ancho: '80',
  cajon_habilitado: '1',
  ticket_pie: 'Gracias por su compra',
};

const ensureDefaults = () => {
  const ins = db.prepare('INSERT OR IGNORE INTO configuracion(clave, valor) VALUES(?,?)');
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(DEFAULT_CONFIG)) ins.run(k, v);
    const seq = db.prepare('INSERT OR IGNORE INTO secuencias_ecf(tipo, descripcion, desde, hasta, actual, vence, activo) VALUES(?,?,?,?,?,?,?)');
    const vence = `${new Date().getFullYear()}-12-31`;
    const tipos = [
      ['31', 'Factura de Crédito Fiscal Electrónica', 1],
      ['32', 'Factura de Consumo Electrónica', 1],
      ['33', 'Nota de Débito Electrónica', 1],
      ['34', 'Nota de Crédito Electrónica', 1],
      ['41', 'Compras Electrónico', 0],
      ['43', 'Gastos Menores Electrónico', 0],
      ['44', 'Regímenes Especiales Electrónico', 0],
      ['45', 'Gubernamental Electrónico', 0],
      ['46', 'Exportaciones Electrónico', 0],
      ['47', 'Pagos al Exterior Electrónico', 0],
      ['B01', 'Crédito Fiscal (NCF tradicional)', 1],
      ['B02', 'Consumo (NCF tradicional)', 1],
      ['B04', 'Nota de Crédito (NCF tradicional)', 1],
    ];
    for (const [t, d, a] of tipos) seq.run(t, d, 1, t.startsWith('B') ? 99999999 : 9999999999, 0, vence, a);
  });
  tx();
};
ensureDefaults();

module.exports = { db, getConfig, setConfig, allConfig, DEFAULT_CONFIG, DATA_DIR, DB_PATH };
