/* Utilidades de interfaz */
(function () {
  const MONEDA = () => (window.APP_CONFIG && window.APP_CONFIG.moneda) || 'RD$';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (v, sinSimbolo) => `${sinSimbolo ? '' : MONEDA() + ' '}${Number(v || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const num = (v, d = 0) => Number(v || 0).toLocaleString('es-DO', { minimumFractionDigits: d, maximumFractionDigits: d });
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const parse = (s) => (s instanceof Date ? s : new Date(String(s).replace(' ', 'T')));
  const hora = (d) => { d = parse(d); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`; };
  const fechaCorta = (d) => { d = parse(d); return `${d.getDate()} ${MESES[d.getMonth()]}, ${hora(d)}`; };
  const fecha = (d) => { d = parse(d); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
  const fechaHora = (d) => `${fecha(d)} ${hora(d)}`;
  const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const inicioMesIso = () => hoyIso().slice(0, 8) + '01';

  function toast(msg, tipo = 'info', ms = 3500) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = `toast ${tipo}`;
    el.innerHTML = `${icon(tipo === 'ok' ? 'check-circle' : tipo === 'err' ? 'alert-circle' : 'info', 18)}<span>${esc(msg)}</span>`;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, ms);
  }

  /** Modal genérico. Devuelve { el, body, close }. */
  function modal({ title, body, footer, size, onClose }) {
    const root = document.getElementById('modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${size || ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="btn-ghost icon-btn" data-close aria-label="Cerrar">${icon('x', 20)}</button></div>
      <div class="modal-body"></div>
      ${footer !== null ? '<div class="modal-foot"></div>' : ''}
    </div>`;
    const bodyEl = back.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const footEl = back.querySelector('.modal-foot');
    if (footEl && footer) { if (typeof footer === 'string') footEl.innerHTML = footer; else footEl.appendChild(footer); }
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    root.appendChild(back);
    const first = bodyEl.querySelector('input,select,textarea,button');
    if (first) setTimeout(() => first.focus(), 30);
    return { el: back, body: bodyEl, foot: footEl, close };
  }

  function confirmar(msg, { titulo = 'Confirmar', ok = 'Confirmar', peligro = false } = {}) {
    return new Promise((resolve) => {
      const m = modal({ title: titulo, body: `<p style="margin:0;font-size:14px;line-height:1.5">${esc(msg)}</p>`, footer: `<button class="btn btn-outline" data-close>Cancelar</button><button class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>`, onClose: () => resolve(false) });
      m.foot.querySelector('[data-ok]').addEventListener('click', () => { resolve(true); m.el.remove(); });
    });
  }

  /** Formulario en modal. fields: [{name,label,type,value,options,required,full,hint,step,min}] */
  function formModal({ title, fields, values = {}, submit = 'Guardar', size, onSubmit, extra }) {
    const form = document.createElement('form');
    form.className = 'form-grid';
    form.innerHTML = fields.map((f) => {
      const v = values[f.name] ?? f.value ?? '';
      let input;
      if (f.type === 'select') input = `<select class="input" name="${f.name}" ${f.required ? 'required' : ''}>${(f.options || []).map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      else if (f.type === 'textarea') input = `<textarea class="input" name="${f.name}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
      else if (f.type === 'checkbox') input = `<label class="check"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}> ${esc(f.text || '')}</label>`;
      else input = `<input class="input" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.required ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} placeholder="${esc(f.placeholder || '')}" ${f.autofocus ? 'autofocus' : ''} ${f.readonly ? 'readonly' : ''}>`;
      return `<label class="field ${f.full ? 'full' : ''}">${esc(f.label)}${input}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</label>`;
    }).join('') + `<div class="form-error full" hidden></div>` + (extra || '');
    const m = modal({ title, body: form, size, footer: `<button class="btn btn-outline" data-close>Cancelar</button><button class="btn btn-primary" data-submit>${esc(submit)}</button>` });
    const errEl = form.querySelector('.form-error');
    const doSubmit = async () => {
      if (!form.reportValidity()) return;
      const data = {};
      for (const f of fields) {
        const el = form.elements[f.name];
        if (!el) continue;
        if (f.type === 'checkbox') data[f.name] = el.checked ? 1 : 0;
        else if (f.type === 'number') data[f.name] = el.value === '' ? null : Number(el.value);
        else data[f.name] = el.value;
      }
      const btn = m.foot.querySelector('[data-submit]'); btn.disabled = true;
      try { await onSubmit(data, m); m.close(); }
      catch (e) { errEl.textContent = e.message; errEl.hidden = false; }
      finally { btn.disabled = false; }
    };
    m.foot.querySelector('[data-submit]').addEventListener('click', doSubmit);
    form.addEventListener('submit', (e) => { e.preventDefault(); doSubmit(); });
    return m;
  }

  const badgeDgii = (estado) => {
    const map = { aceptada: ['green', 'Aceptada DGII'], aceptada_condicional: ['yellow', 'Aceptada cond.'], rechazada: ['red', 'Rechazada'], en_proceso: ['blue', 'En proceso'], pendiente: ['orange', 'Pendiente'], no_enviada: ['gray', 'No enviada'], error: ['red', 'Error'] };
    const [c, t] = map[estado] || ['gray', estado || '—'];
    return `<span class="badge ${c}">${t}</span>`;
  };
  const badgePago = (m) => ({ efectivo: '<span class="badge green">Efectivo</span>', tarjeta: '<span class="badge blue">Tarjeta</span>', transferencia: '<span class="badge purple">Transferencia</span>', credito: '<span class="badge orange">Crédito</span>', mixto: '<span class="badge gray">Mixto</span>' }[m] || `<span class="badge gray">${esc(m)}</span>`);

  function pager(total, page, limit, onPage) {
    const pages = Math.max(1, Math.ceil(total / limit));
    const el = document.createElement('div');
    el.className = 'pager';
    el.innerHTML = `<span>${num(total)} registros · página ${page} de ${pages}</span><div class="pages"><button class="btn btn-outline btn-sm" ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">${icon('chevron-left', 14)} Anterior</button><button class="btn btn-outline btn-sm" ${page >= pages ? 'disabled' : ''} data-p="${page + 1}">Siguiente ${icon('chevron-right', 14)}</button></div>`;
    el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => onPage(Number(b.dataset.p))));
    return el;
  }

  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const descargar = (url) => { const a = document.createElement('a'); a.href = url; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); };
  const imprimir = (id, auto = true) => window.open(`/api/facturas/${id}/imprimir${auto ? '?auto=1' : ''}`, '_blank', 'width=420,height=700');

  window.ui = { esc, money, num, hora, fecha, fechaCorta, fechaHora, hoyIso, inicioMesIso, toast, modal, confirmar, formModal, badgeDgii, badgePago, pager, debounce, descargar, imprimir, MESES };
})();
