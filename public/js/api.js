/* Cliente HTTP del API */
(function () {
  let token = null;
  try { token = localStorage.getItem('mc_token'); } catch { /* sin storage */ }
  async function request(method, url, body, opts = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(url, { method, headers, body: payload });
    if (res.status === 401 && !opts.silent) { api.setToken(null); window.dispatchEvent(new CustomEvent('auth:expired')); }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) { const err = new Error((data && data.error) || `Error ${res.status}`); err.status = res.status; err.data = data; throw err; }
    return data;
  }
  const qs = (o) => { const p = Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''); return p.length ? '?' + p.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : ''; };
  const api = {
    get: (url, params, opts) => request('GET', url + qs(params), undefined, opts),
    post: (url, body) => request('POST', url, body),
    put: (url, body) => request('PUT', url, body),
    del: (url) => request('DELETE', url),
    setToken(t) { token = t; try { t ? localStorage.setItem('mc_token', t) : localStorage.removeItem('mc_token'); } catch { /* ignore */ } },
    getToken: () => token,
    qs,
  };
  window.api = api;
})();
