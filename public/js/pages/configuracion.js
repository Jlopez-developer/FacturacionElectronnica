/* Configuración: negocio, DGII, comprobantes, impresión */
window.Pages = window.Pages || {};
window.Pages.configuracion = {
  async render(root) {
    const { esc, num, toast, fecha } = ui;
    const admin = window.APP.user.rol === 'administrador';
    let cfg = await api.get('/api/configuracion');
    const st = { tab: 'negocio' };
    root.innerHTML = `<div class="row between mb"><div class="row"><a class="btn btn-primary" href="#/asistente">${icon('zap', 16)} Asistente de puesta en marcha</a><span class="small muted">Guía paso a paso: negocio, DGII, certificado, secuencias, impresión y usuarios.</span></div><span id="cfg-estado"></span></div><div class="tabs"><button class="active" data-t="negocio">Negocio</button><button data-t="dgii">DGII / Facturación electrónica</button><button data-t="secuencias">Secuencias e-NCF</button><button data-t="impresion">Impresión y caja</button></div><div id="cfg"></div>`;
    root.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { root.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b)); st.tab = b.dataset.t; draw(); }));
    const $ = (s) => root.querySelector(s);
    api.get('/api/configuracion/estado').then((e) => { $('#cfg-estado').innerHTML = e.listo ? `<span class="badge green">${icon('check', 12)} Sistema listo (${e.listos}/${e.total})</span>` : `<span class="badge orange">${icon('alert-circle', 12)} ${e.listos}/${e.total} pasos completos</span>`; }).catch(() => {});
    const inp = (name, label, opts = {}) => `<label class="field ${opts.full ? 'full' : ''}">${label}${opts.type === 'select' ? `<select class="input" name="${name}" ${admin ? '' : 'disabled'}>${opts.options.map((o) => `<option value="${esc(o[0])}" ${String(cfg[name]) === String(o[0]) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>` : opts.type === 'checkbox' ? `<span class="check"><input type="checkbox" name="${name}" ${cfg[name] === '1' ? 'checked' : ''} ${admin ? '' : 'disabled'}> ${esc(opts.text || '')}</span>` : `<input class="input" name="${name}" type="${opts.type || 'text'}" value="${esc(cfg[name] ?? '')}" placeholder="${esc(opts.placeholder || '')}" ${admin ? '' : 'disabled'}>`}${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}</label>`;
    const guardarBtn = () => (admin ? `<div class="row mt" style="justify-content:flex-end"><button class="btn btn-primary" id="guardar">${icon('save', 16)} Guardar cambios</button></div>` : '');
    const guardar = async (form) => {
      const data = {};
      for (const el of form.querySelectorAll('[name]')) data[el.name] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
      await api.put('/api/configuracion', data);
      cfg = await api.get('/api/configuracion'); window.APP_CONFIG = cfg;
      toast('Configuración guardada', 'ok'); draw();
    };

    async function draw() {
      const c = $('#cfg');
      if (st.tab === 'negocio') {
        c.innerHTML = `<div class="card"><div class="card-head"><h3>${icon('store', 20)} Datos del negocio</h3></div><div class="card-body"><form class="form-grid" id="f">
          ${inp('negocio_nombre', 'Nombre comercial')}${inp('negocio_razon_social', 'Razón social (como aparece en la DGII)')}
          ${inp('negocio_rnc', 'RNC del negocio', { placeholder: '123456789', hint: '9 dígitos. Obligatorio para emitir e-CF.' })}${inp('negocio_telefono', 'Teléfono')}
          ${inp('negocio_direccion', 'Dirección', { full: true })}${inp('negocio_email', 'Correo electrónico', { type: 'email' })}${inp('negocio_eslogan', 'Eslogan (pie de página)')}
          ${inp('moneda', 'Símbolo de moneda')}${inp('itbis_defecto', 'ITBIS por defecto para productos nuevos', { type: 'select', options: [['18', '18%'], ['16', '16%'], ['0', 'Exento']] })}
          </form>${guardarBtn()}</div></div>`;
      } else if (st.tab === 'dgii') {
        const cert = cfg.certificado;
        c.innerHTML = `
          <div class="alert info mb">${icon('info', 18)}<div><b>Cómo funciona la facturación electrónica (e-CF):</b> cada factura genera un XML con el formato de la DGII, se firma con su <b>certificado digital</b> y se envía a los servicios web de la DGII, que la acepta o rechaza. Pasos: 1) obtener el certificado digital de una entidad autorizada (Cámara de Comercio, Avansi, etc.), 2) solicitar en la Oficina Virtual los rangos de e-NCF, 3) probar en <b>TesteCF</b>, 4) certificarse en <b>CerteCF</b> (set de pruebas), 5) pasar a <b>eCF</b> (producción).</div></div>
          <div class="grid-2">
            <div class="card"><div class="card-head"><h3>${icon('globe', 20)} Conexión con la DGII</h3></div><div class="card-body"><form class="form-grid" id="f">
              ${inp('dgii_modo', 'Modo de comprobantes', { type: 'select', full: true, options: [['electronico', 'Facturación electrónica (e-CF) — recomendado'], ['tradicional', 'NCF tradicional (B01/B02, sin envío)'], ['ninguno', 'Sin comprobantes fiscales']] })}
              ${inp('dgii_ambiente', 'Ambiente', { type: 'select', full: true, options: [['TesteCF', 'TesteCF — pruebas'], ['CerteCF', 'CerteCF — certificación'], ['eCF', 'eCF — producción']] })}
              ${inp('dgii_envio_automatico', 'Envío', { type: 'checkbox', full: true, text: 'Enviar cada e-CF a la DGII automáticamente al facturar (si falla, se reintenta cada 10 minutos)' })}
              </form>${guardarBtn()}
              <div class="row mt"><button class="btn btn-outline" id="probar" ${admin ? '' : 'disabled'}>${icon('shield-check', 16)} Probar autenticación</button><button class="btn btn-outline" id="servicios">${icon('refresh', 16)} Estado de servicios DGII</button></div><div id="probar-res" class="mt"></div></div></div>
            <div class="card"><div class="card-head"><h3>${icon('key', 20)} Certificado digital</h3></div><div class="card-body">
              ${cert && !cert.error ? `<div class="alert ${cert.vigente ? 'ok' : 'err'}">${icon(cert.vigente ? 'check-circle' : 'alert-circle', 18)}<div><b>${cert.vigente ? 'Certificado cargado' : 'Certificado vencido'}</b><div class="small" style="margin-top:4px;word-break:break-all">${esc(cert.subject)}</div><div class="small">Vence: ${fecha(cert.vence)}</div></div></div>` : cert && cert.error ? `<div class="alert err">${icon('alert-circle', 18)}<div>${esc(cert.error)}</div></div>` : `<div class="alert warn">${icon('alert-triangle', 18)}<div><b>Sin certificado.</b> Los e-CF se generan pero no se pueden firmar ni enviar hasta cargarlo.</div></div>`}
              ${admin ? `<form class="form-grid mt" id="fcert"><label class="field full">Archivo .p12 / .pfx<input class="input" type="file" name="certificado" accept=".p12,.pfx" required style="padding:6px"></label><label class="field full">Contraseña del certificado<input class="input" type="password" name="clave" required></label></form><div class="row mt" style="justify-content:flex-end">${cert ? `<button class="btn btn-outline" id="cert-borrar">${icon('trash', 16)} Quitar</button>` : ''}<button class="btn btn-primary" id="cert-subir">${icon('upload', 16)} Cargar certificado</button></div>` : ''}
            </div></div>
          </div>
          <div class="card mt"><div class="card-head"><h3>${icon('list', 20)} Bitácora de envíos</h3><span class="spacer"></span><button class="btn btn-outline btn-sm" id="log-ref">${icon('refresh', 14)} Actualizar</button></div><div class="table-wrap"><table class="table small"><thead><tr><th>Fecha</th><th>Factura</th><th>Acción</th><th>Detalle</th></tr></thead><tbody id="log"></tbody></table></div></div>`;
        const cargarLog = async () => { const log = await api.get('/api/dgii/log'); $('#log').innerHTML = log.slice(0, 60).map((l) => `<tr><td class="small muted">${ui.fechaHora(l.fecha)}</td><td>${esc(l.numero || '')}<div class="mono small muted">${esc(l.encf || '')}</div></td><td><span class="badge ${l.exito ? 'green' : 'gray'}">${esc(l.accion)}</span></td><td class="small mono" style="word-break:break-all;max-width:520px">${esc((l.detalle || '').slice(0, 220))}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sin registros</td></tr>'; };
        cargarLog(); $('#log-ref').addEventListener('click', cargarLog);
        $('#probar').addEventListener('click', async () => { const r = $('#probar-res'); r.innerHTML = '<span class="muted">Conectando con la DGII…</span>'; try { const x = await api.post('/api/dgii/probar'); r.innerHTML = `<div class="alert ok">${icon('check-circle', 18)}<div>${esc(x.mensaje)}</div></div>`; } catch (e) { r.innerHTML = `<div class="alert err">${icon('alert-circle', 18)}<div>${esc(e.message)}</div></div>`; } });
        $('#servicios').addEventListener('click', async () => { const r = $('#probar-res'); r.innerHTML = '<span class="muted">Consultando…</span>'; const x = await api.get('/api/dgii/estado', { servicios: 1 }); const s = x.servicios || {}; r.innerHTML = s.ok ? `<div class="alert ok">${icon('check-circle', 18)}<div><b>${esc(x.ambiente)}</b>: ${Array.isArray(s.servicios) && s.servicios.length ? s.servicios.map((v) => `${esc(v.servicio || v.nombre || '')}: ${esc(v.estatus || v.estado || '')}`).join(' · ') : esc(s.raw || 'disponible')}</div></div>` : `<div class="alert err">${icon('alert-circle', 18)}<div>No se pudo consultar (${esc(s.error || s.raw || 'sin respuesta')})</div></div>`; });
        if ($('#cert-subir')) $('#cert-subir').addEventListener('click', async () => { const f = $('#fcert'); if (!f.reportValidity()) return; const fd = new FormData(f); try { const r = await api.post('/api/configuracion/certificado', fd); toast(`Certificado cargado. Vence ${fecha(r.vence)}`, 'ok'); cfg = await api.get('/api/configuracion'); draw(); } catch (e) { toast(e.message, 'err', 6000); } });
        if ($('#cert-borrar')) $('#cert-borrar').addEventListener('click', async () => { if (await ui.confirmar('¿Quitar el certificado digital? No se podrán firmar e-CF.', { peligro: true, ok: 'Quitar' })) { await api.del('/api/configuracion/certificado'); cfg = await api.get('/api/configuracion'); draw(); } });
      } else if (st.tab === 'secuencias') {
        c.innerHTML = `<div class="alert info mb">${icon('info', 18)}<div>Registre aquí los rangos de e-NCF autorizados por la DGII (Oficina Virtual → Solicitud de e-NCF). El sistema numera automáticamente y avisa cuando el rango se agota o vence.</div></div>
          <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Tipo</th><th>Descripción</th><th class="num">Desde</th><th class="num">Hasta</th><th class="num">Último usado</th><th class="num">Disponibles</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody>${cfg.secuencias.map((s) => `<tr data-tipo="${s.tipo}"><td><span class="badge ${s.tipo.startsWith('B') ? 'gray' : 'blue'}">${esc(s.tipo)}</span></td><td>${esc(s.descripcion)}</td><td class="num">${num(s.desde)}</td><td class="num">${num(s.hasta)}</td><td class="num">${num(s.actual)}</td><td class="num ${s.disponibles < 100 ? 'red bold' : ''}">${num(s.disponibles)}</td><td class="${s.vence && new Date(s.vence) < new Date() ? 'red' : ''}">${s.vence ? fecha(s.vence + 'T00:00:00') : '—'}</td><td>${s.activo ? '<span class="badge green">Activa</span>' : '<span class="badge gray">Inactiva</span>'}</td><td class="actions">${admin ? `<button class="btn-ghost" data-a="editar">${icon('edit', 16)}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
        c.querySelector('tbody').addEventListener('click', (e) => { const b = e.target.closest('button[data-a]'); if (!b) return; const s = cfg.secuencias.find((x) => x.tipo === b.closest('tr').dataset.tipo); ui.formModal({ title: `Secuencia ${s.tipo} — ${s.descripcion}`, values: s, fields: [{ name: 'desde', label: 'Desde', type: 'number', required: true }, { name: 'hasta', label: 'Hasta', type: 'number', required: true }, { name: 'actual', label: 'Último número usado', type: 'number', hint: 'Normalmente no se modifica' }, { name: 'vence', label: 'Fecha de vencimiento', type: 'date' }, { name: 'activo', label: 'Estado', type: 'checkbox', text: 'Secuencia activa', full: true }], onSubmit: async (d) => { await api.put(`/api/configuracion/secuencias/${s.tipo}`, d); cfg = await api.get('/api/configuracion'); toast('Secuencia actualizada', 'ok'); draw(); } }); });
      } else {
        c.innerHTML = `<div class="card"><div class="card-head"><h3>${icon('printer', 20)} Impresión de tickets y cajón</h3></div><div class="card-body"><form class="form-grid" id="f">
          ${inp('impresora_tipo', 'Impresora', { type: 'select', options: [['navegador', 'Imprimir desde el navegador (USB / compartida)'], ['red', 'Impresora térmica de red (ESC/POS puerto 9100)']] })}${inp('impresora_ancho', 'Ancho del papel', { type: 'select', options: [['80', '80 mm'], ['58', '58 mm'], ['carta', 'Carta']] })}
          ${inp('impresora_ip', 'IP de la impresora (solo red)', { placeholder: '192.168.1.50' })}${inp('impresora_puerto', 'Puerto', { placeholder: '9100' })}
          ${inp('cajon_habilitado', 'Cajón de dinero', { type: 'checkbox', full: true, text: 'Habilitar apertura del cajón (pulso ESC/POS a la impresora)' })}
          ${inp('ticket_pie', 'Mensaje al pie del ticket', { full: true })}
          </form>${guardarBtn()}</div></div>`;
      }
      if ($('#guardar')) $('#guardar').addEventListener('click', () => guardar($('#f')).catch((e) => toast(e.message, 'err')));
    }
    await draw();
  },
};
