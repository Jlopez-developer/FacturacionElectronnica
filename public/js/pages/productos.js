/* Productos e inventario */
window.Pages = window.Pages || {};
window.Pages.productos = {
  async render(root, rest) {
    const { esc, money, num, toast } = ui;
    const st = { q: '', cat: '', page: 1, bajo: '', activo: '1' };
    const cats = await api.get('/api/categorias');
    const admin = ['administrador', 'supervisor'].includes(window.APP.user.rol);
    root.innerHTML = `
      <div class="page-toolbar">
        <label class="search">${icon('search', 18)}<input id="q" placeholder="Buscar por nombre o código…"></label>
        <span class="select-pill"><select id="cat"><option value="">Todas las categorías</option>${cats.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select>${icon('chevron-down', 14)}</span>
        <span class="select-pill"><select id="activo"><option value="1">Activos</option><option value="0">Inactivos</option><option value="todos">Todos</option></select>${icon('chevron-down', 14)}</span>
        <button class="btn btn-outline" id="bajo">${icon('alert-triangle', 16)} Bajo stock</button>
        <span class="spacer"></span>
        <button class="btn btn-outline" id="btn-cats" ${admin ? '' : 'hidden'}>${icon('tag', 16)} Categorías</button>
        <button class="btn btn-primary" id="btn-nuevo" ${admin ? '' : 'hidden'}>${icon('plus', 16)} Nuevo producto</button>
      </div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th></th><th>Producto</th><th>Código</th><th>Categoría</th><th class="num">Precio</th><th class="num">Costo</th><th>ITBIS</th><th class="num">Stock</th><th></th></tr></thead><tbody id="tb"></tbody></table></div><div id="pg"></div></div>`;
    const $ = (s) => root.querySelector(s);
    async function cargar() {
      const r = await api.get('/api/productos', { q: st.q, categoria: st.cat, page: st.page, limit: 25, bajo_stock: st.bajo, activo: st.activo });
      $('#tb').innerHTML = r.datos.map((p) => `<tr data-id="${p.id}"><td><span class="thumb-sm">${esc(p.imagen || '📦')}</span></td><td><b>${esc(p.nombre)}</b>${p.activo ? '' : ' <span class="badge gray">Inactivo</span>'}</td><td class="mono">${esc(p.codigo || '')}</td><td>${p.categoria ? `<span class="badge" style="background:${esc(p.categoria_color)}22;color:${esc(p.categoria_color)}">${esc(p.categoria)}</span>` : ''}</td><td class="num">${money(p.precio)}</td><td class="num muted">${money(p.costo)}</td><td>${p.itbis === 0 ? '<span class="badge gray">Exento</span>' : `${p.itbis}%`}</td><td class="num ${p.stock <= p.stock_minimo ? 'red bold' : ''}">${num(p.stock)} ${esc(p.unidad)}</td><td class="actions">${admin ? `<button class="btn-ghost" data-a="ajuste" title="Ajustar stock">${icon('layers', 16)}</button><button class="btn-ghost" data-a="editar" title="Editar">${icon('edit', 16)}</button><button class="btn-ghost" data-a="eliminar" title="Desactivar">${icon('trash', 16)}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No hay productos</td></tr>';
      $('#pg').innerHTML = ''; $('#pg').appendChild(ui.pager(r.total, r.page, r.limit, (p) => { st.page = p; cargar(); }));
    }
    $('#q').addEventListener('input', ui.debounce(() => { st.q = $('#q').value.trim(); st.page = 1; cargar(); }));
    $('#cat').addEventListener('change', () => { st.cat = $('#cat').value; st.page = 1; cargar(); });
    $('#activo').addEventListener('change', () => { st.activo = $('#activo').value; st.page = 1; cargar(); });
    $('#bajo').addEventListener('click', () => { st.bajo = st.bajo ? '' : '1'; $('#bajo').classList.toggle('btn-warning', !!st.bajo); st.page = 1; cargar(); });
    $('#btn-nuevo').addEventListener('click', () => this.formulario(null, cats, cargar));
    $('#btn-cats').addEventListener('click', () => this.categorias(cats, async () => { cats.splice(0, cats.length, ...(await api.get('/api/categorias'))); cargar(); }));
    $('#tb').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const id = Number(b.closest('tr').dataset.id);
      const p = await api.get(`/api/productos/${id}`);
      if (b.dataset.a === 'editar') this.formulario(p, cats, cargar);
      if (b.dataset.a === 'eliminar' && await ui.confirmar(`¿Desactivar "${p.nombre}"? Dejará de aparecer en facturación.`, { peligro: true, ok: 'Desactivar' })) { await api.del(`/api/productos/${id}`); toast('Producto desactivado', 'ok'); cargar(); }
      if (b.dataset.a === 'ajuste') ui.formModal({ title: `Ajustar stock: ${p.nombre}`, fields: [{ name: 'cantidad', label: `Cantidad a sumar (negativo para restar). Stock actual: ${num(p.stock)}`, type: 'number', step: '0.01', required: true, full: true, autofocus: true }], submit: 'Ajustar', onSubmit: async (d) => { await api.post(`/api/productos/${id}/ajuste`, d); toast('Stock ajustado', 'ok'); cargar(); } });
    });
    await cargar();
    if (rest && rest[0] === 'nuevo' && admin) this.formulario(null, cats, cargar);
  },
  formulario(p, cats, done) {
    const cfg = window.APP_CONFIG || {};
    ui.formModal({ title: p ? 'Editar producto' : 'Nuevo producto', size: 'lg', values: p || { itbis: cfg.itbis_defecto || 18, stock_minimo: 5, unidad: 'UND', activo: 1 }, submit: p ? 'Guardar cambios' : 'Crear producto',
      fields: [
        { name: 'nombre', label: 'Nombre', required: true, autofocus: true }, { name: 'codigo', label: 'Código / código de barras', hint: 'Escanee el código de barras aquí' },
        { name: 'categoria_id', label: 'Categoría', type: 'select', options: [{ value: '', label: 'Sin categoría' }, ...cats.map((c) => ({ value: c.id, label: c.nombre }))] }, { name: 'imagen', label: 'Ícono (emoji)', placeholder: '📦' },
        { name: 'precio', label: 'Precio de venta (sin ITBIS)', type: 'number', step: '0.01', required: true }, { name: 'costo', label: 'Costo', type: 'number', step: '0.01' },
        { name: 'itbis', label: 'ITBIS', type: 'select', options: [{ value: 18, label: '18% (tasa general)' }, { value: 16, label: '16% (tasa reducida)' }, { value: 0, label: 'Exento (E)' }] }, { name: 'unidad', label: 'Unidad', type: 'select', options: ['UND', 'LB', 'KG', 'LT', 'GAL', 'PAQ', 'CAJA', 'FUNDA'].map((u) => ({ value: u, label: u })) },
        { name: 'stock', label: 'Stock actual', type: 'number', step: '0.01' }, { name: 'stock_minimo', label: 'Stock mínimo (alerta)', type: 'number', step: '0.01' },
        { name: 'activo', label: 'Estado', type: 'checkbox', text: 'Producto activo (visible en facturación)', full: true },
      ],
      onSubmit: async (d) => { d.categoria_id = d.categoria_id || null; if (p) await api.put(`/api/productos/${p.id}`, d); else await api.post('/api/productos', d); ui.toast(p ? 'Producto actualizado' : 'Producto creado', 'ok'); done && done(); } });
  },
  categorias(cats, done) {
    const body = document.createElement('div');
    const render = () => { body.innerHTML = `<table class="table"><thead><tr><th>Categoría</th><th>Color</th><th class="num">Productos</th><th></th></tr></thead><tbody>${cats.map((c) => `<tr data-id="${c.id}"><td>${ui.esc(c.nombre)}</td><td><span class="badge" style="background:${ui.esc(c.color)}22;color:${ui.esc(c.color)}">${ui.esc(c.color)}</span></td><td class="num">${c.productos}</td><td class="actions"><button class="btn-ghost" data-a="editar">${icon('edit', 16)}</button><button class="btn-ghost" data-a="eliminar">${icon('trash', 16)}</button></td></tr>`).join('')}</tbody></table>`; };
    render();
    const m = ui.modal({ title: 'Categorías', body, footer: `<button class="btn btn-outline" data-close>Cerrar</button><button class="btn btn-primary" id="cat-nueva">${icon('plus', 16)} Nueva categoría</button>` });
    const form = (c) => ui.formModal({ title: c ? 'Editar categoría' : 'Nueva categoría', values: c || { color: '#1e88f5' }, fields: [{ name: 'nombre', label: 'Nombre', required: true, full: true, autofocus: true }, { name: 'color', label: 'Color', type: 'color', full: true }], onSubmit: async (d) => { if (c) await api.put(`/api/categorias/${c.id}`, d); else await api.post('/api/categorias', d); cats.splice(0, cats.length, ...(await api.get('/api/categorias'))); render(); done && done(); } });
    m.foot.querySelector('#cat-nueva').addEventListener('click', () => form(null));
    body.addEventListener('click', async (e) => { const b = e.target.closest('button[data-a]'); if (!b) return; const c = cats.find((x) => x.id === Number(b.closest('tr').dataset.id)); if (b.dataset.a === 'editar') form(c); else if (await ui.confirmar(`¿Eliminar la categoría "${c.nombre}"? Los productos quedarán sin categoría.`, { peligro: true, ok: 'Eliminar' })) { await api.del(`/api/categorias/${c.id}`); cats.splice(0, cats.length, ...(await api.get('/api/categorias'))); render(); done && done(); } });
  },
};
