/**
 * Catálogo de trabajadores — JSON local + cache del celular
 * Si el DNI no está local y hay internet → GET a BD-TRABAJADORES y lo guarda en cache.
 * NO sincroniza cantidades / listados masivos.
 */
window.AV = window.AV || {};

AV.workers = {
  _list: [],
  _ready: false,
  _bundledCount: 0,
  COUNT_KEY: 'av_permisos_workers_remote_count_v1',

  async init() {
    const cached = AV.storage.get(API_CONFIG.WORKERS_CACHE_KEY, null);
    if (Array.isArray(cached) && cached.length) {
      this._list = this._merge([], cached);
      this._ready = true;
    }

    try {
      const local = await fetch('./data/workers.json', { cache: 'reload' }).then((r) => r.json());
      if (Array.isArray(local) && local.length) {
        this._bundledCount = local.length;
        this._list = this._merge(local, this._list);
        this._persist();
        this._ready = true;
      }
    } catch (e) {
      console.warn('[workers] JSON local no disponible', e);
    }

    this._ready = true;
    this._emit();
    return this._list;
  },

  _emit() {
    document.dispatchEvent(
      new CustomEvent('av:workers-ready', {
        detail: { count: this._list.length },
      })
    );
  },

  _normalize(w) {
    const key = String(w?.dni || w?.DNI || '').trim();
    if (!key) return null;
    return {
      dni: key,
      nombres: String(w.nombres || w.apellidosNombres || w.nombre || w.Nombres || '').trim(),
      cargo: String(w.cargo || w.puesto || w.Cargo || '').trim(),
      fIngreso: String(w.fIngreso || w.fechaIngreso || w.f_ingreso || w.FIngreso || '').trim(),
    };
  },

  _merge(a, b) {
    const map = new Map();
    [...(a || []), ...(b || [])].forEach((raw) => {
      const w = this._normalize(raw);
      if (!w) return;
      map.set(w.dni, w);
    });
    return [...map.values()].sort((x, y) => AV.norm(x.nombres).localeCompare(AV.norm(y.nombres)));
  },

  _persist() {
    AV.storage.set(API_CONFIG.WORKERS_CACHE_KEY, this._list);
  },

  _configured() {
    const url = API_CONFIG.TRABAJADORES_URL;
    return !!(url && !String(url).includes('PEGAR_AQUI'));
  },

  count() {
    return this._list.length;
  },

  all() {
    return this._list;
  },

  byDni(dni) {
    const k = String(dni || '').trim();
    if (!k) return null;
    return this._list.find((w) => w.dni === k) || null;
  },

  upsertLocal(worker) {
    const w = this._normalize(worker);
    if (!w) return null;
    const idx = this._list.findIndex((x) => x.dni === w.dni);
    if (idx >= 0) this._list[idx] = w;
    else this._list.push(w);
    this._list.sort((x, y) => AV.norm(x.nombres).localeCompare(AV.norm(y.nombres)));
    this._persist();
    this._emit();
    return w;
  },

  search(q, limit = 40) {
    const n = AV.norm(q);
    if (!n) return this._list.slice(0, limit);
    const results = [];
    for (const w of this._list) {
      const hay = AV.norm(`${w.dni} ${w.nombres} ${w.cargo}`);
      if (hay.includes(n) || w.dni.includes(String(q).trim())) {
        results.push(w);
        if (results.length >= limit) break;
      }
    }
    return results;
  },

  async syncIfRemoteHasMore() {
    return { synced: false, reason: 'disabled', local: this.count() };
  },

  async refreshFromApi() {
    return this._list;
  },

  /** GET por DNI desde BD-TRABAJADORES → cache local */
  async fetchByDni(dni) {
    const k = String(dni || '').trim();
    if (!k || !navigator.onLine || !this._configured()) return null;

    const url = API_CONFIG.TRABAJADORES_URL;
    try {
      const res = await AV.network.get(url, { action: 'obtenerPorDni', dni: k });
      if (res && res.ok === false) return null;
      let row = res?.data || res?.trabajador || null;

      if (!row) {
        const alt = await AV.network.get(url, { action: 'buscarTrabajador', dni: k });
        const list = alt?.data || [];
        row = Array.isArray(list)
          ? list.find((w) => String(w.dni) === k) || null
          : list;
      }

      if (!row) return null;
      return this.upsertLocal(row);
    } catch (e) {
      console.warn('[workers] GET por DNI', e);
      return null;
    }
  },

  /**
   * 1) Local  2) Si falta + internet → Sheets  3) Guarda en cache del celular
   */
  async resolveByDni(dni) {
    const k = String(dni || '').trim();
    if (k.length < 8) return { worker: null, source: 'missing' };

    const local = this.byDni(k);
    if (local) return { worker: local, source: 'local' };

    if (!navigator.onLine || !this._configured()) {
      return { worker: null, source: 'missing' };
    }

    const remote = await this.fetchByDni(k);
    if (remote) return { worker: remote, source: 'remote' };
    return { worker: null, source: 'missing' };
  },
};
