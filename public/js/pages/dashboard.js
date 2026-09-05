/* Dashboard — réplica del boceto */
window.Pages = window.Pages || {};
window.Pages.dashboard = {
  async render(root) {
    const { esc, money, num, fechaCorta } = ui;
    const d = await api.get('/api/dashboard');
    const delta = (v, warm) => {
      const up = v >= 0;
      const cls = up ? (warm ? 'warm' : 'up') : 'down';
      const ic = warm && up ? 'arrow-up-right' : up ? 'arrow-up' : 'arrow-down';
      return `<div class="stat-delta ${cls}">${icon(ic, 14)} ${Math.abs(v)}%`;
    };

    // ---- Gráfico de barras (SVG) ----
    const barChart = (W) => {
      const H = 232, padL = 82, padR = 8, padT = 10, padB = 34;
      const data = d.ultimos7;
      const max = Math.max(25000, Math.ceil(Math.max(...data.map((x) => x.total)) / 5000) * 5000);
      const steps = 5; const stepV = max / steps;
      const iw = W - padL - padR, ih = H - padT - padB;
      const y = (v) => padT + ih - (v / max) * ih;
      const slot = iw / data.length; const bw = Math.min(46, slot * 0.52);
      let s = `<svg class="bar-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Ventas de los últimos 7 días">`;
      s += '<g class="grid">';
      for (let i = 0; i <= steps; i++) { const v = i * stepV; s += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="ylabel" x="${padL - 12}" y="${y(v) + 4}" text-anchor="end">${d.moneda} ${num(v)}</text>`; }
      s += '</g>';
      data.forEach((x, i) => {
        const cx = padL + slot * i + slot / 2;
        const h = Math.max(0, y(0) - y(x.total));
        s += `<rect class="bar" x="${cx - bw / 2}" y="${y(x.total)}" width="${bw}" height="${h}" rx="3"><title>${esc(x.etiqueta)}: ${money(x.total)} (${x.facturas} facturas)</title></rect>`;
        s += `<text class="xlabel ${x.hoy ? 'hoy' : ''}" x="${cx}" y="${H - 10}" text-anchor="middle">${esc(x.etiqueta)}</text>`;
      });
      return s + '</svg>';
    };

    // ---- Donut ----
    const donut = () => {
      const cats = d.por_categoria;
      const total = cats.reduce((s, c) => s + c.total, 0) || 1;
      const r = 54, cx = 70, cy = 70, C = 2 * Math.PI * r;
      let off = 0;
      let s = `<svg class="donut" viewBox="0 0 140 140"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef0f4" stroke-width="28"/>`;
      for (const c of cats) {
        const len = (c.total / total) * C;
        s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c.color}" stroke-width="28" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(c.nombre)}: ${c.porcentaje}%</title></circle>`;
        off += len;
      }
      return s + '</svg>';
    };

    root.innerHTML = `
      <div class="dash-toolbar"><span class="date-pill">${icon('calendar', 18)}<span>${esc(d.fecha.texto)}</span>${icon('chevron-down', 16)}</span></div>
      <div class="stats">
        <div class="stat"><span class="stat-icon blue">${icon('dollar')}</span><div><div class="stat-label">Ventas de hoy</div><div class="stat-value">${money(d.ventas_hoy.total)}</div>${delta(d.ventas_hoy.variacion)} vs ayer</div></div></div>
        <div class="stat"><span class="stat-icon green">${icon('cart')}</span><div><div class="stat-label">Ventas del mes</div><div class="stat-value">${money(d.ventas_mes.total)}</div>${delta(d.ventas_mes.variacion)} vs mes pasado</div></div></div>
        <div class="stat"><span class="stat-icon orange">${icon('file-text')}</span><div><div class="stat-label">Facturas hoy</div><div class="stat-value">${num(d.facturas_hoy.total)}</div>${delta(d.facturas_hoy.variacion, true)} vs ayer</div></div></div>
        <div class="stat"><span class="stat-icon purple">${icon('box')}</span><div><div class="stat-label">Productos</div><div class="stat-value">${num(d.productos)}</div><div class="stat-delta">Activos</div></div></div>
        <div class="stat"><span class="stat-icon teal">${icon('users')}</span><div><div class="stat-label">Clientes</div><div class="stat-value">${num(d.clientes)}</div><div class="stat-delta">Registrados</div></div></div>
      </div>
      <div class="dash-row2">
        <div class="card">
          <div class="card-head"><h3>${icon('bar-chart-2', 20)} Ventas de los últimos 7 días</h3><span class="spacer"></span><span class="select-pill"><select id="sel-dias"><option>Últimos 7 días</option></select>${icon('chevron-down', 14)}</span></div>
          <div class="card-body" id="chart-body"></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>${icon('box', 20)} Productos más vendidos</h3><span class="spacer"></span><span class="select-pill"><select><option>Este mes</option></select>${icon('chevron-down', 14)}</span></div>
          <div class="card-body">
            <ol class="top-list">${d.top_productos.length ? d.top_productos.map((p, i) => `<li><span class="rank">${i + 1}</span><span class="thumb">${esc(p.imagen || '📦')}</span><div><div class="name">${esc(p.nombre)}</div><div class="units">${num(p.unidades)} unidades</div></div><span class="amount">${money(p.total)}</span></li>`).join('') : '<li class="muted">Sin ventas este mes</li>'}</ol>
            <a class="link-btn" href="#/productos">Ver todos los productos</a>
          </div>
        </div>
      </div>
      <div class="dash-row3">
        <div class="card">
          <div class="card-head"><h3>${icon('cart', 20)} Ventas por categoría <small>(Este mes)</small></h3></div>
          <div class="card-body"><div class="donut-wrap">${donut()}<ul class="legend">${d.por_categoria.map((c) => `<li><span class="ldot" style="background:${esc(c.color)}"></span><span class="lname">${esc(c.nombre)}</span><span class="lpct">${c.porcentaje}%</span><span class="lamt">${d.moneda} ${num(Math.round(c.total))}</span></li>`).join('') || '<li class="muted">Sin datos</li>'}</ul></div></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>${icon('file-text', 20)} Últimas facturas</h3></div>
          <div class="card-body">
            <ul class="inv-list">${d.ultimas_facturas.map((f) => `<li><a class="num" href="#/ventas/${f.id}">${esc(f.numero)}</a><span class="cli">${esc(f.cliente)}</span><span class="amt">${money(f.total)}</span><span class="when">${fechaCorta(f.fecha)}</span></li>`).join('') || '<li class="muted">Sin facturas</li>'}</ul>
            <a class="link-btn" href="#/ventas">Ver todas las facturas</a>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>${icon('zap', 20)} Accesos rápidos</h3></div>
          <div class="card-body">
            <div class="quick">
              <a class="blue" href="#/facturacion">${icon('file-plus')}Nueva Factura</a>
              <a class="green" href="#/productos/nuevo">${icon('box-plus')}Nuevo Producto</a>
              <a class="orange" href="#/compras/nueva">${icon('cart')}Nueva Compra</a>
              <a class="red" href="#/gastos/nuevo">${icon('wallet')}Gasto</a>
              <a class="purple" href="#" id="btn-cajon">${icon('printer')}Abrir Cajón</a>
            </div>
          </div>
        </div>
      </div>`;
    const chartBody = root.querySelector('#chart-body');
    const draw = () => { chartBody.innerHTML = barChart(Math.max(320, chartBody.clientWidth)); };
    draw();
    const onResize = ui.debounce(draw, 150);
    window.addEventListener('resize', onResize);
    root.querySelector('#btn-cajon').addEventListener('click', async (e) => {
      e.preventDefault();
      try { const r = await api.post('/api/caja/abrir-cajon'); ui.toast(r.mensaje || 'Pulso enviado al cajón', r.modo === 'red' ? 'ok' : 'info'); }
      catch (ex) { ui.toast(ex.message, 'err'); }
    });
  },
};
