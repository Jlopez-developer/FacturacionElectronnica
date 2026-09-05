'use strict';
/**
 * Datos de demostración. Uso: npm run seed
 * Borra las operaciones existentes y genera catálogo, clientes, ventas de los
 * últimos 2 meses, compras, gastos y una caja abierta hoy.
 */
const { db, setConfig } = require('./db');
const { hashPassword } = require('./auth');
const { calcularTotales } = require('./dgii/ecf');
const ncf = require('./dgii/ncf');

let seed = 20260903;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ts = (d) => `${iso(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

const CATEGORIAS = [
  ['Alimentos', '#1e88f5', '🍚'], ['Bebidas', '#22c55e', '🥤'], ['Limpieza', '#ef4444', '🧴'], ['Cuidado Personal', '#f97316', '🧼'], ['Otros', '#8b5cf6', '📦'],
];
// [nombre, precio, itbis, emoji]
const BASE = {
  Alimentos: [
    ['Arroz Selecto 5 lb', 50, 0, '🍚'], ['Aceite Crisol 32 oz', 55, 0, '🫙'], ['Azúcar Crema 5 lb', 40, 0, '🍬'], ['Habichuelas Rojas 1 lb', 35, 0, '🫘'], ['Leche Listamilk 1 L', 35, 0, '🥛'],
    ['Pan de agua', 10, 0, '🍞'], ['Huevos (unidad)', 8, 0, '🥚'], ['Salami Induveca', 120, 18, '🥩'], ['Queso de freír 1 lb', 180, 18, '🧀'], ['Plátano verde', 15, 0, '🍌'],
    ['Sal Refinada 1 lb', 15, 0, '🧂'], ['Harina de trigo 1 lb', 30, 0, '🌾'], ['Espaguetis Milano', 45, 18, '🍝'], ['Sardinas en lata', 65, 18, '🐟'], ['Salsa de tomate', 40, 18, '🥫'],
    ['Café Santo Domingo 1 lb', 250, 0, '☕'], ['Chocolate Cortés', 95, 18, '🍫'], ['Avena Quaker', 85, 18, '🥣'], ['Maíz en lata', 55, 18, '🌽'], ['Guandules en lata', 60, 18, '🥫'],
    ['Pollo (libra)', 75, 0, '🍗'], ['Cebolla (libra)', 45, 0, '🧅'], ['Ajo (cabeza)', 20, 0, '🧄'], ['Papas (libra)', 35, 0, '🥔'], ['Yuca (libra)', 25, 0, '🍠'],
    ['Galletas Guarina', 25, 18, '🍪'], ['Mantequilla 1 lb', 140, 18, '🧈'], ['Sazón Ranchero', 30, 18, '🫙'], ['Sopita Maggi', 12, 18, '🍲'], ['Vinagre', 35, 18, '🫙'],
    ['Pasta de dientes de ajo', 45, 18, '🧄'], ['Mortadela (libra)', 110, 18, '🥓'], ['Jamón (libra)', 190, 18, '🥓'], ['Pica pollo (funda)', 60, 18, '🍗'], ['Ketchup Baldom', 75, 18, '🥫'],
    ['Mayonesa Baldom', 95, 18, '🫙'], ['Cereal Corn Flakes', 145, 18, '🥣'], ['Yogur Yoplait', 55, 18, '🥛'], ['Salchichas (lata)', 70, 18, '🌭'], ['Batata (libra)', 30, 0, '🍠'],
  ],
  Bebidas: [
    ['Coca-Cola 2 L', 110, 18, '🥤'], ['Pepsi 2 L', 100, 18, '🥤'], ['Country Club Merengue 2 L', 95, 18, '🥤'], ['Agua Planeta Azul 16 oz', 15, 18, '💧'], ['Agua Crystal 1 gal', 60, 18, '💧'],
    ['Jugo Rica 1 L', 85, 18, '🧃'], ['Malta Morena', 40, 18, '🍺'], ['Presidente 22 oz', 150, 18, '🍺'], ['Presidente Light 22 oz', 150, 18, '🍺'], ['Brahma 22 oz', 130, 18, '🍺'],
    ['Red Bull', 130, 18, '🥫'], ['Gatorade', 75, 18, '🥤'], ['Sprite 20 oz', 45, 18, '🥤'], ['Fanta Naranja 20 oz', 45, 18, '🥤'], ['Té Lipton', 55, 18, '🧋'],
    ['Leche de coco', 70, 18, '🥥'], ['Jugo Bon 1 L', 90, 18, '🧃'], ['Ron Brugal 750 ml', 550, 18, '🍾'], ['Ron Barceló 750 ml', 600, 18, '🍾'], ['Vino Tinto', 350, 18, '🍷'],
    ['Cerveza Corona', 120, 18, '🍺'], ['Jugo de naranja Tropicana', 120, 18, '🍊'], ['Agua Dasani 1.5 L', 40, 18, '💧'], ['Avena Alpina', 45, 18, '🥛'], ['Chocolate frío Cortés', 50, 18, '🥤'],
  ],
  Limpieza: [
    ['Detergente Ace 1 kg', 150, 18, '🧴'], ['Cloro Clorox 1 gal', 120, 18, '🧴'], ['Jabón de cuaba', 25, 18, '🧼'], ['Suavizante Suavitel', 95, 18, '🧴'], ['Desinfectante Mistolín', 110, 18, '🧴'],
    ['Lavaplatos Axion', 65, 18, '🧴'], ['Esponja Scotch-Brite', 35, 18, '🧽'], ['Papel toalla Scott', 85, 18, '🧻'], ['Fundas de basura (paq.)', 50, 18, '🗑️'], ['Insecticida Baygon', 180, 18, '🪳'],
    ['Escoba', 150, 18, '🧹'], ['Suape', 180, 18, '🧹'], ['Guantes de goma', 60, 18, '🧤'], ['Ambientador Glade', 130, 18, '🌸'], ['Limpiavidrios Windex', 120, 18, '🪟'],
  ],
  'Cuidado Personal': [
    ['Jabón Protex', 55, 18, '🧼'], ['Pasta Colgate', 95, 18, '🪥'], ['Cepillo dental', 45, 18, '🪥'], ['Desodorante Rexona', 130, 18, '🧴'], ['Shampoo Head & Shoulders', 210, 18, '🧴'],
    ['Papel higiénico Scott (4)', 95, 18, '🧻'], ['Pañales Huggies (paq.)', 350, 18, '👶'], ['Toallas Kotex', 85, 18, '🩹'], ['Afeitadora Gillette', 45, 18, '🪒'], ['Crema Nivea', 150, 18, '🧴'],
    ['Alcohol 16 oz', 65, 18, '🧴'], ['Curitas (caja)', 40, 18, '🩹'], ['Acetaminofén (sobre)', 15, 0, '💊'], ['Vitamina C', 25, 0, '💊'], ['Enjuague bucal', 160, 18, '🧴'],
  ],
  Otros: [
    ['Recarga Claro', 100, 0, '📱'], ['Recarga Altice', 100, 0, '📱'], ['Fósforos', 10, 18, '🔥'], ['Velas (paq.)', 35, 18, '🕯️'], ['Bombilla LED', 120, 18, '💡'],
    ['Pilas AA (par)', 60, 18, '🔋'], ['Hielo (funda)', 50, 18, '🧊'], ['Carbón (funda)', 80, 18, '🔥'], ['Funda plástica', 5, 18, '🛍️'], ['Cigarrillos Marlboro', 250, 18, '🚬'],
  ],
};
const VARIANTES = ['', ' Mediano', ' Grande', ' Familiar', ' x2', ' Pequeño', ' Económico', ' Premium'];
const NOMBRES = ['Juan', 'María', 'Pedro', 'Ana', 'Luis', 'Carmen', 'José', 'Rosa', 'Miguel', 'Yolanda', 'Rafael', 'Altagracia', 'Francisco', 'Mercedes', 'Ramón', 'Josefina', 'Julio', 'Dolores', 'Manuel', 'Carolina', 'Wilson', 'Yeimi', 'Eduardo', 'Patricia', 'Domingo', 'Luz', 'Ángel', 'Milagros', 'Víctor', 'Esperanza', 'Alberto', 'Yudelka', 'Héctor', 'Ramona', 'Andrés', 'Gladys'];
const APELLIDOS = ['Pérez', 'Rodríguez', 'García', 'Martínez', 'Sánchez', 'Reyes', 'Díaz', 'Jiménez', 'Peña', 'Núñez', 'Castillo', 'Santana', 'Mejía', 'Guerrero', 'Rosario', 'Vargas', 'Polanco', 'Cruz', 'Almonte', 'Ramírez', 'Encarnación', 'De la Rosa', 'Batista', 'Medina', 'Hernández'];
const EMPRESAS = ['Ferretería El Progreso SRL', 'Colegio Nuevo Amanecer', 'Distribuidora Del Este SRL', 'Panadería La Esperanza', 'Taller Mecánico Reyes', 'Salón de Belleza Yudy', 'Constructora Peña & Asociados', 'Farmacia San Rafael', 'Banca Lotería El Millón', 'Comedor Doña Chea'];
const PROVEEDORES = [['Distribuidora Corripio', '101003561'], ['Grupo Ramos - Distribuidora', '101001091'], ['Cervecería Nacional Dominicana', '101003452'], ['Induveca', '101010401'], ['Bepensa Dominicana', '101013891'], ['Mercasid', '101002631'], ['Sigma Alimentos', '101090861'], ['Colgate-Palmolive', '101005082']];

function generarRNC() { // RNC válido (dígito verificador módulo 11)
  const pesos = [7, 9, 8, 6, 5, 4, 3, 2];
  let d = '1' + String(ri(0, 9999999)).padStart(7, '0');
  let s = 0; for (let i = 0; i < 8; i++) s += parseInt(d[i], 10) * pesos[i];
  const r = s % 11; const dv = r === 0 ? 2 : r === 1 ? 1 : 11 - r;
  return d + dv;
}
function generarCedula() {
  let d = '';
  d += pick(['001', '002', '003', '031', '037', '402', '223']);
  for (let i = 0; i < 7; i++) d += ri(0, 9);
  let s = 0;
  for (let i = 0; i < 10; i++) { let n = parseInt(d[i], 10) * (i % 2 === 0 ? 1 : 2); if (n > 9) n = Math.floor(n / 10) + (n % 10); s += n; }
  return d + ((10 - (s % 10)) % 10);
}

const limpiar = db.transaction(() => {
  for (const t of ['dgii_log', 'factura_items', 'facturas', 'compra_items', 'compras', 'gastos', 'caja_movimientos', 'caja_sesiones', 'productos', 'categorias', 'clientes', 'proveedores', 'sesiones']) db.exec(`DELETE FROM ${t}`);
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('facturas','factura_items','compras','compra_items','gastos','caja_movimientos','caja_sesiones','productos','categorias','clientes','proveedores')");
  db.prepare('UPDATE secuencias_ecf SET actual = 0').run();
});

function run() {
  limpiar();
  setConfig('negocio_nombre', 'Mi Colmado');
  setConfig('negocio_razon_social', 'Mi Colmado SRL');
  setConfig('negocio_rnc', '131793916');
  setConfig('negocio_direccion', 'Calle Duarte #45, Villa Mella, Santo Domingo Norte');
  setConfig('negocio_telefono', '(809) 555-0147');
  setConfig('dgii_envio_automatico', '1');
  setConfig('config_completada', '0'); setConfig('config_paso', '0');
  setConfig('dgii_ultima_prueba', ''); setConfig('dgii_ultima_prueba_ok', ''); setConfig('dgii_ultima_prueba_msg', '');

  // Usuarios
  const insU = db.prepare('INSERT OR IGNORE INTO usuarios(usuario,nombre,clave_hash,rol) VALUES(?,?,?,?)');
  insU.run('admin', 'Administrador', hashPassword('admin123'), 'administrador');
  insU.run('cajero', 'Yolanda Peña', hashPassword('cajero123'), 'cajero');
  insU.run('supervisor', 'Rafael Núñez', hashPassword('super123'), 'supervisor');
  const usuarios = db.prepare('SELECT id, rol FROM usuarios').all();
  const adminId = usuarios.find((u) => u.rol === 'administrador').id;
  const cajeroId = usuarios.find((u) => u.rol === 'cajero').id;

  // Categorías y productos (268 activos)
  const insC = db.prepare('INSERT INTO categorias(nombre,color) VALUES(?,?)');
  const catIds = {};
  for (const [n, c] of CATEGORIAS) catIds[n] = insC.run(n, c).lastInsertRowid;
  const insP = db.prepare('INSERT INTO productos(codigo,nombre,categoria_id,precio,costo,itbis,stock,stock_minimo,unidad,imagen,activo) VALUES(?,?,?,?,?,?,?,?,?,?,1)');
  const productos = [];
  let codigo = 7501000;
  const TOTAL_PRODUCTOS = 268;
  const objetivo = { Alimentos: 108, Bebidas: 60, Limpieza: 40, 'Cuidado Personal': 35, Otros: 25 };
  for (const [cat] of CATEGORIAS) {
    const base = BASE[cat]; let n = 0; let v = 0;
    while (n < objetivo[cat]) {
      for (const [nombre, precio, itbis, emoji] of base) {
        if (n >= objetivo[cat]) break;
        const sufijo = VARIANTES[v] || ` #${v}`;
        const nom = v === 0 ? nombre : `${nombre.replace(/\s\d.*$/, '')}${sufijo}`;
        const pr = v === 0 ? precio : Math.round(precio * (0.8 + v * 0.25));
        const id = insP.run(String(codigo++), nom, catIds[cat], pr, Math.round(pr * 0.72), itbis, ri(8, 120), ri(3, 10), 'UND', emoji).lastInsertRowid;
        productos.push({ id, nombre: nom, precio: pr, itbis, categoria: cat, base: v === 0 ? nombre : null });
        n++;
      }
      v++;
    }
  }
  if (productos.length !== TOTAL_PRODUCTOS) throw new Error(`Se generaron ${productos.length} productos`);

  // Clientes (156)
  const insCl = db.prepare('INSERT INTO clientes(nombre,tipo_id,identificacion,telefono,email,direccion) VALUES(?,?,?,?,?,?)');
  const clientes = [];
  for (let i = 0; i < 156; i++) {
    let nombre, tipo, idn;
    if (i < 10) { nombre = EMPRESAS[i]; tipo = 'RNC'; idn = generarRNC(); }
    else { nombre = `${pick(NOMBRES)} ${pick(APELLIDOS)}`; tipo = rnd() < 0.7 ? 'CEDULA' : null; idn = tipo ? generarCedula() : null; }
    const id = insCl.run(nombre, tipo, idn, `(809) ${ri(200, 999)}-${String(ri(0, 9999)).padStart(4, '0')}`, null, pick(['Villa Mella', 'Los Guaricanos', 'Sabana Perdida', 'La Victoria', 'Calle Duarte', 'Av. Hermanas Mirabal'])).lastInsertRowid;
    clientes.push({ id, nombre, tipo, idn });
  }
  const clienteRNC = clientes.filter((c) => c.tipo === 'RNC');

  // Proveedores
  const insPr = db.prepare('INSERT INTO proveedores(nombre,rnc,telefono) VALUES(?,?,?)');
  const proveedores = PROVEEDORES.map(([n, rnc]) => ({ id: insPr.run(n, rnc, `(809) ${ri(200, 999)}-${String(ri(0, 9999)).padStart(4, '0')}`).lastInsertRowid, nombre: n }));

  // ---------- Ventas ----------
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = (n) => { const d = new Date(hoy); d.setDate(hoy.getDate() + n); return d; };
  // Últimos 7 días (mismos valores del boceto). Hoy: 47 facturas / RD$ 18,750; ayer calibrado para +23% y +15%.
  const objetivos = new Map(); // iso -> { total, facturas }
  const ult7 = [[-6, 15000, 39], [-5, 17500, 42], [-4, 21000, 51], [-3, 17500, 44], [-2, 16000, 40], [-1, 15244, 41], [0, 18750, 47]];
  for (const [n, t, f] of ult7) objetivos.set(iso(dia(n)), { total: t, facturas: f, d: dia(n) });
  // Resto del mes actual para llegar a RD$ 482,350 y mes anterior (~RD$ 430,670, +12%)
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const diasMesPrevios = [];
  for (let d = new Date(inicioMes); d < dia(-6); d.setDate(d.getDate() + 1)) diasMesPrevios.push(new Date(d));
  const sumaVentana = [...objetivos.values()].filter((o) => o.d >= inicioMes).reduce((s, o) => s + o.total, 0);
  const restanteMes = 482350 - sumaVentana;
  if (diasMesPrevios.length && restanteMes > 0) repartir(diasMesPrevios, restanteMes, objetivos);
  const mesAnterior = []; const ini = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) if (!objetivos.has(iso(d))) mesAnterior.push(new Date(d));
  const ventasMesActual = [...objetivos.values()].filter((o) => o.d >= inicioMes).reduce((s, o) => s + o.total, 0);
  const ventanaMesAnterior = [...objetivos.values()].filter((o) => o.d < inicioMes).reduce((s, o) => s + o.total, 0);
  repartir(mesAnterior, Math.max(0, Math.round(ventasMesActual / 1.12) - ventanaMesAnterior), objetivos);

  function repartir(dias, total, mapa) {
    const pesos = dias.map((d) => (d.getDay() === 0 ? 1.15 : d.getDay() === 6 ? 1.3 : 0.9 + rnd() * 0.3));
    const sp = pesos.reduce((a, b) => a + b, 0);
    let acum = 0;
    dias.forEach((d, i) => {
      const t = i === dias.length - 1 ? total - acum : Math.round((total * pesos[i]) / sp);
      acum += t;
      mapa.set(iso(d), { total: t, facturas: Math.max(20, Math.round(t / 400)), d });
    });
  }

  // Productos más vendidos del mes (unidades exactas del boceto) — se reparten en los días del mes actual
  const top = [['Arroz Selecto 5 lb', 125], ['Aceite Crisol 32 oz', 98], ['Azúcar Crema 5 lb', 87], ['Habichuelas Rojas 1 lb', 75], ['Leche Listamilk 1 L', 64]];
  const topIds = new Set();
  const pendientesTop = []; // { producto, cantidad }
  for (const [nombre, cant] of top) { const p = productos.find((x) => x.nombre === nombre); topIds.add(p.id); for (let i = 0; i < cant; i++) pendientesTop.push(p); }
  const diasMes = [...objetivos.values()].filter((o) => o.d >= inicioMes).sort((a, b) => a.d - b.d);
  const topPorDia = new Map(diasMes.map((o) => [iso(o.d), []]));
  pendientesTop.forEach((p, i) => topPorDia.get(iso(diasMes[i % diasMes.length].d)).push(p));

  // Tope mensual de venta por producto (para que el top 5 sea exacto): ex-ITBIS < 2,240
  const tope = new Map(productos.map((p) => [p.id, topIds.has(p.id) ? Infinity : ri(1500, 2150)]));
  const acumMes = new Map();
  const pesoCat = { Alimentos: 36, Bebidas: 36, Limpieza: 12, 'Cuidado Personal': 12, Otros: 2 };
  const porCat = {}; for (const p of productos) (porCat[p.categoria] = porCat[p.categoria] || []).push(p);
  const FILLER = ['Recarga telefónica', 'Funda de hielo', 'Velas', 'Fósforos', 'Pilas', 'Bombilla', 'Carbón', 'Fundas'];

  const insF = db.prepare(`INSERT INTO facturas(numero,tipo_ecf,encf,ncf_vence,cliente_id,usuario_id,caja_id,fecha,subtotal,descuento,itbis,total,metodo_pago,monto_recibido,cambio,estado,dgii_estado,dgii_mensaje,codigo_seguridad,fecha_firma)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insI = db.prepare('INSERT INTO factura_items(factura_id,producto_id,nombre,cantidad,precio,itbis_tasa,itbis_monto,total) VALUES(?,?,?,?,?,?,?,?)');
  const insCaja = db.prepare('INSERT INTO caja_sesiones(usuario_id,apertura,cierre,monto_inicial,monto_cierre,estado) VALUES(?,?,?,?,?,?)');
  let numero = 0;
  const vence = `${hoy.getFullYear()}-12-31`;

  const fechasOrdenadas = [...objetivos.values()].sort((a, b) => a.d - b.d);
  let cajaHoyId = null;
  const insertarDia = db.transaction((obj) => {
    const esHoy = iso(obj.d) === iso(hoy);
    const apertura = new Date(obj.d); apertura.setHours(8, 0, 0, 0);
    const cierre = new Date(obj.d); cierre.setHours(21, 30, 0, 0);
    const cajaId = insCaja.run(obj.d.getDay() % 2 ? cajeroId : adminId, ts(apertura), esHoy ? null : ts(cierre), 2000, esHoy ? null : null, esHoy ? 'abierta' : 'cerrada').lastInsertRowid;
    if (esHoy) cajaHoyId = cajaId;
    const enMes = obj.d >= inicioMes;
    const topHoy = enMes ? [...(topPorDia.get(iso(obj.d)) || [])] : [];
    const n = obj.facturas;
    const objetivoPool = obj.total * 0.95;
    // reparto de líneas del pool en n facturas
    const facturas = Array.from({ length: n }, () => []);
    let valorPool = 0; let k = 0;
    // primero el top 5 del mes
    while (topHoy.length) { const p = topHoy.pop(); facturas[k % n].push({ producto_id: p.id, nombre: p.nombre, cantidad: 1, precio: p.precio, itbis_tasa: p.itbis }); valorPool += p.precio * (1 + p.itbis / 100); k++; }
    let intentos = 0;
    while (valorPool < objetivoPool && intentos < 5000) {
      intentos++;
      const r = rnd() * 98; let cat = 'Otros'; let acc = 0;
      for (const [c, w] of Object.entries(pesoCat)) { acc += w; if (r < acc) { cat = c; break; } }
      const p = pick(porCat[cat]);
      if (topIds.has(p.id)) continue;
      const cant = rnd() < 0.7 ? 1 : ri(2, 3);
      const monto = p.precio * cant;
      if (enMes && (acumMes.get(p.id) || 0) + monto > tope.get(p.id)) continue;
      const v = monto * (1 + p.itbis / 100);
      if (valorPool + v > obj.total * 0.97) { if (intentos > 4000) break; continue; }
      facturas[k % n].push({ producto_id: p.id, nombre: p.nombre, cantidad: cant, precio: p.precio, itbis_tasa: p.itbis });
      if (enMes) acumMes.set(p.id, (acumMes.get(p.id) || 0) + monto);
      valorPool += v; k++;
    }
    // relleno exacto (categoría Otros, sin producto) repartido en 3 facturas
    let resto = Math.round((obj.total - valorPool) * 100) / 100;
    const partes = [0.5, 0.3, 0.2];
    partes.forEach((pp, i) => {
      const monto = i === partes.length - 1 ? resto : Math.round(obj.total * 0.05 * pp * 100) / 100;
      resto = Math.round((resto - monto) * 100) / 100;
      facturas[(i * 7) % n].push({ producto_id: null, nombre: pick(FILLER), cantidad: 1, precio: monto, itbis_tasa: 0 });
    });
    // insertar facturas del día
    const ini = 8 * 60 + 5; const finM = esHoy ? Math.max(ini + n, new Date().getHours() * 60 + new Date().getMinutes() - 5) : 21 * 60;
    facturas.forEach((items, i) => {
      if (!items.length) items.push({ producto_id: null, nombre: 'Funda plástica', cantidad: 1, precio: 5, itbis_tasa: 18 });
      const minutos = Math.round(ini + ((finM - ini) * i) / Math.max(1, n - 1));
      const fecha = new Date(obj.d); fecha.setHours(Math.floor(minutos / 60), minutos % 60, ri(0, 59), 0);
      const tot = calcularTotales(items);
      const rr = rnd();
      const cliente = rr < 0.25 ? pick(clientes) : null;
      const credito = cliente && cliente.tipo === 'RNC' && rnd() < 0.6;
      const tipo = credito ? '31' : '32';
      const comp = ncf.siguiente(tipo);
      const metodo = rnd() < 0.62 ? 'efectivo' : rnd() < 0.6 ? 'tarjeta' : 'transferencia';
      const recibido = metodo === 'efectivo' ? Math.ceil(tot.total / 50) * 50 : tot.total;
      numero++;
      const codigo = Math.random().toString(36).slice(2, 8);
      const fid = insF.run(`F-${String(numero).padStart(6, '0')}`, tipo, comp.encf, vence, cliente ? cliente.id : null, obj.d.getDay() % 2 ? cajeroId : adminId, cajaId, ts(fecha), tot.subtotal, 0, tot.itbis, tot.total, metodo, recibido, +(recibido - tot.total).toFixed(2), 'emitida', 'aceptada', 'Datos de demostración (no enviado a la DGII)', codigo, ts(fecha)).lastInsertRowid;
      for (const l of tot.lineas) insI.run(fid, l.producto_id, l.nombre, l.cantidad, l.precio, l.tasa, l.itbis, l.monto);
    });
  });
  for (const obj of fechasOrdenadas) insertarDia(obj);

  // ---------- Compras ----------
  const insCo = db.prepare('INSERT INTO compras(numero,proveedor_id,ncf,fecha,subtotal,itbis,total,metodo_pago,usuario_id) VALUES(?,?,?,?,?,?,?,?,?)');
  const insCoI = db.prepare('INSERT INTO compra_items(compra_id,producto_id,nombre,cantidad,costo,itbis_tasa,total) VALUES(?,?,?,?,?,?,?)');
  let nc = 0;
  for (let k = 0; k < 24; k++) {
    const d = dia(-ri(0, 45)); d.setHours(ri(9, 16), ri(0, 59), 0, 0);
    const prov = pick(proveedores);
    const items = Array.from({ length: ri(3, 8) }, () => { const p = pick(productos); const cant = ri(6, 48); return { p, cant, costo: Math.round(p.precio * 0.72) }; });
    let sub = 0, itb = 0; for (const it of items) { const m = it.cant * it.costo; sub += m; itb += m * it.p.itbis / 100; }
    const cid = insCo.run(`C-${String(++nc).padStart(6, '0')}`, prov.id, `B01${String(ri(1, 99999999)).padStart(8, '0')}`, ts(d), +sub.toFixed(2), +itb.toFixed(2), +(sub + itb).toFixed(2), pick(['efectivo', 'transferencia', 'credito']), adminId).lastInsertRowid;
    for (const it of items) insCoI.run(cid, it.p.id, it.p.nombre, it.cant, it.costo, it.p.itbis, it.cant * it.costo);
  }
  // ---------- Gastos ----------
  const insG = db.prepare('INSERT INTO gastos(descripcion,categoria,monto,fecha,ncf,proveedor,metodo_pago,usuario_id,caja_id) VALUES(?,?,?,?,?,?,?,?,?)');
  const GASTOS = [['Pago de luz (EDESUR)', 'Servicios', 8500, 'EDESUR'], ['Agua (CAASD)', 'Servicios', 1200, 'CAASD'], ['Internet Claro', 'Servicios', 2500, 'Claro'], ['Alquiler del local', 'Alquiler', 25000, null], ['Sueldo cajera', 'Nómina', 18000, null], ['Reparación nevera', 'Mantenimiento', 4500, 'Refrigeración Peña'], ['Fundas y material', 'Insumos', 1800, 'Plásticos del Norte'], ['Gasolina motor delivery', 'Transporte', 1500, 'Estación Texaco'], ['Pintura fachada', 'Mantenimiento', 3200, 'Ferretería El Progreso']];
  for (let k = 0; k < 18; k++) {
    const [desc, cat, monto, prov] = pick(GASTOS);
    const d = dia(-ri(0, 45)); d.setHours(ri(9, 18), ri(0, 59), 0, 0);
    insG.run(desc, cat, Math.round(monto * (0.9 + rnd() * 0.2)), ts(d), prov && rnd() < 0.6 ? `B01${String(ri(1, 99999999)).padStart(8, '0')}` : null, prov, pick(['efectivo', 'transferencia']), adminId, null);
  }
  // Un gasto de hoy pagado desde la caja
  const dg = new Date(); dg.setHours(10, 20, 0, 0);
  insG.run('Hielo para neveras', 'Insumos', 350, ts(dg), null, 'Hielo Express', 'efectivo', cajeroId, cajaHoyId);

  // Caja de hoy: total en caja = RD$ 12,450.00 (efectivo del día + fondo inicial − gastos)
  const efectivo = () => db.prepare("SELECT COALESCE(SUM(total),0) t FROM facturas WHERE caja_id = ? AND metodo_pago='efectivo'").get(cajaHoyId).t;
  while (efectivo() > 12450 + 350 - 800) { // deja un fondo inicial de al menos RD$ 800
    const f = db.prepare("SELECT id, total FROM facturas WHERE caja_id = ? AND metodo_pago='efectivo' ORDER BY total DESC LIMIT 1").get(cajaHoyId);
    db.prepare("UPDATE facturas SET metodo_pago='tarjeta', monto_recibido=total, cambio=0 WHERE id = ?").run(f.id);
  }
  const inicial = +(12450 - efectivo() + 350).toFixed(2);
  db.prepare('UPDATE caja_sesiones SET monto_inicial = ? WHERE id = ?').run(inicial, cajaHoyId);
  const hm = new Date(); hm.setHours(9, 15, 0, 0);
  db.prepare('INSERT INTO caja_movimientos(caja_id,tipo,monto,concepto,fecha,usuario_id) VALUES(?,?,?,?,?,?)').run(cajaHoyId, 'entrada', 0, 'Apertura de caja', ts(hm), cajeroId);
  db.prepare('DELETE FROM caja_movimientos WHERE monto = 0').run();

  const res = db.prepare("SELECT COUNT(*) n, SUM(total) t FROM facturas WHERE date(fecha) = date('now','localtime')").get();
  console.log(`Listo: ${productos.length} productos, ${clientes.length} clientes, ${numero} facturas. Hoy: ${res.n} facturas / RD$ ${res.t.toFixed(2)}. Caja abierta con RD$ ${inicial}.`);
}

if (require.main === module) run();
module.exports = { run };
