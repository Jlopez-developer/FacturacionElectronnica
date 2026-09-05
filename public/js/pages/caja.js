/* Caja: apertura, cierre y movimientos */
window.Pages = window.Pages || {};
window.Caja = {
  abrirDialogo() {
    return new Promise((resolve) => {
      ui.formModal({ title: 'Abrir caja', fields: [{ name: 'monto_inicial', label: 'Fondo inicial en efectivo (RD$)', type: 'number', step: '0.01', min: 0, required: true, full: true, autofocus: true, value: 2000 }, { name: 'notas', label: 'Notas', full: true }], submit: 'Abrir caja', onSubmit: async (d) => { await api.post('/api/caja/abrir', d); ui.toast('Caja abierta', 'ok'); resolve(true); } });
    });
  },
  cerrarDialogo(c) {
    const { money } = ui;
    return new Promise((resolve) => {
      ui.formModal({ title: 'Cerrar caja', size: 'lg', values: { monto_cierre: c.esperado.toFixed(2) }, submit: 'Cerrar caja',
        extra: `<div class="full"><table class="table"><tbody><tr><td>Fondo inicial</td><td class="num">${money(c.monto_inicial)}</td></tr><tr><td>Ventas en efectivo (${c.facturas} facturas)</td><td class="num">${money(c.ventas_efectivo)}</td></tr><tr><td>Entradas</td><td class="num">${money(c.entradas)}</td></tr><tr><td>Salidas</td><td class="num red">-${money(c.salidas)}</td></tr><tr><td>Gastos pagados en efectivo</td><td class="num red">-${money(c.gastos)}</td></tr><tr><td class="bold">Efectivo esperado</td><td class="num bold" style="font-size:16px">${money(c.esperado)}</td></tr><tr><td class="muted">Tarjeta / transferencia / crédito (no en caja)</td><td class="num muted">${money(c.ventas_tarjeta + c.ventas_transferencia + c.ventas_credito)}</td></tr></tbody></table></div>`,
        fields: [{ name: 'monto_cierre', label: 'Efectivo contado (RD$)', type: 'number', step: '0.01', min: 0, required: true, autofocus: true }, { name: 'notas', label: 'Notas' }],
        onSubmit: async (d) => { const r = await api.post('/api/caja/cerrar', d); ui.toast(`Caja cerrada. Diferencia: ${money(r.diferencia)}`, Math.abs(r.diferencia) < 1 ? 'ok' : 'warn', 6000); resolve(true); } });
    });
  },
};
window.Pages.caja = {
  async render(root) {
    const { esc, money, num, fechaHora, hora, toast } = ui;
    const draw = async () => {
      const c = await api.get('/api/caja/actual');
      const hist = await api.get('/api/caja/historial');
      root.innerHTML = `
        ${c ? `
        <div class="page-toolbar"><span class="badge green" style="font-size:13px;padding:6px 12px">${icon('check-circle', 14)} Caja abierta desde ${hora(c.apertura)} por ${esc(c.usuario)}</span><span class="spacer"></span>
          <button class="btn btn-outline" id="mov-in">${icon('arrow-down', 16)} Entrada de efectivo</button><button class="btn btn-outline" id="mov-out">${icon('arrow-up', 16)} Salida de efectivo</button><button class="btn btn-outline" id="cajon">${icon('printer', 16)} Abrir cajón</button><button class="btn btn-danger" id="cerrar">${icon('clock', 16)} Cerrar caja</button></div>
        <div class="kpis">
          <div class="kpi"><div class="k-label">Efectivo esperado en caja</div><div class="k-value green">${money(c.esperado)}</div><div class="k-sub">Fondo inicial ${money(c.monto_inicial)}</div></div>
          <div class="kpi"><div class="k-label">Ventas en efectivo</div><div class="k-value">${money(c.ventas_efectivo)}</div><div class="k-sub">${num(c.facturas)} facturas</div></div>
          <div class="kpi"><div class="k-label">Tarjeta</div><div class="k-value">${money(c.ventas_tarjeta)}</div></div>
          <div class="kpi"><div class="k-label">Transferencia</div><div class="k-value">${money(c.ventas_transferencia)}</div></div>
          <div class="kpi"><div class="k-label">Crédito</div><div class="k-value">${money(c.ventas_credito)}</div></div>
          <div class="kpi"><div class="k-label">Entradas / Salidas</div><div class="k-value">${money(c.entradas)} <span class="muted" style="font-size:14px">/</span> <span class="red">${money(c.salidas + c.gastos)}</span></div><div class="k-sub">incluye gastos en efectivo</div></div>
        </div>
        <div class="card mb"><div class="card-head"><h3>${icon('arrow-left-right', 20)} Movimientos de la sesión</h3></div><div class="table-wrap"><table class="table"><thead><tr><th>Hora</th><th>Tipo</th><th>Concepto</th><th>Usuario</th><th class="num">Monto</th></tr></thead><tbody>${c.movimientos.map((m) => `<tr><td>${hora(m.fecha)}</td><td>${m.tipo === 'entrada' ? '<span class="badge green">Entrada</span>' : '<span class="badge red">Salida</span>'}</td><td>${esc(m.concepto)}</td><td>${esc(m.usuario || '')}</td><td class="num ${m.tipo === 'entrada' ? 'green' : 'red'}">${m.tipo === 'entrada' ? '+' : '-'}${money(m.monto)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sin movimientos manuales</td></tr>'}</tbody></table></div></div>`
        : `<div class="alert warn mb">${icon('alert-triangle', 18)}<div><b>No hay caja abierta.</b> Debe abrir la caja para poder facturar.</div><span class="spacer"></span><button class="btn btn-primary" id="abrir">${icon('clock', 16)} Abrir caja</button></div>`}
        <div class="card"><div class="card-head"><h3>${icon('clock', 20)} Historial de cajas</h3></div><div class="table-wrap"><table class="table"><thead><tr><th>Apertura</th><th>Cierre</th><th>Usuario</th><th class="num">Fondo</th><th class="num">Ventas efectivo</th><th class="num">Esperado</th><th class="num">Contado</th><th class="num">Diferencia</th><th>Estado</th></tr></thead><tbody>${hist.map((h) => { const dif = h.monto_cierre != null ? h.monto_cierre - h.esperado : null; return `<tr><td class="small">${fechaHora(h.apertura)}</td><td class="small">${h.cierre ? fechaHora(h.cierre) : '—'}</td><td>${esc(h.usuario)}</td><td class="num">${money(h.monto_inicial)}</td><td class="num">${money(h.ventas_efectivo)}</td><td class="num">${money(h.esperado)}</td><td class="num">${h.monto_cierre != null ? money(h.monto_cierre) : '—'}</td><td class="num ${dif == null ? '' : Math.abs(dif) < 1 ? 'green' : 'red'}">${dif == null ? '—' : money(dif)}</td><td>${h.estado === 'abierta' ? '<span class="badge green">Abierta</span>' : '<span class="badge gray">Cerrada</span>'}</td></tr>`; }).join('')}</tbody></table></div></div>`;
      const $ = (s) => root.querySelector(s);
      const mov = (tipo) => ui.formModal({ title: tipo === 'entrada' ? 'Entrada de efectivo' : 'Salida de efectivo', fields: [{ name: 'monto', label: 'Monto (RD$)', type: 'number', step: '0.01', min: 0.01, required: true, full: true, autofocus: true }, { name: 'concepto', label: 'Concepto', required: true, full: true, placeholder: tipo === 'entrada' ? 'Cambio / fondo adicional' : 'Pago a suplidor, retiro…' }], submit: 'Registrar', onSubmit: async (d) => { await api.post('/api/caja/movimiento', { ...d, tipo }); toast('Movimiento registrado', 'ok'); await window.refreshCaja(); draw(); } });
      if ($('#mov-in')) { $('#mov-in').addEventListener('click', () => mov('entrada')); $('#mov-out').addEventListener('click', () => mov('salida')); $('#cerrar').addEventListener('click', () => window.Caja.cerrarDialogo(c).then(async () => { await window.refreshCaja(); draw(); })); $('#cajon').addEventListener('click', async () => { try { const r = await api.post('/api/caja/abrir-cajon'); toast(r.mensaje || 'Pulso enviado al cajón', 'ok'); } catch (e) { toast(e.message, 'err'); } }); }
      if ($('#abrir')) $('#abrir').addEventListener('click', () => window.Caja.abrirDialogo().then(async () => { await window.refreshCaja(); draw(); }));
    };
    await draw();
  },
};
