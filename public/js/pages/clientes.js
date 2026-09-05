/* Clientes */
window.Pages = window.Pages || {};
window.Pages.clientes = {
  async render(root) {
    const { esc, money, num, toast } = ui;
    const st = { q: '', page: 1 };
    const admin = ['administrador', 'supervisor'].includes(window.APP.user.rol);
    root.innerHTML = `
      <div class="page-toolbar"><label class="search">${icon('search', 18)}<input id="q" placeholder="Buscar por nombre, RNC/cédula o teléfono…"></label><span class="spacer"></span><button class="btn btn-primary" id="btn-nuevo">${icon('plus', 16)} Nuevo cliente</button></div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Identificación</th><th>Teléfono</th><th>Dirección</th><th class="num">Compras</th><th class="num">Total comprado</th><th></th></tr></thead><tbody id="tb"></tbody></table></div><div id="pg"></div></div>`;
    const $ = (s) => root.querySelector(s);
    async function cargar() {
      const r = await api.get('/api/clientes', { q: st.q, page: st.page, limit: 25 });
      $('#tb').innerHTML = r.datos.map((c) => `<tr data-id="${c.id}"><td><b>${esc(c.nombre)}</b>${c.email ? `<div class="small muted">${esc(c.email)}</div>` : ''}</td><td>${c.identificacion ? `<span class="badge ${c.tipo_id === 'RNC' ? 'blue' : 'gray'}">${esc(c.tipo_id)}</span> <span class="mono">${esc(c.identificacion)}</span>` : '<span class="muted">—</span>'}</td><td>${esc(c.telefono || '')}</td><td class="muted">${esc(c.direccion || '')}</td><td class="num">${num(c.compras)}</td><td class="num">${money(c.total_comprado)}</td><td class="actions"><a class="btn-ghost btn" href="#/ventas?cliente_id=${c.id}" title="Ver facturas">${icon('file-text', 16)}</a><button class="btn-ghost" data-a="editar" title="Editar">${icon('edit', 16)}</button>${admin ? `<button class="btn-ghost" data-a="eliminar" title="Desactivar">${icon('trash', 16)}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No hay clientes</td></tr>';
      $('#pg').innerHTML = ''; $('#pg').appendChild(ui.pager(r.total, r.page, r.limit, (p) => { st.page = p; cargar(); }));
      $('#tb')._datos = r.datos;
    }
    $('#q').addEventListener('input', ui.debounce(() => { st.q = $('#q').value.trim(); st.page = 1; cargar(); }));
    $('#btn-nuevo').addEventListener('click', () => this.formulario(null, cargar));
    $('#tb').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const c = $('#tb')._datos.find((x) => x.id === Number(b.closest('tr').dataset.id));
      if (b.dataset.a === 'editar') this.formulario(c, cargar);
      if (b.dataset.a === 'eliminar' && await ui.confirmar(`¿Desactivar al cliente "${c.nombre}"?`, { peligro: true, ok: 'Desactivar' })) { await api.del(`/api/clientes/${c.id}`); toast('Cliente desactivado', 'ok'); cargar(); }
    });
    await cargar();
  },
  formulario(c, done) {
    const m = ui.formModal({ title: c ? 'Editar cliente' : 'Nuevo cliente', values: c || {}, submit: c ? 'Guardar cambios' : 'Crear cliente',
      fields: [
        { name: 'nombre', label: 'Nombre / Razón social', required: true, full: true, autofocus: true },
        { name: 'identificacion', label: 'RNC o Cédula', hint: 'Requerido para Crédito Fiscal (RNC 9 dígitos, cédula 11)' }, { name: 'telefono', label: 'Teléfono' },
        { name: 'email', label: 'Correo', type: 'email' }, { name: 'direccion', label: 'Dirección' },
      ],
      onSubmit: async (d) => { const r = c ? await api.put(`/api/clientes/${c.id}`, d) : await api.post('/api/clientes', d); ui.toast(c ? 'Cliente actualizado' : 'Cliente creado', 'ok'); done && done(r); } });
    const inp = m.body.querySelector('[name=identificacion]');
    inp.addEventListener('blur', async () => { const v = inp.value.trim(); if (!v) return; const r = await api.get('/api/clientes/validar', { id: v }); inp.style.borderColor = r.valido ? '#22c55e' : '#ef4444'; inp.title = r.valido ? `${r.tipo} válido` : 'Identificación inválida'; });
  },
};
