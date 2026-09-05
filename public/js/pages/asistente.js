/* Asistente de puesta en marcha: deja el sistema listo para facturar */
window.Pages = window.Pages || {};
window.Pages.asistente = {
  async render(root, rest) {
    const { esc, toast, fecha, num } = ui;
    const admin = window.APP.user.rol === 'administrador';
    if (!admin) { root.innerHTML = `<div class="alert warn">${icon('alert-triangle', 18)}<div>Solo un administrador puede ejecutar la configuración inicial.</div></div>`; return; }
    let cfg = await api.get('/api/configuracion');
    let estado = await api.get('/api/configuracion/estado');
    const PASOS = [
      { id: 'negocio', titulo: 'Negocio', icono: 'store' },
      { id: 'dgii', titulo: 'DGII', icono: 'shield-check' },
      { id: 'secuencias', titulo: 'Comprobantes', icono: 'receipt' },
      { id: 'impresion', titulo: 'Impresión', icono: 'printer' },
      { id: 'usuarios', titulo: 'Usuarios', icono: 'users' },
      { id: 'final', titulo: 'Listo', icono: 'check-circle' },
    ];
    let paso = rest && rest[0] ? Math.max(0, PASOS.findIndex((p) => p.id === rest[0])) : Math.min(estado.paso_actual, PASOS.length - 1);
    if (paso < 0) paso = 0;

    const refrescar = async () => { cfg = await api.get('/api/configuracion'); estado = await api.get('/api/configuracion/estado'); window.APP_CONFIG = cfg; };
    const guardar = async (data) => { const r = await api.put('/api/configuracion', data); await refrescar(); return r; };
    const inp = (name, label, o = {}) => `<label class="field ${o.full ? 'full' : ''}">${label}${o.type === 'select' ? `<select class="input" name="${name}">${o.options.map((x) => `<option value="${esc(x[0])}" ${String(cfg[name] ?? '') === String(x[0]) ? 'selected' : ''}>${esc(x[1])}</option>`).join('')}</select>` : o.type === 'checkbox' ? `<span class="check"><input type="checkbox" name="${name}" ${cfg[name] === '1' ? 'checked' : ''}> ${esc(o.text || '')}</span>` : `<input class="input" name="${name}" type="${o.type || 'text'}" value="${esc(cfg[name] ?? '')}" placeholder="${esc(o.placeholder || '')}" ${o.required ? 'required' : ''} ${o.maxlength ? `maxlength="${o.maxlength}"` : ''}>`}${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</label>`;
    const leerForm = (form) => { const d = {}; for (const el of form.querySelectorAll('[name]')) d[el.name] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value.trim(); return d; };
    const okBadge = (ok) => (ok ? `<span class="badge green">${icon('check', 12)} Listo</span>` : `<span class="badge orange">${icon('alert-circle', 12)} Pendiente</span>`);

    function stepper() {
      return `<div class="wizard-steps">${PASOS.map((p, i) => { const st = estado.pasos.find((x) => x.id === p.id); const done = st ? st.ok : estado.listo; return `<button class="wstep ${i === paso ? 'active' : ''} ${done ? 'done' : ''}" data-i="${i}"><span class="wnum">${done ? icon('check', 14) : i + 1}</span><span>${esc(p.titulo)}</span></button>${i < PASOS.length - 1 ? '<span class="wline"></span>' : ''}`; }).join('')}</div>`;
    }
    function nav(extra = '') {
      return `<div class="wizard-nav"><button class="btn btn-outline" id="w-prev" ${paso === 0 ? 'disabled' : ''}>${icon('chevron-left', 16)} Anterior</button><span class="spacer"></span>${extra}${paso < PASOS.length - 1 ? `<button class="btn btn-primary" id="w-next">Guardar y continuar ${icon('chevron-right', 16)}</button>` : ''}</div>`;
    }

    async function draw() {
      const p = PASOS[paso];
      const st = estado.pasos.find((x) => x.id === p.id);
      let body = '';
      if (p.id === 'negocio') {
        body = `<h2>Datos del negocio</h2><p class="muted">Estos datos aparecen en cada factura y en el XML que se envía a la DGII. Deben coincidir con el registro del contribuyente.</p>
          <form class="form-grid" id="f">
            ${inp('negocio_rnc', 'RNC del contribuyente', { required: true, placeholder: '123456789', maxlength: 11, hint: '9 dígitos. Se valida el dígito verificador.' })}
            ${inp('negocio_razon_social', 'Razón social (nombre registrado en la DGII)', { required: true })}
            ${inp('negocio_nombre', 'Nombre comercial', { required: true, hint: 'Aparece en el ticket y en el sistema' })}
            ${inp('negocio_telefono', 'Teléfono')}
            ${inp('negocio_direccion', 'Dirección del establecimiento', { required: true, full: true })}
            ${inp('negocio_email', 'Correo electrónico', { type: 'email' })}
            ${inp('itbis_defecto', 'ITBIS por defecto', { type: 'select', options: [['18', '18 % (tasa general)'], ['16', '16 %'], ['0', 'Exento']] })}
          </form><div id="w-rnc" class="mt"></div>`;
      } else if (p.id === 'dgii') {
        const cert = cfg.certificado;
        body = `<h2>Conexión con la DGII</h2><p class="muted">Elija cómo emitirá comprobantes, cargue el certificado digital y pruebe la conexión.</p>
          <form class="form-grid" id="f">
            ${inp('dgii_modo', 'Modo de comprobantes', { type: 'select', full: true, options: [['electronico', 'Facturación electrónica (e-CF) — obligatoria según calendario DGII'], ['tradicional', 'NCF tradicional B01/B02 (transición, sin envío electrónico)'], ['ninguno', 'Sin comprobantes fiscales']] })}
            ${inp('dgii_ambiente', 'Ambiente de la DGII', { type: 'select', options: [['TesteCF', 'TesteCF — pruebas (empiece aquí)'], ['CerteCF', 'CerteCF — certificación'], ['eCF', 'eCF — producción']], hint: 'Cambie a eCF solo cuando la DGII le haya certificado.' })}
            ${inp('dgii_envio_automatico', 'Envío automático', { type: 'checkbox', text: 'Firmar y enviar cada factura al momento de emitirla' })}
            <details class="full"><summary class="muted small" style="cursor:pointer">Avanzado: URLs de los servicios (solo si la DGII las cambia)</summary><div class="form-grid mt">
              ${inp('dgii_url_base', 'URL base de servicios e-CF', { placeholder: 'https://ecf.dgii.gov.do/testecf', hint: 'Vacío = URL oficial del ambiente seleccionado' })}
              ${inp('dgii_url_fc', 'URL de recepción de facturas de consumo (RFCE)', { placeholder: 'https://fc.dgii.gov.do/testecf' })}
            </div></details>
          </form>
          <div class="grid-2 mt">
            <div class="card"><div class="card-head"><h3>${icon('key', 18)} Certificado digital (.p12 / .pfx)</h3></div><div class="card-body">
              ${cert && !cert.error ? `<div class="alert ${cert.vigente ? 'ok' : 'err'}">${icon(cert.vigente ? 'check-circle' : 'alert-circle', 18)}<div><b>${cert.vigente ? 'Certificado cargado' : 'Certificado vencido'}</b><div class="small" style="word-break:break-all">${esc(cert.subject)}</div><div class="small">Vence: ${fecha(cert.vence)}</div></div></div>` : cert && cert.error ? `<div class="alert err">${icon('alert-circle', 18)}<div>${esc(cert.error)}</div></div>` : `<div class="alert warn">${icon('alert-triangle', 18)}<div>Aún no hay certificado. Se obtiene de una entidad autorizada por la DGII (Cámara de Comercio de Santo Domingo, Avansi, etc.) a nombre del contribuyente.</div></div>`}
              <form class="form-grid mt" id="fcert"><label class="field full">Archivo del certificado<input class="input" type="file" name="certificado" accept=".p12,.pfx" style="padding:6px"></label><label class="field full">Contraseña del certificado<input class="input" type="password" name="clave" autocomplete="new-password"></label></form>
              <div class="row mt" style="justify-content:flex-end">${cert ? `<button class="btn btn-outline" id="cert-borrar">${icon('trash', 16)} Quitar</button>` : ''}<button class="btn btn-primary" id="cert-subir">${icon('upload', 16)} Cargar certificado</button></div>
            </div></div>
            <div class="card"><div class="card-head"><h3>${icon('globe', 18)} Prueba de conexión</h3></div><div class="card-body">
              <p class="small muted" style="margin-top:0">Solicita una semilla a la DGII, la firma con su certificado y obtiene un token. Si funciona, el sistema está listo para enviar e-CF.</p>
              <div id="prueba-res">${cfg.dgii_ultima_prueba ? `<div class="alert ${cfg.dgii_ultima_prueba_ok === '1' ? 'ok' : 'err'}">${icon(cfg.dgii_ultima_prueba_ok === '1' ? 'check-circle' : 'alert-circle', 18)}<div>${esc(cfg.dgii_ultima_prueba_msg || '')}<div class="small">Última prueba: ${esc(cfg.dgii_ultima_prueba)}</div></div></div>` : '<div class="muted small">Todavía no se ha probado la conexión.</div>'}</div>
              <div class="row mt"><button class="btn btn-primary" id="probar">${icon('shield-check', 16)} Probar conexión con la DGII</button><button class="btn btn-outline" id="servicios">${icon('refresh', 16)} Estado de servicios</button></div>
            </div></div>
          </div>`;
      } else if (p.id === 'secuencias') {
        const modo = cfg.dgii_modo;
        const tipos = modo === 'tradicional' ? ['B01', 'B02', 'B04'] : ['31', '32', '33', '34', '41', '43', '44', '45', '46', '47'];
        const seqs = cfg.secuencias.filter((s) => tipos.includes(s.tipo));
        body = `<h2>Secuencias de comprobantes ${modo === 'tradicional' ? '(NCF)' : '(e-NCF)'}</h2>
          <p class="muted">${modo === 'ninguno' ? 'Ha elegido trabajar sin comprobantes fiscales. Puede continuar.' : 'Registre los rangos autorizados por la DGII (Oficina Virtual → Solicitud de e-NCF). Como mínimo necesita <b>' + (modo === 'tradicional' ? 'B02 (consumo), B01 (crédito fiscal) y B04 (nota de crédito)' : '32 (consumo), 31 (crédito fiscal) y 34 (nota de crédito)') + '</b>. El sistema numera automáticamente y avisa cuando un rango se agota o vence.'}</p>
          ${modo === 'ninguno' ? '' : `<div class="card"><div class="table-wrap"><table class="table" id="tseq"><thead><tr><th>Tipo</th><th>Descripción</th><th style="width:130px">Desde</th><th style="width:150px">Hasta</th><th style="width:120px">Último usado</th><th style="width:160px">Vence</th><th>Activa</th><th class="num">Disponibles</th></tr></thead><tbody>${seqs.map((s) => `<tr data-tipo="${s.tipo}"><td><span class="badge ${['31', '32', '34', 'B01', 'B02', 'B04'].includes(s.tipo) ? 'blue' : 'gray'}">${esc(s.tipo)}</span></td><td>${esc(s.descripcion)}${['31', '32', '34', 'B01', 'B02', 'B04'].includes(s.tipo) ? ' <span class="small muted">(requerida)</span>' : ''}</td><td><input class="input" type="number" min="1" name="desde" value="${s.desde}"></td><td><input class="input" type="number" min="1" name="hasta" value="${s.hasta}"></td><td><input class="input" type="number" min="0" name="actual" value="${s.actual}"></td><td><input class="input" type="date" name="vence" value="${esc(s.vence || '')}"></td><td><input type="checkbox" name="activo" ${s.activo ? 'checked' : ''}></td><td class="num">${num(s.disponibles)}</td></tr>`).join('')}</tbody></table></div></div>
          <p class="small muted mt">Ejemplo: si la DGII le autorizó del E320000000001 al E320000010000, registre <b>Desde 1</b> y <b>Hasta 10000</b> en el tipo 32.</p>`}`;
      } else if (p.id === 'impresion') {
        body = `<h2>Impresión de tickets y cajón de dinero</h2><p class="muted">Configure cómo se imprime la factura para el cliente.</p>
          <form class="form-grid" id="f">
            ${inp('impresora_tipo', 'Impresora', { type: 'select', options: [['navegador', 'Imprimir desde el navegador (impresora USB o compartida de Windows)'], ['red', 'Impresora térmica de red (ESC/POS, puerto 9100)']] })}
            ${inp('impresora_ancho', 'Ancho del papel', { type: 'select', options: [['80', '80 mm (térmica estándar)'], ['58', '58 mm'], ['carta', 'Carta']] })}
            ${inp('impresora_ip', 'IP de la impresora (solo red)', { placeholder: '192.168.1.50' })}
            ${inp('impresora_puerto', 'Puerto', { placeholder: '9100' })}
            ${inp('cajon_habilitado', 'Cajón de dinero', { type: 'checkbox', full: true, text: 'Habilitar apertura del cajón conectado a la impresora' })}
            ${inp('ticket_pie', 'Mensaje al pie del ticket', { full: true })}
            ${inp('moneda', 'Símbolo de moneda')}
          </form>
          <div class="row mt"><button class="btn btn-outline" id="ticket-prueba">${icon('printer', 16)} Ver ticket de ejemplo</button><button class="btn btn-outline" id="cajon-prueba">${icon('printer', 16)} Probar cajón</button></div>`;
      } else if (p.id === 'usuarios') {
        const us = await api.get('/api/usuarios');
        body = `<h2>Usuarios y seguridad</h2><p class="muted">Cambie la contraseña inicial del administrador y cree los usuarios de caja.</p>
          ${st && !st.ok ? `<div class="alert warn mb">${icon('alert-triangle', 18)}<div><b>El usuario admin todavía usa la contraseña inicial (admin123).</b> Cámbiela antes de poner el sistema en producción.</div></div>` : `<div class="alert ok mb">${icon('check-circle', 18)}<div>La contraseña del administrador ya fue cambiada.</div></div>`}
          <div class="grid-2">
            <div class="card"><div class="card-head"><h3>${icon('lock', 18)} Contraseña del administrador</h3></div><div class="card-body"><form class="form-grid" id="fclave"><label class="field full">Nueva contraseña<input class="input" type="password" name="clave" minlength="6" required autocomplete="new-password"></label><label class="field full">Repetir contraseña<input class="input" type="password" name="clave2" minlength="6" required autocomplete="new-password"></label></form><div class="row mt" style="justify-content:flex-end"><button class="btn btn-primary" id="clave-guardar">${icon('save', 16)} Cambiar contraseña</button></div></div></div>
            <div class="card"><div class="card-head"><h3>${icon('users', 18)} Usuarios</h3><span class="spacer"></span><button class="btn btn-outline btn-sm" id="u-nuevo">${icon('plus', 14)} Nuevo cajero</button></div><div class="table-wrap"><table class="table"><tbody>${us.map((u) => `<tr><td class="mono">${esc(u.usuario)}</td><td>${esc(u.nombre)}</td><td><span class="badge ${u.rol === 'administrador' ? 'purple' : u.rol === 'supervisor' ? 'blue' : 'gray'}">${esc(u.rol)}</span></td><td>${u.activo ? '<span class="badge green">Activo</span>' : '<span class="badge red">Inactivo</span>'}</td></tr>`).join('')}</tbody></table></div></div>
          </div>`;
      } else {
        body = `<h2>${estado.listo ? '¡Todo listo para facturar!' : 'Revisión final'}</h2><p class="muted">Este es el estado de la configuración. Puede volver a cualquier paso desde arriba.</p>
          <div class="card"><div class="table-wrap"><table class="table"><tbody>${estado.pasos.map((x) => `<tr><td style="width:36px">${x.ok ? `<span class="wcheck ok">${icon('check', 14)}</span>` : `<span class="wcheck">${icon('x', 14)}</span>`}</td><td><b>${esc(x.titulo)}</b><div class="small muted">${esc(x.detalle)}</div></td><td class="actions"><button class="btn btn-outline btn-sm" data-go="${x.id}">${x.ok ? 'Revisar' : 'Completar'}</button></td></tr>`).join('')}</tbody></table></div></div>
          <div class="alert ${estado.listo ? 'ok' : 'warn'} mt">${icon(estado.listo ? 'check-circle' : 'alert-triangle', 18)}<div>${estado.listo ? `El sistema está configurado en modo <b>${esc(estado.modo === 'electronico' ? 'facturación electrónica' : estado.modo === 'tradicional' ? 'NCF tradicional' : 'sin comprobantes')}</b>${estado.modo === 'electronico' ? ` en el ambiente <b>${esc(estado.ambiente)}</b>` : ''}. Abra la caja y emita su primera factura.` : `Hay ${estado.total - estado.listos} punto(s) pendiente(s). Puede empezar a facturar igualmente: las facturas se emiten y, si falta la firma o la conexión, quedan pendientes de envío a la DGII y se reintentan automáticamente.`}</div></div>
          ${estado.modo === 'electronico' && estado.ambiente !== 'eCF' && estado.listo ? `<div class="alert info mt">${icon('info', 18)}<div><b>Está en el ambiente ${esc(estado.ambiente)}.</b> Los comprobantes emitidos aquí no tienen validez fiscal. Cuando la DGII apruebe su certificación, vuelva al paso DGII y cambie el ambiente a <b>eCF</b>.</div></div>` : ''}`;
      }
      root.innerHTML = `<div class="wizard">
        <div class="wizard-head"><div><h1>Puesta en marcha</h1><p class="muted">Configure el sistema en ${PASOS.length - 1} pasos y empiece a facturar.</p></div><div class="wizard-progress">${okBadge(estado.listo)}<span class="small muted">${estado.listos} de ${estado.total} completos</span></div></div>
        ${stepper()}
        <div class="card wizard-body"><div class="card-body" style="padding-top:20px">${body}</div>${nav(paso === PASOS.length - 1 ? `<a class="btn btn-outline" href="#/dashboard">Ir al dashboard</a><button class="btn btn-success" id="w-finalizar">${icon('check', 16)} Finalizar y empezar a facturar</button>` : `<button class="btn btn-ghost" id="w-skip">Omitir</button>`)}</div>
      </div>`;

      const $ = (s) => root.querySelector(s);
      const irA = async (i) => { paso = Math.max(0, Math.min(PASOS.length - 1, i)); api.put('/api/configuracion/paso', { paso }).catch(() => {}); await refrescar(); draw(); };
      root.querySelectorAll('.wstep').forEach((b) => b.addEventListener('click', () => irA(Number(b.dataset.i))));
      root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => irA(PASOS.findIndex((x) => x.id === b.dataset.go))));
      if ($('#w-prev')) $('#w-prev').addEventListener('click', () => irA(paso - 1));
      if ($('#w-skip')) $('#w-skip').addEventListener('click', () => irA(paso + 1));
      if ($('#w-finalizar')) $('#w-finalizar').addEventListener('click', async () => { await api.post('/api/configuracion/completar', {}); await refrescar(); toast('Configuración finalizada', 'ok'); location.hash = window.APP.caja ? '#/facturacion' : '#/caja'; });

      const guardarPaso = async () => {
        if (p.id === 'secuencias') {
          for (const tr of root.querySelectorAll('#tseq tbody tr')) {
            const g = (n) => tr.querySelector(`[name=${n}]`);
            await api.put(`/api/configuracion/secuencias/${tr.dataset.tipo}`, { desde: Number(g('desde').value), hasta: Number(g('hasta').value), actual: Number(g('actual').value), vence: g('vence').value || null, activo: g('activo').checked ? 1 : 0 });
          }
          return true;
        }
        const f = $('#f');
        if (!f) return true;
        if (!f.reportValidity()) return false;
        await guardar(leerForm(f));
        return true;
      };
      if ($('#w-next')) $('#w-next').addEventListener('click', async () => { try { if (await guardarPaso()) { toast('Guardado', 'ok', 1500); irA(paso + 1); } } catch (e) { toast(e.message, 'err', 6000); } });

      // ---- acciones específicas ----
      if (p.id === 'negocio') {
        const rncEl = $('[name=negocio_rnc]');
        const validar = async () => { const v = rncEl.value.trim(); if (!v) { $('#w-rnc').innerHTML = ''; return; } const r = await api.get('/api/clientes/validar', { id: v }); $('#w-rnc').innerHTML = r.tipo === 'RNC' && r.valido ? `<div class="alert ok">${icon('check-circle', 18)}<div>RNC válido</div></div>` : `<div class="alert err">${icon('alert-circle', 18)}<div>El RNC debe tener 9 dígitos con dígito verificador correcto. Verifíquelo en su Registro Nacional de Contribuyentes.</div></div>`; };
        rncEl.addEventListener('blur', validar); if (rncEl.value) validar();
      }
      if (p.id === 'dgii') {
        $('#cert-subir').addEventListener('click', async () => { const f = $('#fcert'); if (!f.certificado.files.length) return toast('Seleccione el archivo .p12', 'warn'); const b = $('#cert-subir'); b.disabled = true; try { await guardar(leerForm($('#f'))); const r = await api.post('/api/configuracion/certificado', new FormData(f)); toast(`Certificado cargado. Vence ${fecha(r.vence)}`, 'ok'); await refrescar(); draw(); } catch (e) { toast(e.message, 'err', 6000); b.disabled = false; } });
        if ($('#cert-borrar')) $('#cert-borrar').addEventListener('click', async () => { if (await ui.confirmar('¿Quitar el certificado digital?', { peligro: true, ok: 'Quitar' })) { await api.del('/api/configuracion/certificado'); await refrescar(); draw(); } });
        $('#probar').addEventListener('click', async () => { const r = $('#prueba-res'); const b = $('#probar'); b.disabled = true; r.innerHTML = '<span class="muted">Conectando con la DGII…</span>'; try { await guardar(leerForm($('#f'))); const x = await api.post('/api/dgii/probar'); r.innerHTML = `<div class="alert ok">${icon('check-circle', 18)}<div><b>${esc(x.mensaje)}</b><div class="small">${esc(x.fecha)}</div></div></div>`; await refrescar(); root.querySelector('.wizard-steps').outerHTML = stepper(); root.querySelectorAll('.wstep').forEach((s) => s.addEventListener('click', () => irA(Number(s.dataset.i)))); } catch (e) { r.innerHTML = `<div class="alert err">${icon('alert-circle', 18)}<div><b>No se pudo conectar.</b><div class="small">${esc(e.message)}</div><div class="small mt">Revise: certificado y contraseña correctos, RNC registrado en la DGII para e-CF, ambiente adecuado y acceso a internet.</div></div></div>`; } finally { b.disabled = false; } });
        $('#servicios').addEventListener('click', async () => { const r = $('#prueba-res'); r.innerHTML = '<span class="muted">Consultando…</span>'; const x = await api.get('/api/dgii/estado', { servicios: 1 }); const s = x.servicios || {}; r.innerHTML = s.ok ? `<div class="alert ok">${icon('check-circle', 18)}<div><b>${esc(x.ambiente)} disponible</b><div class="small">${Array.isArray(s.servicios) && s.servicios.length ? s.servicios.map((v) => `${esc(v.servicio || v.nombre || '')}: ${esc(v.estatus || v.estado || '')}`).join(' · ') : esc(s.raw || '')}</div></div></div>` : `<div class="alert err">${icon('alert-circle', 18)}<div>No se pudo consultar el estado de servicios (${esc(s.error || s.raw || 'sin respuesta')})</div></div>`; });
      }
      if (p.id === 'impresion') {
        $('#ticket-prueba').addEventListener('click', async () => { await guardar(leerForm($('#f'))); const r = await api.get('/api/facturas', { limit: 1 }); if (!r.datos.length) return toast('Aún no hay facturas para mostrar un ejemplo', 'warn'); ui.imprimir(r.datos[0].id, false); });
        $('#cajon-prueba').addEventListener('click', async () => { try { await guardar(leerForm($('#f'))); const r = await api.post('/api/caja/abrir-cajon'); toast(r.mensaje || 'Pulso enviado al cajón', 'ok'); } catch (e) { toast(e.message, 'err'); } });
      }
      if (p.id === 'usuarios') {
        $('#clave-guardar').addEventListener('click', async () => { const f = $('#fclave'); if (!f.reportValidity()) return; if (f.clave.value !== f.clave2.value) return toast('Las contraseñas no coinciden', 'warn'); await api.put(`/api/usuarios/${window.APP.user.id}`, { clave: f.clave.value }); toast('Contraseña actualizada', 'ok'); await refrescar(); draw(); });
        $('#u-nuevo').addEventListener('click', () => ui.formModal({ title: 'Nuevo usuario', values: { rol: 'cajero' }, fields: [{ name: 'nombre', label: 'Nombre completo', required: true, full: true, autofocus: true }, { name: 'usuario', label: 'Usuario', required: true }, { name: 'clave', label: 'Contraseña', type: 'password', required: true }, { name: 'rol', label: 'Rol', type: 'select', full: true, options: [{ value: 'cajero', label: 'Cajero' }, { value: 'supervisor', label: 'Supervisor' }, { value: 'administrador', label: 'Administrador' }] }], submit: 'Crear', onSubmit: async (d) => { await api.post('/api/usuarios', d); toast('Usuario creado', 'ok'); draw(); } }));
      }
    }
    await draw();
  },
};
