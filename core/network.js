/**
 * Capa de red: GET por JSONP (evita CORS con Apps Script) + POST text/plain
 */
window.AV = window.AV || {};

AV.network = {
  _ensureUrl(url) {
    if (!url || String(url).includes('PEGAR_AQUI')) {
      const err = new Error('API no configurada');
      err.code = 'NO_CONFIG';
      throw err;
    }
  },

  /**
   * GET vía JSONP — no lo bloquea CORS del navegador
   */
  jsonp(url, params = {}, timeout) {
    this._ensureUrl(url);
    const ms = timeout ?? (window.API_CONFIG?.TIMEOUT_MS ?? 15000);

    return new Promise((resolve, reject) => {
      const cbName = '_avJsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const script = document.createElement('script');
      let done = false;

      const cleanup = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          delete window[cbName];
        } catch (_) {
          window[cbName] = undefined;
        }
        if (script.parentNode) script.parentNode.removeChild(script);
      };

      const timer = setTimeout(() => {
        cleanup();
        const err = new Error('Tiempo de espera agotado');
        err.code = 'TIMEOUT';
        reject(err);
      }, ms);

      window[cbName] = (data) => {
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        const err = new Error('No se pudo conectar con el servidor');
        err.code = 'NETWORK';
        reject(err);
      };

      const q = new URLSearchParams({ ...(params || {}), callback: cbName }).toString();
      script.src = url + (url.includes('?') ? '&' : '?') + q;
      document.head.appendChild(script);
    });
  },

  async request(url, { method = 'GET', body = null, params = null, timeout } = {}) {
    // GET → JSONP (CORS-safe con Apps Script)
    if (String(method).toUpperCase() === 'GET') {
      return this.jsonp(url, params || {}, timeout);
    }

    this._ensureUrl(url);
    const ms = timeout ?? (window.API_CONFIG?.TIMEOUT_MS ?? 15000);
    let finalUrl = url;
    if (params && typeof params === 'object') {
      const q = new URLSearchParams(params).toString();
      finalUrl += (url.includes('?') ? '&' : '?') + q;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);

    try {
      const opts = {
        method: 'POST',
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      };

      const res = await fetch(finalUrl, opts);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // Si Google devolvió HTML (error de deploy), avisar claro
        if (/doGet|doPost|Script function not found/i.test(text)) {
          const err = new Error('La API no está implementada. Vuelve a implementar el code.gs.');
          err.code = 'NO_DEPLOY';
          throw err;
        }
        data = { raw: text, ok: res.ok };
      }

      if (!res.ok) {
        const err = new Error(data?.message || `HTTP ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (e) {
      if (e.name === 'AbortError') {
        const err = new Error('Tiempo de espera agotado');
        err.code = 'TIMEOUT';
        throw err;
      }
      // Fallback no-cors: NO confirmar éxito (no se puede leer la respuesta)
      if (e.message && /Failed to fetch|CORS|NetworkError/i.test(e.message)) {
        try {
          await fetch(finalUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: typeof body === 'string' ? body : JSON.stringify(body),
          });
          const err = new Error('No se pudo confirmar el envío. Queda pendiente de subir.');
          err.code = 'OPAQUE';
          throw err;
        } catch (e2) {
          if (e2.code === 'OPAQUE') throw e2;
        }
      }
      if (!navigator.onLine) {
        const err = new Error('Sin conexión');
        err.code = 'OFFLINE';
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  get(url, params) {
    return this.request(url, { method: 'GET', params });
  },

  post(url, body, timeout) {
    return this.request(url, { method: 'POST', body, timeout });
  },
};
