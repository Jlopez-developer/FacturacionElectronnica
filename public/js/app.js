/* Arranque, navegación y layout */
(function () {
  const { esc, money, hora, toast } = ui;
  const NAV = [
    ['dashboard', 'Dashboard', 'home', 'Resumen general de tu negocio'],
    ['facturacion', 'Facturación', 'file-text', 'Punto de venta y emisión de comprobantes'],
    ['productos', 'Productos', 'box', 'Catálogo e inventario'],
    ['clientes', 'Clientes', 'users', 'Clientes registrados'],
    ['ventas', 'Ventas', 'cart', 'Facturas emitidas y estado en la DGII'],
    ['compras', 'Compras', 'bag', 'Compras a suplidores'],
    ['gastos', 'Gastos', 'wallet', 'Gastos del negocio'],
    ['reportes', 'Reportes', 'bar-chart', 'Reportes de ventas y fiscales'],
    ['caja', 'Caja', 'register', 'Apertura, cierre y movimientos de caja'],
    ['usuarios', 'Usuarios', 'user', 'Usuarios y roles'],
    ['configuracion', 'Configuración', 'settings', 'Negocio, DGII e impresión'],
  ];
  const EXTRA = { asistente: ['Puesta en marcha', 'Configure el sistema y empiece a facturar', 'configuracion'] };
  const ROLES = { administrador: 'Administrador', supervisor: 'Supervisor', cajero: 'Cajero' };
  const state = { user: null, caja: null };
  window.APP = state;

  const $ = (s) => document.querySelector(s);

  function renderNav() {
    $('#nav').innerHTML = NAV.filter(([k]) => !(k === 'usuarios' && state.user.rol === 'cajero')).map(([key, label, ic]) => `<a href="#/${key}" data-page="${key}">${icon(ic, 20)}<span>${label}</span></a>`).join('');
  }
  function setActive(page) {
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
    const ex = EXTRA[page];
    if (ex) document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === ex[2]));
    const n = ex ? [page, ex[0], '', ex[1]] : (NAV.find((x) => x[0] === page) || NAV[0]);
    $('#page-title').textContent = n[1];
    $('#page-subtitle').textContent = n[3];
    document.title = `${n[1]} - Mi Colmado`;
  }

  async function refreshCaja() {
    try { state.caja = await api.get('/api/caja/actual'); } catch { state.caja = null; }
    renderCajaWidget();
  }
  function renderCajaWidget() {
    const c = state.caja;
    const el = $('#caja-widget');
    if (!c) {
      el.innerHTML = `<div class="cw-title cerrada">Caja cerrada <span class="dot"></span></div><div class="cw-desde">Abra la caja para facturar</div><button class="btn" id="btn-abrir-caja">${icon('clock', 16)} Abrir caja</button>`;
      el.querySelector('#btn-abrir-caja').addEventListener('click', () => window.Caja.abrirDialogo().then(refreshCaja));
      return;
    }
    el.innerHTML = `<div class="cw-title">Caja abierta <span class="dot"></span></div>
      <div class="cw-desde">Desde: ${hora(c.apertura)}</div>
      <div class="cw-label">Total en caja</div>
      <div class="cw-total">${money(c.esperado)}</div>
      <button class="btn" id="btn-cerrar-caja">${icon('clock', 16)} Cerrar caja</button>`;
    el.querySelector('#btn-cerrar-caja').addEventListener('click', () => window.Caja.cerrarDialogo(c).then(refreshCaja));
  }
  window.refreshCaja = refreshCaja;

  async function route() {
    const hash = location.hash || '#/dashboard';
    const [, page, ...rest] = hash.split('/');
    const mod = window.Pages && window.Pages[page];
    if (!mod) { location.hash = '#/dashboard'; return; }
    if (page === 'usuarios' && state.user.rol === 'cajero') { toast('Sin permiso para ver usuarios', 'warn'); location.hash = '#/dashboard'; return; }
    setActive(page);
    const content = $('#content');
    content.innerHTML = '<div class="empty">Cargando…</div>';
    try { await mod.render(content, rest); }
    catch (e) { console.error(e); content.innerHTML = `<div class="alert err">${icon('alert-circle', 18)}<div>${esc(e.message)}</div></div>`; }
    window.scrollTo(0, 0);
  }

  async function iniciarApp(user) {
    state.user = user;
    $('#login').hidden = true; $('#app').hidden = false;
    $('#user-name').textContent = user.usuario;
    $('#user-role').textContent = ROLES[user.rol] || user.rol;
    $('#footer-year').textContent = new Date().getFullYear();
    try { window.APP_CONFIG = await api.get('/api/configuracion'); } catch { window.APP_CONFIG = {}; }
    if (window.APP_CONFIG.negocio_nombre) { document.querySelectorAll('.logo-title').forEach((e) => (e.textContent = window.APP_CONFIG.negocio_nombre)); $('#footer').innerHTML = `© ${new Date().getFullYear()} ${esc(window.APP_CONFIG.negocio_nombre)} - Sistema de Facturación Electrónica | ${esc(window.APP_CONFIG.negocio_eslogan || 'Fácil, rápido y seguro.')}`; }
    renderNav();
    await refreshCaja();
    // Primera vez: llevar al administrador al asistente de puesta en marcha
    if (user.rol === 'administrador' && window.APP_CONFIG.config_completada !== '1' && (!location.hash || location.hash === '#/dashboard')) location.hash = '#/asistente';
    route();
  }

  function mostrarLogin() {
    state.user = null;
    $('#app').hidden = true; $('#login').hidden = false;
    setTimeout(() => $('#login-form input[name=usuario]').focus(), 50);
  }

  // ---- Iconos estáticos ----
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon, el.classList.contains('avatar') ? 28 : 18); });
  document.getElementById('btn-menu').innerHTML = icon('menu', 26);

  // ---- Eventos globales ----
  window.addEventListener('hashchange', route);
  window.addEventListener('auth:expired', () => { toast('La sesión expiró, inicie sesión de nuevo', 'warn'); mostrarLogin(); });
  document.getElementById('btn-menu').addEventListener('click', () => { const app = $('#app'); if (window.innerWidth <= 900) app.classList.toggle('open'); else app.classList.toggle('collapsed'); });
  document.getElementById('nav').addEventListener('click', () => $('#app').classList.remove('open'));
  document.getElementById('user-menu').addEventListener('click', (e) => {
    const dd = $('#user-dropdown');
    const btn = e.target.closest('[data-action]');
    if (btn) {
      dd.hidden = true;
      if (btn.dataset.action === 'salir') api.post('/api/auth/logout').finally(() => { api.setToken(null); mostrarLogin(); });
      if (btn.dataset.action === 'clave') ui.formModal({ title: 'Cambiar contraseña', fields: [{ name: 'actual', label: 'Contraseña actual', type: 'password', required: true, full: true }, { name: 'nueva', label: 'Nueva contraseña', type: 'password', required: true, full: true }], onSubmit: async (d) => { await api.post('/api/usuarios/cambiar-clave', d); toast('Contraseña actualizada', 'ok'); } });
      return;
    }
    dd.hidden = !dd.hidden;
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#user-menu')) $('#user-dropdown').hidden = true; });
  document.getElementById('btn-ayuda').addEventListener('click', () => ui.modal({ title: 'Ayuda', size: 'lg', footer: '<button class="btn btn-primary" data-close>Entendido</button>', body: `
    <div class="dl" style="gap:10px 20px">
      <dt>Facturar</dt><dd>Vaya a <b>Facturación</b>, busque productos (nombre o código de barras), elija el cliente y el tipo de comprobante y presione <b>Cobrar</b>. El e-CF se firma y se envía a la DGII automáticamente.</dd>
      <dt>Crédito fiscal</dt><dd>Para emitir un e-CF tipo 31 el cliente debe tener RNC. Para consumo (tipo 32) puede usar "Cliente general".</dd>
      <dt>DGII</dt><dd>En <b>Configuración → DGII</b> cargue su certificado digital (.p12), el RNC y los rangos de e-NCF autorizados. Use el ambiente <b>TesteCF</b> para pruebas, <b>CerteCF</b> para certificarse y <b>eCF</b> en producción.</dd>
      <dt>Anular</dt><dd>En <b>Ventas</b>, "Anular" emite una Nota de Crédito electrónica (tipo 34) que referencia la factura original.</dd>
      <dt>Reportes</dt><dd>Exporte los formatos <b>606</b> (compras) y <b>607</b> (ventas) desde <b>Reportes</b>.</dd>
      <dt>Caja</dt><dd>Abra la caja al iniciar el día y ciérrela al terminar; el sistema calcula el efectivo esperado.</dd>
      <dt>Atajos</dt><dd>En Facturación: <b>F2</b> buscar producto, <b>F4</b> cobrar, <b>Esc</b> limpiar.</dd>
    </div>` }));

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const err = $('#login-error'); err.hidden = true;
    const btn = f.querySelector('button'); btn.disabled = true;
    try {
      const r = await api.post('/api/auth/login', { usuario: f.usuario.value, clave: f.clave.value });
      api.setToken(r.token); f.reset();
      iniciarApp(r.usuario);
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    finally { btn.disabled = false; }
  });

  // ---- Inicio ----
  (async () => {
    if (api.getToken()) {
      try { const u = await api.get('/api/auth/me', null, { silent: true }); return iniciarApp(u); } catch { api.setToken(null); }
    }
    mostrarLogin();
  })();
})();
