/* Compras a suplidores */
window.Pages = window.Pages || {};
window.Pages.compras = {
  async render(root, rest) {
    const { esc, money, num, fechaHora, toast } = ui;
    const st = { q: '', desde: '', hasta: '', page: 1 };
    const admin = ['administrador', 'supervisor'].includes(window.APP.user.rol);
    root.innerHTML = `
      <div class="page-toolbar"><label class="search">${icon('search', 18)}<input id="q" placeholder="Buscar por número, NCF o suplidor…"></label><input class="input" type="date" id="desde" style="width:auto"><span class="muted">a</span><input class="input" type="date" id="hasta" style="width:auto"><span class="spacer"></span><button class="btn btn-outline" id="btn-prov">${icon('truck', 16)} Suplidores</button><button class="btn btn-primary" id="btn-nueva">${icon('plus', 16)} Nueva compra</button></div>
      <div class="kpis" id="kpis"></div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Número</th><th>Fecha</th><th>Suplidor</th><th>NCF</th><th class="num">Artículos</th><th class="num">Subtotal</th><th class="num">ITBIS</th><th class="num">Total</th><th>Pago</th><th></th></tr></thead><tbody id="tb"></tbody></table></div><div id="pg"></div></div>`;
    const $ = (s) => root.querySelector(s);
    async function cargar() {
      const r = await api.get('/api/compras', { ...st, limit: 25 });
      $('#kpis').innerHTML = `<div class="kpi"><div class="k-label">Compras</div><div class="k-value">${num(r.total)}</div></div><div class="kpi"><div class="k-label">Total comprado</div><div class="k-value">${money(r.suma)}</div></div>`;
      $('#tb').innerHTML = r.datos.map((c) => `<tr data-id="${c.id}"><td><b>${esc(c.numero)}</b></td><td class="small">${fechaHora(c.fecha)}</td><td>${esc(c.proveedor || '—')}</td><td class="mono">${esc(c.ncf || '')}</td><td class="num">${c.articulos}</td><td class="num">${money(c.subtotal)}</td><td class="num">${money(c.itbis)}</td><td class="num bold">${money(c.total)}</td><td>${ui.badgePago(c.metodo_pago)}</td><td class="actions"><button class="btn-ghost" data-a="ver">${icon('eye', 16)}</button>${admin ? `<button class="btn-ghost" data-a="eliminar" title="Eliminar (revierte inventario)">${icon('trash', 16)}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">No hay compras registradas</td></tr>';
      $('#pg').innerHTML = ''; $('#pg').appendChild(ui.pager(r.total, st.page, 25, (p) => { st.page = p; cargar(); }));
    }
    $('#q').addEventListener('input', ui.debounce(() => { st.q = $('#q').value.trim(); st.page = 1; cargar(); }));
    ['desde', 'hasta'].forEach((k) => $(`#${k}`).addEventListener('change', () => { st[k] = $(`#${k}`).value; cargar(); }));
    $('#btn-nueva').addEventListener('click', () => this.nueva(cargar));
    $('#btn-prov').addEventListener('click', () => this.proveedores());
    $('#tb').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-a]'); if (!b) return; const id = Number(b.closest('tr').dataset.id);
      if (b.dataset.a === 'ver') { const c = await api.get(`/api/compras/${id}`); ui.modal({ title: `Compra ${c.numero}`, size: 'lg', footer: '<button class="btn btn-primary" data-close>Cerrar</button>', body: `<dl class="dl"><dt>Suplidor</dt><dd>${esc(c.proveedor || '—')}</dd><dt>NCF</dt><dd class="mono">${esc(c.ncf || '—')}</dd><dt>Fecha</dt><dd>${fechaHora(c.fecha)}</dd><dt>Pago</dt><dd>${ui.badgePago(c.metodo_pago)}</dd>${c.notas ? `<dt>Notas</dt><dd>${esc(c.notas)}</dd>` : ''}</dl><table class="table mt"><thead><tr><th>Artículo</th><th class="num">Cant.</th><th class="num">Costo</th><th class="num">ITBIS</th><th class="num">Total</th></tr></thead><tbody>${c.items.map((i) => `<tr><td>${esc(i.nombre)}</td><td class="num">${num(i.cantidad, 2)}</td><td class="num">${money(i.costo)}</td><td class="num">${i.itbis_tasa}%</td><td class="num">${money(i.total)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="4" class="right bold">Total</td><td class="num bold">${money(c.total)}</td></tr></tfoot></table>` }); }
      if (b.dataset.a === 'eliminar' && await ui.confirmar('¿Eliminar esta compra? Se restará del inventario lo que había sumado.', { peligro: true, ok: 'Eliminar' })) { await api.del(`/api/compras/${id}`); toast('Compra eliminada', 'ok'); cargar(); }
    });
    await cargar();
    if (rest && rest[0] === 'nueva') this.nueva(cargar);
  },
  async nueva(done) {
    const { esc, money, toast } = ui;
    const provs = await api.get('/api/proveedores');
    const items = [];
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-grid">
        <label class="field">Suplidor<select class="input" id="c-prov"><option value="">Sin suplidor</option>${provs.map((p) => `<option value="${p.id}">${esc(p.nombre)}${p.rnc ? ` (${esc(p.rnc)})` : ''}</option>`).join('')}</select></label>
        <label class="field">NCF del suplidor<input class="input" id="c-ncf" placeholder="B0100000001 / E310000000001"></label>
        <label class="field">Fecha<input class="input" type="date" id="c-fecha" value="${ui.hoyIso()}"></label>
        <label class="field">Forma de pago<select class="input" id="c-pago"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="credito">Crédito</option></select></label>
        <label class="check full"><input type="checkbox" id="c-caja"> Descontar de la caja abierta (solo efectivo)</label>
      </div>
      <div class="rel mt"><label class="search" style="width:100%">${icon('search', 18)}<input id="c-q" placeholder="Buscar producto para agregar…" autocomplete="off"></label><div class="suggest" id="c-sug" hidden></div></div>
      <table class="table mt"><thead><tr><th>Producto</th><th style="width:90px">Cant.</th><th style="width:110px">Costo</th><th class="num">Total</th><th></th></tr></thead><tbody id="c-items"><tr><td colspan="5" class="empty">Agregue productos</td></tr></tbody></table>
      <div class="totals right" id="c-tot"></div>`;
    const m = ui.modal({ title: 'Nueva compra', size: 'lg', body, footer: `<button class="btn btn-outline" data-close>Cancelar</button><button class="btn btn-primary" id="c-guardar">${icon('save', 16)} Registrar compra</button>` });
    const $ = (s) => body.querySelector(s);
    const render = () => {
      $('#c-items').innerHTML = items.map((i, k) => `<tr><td>${esc(i.nombre)}<div class="small muted">Costo actual ${money(i.costo_actual)} · ITBIS ${i.itbis}%</div></td><td><input class="input" type="number" step="0.01" min="0.01" value="${i.cantidad}" data-k="${k}" data-f="cantidad"></td><td><input class="input" type="number" step="0.01" min="0" value="${i.costo}" data-k="${k}" data-f="costo"></td><td class="num">${money(i.cantidad * i.costo)}</td><td class="actions"><button class="btn-ghost" data-del="${k}">${icon('x', 16)}</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Agregue productos</td></tr>';
      let sub = 0, itb = 0; for (const i of items) { const mm = i.cantidad * i.costo; sub += mm; itb += mm * i.itbis / 100; }
      $('#c-tot').innerHTML = `<div class="tr"><span>Subtotal</span><span>${money(sub)}</span></div><div class="tr"><span>ITBIS</span><span>${money(itb)}</span></div><div class="tr big"><span>Total</span><span>${money(sub + itb)}</span></div>`;
    };
    $('#c-items').addEventListener('input', (e) => { const i = e.target; if (!i.dataset.k) return; items[Number(i.dataset.k)][i.dataset.f] = Number(i.value) || 0; render(); i.focus(); });
    $('#c-items').addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) { items.splice(Number(b.dataset.del), 1); render(); } });
    const sug = $('#c-sug');
    $('#c-q').addEventListener('input', ui.debounce(async () => { const q = $('#c-q').value.trim(); if (!q) { sug.hidden = true; return; } const r = await api.get('/api/productos/buscar', { q }); sug._d = r; sug.innerHTML = r.map((p) => `<button data-id="${p.id}"><span>${esc(p.nombre)}</span><span class="muted">Stock ${p.stock} · ${money(p.costo)}</span></button>`).join('') || '<button disabled>Sin resultados</button>'; sug.hidden = false; }, 200));
    sug.addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (!b) return; const p = sug._d.find((x) => x.id === Number(b.dataset.id)); const ex = items.find((i) => i.producto_id === p.id); if (ex) ex.cantidad += 1; else items.push({ producto_id: p.id, nombre: p.nombre, cantidad: 1, costo: p.costo || 0, costo_actual: p.costo, itbis: p.itbis }); sug.hidden = true; $('#c-q').value = ''; render(); });
    m.foot.querySelector('#c-guardar').addEventListener('click', async () => {
      if (!items.length) return toast('Agregue al menos un producto', 'warn');
      try { await api.post('/api/compras', { proveedor_id: $('#c-prov').value || null, ncf: $('#c-ncf').value.trim() || null, fecha: `${$('#c-fecha').value} 12:00:00`, metodo_pago: $('#c-pago').value, pagar_desde_caja: $('#c-caja').checked, items: items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad, costo: i.costo, itbis_tasa: i.itbis })) }); toast('Compra registrada e inventario actualizado', 'ok'); m.close(); done && done(); window.refreshCaja(); } catch (e) { toast(e.message, 'err'); }
    });
    render();
  },
  async proveedores() {
    const { esc } = ui;
    const body = document.createElement('div');
    const render = async () => { const provs = await api.get('/api/proveedores'); body.innerHTML = `<table class="table"><thead><tr><th>Suplidor</th><th>RNC</th><th>Teléfono</th><th></th></tr></thead><tbody>${provs.map((p) => `<tr data-id="${p.id}"><td>${esc(p.nombre)}</td><td class="mono">${esc(p.rnc || '')}</td><td>${esc(p.telefono || '')}</td><td class="actions"><button class="btn-ghost" data-a="editar">${icon('edit', 16)}</button><button class="btn-ghost" data-a="eliminar">${icon('trash', 16)}</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sin suplidores</td></tr>'}</tbody></table>`; body._d = provs; };
    await render();
    const m = ui.modal({ title: 'Suplidores', body, footer: `<button class="btn btn-outline" data-close>Cerrar</button><button class="btn btn-primary" id="p-nuevo">${icon('plus', 16)} Nuevo suplidor</button>` });
    const form = (p) => ui.formModal({ title: p ? 'Editar suplidor' : 'Nuevo suplidor', values: p || {}, fields: [{ name: 'nombre', label: 'Nombre', required: true, full: true, autofocus: true }, { name: 'rnc', label: 'RNC' }, { name: 'telefono', label: 'Teléfono' }, { name: 'direccion', label: 'Dirección', full: true }], onSubmit: async (d) => { if (p) await api.put(`/api/proveedores/${p.id}`, d); else await api.post('/api/proveedores', d); render(); } });
    m.foot.querySelector('#p-nuevo').addEventListener('click', () => form(null));
    body.addEventListener('click', async (e) => { const b = e.target.closest('button[data-a]'); if (!b) return; const p = body._d.find((x) => x.id === Number(b.closest('tr').dataset.id)); if (b.dataset.a === 'editar') form(p); else if (await ui.confirmar(`¿Eliminar el suplidor "${p.nombre}"?`, { peligro: true, ok: 'Eliminar' })) { await api.del(`/api/proveedores/${p.id}`); render(); } });
  },
};
