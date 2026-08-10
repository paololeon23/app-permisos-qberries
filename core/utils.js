/**
 * Utilidades compartidas
 */
window.AV = window.AV || {};

AV.uid = () =>
  'P' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

AV.today = () => {
  const tz = (window.API_CONFIG && API_CONFIG.TIMEZONE) || 'America/Lima';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()); // yyyy-mm-dd
};

AV.nowTime = () => AV.fmtTime12(new Date());

/** Hora actual en 24h (interno) HH:mm */
AV.nowTime24 = () => {
  const tz = (window.API_CONFIG && API_CONFIG.TIMEZONE) || 'America/Lima';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hh = parts.find((p) => p.type === 'hour')?.value || '00';
  const mm = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hh}:${mm}`;
};

/**
 * Formatea a 12h con AM/PM: "04:30 PM"
 * Acepta Date, "16:30", "4:30 PM", "04:30 p. m."
 */
AV.fmtTime12 = (value) => {
  let h = 0;
  let m = 0;

  if (value instanceof Date && !isNaN(value.getTime())) {
    h = value.getHours();
    m = value.getMinutes();
  } else {
    const s = String(value || '').trim();
    if (!s) return '';
    const ampm = /a\.?\s*m\.?/i.test(s) ? 'AM' : /p\.?\s*m\.?/i.test(s) ? 'PM' : null;
    const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*$/);
    const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|a\.?\s*m\.?|p\.?\s*m\.?)$/i);
    if (m12) {
      h = parseInt(m12[1], 10);
      m = parseInt(m12[2], 10);
      const ap = m12[3].toUpperCase().includes('P') ? 'PM' : 'AM';
      if (ap === 'PM' && h < 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
    } else if (m24) {
      h = parseInt(m24[1], 10);
      m = parseInt(m24[2], 10);
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
    } else {
      return s;
    }
  }

  const ap = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(h12)}:${p(m)} ${ap}`;
};

/** Convierte cualquier hora visible a 24h HH:mm (interno) */
AV.toTime24 = (value) => {
  const s = String(value || '').trim();
  if (!s) return '';
  const twelve = AV.fmtTime12(s);
  const m = twelve.match(/^(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) {
    const m24 = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m24) return s;
    return `${String(m24[1]).padStart(2, '0')}:${m24[2]}`;
  }
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
};

