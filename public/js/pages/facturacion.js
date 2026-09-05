/* Punto de venta / emisión de comprobantes */
window.Pages = window.Pages || {};
window.Pages.facturacion = {
  async render(root) {
    const { esc, money, num, toast } = ui;
    const st = { cart: [], cliente: null, metodo: 'efectivo', tipo: 'consumo', cat: '', q: '', productos: [] };
    const cats = await api.get('/api/categorias');
    const cfg = window.APP_CONFIG || {};

    root.innerHTML = `
      <div class="pos">
        <div class="card pos-products">
          <div class="card-head" style="gap:12px">
            <label class="search" style="flex:1;min-width:0">${icon('search', 18)}<input id="pos-q" placeholder="Buscar producto por nombre o código de barras (F2)…" autocomplete="off"></label>
            <button class="btn btn-outline" id="pos-manual" title="Agregar artículo sin catálogo">${icon('plus', 16)} Artículo libre</button>
          </div>
          <div class="cat-chips" id="pos-cats"><button class="chip active" data-cat="">Todos</button>${cats.map((c) => `<button class="chip" data-cat="${c.id}">${esc(c.nombre)}</button>`).join('')}</div>
          <div class="grid" id="pos-grid"></div>
        </div>
        <div class="card cart">
          <div class="card-head"><h3>${icon('cart', 20)} Factura actual</h3><span class="spacer"></span><button class="btn btn-ghost" id="pos-clear" title="Limpiar (Esc)">${icon('trash', 18)}</button></div>
          <div class="cliente-box rel">
            <label class="field">Cliente
              <div class="row" style="flex-wrap:nowrap"><input class="input" id="pos-cliente" placeholder="Cliente general (escriba para buscar)" autocomplete="off"><button class="btn btn-outline" id="pos-nuevo-cliente" title="Nuevo cliente">${icon('plus', 16)}</button></div>
            </label>
            <div class="suggest" id="pos-sug" hidden></div>
            <div class="row mt" style="margin-top:10px;gap:6px">
              <span class="small muted">Comprobante:</span>
              <button class="chip active" data-tipo="consumo">Consumo</button>
              <button class="chip" data-tipo="credito_fiscal">Crédito Fiscal</button>
              <button class="chip" data-tipo="ninguno" ${cfg.dgii_modo === 'ninguno' ? '' : 'hidden'}>Sin comprobante</button>
            </div>
          </div>
          <div class="cart-items" id="pos-items"></div>
          <div class="totals" id="pos-totals"></div>
          <div class="pay-methods" id="pos-pay">
            <button class="active" data-m="efectivo">${icon('banknote', 18)}Efectivo</button>
            <button data-m="tarjeta">${icon('credit-card', 18)}Tarjeta</button>
            <button data-m="transferencia">${icon('arrow-left-right', 18)}Transf.</button>
            <button data-m="credito">${icon('clock', 18)}Crédito</button>
          </div>
          <div class="cart-foot">
            <div class="row" id="pos-efectivo" style="flex-wrap:nowrap"><label class="field" style="flex:1">Recibido<input class="input" id="pos-recibido" type="number" step="0.01" min="0" placeholder="0.00"></label><label class="field" style="flex:1">Cambio<input class="input" id="pos-cambio" readonly value="0.00"></label></div>
            <button class="btn btn-primary btn-lg btn-block" id="pos-cobrar">${icon('check', 20)} Cobrar (F4)</button>
          </div>
        </div>
      </div>`;

    const $ = (s) => root.querySelector(s);
    const grid = $('#pos-grid');

    async function cargarProductos() {
      const r = await api.get('/api/productos', { q: st.q, categoria: st.cat, limit: 120 });
      st.productos = r.datos;
      grid.innerHTML = st.productos.map((p) => `<button class="prod-tile ${p.stock <= 0 ? 'sin-stock' : ''}" data-id="${p.id}"><span class="emoji">${esc(p.imagen || '📦')}</span><span class="pname">${esc(p.nombre)}</span><span class="pprice">${money(p.precio)}</span><span class="pstock">Stock: ${num(p.stock)} ${p.itbis === 0 ? '· Exento' : ''}</span></button>`).join('') || '<div class="empty">No se encontraron productos</div>';
    }
    grid.addEventListener('click', (e) => { const b = e.target.closest('.prod-tile'); if (b) agregar(st.productos.find((p) => p.id === Number(b.dataset.id))); });
    $('#pos-cats').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; root.querySelectorAll('#pos-cats .chip').forEach((c) => c.classList.toggle('active', c === b)); st.cat = b.dataset.cat; cargarProductos(); });
    const buscar = ui.debounce(async () => {
      st.q = $('#pos-q').value.trim();
      if (st.q) { const ex = await api.get('/api/productos/buscar', { q: st.q }); if (ex.length === 1 && ex[0].codigo === st.q) { agregar(ex[0]); $('#pos-q').value = ''; st.q = ''; cargarProductos(); return; } }
      cargarProductos();
    }, 200);
    $('#pos-q').addEventListener('input', buscar);
    $('#pos-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (st.productos.length === 1) { agregar(st.productos[0]); $('#pos-q').value = ''; st.q = ''; cargarProductos(); } } });

    function agregar(p, cantidad = 1) {
      if (!p) return;
      const ex = st.cart.find((i) => i.producto_id === p.id);
      if (ex) ex.cantidad += cantidad; else st.cart.push({ producto_id: p.id, nombre: p.nombre, precio: p.precio, itbis_tasa: p.itbis, cantidad, stock: p.stock, imagen: p.imagen });
      renderCart();
    }
    $('#pos-manual').addEventListener('click', () => ui.formModal({ title: 'Artículo libre', fields: [{ name: 'nombre', label: 'Descripción', required: true, full: true, autofocus: true }, { name: 'precio', label: 'Precio', type: 'number', step: '0.01', required: true }, { name: 'cantidad', label: 'Cantidad', type: 'number', step: '0.01', value: 1, required: true }, { name: 'itbis_tasa', label: 'ITBIS', type: 'select', options: [{ value: 18, label: '18%' }, { value: 16, label: '16%' }, { value: 0, label: 'Exento' }], full: true }], submit: 'Agregar', onSubmit: async (d) => { st.cart.push({ producto_id: null, nombre: d.nombre, precio: d.precio, itbis_tasa: Number(d.itbis_tasa), cantidad: d.cantidad }); renderCart(); } }));

    function totales() {
      let sub = 0, itb = 0;
      for (const i of st.cart) { const m = i.precio * i.cantidad; sub += m; itb += m * (Number(i.itbis_tasa) / 100); }
      return { sub, itb, total: Math.round((sub + itb) * 100) / 100 };
    }
    function renderCart() {
      const items = $('#pos-items');
      items.innerHTML = st.cart.map((i, idx) => `<div class="cart-item"><div><div class="ci-name">${esc(i.nombre)}</div><div class="ci-sub">${money(i.precio)} ${Number(i.itbis_tasa) === 0 ? '· Exento' : `+ ITBIS ${i.itbis_tasa}%`}</div></div><span class="qty"><button data-d="-1" data-i="${idx}">${icon('minus', 12)}</button><input type="number" min="0.01" step="0.01" value="${i.cantidad}" data-i="${idx}"><button data-d="1" data-i="${idx}">${icon('plus', 12)}</button></span><b style="min-width:80px;text-align:right">${money(i.precio * i.cantidad)}</b></div>`).join('') || '<div class="empty" style="padding:24px">Agregue productos a la factura</div>';
      const t = totales();
      $('#pos-totals').innerHTML = `<div class="tr"><span>Subtotal</span><span>${money(t.sub)}</span></div><div class="tr"><span>ITBIS</span><span>${money(t.itb)}</span></div><div class="tr big"><span>Total</span><span>${money(t.total)}</span></div>`;
      calcCambio();
      $('#pos-cobrar').disabled = !st.cart.length;
    }
    $('#pos-items').addEventListener('click', (e) => { const b = e.target.closest('button[data-d]'); if (!b) return; const i = st.cart[Number(b.dataset.i)]; i.cantidad = Math.round((i.cantidad + Number(b.dataset.d)) * 100) / 100; if (i.cantidad <= 0) st.cart.splice(Number(b.dataset.i), 1); renderCart(); });
    $('#pos-items').addEventListener('change', (e) => { const inp = e.target.closest('input[data-i]'); if (!inp) return; const i = st.cart[Number(inp.dataset.i)]; i.cantidad = Number(inp.value) || 0; if (i.cantidad <= 0) st.cart.splice(Number(inp.dataset.i), 1); renderCart(); });
    $('#pos-clear').addEventListener('click', () => { st.cart = []; renderCart(); });

    function calcCambio() { const t = totales(); const r = Number($('#pos-recibido').value) || 0; $('#pos-cambio').value = (r > t.total ? r - t.total : 0).toFixed(2); }
    $('#pos-recibido').addEventListener('input', calcCambio);
    $('#pos-pay').addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (!b) return; root.querySelectorAll('#pos-pay button').forEach((x) => x.classList.toggle('active', x === b)); st.metodo = b.dataset.m; $('#pos-efectivo').hidden = st.metodo !== 'efectivo'; });
    root.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => { root.querySelectorAll('[data-tipo]').forEach((x) => x.classList.toggle('active', x === b)); st.tipo = b.dataset.tipo; }));

    // Cliente
    const cliInput = $('#pos-cliente'); const sug = $('#pos-sug');
    const buscarCli = ui.debounce(async () => {
      const q = cliInput.value.trim();
      if (!q) { st.cliente = null; sug.hidden = true; return; }
      const r = await api.get('/api/clientes', { q, limit: 8 });
      sug.innerHTML = r.datos.map((c) => `<button data-id="${c.id}"><span>${esc(c.nombre)}</span><span class="muted">${esc(c.identificacion || '')}</span></button>`).join('') || '<button disabled class="muted">Sin resultados</button>';
      sug.hidden = false; sug._datos = r.datos;
    }, 200);
    cliInput.addEventListener('input', () => { st.cliente = null; buscarCli(); });
    sug.addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (!b) return; st.cliente = sug._datos.find((c) => c.id === Number(b.dataset.id)); cliInput.value = `${st.cliente.nombre}${st.cliente.identificacion ? ` (${st.cliente.identificacion})` : ''}`; sug.hidden = true; if (st.cliente.tipo_id === 'RNC') { root.querySelector('[data-tipo=credito_fiscal]').click(); } });
    document.addEventListener('click', (e) => { if (!e.target.closest('.cliente-box')) sug.hidden = true; });
    $('#pos-nuevo-cliente').addEventListener('click', () => window.Pages.clientes.formulario(null, (c) => { st.cliente = c; cliInput.value = `${c.nombre}${c.identificacion ? ` (${c.identificacion})` : ''}`; }));

    // Cobrar
    async function cobrar() {
      if (!st.cart.length) return;
      const t = totales();
      const body = { items: st.cart.map((i) => ({ producto_id: i.producto_id, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, itbis_tasa: i.itbis_tasa })), cliente_id: st.cliente ? st.cliente.id : null, metodo_pago: st.metodo, tipo_comprobante: st.tipo, monto_recibido: st.metodo === 'efectivo' ? (Number($('#pos-recibido').value) || t.total) : t.total };
      const btn = $('#pos-cobrar'); btn.disabled = true; btn.innerHTML = 'Emitiendo…';
      try {
        const f = await api.post('/api/facturas', body);
        st.cart = []; st.cliente = null; cliInput.value = ''; $('#pos-recibido').value = ''; renderCart(); cargarProductos(); window.refreshCaja();
        mostrarResultado(f);
      } catch (e) { toast(e.message, 'err', 6000); }
      finally { btn.disabled = !st.cart.length; btn.innerHTML = `${icon('check', 20)} Cobrar (F4)`; }
    }
    $('#pos-cobrar').addEventListener('click', cobrar);
    function mostrarResultado(f) {
      const d = f.dgii || {};
      const estado = f.dgii_estado;
      const cls = estado.startsWith('aceptada') ? 'ok' : estado === 'rechazada' || estado === 'error' ? 'err' : estado === 'no_enviada' && f.tipo_ecf.startsWith('B') ? 'info' : 'warn';
      const m = ui.modal({ title: `Factura ${f.numero} emitida`, footer: `<button class="btn btn-outline" data-close>Cerrar</button><button class="btn btn-primary" id="res-print">${icon('printer', 16)} Imprimir</button>`, body: `
        <div class="center" style="margin-bottom:14px"><div style="font-size:32px;font-weight:800">${money(f.total)}</div>${f.metodo_pago === 'efectivo' ? `<div class="muted">Recibido ${money(f.monto_recibido)} · Cambio <b>${money(f.cambio)}</b></div>` : ''}</div>
        <dl class="dl">${f.encf ? `<dt>${f.tipo_ecf.startsWith('B') ? 'NCF' : 'e-NCF'}</dt><dd class="mono" style="font-size:15px">${esc(f.encf)}</dd>` : ''}<dt>Cliente</dt><dd>${esc(f.cliente_nombre || 'Cliente general')}</dd><dt>Pago</dt><dd>${ui.badgePago(f.metodo_pago)}</dd>${f.codigo_seguridad ? `<dt>Cód. seguridad</dt><dd class="mono">${esc(f.codigo_seguridad)}</dd>` : ''}</dl>
        <div class="alert ${cls} mt">${icon(cls === 'ok' ? 'check-circle' : cls === 'err' ? 'alert-circle' : 'info', 18)}<div><b>DGII: ${ui.badgeDgii(estado)}</b><div style="margin-top:4px">${esc(d.mensaje || f.dgii_mensaje || '')}</div></div></div>` });
      m.el.querySelector('#res-print').addEventListener('click', () => ui.imprimir(f.id));
    }

    // Atajos
    const keys = (e) => { if (!document.body.contains(root)) { document.removeEventListener('keydown', keys); return; } if (e.key === 'F2') { e.preventDefault(); $('#pos-q').focus(); } if (e.key === 'F4') { e.preventDefault(); cobrar(); } if (e.key === 'Escape' && !document.querySelector('.modal-back')) { st.cart = []; renderCart(); } };
    document.addEventListener('keydown', keys);

    if (!window.APP.caja) root.querySelector('.pos').insertAdjacentHTML('beforebegin', `<div class="alert warn mb">${icon('alert-triangle', 18)}<div><b>La caja está cerrada.</b> Ábrala desde el panel lateral para poder facturar.</div></div>`);
    renderCart();
    await cargarProductos();
    $('#pos-q').focus();
  },
};
