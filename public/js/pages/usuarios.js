/* Usuarios y roles */
window.Pages = window.Pages || {};
window.Pages.usuarios = {
  async render(root) {
    const { esc, fechaHora, toast } = ui;
    const ROLES = { administrador: 'Administrador', supervisor: 'Supervisor', cajero: 'Cajero' };
    const admin = window.APP.user.rol === 'administrador';
    const draw = async () => {
      const us = await api.get('/api/usuarios');
      root.innerHTML = `
        <div class="page-toolbar"><div class="alert info" style="flex:1">${icon('info', 18)}<div><b>Roles:</b> Administrador (todo), Supervisor (ventas, anulaciones, productos, reportes), Cajero (facturar, clientes, gastos, caja).</div></div>${admin ? `<button class="btn btn-primary" id="nuevo">${icon('plus', 16)} Nuevo usuario</button>` : ''}</div>
        <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Última venta</th><th>Estado</th><th></th></tr></thead><tbody>${us.map((u) => `<tr data-id="${u.id}"><td class="mono">${esc(u.usuario)}</td><td><b>${esc(u.nombre)}</b></td><td><span class="badge ${u.rol === 'administrador' ? 'purple' : u.rol === 'supervisor' ? 'blue' : 'gray'}">${ROLES[u.rol] || u.rol}</span></td><td class="small">${u.ultima_venta ? fechaHora(u.ultima_venta) : '—'}</td><td>${u.activo ? '<span class="badge green">Activo</span>' : '<span class="badge red">Inactivo</span>'}</td><td class="actions">${admin ? `<button class="btn-ghost" data-a="editar" title="Editar">${icon('edit', 16)}</button><button class="btn-ghost" data-a="clave" title="Cambiar contraseña">${icon('key', 16)}</button><button class="btn-ghost" data-a="toggle" title="${u.activo ? 'Desactivar' : 'Activar'}">${icon(u.activo ? 'lock' : 'check', 16)}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
      const form = (u) => ui.formModal({ title: u ? 'Editar usuario' : 'Nuevo usuario', values: u || { rol: 'cajero' }, submit: u ? 'Guardar' : 'Crear usuario', fields: [{ name: 'nombre', label: 'Nombre completo', required: true, full: true, autofocus: true }, ...(u ? [] : [{ name: 'usuario', label: 'Nombre de usuario', required: true }, { name: 'clave', label: 'Contraseña', type: 'password', required: true }]), { name: 'rol', label: 'Rol', type: 'select', full: true, options: Object.entries(ROLES).map(([v, l]) => ({ value: v, label: l })) }], onSubmit: async (d) => { if (u) await api.put(`/api/usuarios/${u.id}`, d); else await api.post('/api/usuarios', d); toast(u ? 'Usuario actualizado' : 'Usuario creado', 'ok'); draw(); } });
      if (root.querySelector('#nuevo')) root.querySelector('#nuevo').addEventListener('click', () => form(null));
      root.querySelector('tbody').addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-a]'); if (!b) return; const u = us.find((x) => x.id === Number(b.closest('tr').dataset.id));
        if (b.dataset.a === 'editar') form(u);
        if (b.dataset.a === 'clave') ui.formModal({ title: `Nueva contraseña para ${u.usuario}`, fields: [{ name: 'clave', label: 'Nueva contraseña', type: 'password', required: true, full: true, autofocus: true }], onSubmit: async (d) => { await api.put(`/api/usuarios/${u.id}`, d); toast('Contraseña actualizada', 'ok'); } });
        if (b.dataset.a === 'toggle') { try { await api.put(`/api/usuarios/${u.id}`, { activo: u.activo ? 0 : 1 }); draw(); } catch (ex) { toast(ex.message, 'err'); } }
      });
    };
    await draw();
  },
};
