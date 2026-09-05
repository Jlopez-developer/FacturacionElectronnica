/* Ventas: listado de facturas y estado DGII */
window.Pages = window.Pages || {};
window.Pages.ventas = {
  async render(root, rest) {
    const { esc, money, num, fechaHora, toast } = ui;
    const params = new URLSearchParams((location.hash.split('?')[1] || ''));
    const st = { q: '', desde: ui.inicioMesIso(), hasta: ui.hoyIso(), dgii_estado: '', estado: '', page: 1, cliente_id: params.get('cliente_id') || '' };
    const admin = ['administrador', 'supervisor'].includes(window.APP.user.rol);
    root.innerHTML = `
      <div class="page-toolbar">
        <label class="search">${icon('search', 18)}<input id="q" placeholder="Buscar por número, e-NCF o cliente…"></label>
        <input class="input" type="date" id="desde" value="${st.desde}" style="width:auto"><span class="muted">a</span><input class="input" type="date" id="hasta" value="${st.hasta}" style="width:auto">
        <span class="select-pill"><select id="dgii"><option value="">Estado DGII: todos</option><option value="aceptada">Aceptada</option><option value="aceptada_condicional">Aceptada condicional</option><option value="en_proceso">En proceso</option><option value="pendiente">Pendiente</option><option value="no_enviada">No enviada</option><option value="rechazada">Rechazada</option><option value="error">Error</option></select>${icon('chevron-down', 14)}</span>
        <span class="select-pill"><select id="estado"><option value="">Todas</option><option value="emitida">Emitidas</option><option value="anulada">Anuladas</option></select>${icon('chevron-down', 14)}</span>
        <span class="spacer"></span>
        <button class="btn btn-outline" id="btn-reprocesar" ${admin ? '' : 'hidden'} title="Reintentar envío de e-CF pendientes">${icon('refresh', 16)} Reenviar pendientes</button>
        <a class="btn btn-primary" href="#/facturacion">${icon('plus', 16)} Nueva factura</a>
      </div>
      <div class="kpis" id="kpis"></div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Número</th><th>Comprobante</th><th>Fecha</th><th>Cliente</th><th class="num">Total</th><th>Pago</th><th>DGII</th><th>Estado</th><th></th></tr></thead><tbody id="tb"></tbody></table></div><div id="pg"></div></div>`;
    const $ = (s) => root.querySelector(s);
    async function cargar() {
      const r = await api.get('/api/facturas', { ...st, limit: 25 });
      $('#kpis').innerHTML = `<div class="kpi"><div class="k-label">Facturas en el período</div><div class="k-value">${num(r.total)}</div></div><div class="kpi"><div class="k-label">Total vendido (emitidas)</div><div class="k-value">${money(r.suma)}</div></div>`;
      $('#tb').innerHTML = r.datos.map((f) => `<tr data-id="${f.id}"><td><a href="#/ventas/${f.id}"><b>${esc(f.numero)}</b></a></td><td>${f.encf ? `<span class="mono">${esc(f.encf)}</span><div class="small muted">${esc(tipoNombre(f.tipo_ecf))}</div>` : '<span class="muted">Sin comprobante</span>'}</td><td class="small">${fechaHora(f.fecha)}</td><td>${esc(f.cliente)}${f.cliente_identificacion ? `<div class="small muted mono">${esc(f.cliente_identificacion)}</div>` : ''}</td><td class="num ${['34', 'B04'].includes(f.tipo_ecf) ? 'red' : ''}">${['34', 'B04'].includes(f.tipo_ecf) ? '-' : ''}${money(f.total)}</td><td>${ui.badgePago(f.metodo_pago)}</td><td>${f.tipo_ecf.startsWith('B') || !f.encf ? '<span class="muted small">N/A</span>' : ui.badgeDgii(f.dgii_estado)}</td><td>${f.estado === 'anulada' ? '<span class="badge red">Anulada</span>' : '<span class="badge green">Emitida</span>'}</td><td class="actions"><button class="btn-ghost" data-a="ver" title="Ver">${icon('eye', 16)}</button><button class="btn-ghost" data-a="imprimir" title="Imprimir">${icon('printer', 16)}</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">No hay facturas en el período</td></tr>';
      $('#pg').innerHTML = ''; $('#pg').appendChild(ui.pager(r.total, r.page, r.limit, (p) => { st.page = p; cargar(); }));
    }
    const tipoNombre = (t) => ({ 31: 'Crédito Fiscal e-CF', 32: 'Consumo e-CF', 33: 'Nota de Débito e-CF', 34: 'Nota de Crédito e-CF', B01: 'Crédito Fiscal', B02: 'Consumo', B04: 'Nota de Crédito' }[t] || t);
    $('#q').addEventListener('input', ui.debounce(() => { st.q = $('#q').value.trim(); st.page = 1; cargar(); }));
    ['desde', 'hasta', 'dgii', 'estado'].forEach((k) => $(`#${k}`).addEventListener('change', () => { st[k === 'dgii' ? 'dgii_estado' : k] = $(`#${k}`).value; st.page = 1; cargar(); }));
    $('#btn-reprocesar').addEventListener('click', async () => { const b = $('#btn-reprocesar'); b.disabled = true; try { const r = await api.post('/api/dgii/reprocesar', { limite: 20 }); toast(r.length ? `Procesadas ${r.length} facturas: ${r.filter((x) => String(x.estado).startsWith('aceptada')).length} aceptadas` : 'No hay facturas pendientes', 'ok'); cargar(); } catch (e) { toast(e.message, 'err'); } finally { b.disabled = false; } });
    $('#tb').addEventListener('click', (e) => { const b = e.target.closest('button[data-a]'); if (!b) return; const id = Number(b.closest('tr').dataset.id); if (b.dataset.a === 'ver') this.detalle(id, cargar); else ui.imprimir(id); });
    await cargar();
    if (rest && rest[0] && /^\d+$/.test(rest[0])) this.detalle(Number(rest[0]), cargar);
  },
  async detalle(id, done) {
    const { esc, money, num, fechaHora, toast } = ui;
    const f = await api.get(`/api/facturas/${id}`);
    const admin = ['administrador', 'supervisor'].includes(window.APP.user.rol);
    const electronico = f.encf && !f.tipo_ecf.startsWith('B');
    const body = `
      <div class="grid-2">
        <dl class="dl">
          <dt>Número</dt><dd>${esc(f.numero)} ${f.estado === 'anulada' ? '<span class="badge red">Anulada</span>' : ''}</dd>
          <dt>${electronico ? 'e-NCF' : 'NCF'}</dt><dd class="mono">${esc(f.encf || '—')}</dd>
          <dt>Fecha</dt><dd>${fechaHora(f.fecha)}</dd>
          <dt>Cliente</dt><dd>${esc(f.cliente_nombre || 'Cliente general')} ${f.cliente_identificacion ? `<span class="mono muted">(${esc(f.cliente_identificacion)})</span>` : ''}</dd>
          <dt>Cajero</dt><dd>${esc(f.usuario || '')}</dd>
          <dt>Pago</dt><dd>${ui.badgePago(f.metodo_pago)}</dd>
          ${f.referencia_id ? `<dt>Modifica</dt><dd><a href="#/ventas/${f.referencia_id}">Factura #${f.referencia_id}</a></dd>` : ''}
          ${f.notas_credito.length ? `<dt>Notas de crédito</dt><dd>${f.notas_credito.map((n) => `<a href="#/ventas/${n.id}">${esc(n.numero)}</a> (${esc(n.encf || '')})`).join(', ')}</dd>` : ''}
        </dl>
        <div>
          ${electronico ? `<div class="alert ${f.dgii_estado.startsWith('aceptada') ? 'ok' : ['rechazada', 'error'].includes(f.dgii_estado) ? 'err' : 'warn'}">${icon('shield-check', 18)}<div><b>DGII: </b>${ui.badgeDgii(f.dgii_estado)}<div class="small" style="margin-top:6px">${esc(f.dgii_mensaje || '')}</div>${f.dgii_trackid ? `<div class="small mono">TrackId: ${esc(f.dgii_trackid)}</div>` : ''}${f.codigo_seguridad ? `<div class="small">Código de seguridad: <b class="mono">${esc(f.codigo_seguridad)}</b></div>` : ''}${f.qr_url ? `<div class="small" style="margin-top:4px"><a href="${esc(f.qr_url)}" target="_blank" rel="noopener">${icon('external', 12)} Consultar en la DGII</a></div>` : ''}</div></div>` : `<div class="alert info">${icon('info', 18)}<div>Comprobante ${f.encf ? 'tradicional (no requiere envío electrónico)' : 'no fiscal'}</div></div>`}
        </div>
      </div>
      <table class="table mt"><thead><tr><th>Artículo</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">ITBIS</th><th class="num">Total</th></tr></thead><tbody>${f.items.map((i) => `<tr><td>${esc(i.nombre)}</td><td class="num">${num(i.cantidad, 2)}</td><td class="num">${money(i.precio)}</td><td class="num">${i.itbis_tasa === 0 ? 'E' : money(i.itbis_monto)}</td><td class="num">${money(i.total)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4" class="right">Subtotal</td><td class="num">${money(f.subtotal)}</td></tr><tr><td colspan="4" class="right">ITBIS</td><td class="num">${money(f.itbis)}</td></tr><tr><td colspan="4" class="right bold">Total</td><td class="num bold" style="font-size:16px">${money(f.total)}</td></tr></tfoot></table>
      ${f.log.length ? `<details class="mt"><summary class="muted small">Bitácora DGII (${f.log.length})</summary><table class="table small"><tbody>${f.log.map((l) => `<tr><td class="small muted">${fechaHora(l.fecha)}</td><td><span class="badge ${l.exito ? 'green' : 'gray'}">${esc(l.accion)}</span></td><td class="small mono" style="word-break:break-all">${esc((l.detalle || '').slice(0, 300))}</td></tr>`).join('')}</tbody></table></details>` : ''}
      ${f.xml ? `<details class="mt"><summary class="muted small">XML del e-CF</summary><pre class="xml">${esc(f.xml.replace(/></g, '>\n<'))}</pre></details>` : ''}`;
    const m = ui.modal({ title: `Factura ${f.numero}`, size: 'lg', body, footer: `
      <button class="btn btn-outline" data-close>Cerrar</button>
      ${f.xml ? `<a class="btn btn-outline" href="/api/facturas/${f.id}/xml" target="_blank">${icon('download', 16)} XML</a>` : ''}
      ${electronico && !f.dgii_estado.startsWith('aceptada') && f.estado === 'emitida' ? `<button class="btn btn-outline" id="d-enviar">${icon('send', 16)} ${f.dgii_trackid ? 'Consultar estado' : 'Enviar a DGII'}</button>` : ''}
      ${admin && f.estado === 'emitida' && !['34', 'B04'].includes(f.tipo_ecf) ? `<button class="btn btn-danger" id="d-anular">${icon('x', 16)} Anular</button>` : ''}
      <button class="btn btn-primary" id="d-print">${icon('printer', 16)} Imprimir</button>` });
    m.foot.querySelector('#d-print').addEventListener('click', () => ui.imprimir(f.id));
    const env = m.foot.querySelector('#d-enviar');
    if (env) env.addEventListener('click', async () => { env.disabled = true; try { const r = await api.post(`/api/facturas/${f.id}/enviar`); toast(`DGII: ${r.estado} ${r.mensaje ? '· ' + r.mensaje : ''}`, String(r.estado).startsWith('aceptada') ? 'ok' : 'warn', 6000); m.close(); done && done(); this.detalle(f.id, done); } catch (e) { toast(e.message, 'err'); env.disabled = false; } });
    const an = m.foot.querySelector('#d-anular');
    if (an) an.addEventListener('click', () => ui.formModal({ title: `Anular ${f.numero}`, fields: [{ name: 'motivo', label: 'Motivo de la anulación', type: 'textarea', required: true, full: true, hint: electronico ? 'Se emitirá una Nota de Crédito electrónica (e-CF 34) que referencia esta factura y se devolverá el inventario.' : 'Se emitirá una nota de crédito y se devolverá el inventario.' }], submit: 'Anular factura', onSubmit: async (d) => { const r = await api.post(`/api/facturas/${f.id}/anular`, d); toast(`Factura anulada. Nota de crédito ${r.nota_credito.numero} (${r.nota_credito.encf || 'sin NCF'})`, 'ok', 6000); m.close(); done && done(); window.refreshCaja(); } }));
  },
};