/** Fecha/hora de registro en zona Lima (automática al guardar) */
AV.registroNow = () => {
  const tz = (window.API_CONFIG && API_CONFIG.TIMEZONE) || 'America/Lima';
  const now = new Date();
  const fecha = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // yyyy-mm-dd
  const hora = new Intl.DateTimeFormat('es-PE', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  const display = new Intl.DateTimeFormat('es-PE', {
    timeZone: tz,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(now);
  return {
    fechaRegistro: fecha,
    horaRegistro: hora,
    registroDisplay: display,
    createdAt: now.toISOString(),
  };
};

AV.fmtDate = (iso) => {
  if (!iso) return '-';
  const [y, m, d] = String(iso).split('-');
  if (!d) return iso;
  return `${d}/${m}/${y}`;
};

AV.escape = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

AV.norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

AV.debounce = (fn, ms = 180) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

AV.isOnline = () => navigator.onLine;

/**
 * Voz del dispositivo (Web Speech API) — funciona CON y SIN internet.
 * Usa voces instaladas en el celular/PC; no descarga audio de la nube.
 */
AV.voice = {
  _ready: false,
  _voice: null,
  _lastText: '',
  _lastAt: 0,

  init() {
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices() || [];
      if (!voices.length) return;
      this._voice =
        voices.find((v) => /es-PE/i.test(v.lang)) ||
        voices.find((v) => /es-MX|es-AR|es-CO|es-CL|es-US/i.test(v.lang)) ||
        voices.find((v) => /^es/i.test(v.lang)) ||
        voices.find((v) => /spanish|español/i.test(v.name)) ||
        voices[0] ||
        null;
      this._ready = !!this._voice || voices.length > 0;
    };
    pick();
    if (typeof speechSynthesis.onvoiceschanged !== 'undefined') {
      speechSynthesis.onvoiceschanged = pick;
    }
    try {
      const warm = new SpeechSynthesisUtterance(' ');
      warm.volume = 0;
      speechSynthesis.speak(warm);
      speechSynthesis.cancel();
    } catch (_) {}
  },

  /**
   * @param {string} text
   * @param {{ force?: boolean, cooldownMs?: number, rate?: number }} opts
   * force=true → habla siempre (éxito). En errores usa cooldown para no saturar.
   */
  speak(text, opts = {}) {
    if (!text || !('speechSynthesis' in window)) return;
    const now = Date.now();
    const cooldown = opts.cooldownMs ?? 2500;
    const force = !!opts.force;
    if (!force && text === this._lastText && now - this._lastAt < cooldown) {
      return;
    }
    this._lastText = text;
    this._lastAt = now;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = (this._voice && this._voice.lang) || 'es-PE';
      if (this._voice) u.voice = this._voice;
      u.rate = opts.rate ?? 1;
      u.pitch = opts.pitch ?? 1;
      u.volume = opts.volume ?? 1;
      speechSynthesis.speak(u);
    } catch (e) {
      console.warn('[voice]', e);
    }
  },

  /** Frases del escáner de carnet */
  dniValidado() {
    this.speak('DNI validado', { force: true });
  },
  dniNoCoincide() {
    this.speak('DNI no coincide', { cooldownMs: 2800 });
  },
  qrSinDni() {
    this.speak('Código inválido. No se encontró D N I', { cooldownMs: 2800 });
  },
  camaraError() {
    this.speak('No se pudo abrir la cámara', { force: true });
  },
  dniRequerido() {
    this.speak('Primero ingrese el D N I del trabajador', { force: true });
  },
  escanerListo() {
    this.speak('Escanee el carnet', { force: true, rate: 1.05 });
  },
};

// Precarga voces al cargar el script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => AV.voice.init());
} else {
  AV.voice.init();
}

/**
 * Almacenamiento durable:
 * - localStorage (lectura inmediata)
 * - IndexedDB (respaldo: no se pierde al cerrar la app)
 * Claves de cola/historial NUNCA se borran desde código.
 */
