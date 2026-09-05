/* Reportes */
window.Pages = window.Pages || {};
window.Pages.reportes = {
  async render(root) {
    const { esc, money, num } = ui;
    const st = { desde: ui.inicioMesIso(), hasta: ui.hoyIso(), tab: 'ventas' };
    root.innerHTML = `
      <div class="page-toolbar"><span class="muted">Período:</span><input class="input" type="date" id="desde" value="${st.desde}" style="width:auto"><span class="muted">a</span><input class="input" type="date" id="hasta" value="${st.hasta}" style="width:auto">
        <button class="btn btn-outline btn-sm" data-r="hoy">Hoy</button><button class="btn btn-outline btn-sm" data-r="semana">Esta semana</button><button class="btn btn-outline btn-sm" data-r="mes">Este mes</button><button class="btn btn-outline btn-sm" data-r="mes-1">Mes pasado</button>
        <span class="spacer"></span>
        <button class="btn btn-outline" id="x607">${icon('download', 16)} Formato 607 (ventas)</button><button class="btn btn-outline" id="x606">${icon('download', 16)} Formato 606 (compras)</button></div>
      <div class="tabs"><button class="active" data-t="ventas">Ventas y resultado</button><button data-t="productos">Productos</button><button data-t="inventario">Inventario</button></div>
      <div id="rep"></div>`;
    const $ = (s) => root.querySelector(s);
    const rango = (k) => { const h = new Date(); const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; let a = new Date(h), b = new Date(h); if (k === 'semana') a.setDate(h.getDate() - ((h.getDay() + 6) % 7)); if (k === 'mes') a = new Date(h.getFullYear(), h.getMonth(), 1); if (k === 'mes-1') { a = new Date(h.getFullYear(), h.getMonth() - 1, 1); b = new Date(h.getFullYear(), h.getMonth(), 0); } st.desde = iso(a); st.hasta = iso(b); $('#desde').value = st.desde; $('#hasta').value = st.hasta; cargar(); };
    root.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => rango(b.dataset.r)));
    ['desde', 'hasta'].forEach((k) => $(`#${k}`).addEventListener('change', () => { st[k] = $(`#${k}`).value; cargar(); }));
    root.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { root.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b)); st.tab = b.dataset.t; cargar(); }));
    $('#x607').addEventListener('click', () => ui.descargar(`/api/reportes/607?desde=${st.desde}&hasta=${st.hasta}`));
    $('#x606').addEventListener('click', () => ui.descargar(`/api/reportes/606?desde=${st.desde}&hasta=${st.hasta}`));
    // descargas autenticadas por token: usamos fetch + blob
    const descargarAuth = async (url, nombre) => { const res = await fetch(url, { headers: { Authorization: `Bearer ${api.getToken()}` } }); const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; a.click(); URL.revokeObjectURL(a.href); };
    $('#x607').onclick = () => descargarAuth(`/api/reportes/607?desde=${st.desde}&hasta=${st.hasta}`, `607_${st.desde.slice(0, 7)}.csv`);
    $('#x606').onclick = () => descargarAuth(`/api/reportes/606?desde=${st.desde}&hasta=${st.hasta}`, `606_${st.desde.slice(0, 7)}.csv`);

    async function cargar() {
      const rep = $('#rep'); rep.innerHTML = '<div class="empty">Cargando…</div>';
      if (st.tab === 'inventario') {
        const r = await api.get('/api/reportes/inventario');
        rep.innerHTML = `<div class="kpis"><div class="kpi"><div class="k-label">Productos activos</div><div class="k-value">${num(r.productos.length)}</div></div><div class="kpi"><div class="k-label">Valor del inventario (costo)</div><div class="k-value">${money(r.valor_costo)}</div></div><div class="kpi"><div class="k-label">Valor a precio de venta</div><div class="k-value">${money(r.valor_venta)}</div></div><div class="kpi"><div class="k-label">Bajo stock</div><div class="k-value ${r.bajo_stock.length ? 'red' : ''}">${num(r.bajo_stock.length)}</div></div></div>
          <div class="card"><div class="card-head"><h3>${icon('alert-triangle', 20)} Productos con bajo stock</h3></div><div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th>Categoría</th><th class="num">Stock</th><th class="num">Mínimo</th><th class="num">Costo</th></tr></thead><tbody>${r.bajo_stock.map((p) => `<tr><td>${esc(p.nombre)}</td><td>${esc(p.categoria || '')}</td><td class="num red bold">${num(p.stock)}</td><td class="num">${num(p.stock_minimo)}</td><td class="num">${money(p.costo)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Todo el inventario está por encima del mínimo</td></tr>'}</tbody></table></div></div>`;
        return;
      }
      const r = await api.get('/api/reportes/ventas', { desde: st.desde, hasta: st.hasta });
      const t = r.totales;
      if (st.tab === 'productos') {
        rep.innerHTML = `<div class="grid-2"><div class="card"><div class="card-head"><h3>${icon('box', 20)} Productos más vendidos</h3></div><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Producto</th><th class="num">Unidades</th><th class="num">Vendido</th><th class="num">Ganancia</th></tr></thead><tbody>${r.productos.map((p, i) => `<tr><td class="muted">${i + 1}</td><td>${esc(p.nombre)}</td><td class="num">${num(p.unidades)}</td><td class="num">${money(p.total)}</td><td class="num green">${money(p.ganancia)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sin ventas</td></tr>'}</tbody></table></div></div>
          <div class="card"><div class="card-head"><h3>${icon('pie-chart', 20)} Por categoría</h3></div><div class="table-wrap"><table class="table"><thead><tr><th>Categoría</th><th class="num">Vendido</th><th class="num">%</th></tr></thead><tbody>${(() => { const tot = r.categorias.reduce((s, c) => s + c.total, 0) || 1; return r.categorias.map((c) => `<tr><td><span class="ldot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(c.color)};margin-right:8px"></span>${esc(c.nombre)}</td><td class="num">${money(c.total)}</td><td class="num">${Math.round(c.total / tot * 100)}%</td></tr>`).join(''); })()}</tbody></table></div></div></div>`;
        return;
      }
      const maxDia = Math.max(1, ...r.por_dia.map((d) => d.total));
      rep.innerHTML = `
        <div class="kpis">
          <div class="kpi"><div class="k-label">Ventas (con ITBIS)</div><div class="k-value">${money(t.total)}</div><div class="k-sub">${num(t.facturas)} comprobantes</div></div>
          <div class="kpi"><div class="k-label">ITBIS cobrado</div><div class="k-value">${money(t.itbis)}</div><div class="k-sub">a declarar (IT-1)</div></div>
          <div class="kpi"><div class="k-label">Costo de lo vendido</div><div class="k-value">${money(t.costo_ventas)}</div></div>
          <div class="kpi"><div class="k-label">Ganancia bruta</div><div class="k-value green">${money(t.ganancia_bruta)}</div><div class="k-sub">ventas sin ITBIS − costo</div></div>
          <div class="kpi"><div class="k-label">Compras</div><div class="k-value">${money(t.compras)}</div><div class="k-sub">${num(t.n_compras)} compras</div></div>
          <div class="kpi"><div class="k-label">Gastos</div><div class="k-value red">${money(t.gastos)}</div><div class="k-sub">${num(t.n_gastos)} gastos</div></div>
          <div class="kpi"><div class="k-label">Resultado del período</div><div class="k-value ${t.resultado >= 0 ? 'green' : 'red'}">${money(t.resultado)}</div><div class="k-sub">ganancia bruta − gastos</div></div>
        </div>
        <div class="grid-2">
          <div class="card"><div class="card-head"><h3>${icon('bar-chart-2', 20)} Ventas por día</h3></div><div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th class="num">Facturas</th><th class="num">ITBIS</th><th class="num">Total</th><th style="width:30%"></th></tr></thead><tbody>${r.por_dia.map((d) => `<tr><td>${ui.fecha(d.fecha)}</td><td class="num">${num(d.facturas)}</td><td class="num">${money(d.itbis)}</td><td class="num bold">${money(d.total)}</td><td><div style="height:8px;border-radius:4px;background:#1e88f5;width:${Math.round(d.total / maxDia * 100)}%"></div></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sin ventas en el período</td></tr>'}</tbody></table></div></div>
          <div>
            <div class="card mb"><div class="card-head"><h3>${icon('credit-card', 20)} Por forma de pago</h3></div><div class="table-wrap"><table class="table"><tbody>${r.por_pago.map((p) => `<tr><td>${ui.badgePago(p.metodo_pago)}</td><td class="num">${num(p.facturas)} fact.</td><td class="num bold">${money(p.total)}</td></tr>`).join('') || '<tr><td class="empty">Sin datos</td></tr>'}</tbody></table></div></div>
            <div class="card mb"><div class="card-head"><h3>${icon('receipt', 20)} Por tipo de comprobante</h3></div><div class="table-wrap"><table class="table"><tbody>${r.por_tipo.map((p) => `<tr><td><span class="badge blue">${esc(p.tipo_ecf)}</span> ${esc(p.nombre)}</td><td class="num">${num(p.facturas)}</td><td class="num bold">${money(p.total)}</td></tr>`).join('') || '<tr><td class="empty">Sin datos</td></tr>'}</tbody></table></div></div>
            <div class="card"><div class="card-head"><h3>${icon('user', 20)} Por cajero</h3></div><div class="table-wrap"><table class="table"><tbody>${r.por_usuario.map((p) => `<tr><td>${esc(p.usuario)}</td><td class="num">${num(p.facturas)} fact.</td><td class="num bold">${money(p.total)}</td></tr>`).join('') || '<tr><td class="empty">Sin datos</td></tr>'}</tbody></table></div></div>
          </div>
        </div>`;
    }
    await cargar();
  },
};
