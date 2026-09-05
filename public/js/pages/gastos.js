/* Gastos */
window.Pages = window.Pages || {};
window.Pages.gastos = {
  async render(root, rest) {
    const { esc, money, num, fechaHora, toast } = ui;
    const st = { q: '', desde: ui.inicioMesIso(), hasta: ui.hoyIso(), categoria: '', page: 1 };
    const admin = ['administrador', 'supervisor'].includes(window.APP.user.rol);
    root.innerHTML = `
      <div class="page-toolbar"><label class="search">${icon('search', 18)}<input id="q" placeholder="Buscar gasto…"></label><input class="input" type="date" id="desde" value="${st.desde}" style="width:auto"><span class="muted">a</span><input class="input" type="date" id="hasta" value="${st.hasta}" style="width:auto"><span class="select-pill"><select id="cat"><option value="">Todas las categorías</option></select>${icon('chevron-down', 14)}</span><span class="spacer"></span><button class="btn btn-primary" id="btn-nuevo">${icon('plus', 16)} Registrar gasto</button></div>
      <div class="kpis" id="kpis"></div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Suplidor</th><th>NCF</th><th>Pago</th><th class="num">Monto</th><th></th></tr></thead><tbody id="tb"></tbody></table></div><div id="pg"></div></div>`;
    const $ = (s) => root.querySelector(s);
    async function cargar() {
      const r = await api.get('/api/gastos', { ...st, limit: 25 });
      const sel = $('#cat'); const cur = sel.value; sel.innerHTML = '<option value="">Todas las categorías</option>' + r.categorias.map((c) => `<option value="${esc(c.categoria)}" ${c.categoria === cur ? 'selected' : ''}>${esc(c.categoria)}</option>`).join('');
      $('#kpis').innerHTML = `<div class="kpi"><div class="k-label">Gastos en el período</div><div class="k-value">${num(r.total)}</div></div><div class="kpi"><div class="k-label">Total gastado</div><div class="k-value red">${money(r.suma)}</div></div>${r.categorias.slice(0, 3).map((c) => `<div class="kpi"><div class="k-label">${esc(c.categoria)} (histórico)</div><div class="k-value">${money(c.total)}</div></div>`).join('')}`;
      $('#tb').innerHTML = r.datos.map((g) => `<tr data-id="${g.id}"><td class="small">${fechaHora(g.fecha)}</td><td><b>${esc(g.descripcion)}</b><div class="small muted">${esc(g.usuario || '')}</div></td><td><span class="badge gray">${esc(g.categoria)}</span></td><td>${esc(g.proveedor || '')}</td><td class="mono">${esc(g.ncf || '')}</td><td>${ui.badgePago(g.metodo_pago)}</td><td class="num bold">${money(g.monto)}</td><td class="actions">${admin ? `<button class="btn-ghost" data-a="editar">${icon('edit', 16)}</button><button class="btn-ghost" data-a="eliminar">${icon('trash', 16)}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No hay gastos en el período</td></tr>';
      $('#tb')._d = r.datos;
      $('#pg').innerHTML = ''; $('#pg').appendChild(ui.pager(r.total, st.page, 25, (p) => { st.page = p; cargar(); }));
    }
    $('#q').addEventListener('input', ui.debounce(() => { st.q = $('#q').value.trim(); st.page = 1; cargar(); }));
    ['desde', 'hasta', 'cat'].forEach((k) => $(`#${k}`).addEventListener('change', () => { st[k === 'cat' ? 'categoria' : k] = $(`#${k}`).value; st.page = 1; cargar(); }));
    $('#btn-nuevo').addEventListener('click', () => this.formulario(null, cargar));
    $('#tb').addEventListener('click', async (e) => { const b = e.target.closest('button[data-a]'); if (!b) return; const g = $('#tb')._d.find((x) => x.id === Number(b.closest('tr').dataset.id)); if (b.dataset.a === 'editar') this.formulario(g, cargar); else if (await ui.confirmar(`¿Eliminar el gasto "${g.descripcion}"?`, { peligro: true, ok: 'Eliminar' })) { await api.del(`/api/gastos/${g.id}`); toast('Gasto eliminado', 'ok'); cargar(); window.refreshCaja(); } });
    await cargar();
    if (rest && rest[0] === 'nuevo') this.formulario(null, cargar);
  },
  formulario(g, done) {
    ui.formModal({ title: g ? 'Editar gasto' : 'Registrar gasto', values: g ? { ...g, fecha: g.fecha.slice(0, 10) } : { fecha: ui.hoyIso(), categoria: 'General', metodo_pago: 'efectivo' }, submit: g ? 'Guardar' : 'Registrar',
      fields: [
        { name: 'descripcion', label: 'Descripción', required: true, full: true, autofocus: true },
        { name: 'monto', label: 'Monto (RD$)', type: 'number', step: '0.01', required: true }, { name: 'fecha', label: 'Fecha', type: 'date', required: true },
        { name: 'categoria', label: 'Categoría', type: 'select', options: ['General', 'Servicios', 'Alquiler', 'Nómina', 'Mantenimiento', 'Insumos', 'Transporte', 'Impuestos', 'Otros'].map((c) => ({ value: c, label: c })) },
        { name: 'metodo_pago', label: 'Forma de pago', type: 'select', options: [{ value: 'efectivo', label: 'Efectivo (se descuenta de la caja abierta)' }, { value: 'transferencia', label: 'Transferencia' }, { value: 'tarjeta', label: 'Tarjeta' }] },
        { name: 'proveedor', label: 'Suplidor / beneficiario' }, { name: 'ncf', label: 'NCF (para reporte 606)', placeholder: 'B0100000001' },
      ],
      onSubmit: async (d) => { d.fecha = `${d.fecha} 12:00:00`; if (g) await api.put(`/api/gastos/${g.id}`, d); else await api.post('/api/gastos', d); ui.toast(g ? 'Gasto actualizado' : 'Gasto registrado', 'ok'); done && done(); window.refreshCaja(); } });
  },
};