AV.storage = {
  _dbName: 'av_permisos_db',
  _store: 'kv',
  _dbp: null,
  _pendingWrites: new Map(),
  _critical: () => {
    const c = window.API_CONFIG || {};
    return new Set([
      c.QUEUE_KEY || 'av_permisos_queue_v1',
      c.HISTORY_KEY || 'av_permisos_historial_v1',
      c.WORKERS_CACHE_KEY || 'av_permisos_workers_v1',
    ]);
  },

  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },

  set(key, val) {
    let ok = false;
    try {
      localStorage.setItem(key, JSON.stringify(val));
      ok = true;
    } catch (e) {
      console.warn('[storage] localStorage lleno o bloqueado', key, e);
      ok = false;
    }
    // Respaldo IndexedDB (async) — crítico para pendientes
    this._idbSet(key, val);
    return ok;
  },

  /** No borramos claves críticas (cola / historial) */
  remove(key) {
    if (this._critical().has(key)) {
      console.warn('[storage] bloqueado borrar clave crítica', key);
      return false;
    }
    try {
      localStorage.removeItem(key);
    } catch (_) {}
    this._idbDelete(key);
    return true;
  },

  _openDb() {
    if (this._dbp) return this._dbp;
    this._dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const req = indexedDB.open(this._dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this._store)) {
          db.createObjectStore(this._store);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('[storage] IndexedDB no disponible', req.error);
        resolve(null);
      };
    });
    return this._dbp;
  },

  async _idbSet(key, val) {
    this._pendingWrites.set(key, val);
    try {
      const db = await this._openDb();
      if (!db) return;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this._store, 'readwrite');
        tx.objectStore(this._store).put(val, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[storage] idb set fail', key, e);
    } finally {
      this._pendingWrites.delete(key);
    }
  },

  async _idbGet(key) {
    try {
      const db = await this._openDb();
      if (!db) return undefined;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this._store, 'readonly');
        const req = tx.objectStore(this._store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return undefined;
    }
  },

  async _idbDelete(key) {
    try {
      const db = await this._openDb();
      if (!db) return;
      await new Promise((resolve) => {
        const tx = db.transaction(this._store, 'readwrite');
        tx.objectStore(this._store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (_) {}
  },

  _mergeArrays(a, b) {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    if (!arrA.length) return arrB;
    if (!arrB.length) return arrA;
    const map = new Map();
    const keyOf = (x) => {
      if (x && x._queueId) return 'q:' + x._queueId;
      if (x && x.id) return 'id:' + x.id;
      const dni = String(x?.dni || '');
      const day = String(x?.fechaRegistro || x?.fechaSalida || '').slice(0, 10);
      if (dni && day) return 'd:' + dni + ':' + day;
      return 'r:' + JSON.stringify(x).slice(0, 80);
    };
    const prefer = (old, neu) => {
      if (!old) return neu;
      if (!neu) return old;
      // Preferir "synced" si alguno ya se envió
      const oSync = (old.syncStatus || '') === 'synced' || (old._status || '') === 'synced';
      const nSync = (neu.syncStatus || '') === 'synced' || (neu._status || '') === 'synced';
      if (oSync && !nSync) return old;
      if (nSync && !oSync) return { ...old, ...neu, syncStatus: 'synced' };
      return { ...old, ...neu };
    };
    [...arrA, ...arrB].forEach((x) => {
      const k = keyOf(x);
      map.set(k, prefer(map.get(k), x));
    });
    return Array.from(map.values());
  },

  /**
   * Al abrir la app: recupera cola/historial desde IndexedDB si hace falta.
   * Cerrar la app NO borra nada.
   */
  async hydrate() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }
    } catch (_) {}

    const keys = [...this._critical()];
    for (const key of keys) {
      const local = this.get(key, null);
      const idb = await this._idbGet(key);
      if (idb === undefined || idb === null) {
        if (local != null) await this._idbSet(key, local);
        continue;
      }
      if (local == null) {
        // Recuperar desde respaldo
        try {
          localStorage.setItem(key, JSON.stringify(idb));
          console.info('[storage] recuperado desde IndexedDB', key);
        } catch (e) {
          console.warn('[storage] no se pudo restaurar a localStorage', key, e);
        }
        continue;
      }
      // Ambos existen: fusionar arrays (no perder pendientes)
      if (Array.isArray(local) || Array.isArray(idb)) {
        const merged = this._mergeArrays(local, idb);
        try {
          localStorage.setItem(key, JSON.stringify(merged));
        } catch (_) {}
        await this._idbSet(key, merged);
      }
    }
    return true;
  },

  /** Forzar escribir lo crítico a IndexedDB (antes de cerrar) */
  async flushDurable() {
    const keys = [...this._critical()];
    for (const key of keys) {
      const val = this.get(key, null);
      if (val != null) await this._idbSet(key, val);
    }
  },
};

// Antes de cerrar / minimizar: asegurar respaldo
window.addEventListener('pagehide', () => {
  try {
    AV.storage.flushDurable();
  } catch (_) {}
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    try {
      AV.storage.flushDurable();
    } catch (_) {}
  }
});

AV.toast = (icon, title, text) => {
  if (window.Swal) {
    return Swal.fire({
      icon,
      title,
      text,
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2800,
      timerProgressBar: true,
    });
  }
  alert(title + (text ? '\n' + text : ''));
};

AV.confirm = (title, text) => {
  if (!window.Swal) return Promise.resolve(confirm(title + '\n' + (text || '')));
  return Swal.fire({
    title,
    text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Sí',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#1a5c3a',
  }).then((r) => r.isConfirmed);
};
