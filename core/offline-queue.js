/**
 * Cola offline de pases + historial local
 * Regla: un DNI = un envío; flush nunca corre en paralelo.
 */
window.AV = window.AV || {};

AV.queue = {
  _flushing: false,

  key() {
    return (window.API_CONFIG && API_CONFIG.QUEUE_KEY) || 'av_permisos_queue_v1';
  },
  histKey() {
    return (window.API_CONFIG && API_CONFIG.HISTORY_KEY) || 'av_permisos_historial_v1';
  },

  list() {
    return AV.storage.get(this.key(), []) || [];
  },

  save(items) {
    AV.storage.set(this.key(), items);
  },

  /** Si quedó pegado en "sending", vuelve a pending */
  recoverStuck() {
    const items = this.list();
    let changed = false;
    const next = items.map((x) => {
      if (x._status === 'sending') {
        changed = true;
        return { ...x, _status: 'pending' };
      }
      return x;
    });
    if (changed) this.save(next);

    // Historial pendiente sin ítem en cola → reencolar
    const hist = this.history().filter((h) => (h.syncStatus || 'pending') !== 'synced');
    const q = this.list();
    hist.forEach((h) => {
      const dayH = this._dayOf(h);
      const inQ = q.some((x) => {
        if (h.id && String(x.id) === String(h.id)) return true;
        if (String(x.dni) !== String(h.dni)) return false;
        const dayX = this._dayOf(x);
        return !dayH || !dayX || dayX === dayH;
      });
      if (!inQ && h.dni) {
        q.unshift({
          ...h,
          _queueId: AV.uid(),
          _queuedAt: new Date().toISOString(),
          _status: 'pending',
        });
        changed = true;
      }
    });
    if (changed) this.save(q);
    return changed;
  },

  enqueue(permiso) {
    const dni = String(permiso?.dni || '').trim();
    const day = String(permiso?.fechaRegistro || permiso?.fechaSalida || AV.today()).slice(0, 10);
    const id = String(permiso?.id || '').trim();

    // Solo bloquear si YA ESTÁ ENVIADO hoy (no si está pendiente — ese va en cola)
    const sentHoy = this.history().find((p) => {
      if (String(p.dni) !== dni) return false;
      if ((p.syncStatus || '') !== 'synced') return false;
      const fr = String(p.fechaRegistro || '').slice(0, 10);
      const fs = String(p.fechaSalida || '').slice(0, 10);
      return fr === day || fs === day;
    });
    if (sentHoy) {
      console.warn('[queue] omitido: ya enviado hoy', dni);
      return null;
    }

    const items = this.list();
    const dupQ = items.find((x) => {
      if (x._status !== 'pending' && x._status !== 'sending') return false;
      if (id && String(x.id) === id) return true;
      const xd = String(x.fechaRegistro || x.fechaSalida || '').slice(0, 10);
      return String(x.dni) === dni && (xd === day || !xd);
    });
    if (dupQ) {
      console.warn('[queue] omitido: ya está en cola', dni);
      return dupQ;
    }

    items.unshift({
      ...permiso,
      _queueId: AV.uid(),
      _queuedAt: new Date().toISOString(),
      _status: 'pending',
    });
    this.save(items);
    this.addHistory({ ...permiso, syncStatus: 'pending' });
    document.dispatchEvent(new CustomEvent('av:queue-updated'));
    return items[0];
  },

  remove(queueId) {
    this.save(this.list().filter((x) => x._queueId !== queueId));
  },

  pendingCount() {
    this.recoverStuck();
    return this.list().filter((x) => x._status === 'pending' || x._status === 'sending').length;
  },

  history() {
    return AV.storage.get(this.histKey(), []) || [];
  },

  findPaseHoy(dni, fecha) {
    const key = String(dni || '').trim();
    if (!key) return null;
    const day = fecha || AV.today();
    const sameDay = (p) => {
      const fr = String(p.fechaRegistro || '').slice(0, 10);
      const fs = String(p.fechaSalida || '').slice(0, 10);
      return fr === day || fs === day;
    };
    const fromHist = this.history().find((p) => String(p.dni) === key && sameDay(p));
    if (fromHist) return fromHist;
    return this.list().find((p) => String(p.dni) === key && sameDay(p)) || null;
  },

  /** Historial: NUNCA elimina pendientes; solo limita enviados antiguos */
  _trimHistory(h) {
    const list = Array.isArray(h) ? h : [];
    const pending = list.filter((x) => (x.syncStatus || 'pending') !== 'synced');
    const synced = list.filter((x) => (x.syncStatus || '') === 'synced');
    return pending.concat(synced.slice(0, 300));
  },

  addHistory(item) {
    const h = this.history();
    const id = String(item?.id || '').trim();
    const dni = String(item?.dni || '').trim();
    const day = String(item?.fechaRegistro || item?.fechaSalida || AV.today()).slice(0, 10);

    const exists = h.findIndex((x) => {
      if (id && String(x.id) === id) return true;
      const xd = String(x.fechaRegistro || x.fechaSalida || '').slice(0, 10);
      return dni && String(x.dni) === dni && xd === day;
    });
    if (exists >= 0) {
      h[exists] = {
        ...h[exists],
        ...item,
        syncStatus: item.syncStatus || h[exists].syncStatus,
        _savedAt: h[exists]._savedAt || new Date().toISOString(),
      };
      AV.storage.set(this.histKey(), this._trimHistory(h));
      return;
    }

    h.unshift({
      ...item,
      _savedAt: new Date().toISOString(),
    });
    AV.storage.set(this.histKey(), this._trimHistory(h));
  },

  updateHistorySync(localId, syncStatus, remoteId) {
    const id = String(localId || '');
    const h = this.history().map((x) => {
      if (String(x.id) === id) {
        return { ...x, syncStatus, remoteId: remoteId || x.remoteId };
      }
      return x;
    });
    AV.storage.set(this.histKey(), h);
  },

  _dayOf(p) {
    return String(p?.fechaRegistro || p?.fechaSalida || '').slice(0, 10);
  },

  /** Marca enviado buscando por id o dni+fecha (registro o salida) */
  markSynced(item, remoteId) {
    const itemDay = this._dayOf(item);
    const h = this.history().map((x) => {
      const sameId = item.id && String(x.id) === String(item.id);
      const sameDni = String(x.dni || '') === String(item.dni || '') && String(item.dni || '');
      const sameDniDay = sameDni && itemDay && this._dayOf(x) === itemDay;
      // Fallback: mismo DNI pendiente (1 pase/día) si fechas vienen vacías o desfasadas
      const sameDniPending =
        sameDni && (x.syncStatus || 'pending') !== 'synced' && (!itemDay || !this._dayOf(x) || this._dayOf(x) === itemDay);
      if (sameId || sameDniDay || sameDniPending) {
        return { ...x, syncStatus: 'synced', remoteId: remoteId || x.remoteId };
      }
      return x;
    });
    AV.storage.set(this.histKey(), h);
  },

  /**
   * Envía la cola. Recupera stuck; si hay flush en curso, ESPERA (no descarta).
   */
  async flush() {
    // Esperar flush previo (máx 25s) en vez de “busy” silencioso
    const waitStart = Date.now();
    while (this._flushing && Date.now() - waitStart < 25000) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (this._flushing) {
      this._flushing = false; // desbloquear candado colgado
      this.recoverStuck();
    }

    if (!navigator.onLine) return { sent: 0, failed: 0, error: 'Sin conexión' };
    const url = window.API_CONFIG?.PERMISOS_URL;
    if (!url || String(url).includes('PEGAR_AQUI')) {
      return { sent: 0, failed: 0, skipped: true, error: 'URL de permisos no configurada' };
    }

    this.recoverStuck();
    this._flushing = true;
    let sent = 0;
    let failed = 0;
    let lastError = '';

    try {
      const items = this.list().filter((x) => x._status === 'pending');
      if (!items.length) {
        return { sent: 0, failed: 0, error: '' };
      }

      for (const item of items) {
        const live = this.list();
        const idx = live.findIndex((x) => x._queueId === item._queueId);
        if (idx < 0) continue;
        live[idx] = { ...live[idx], _status: 'sending' };
        this.save(live);

        try {
          const payload = { ...item };
          delete payload._queueId;
          delete payload._queuedAt;
          delete payload._status;
          delete payload._savedAt;
          delete payload.syncStatus;
          delete payload.remoteId;

          // Servidor puede demorar por LockService (hasta 30s)
          const res = await AV.network.post(
            url,
            { action: 'crearPermiso', data: payload },
            45000
          );

          // Confirmar respuesta real
          if (!res || res.opaque) {
            throw Object.assign(new Error('Sin confirmación del servidor'), { code: 'NO_CONFIRM' });
          }
          if (res.ok === false) {
            if (res.code === 'DUPLICATE' || /ya tiene un pase/i.test(res.message || '')) {
              this.remove(item._queueId);
              this.markSynced(item, res.id || res.data?.id);
              sent++;
              continue;
            }
            throw Object.assign(new Error(res.message || 'Error API'), { code: res.code || 'API_ERROR' });
          }
          if (res.api && res.api !== 'permisos') {
            throw Object.assign(
              new Error('La URL no es la API de permisos (responde ' + res.api + ')'),
              { code: 'WRONG_API' }
            );
          }
          // ok sin api pero con id/data también vale
          if (!(res.id || res.data?.id || res.api === 'permisos' || res.ok === true)) {
            throw Object.assign(new Error('Respuesta inválida del servidor'), { code: 'NO_CONFIRM' });
          }

          this.remove(item._queueId);
          this.markSynced(item, res?.id || res?.data?.id);
          sent++;
        } catch (e) {
          if (e.code === 'DUPLICATE' || /ya tiene un pase/i.test(e.message || '')) {
            this.remove(item._queueId);
            this.markSynced(item);
            sent++;
            continue;
          }
          const again = this.list();
          const j = again.findIndex((x) => x._queueId === item._queueId);
          if (j >= 0) {
            again[j] = { ...again[j], _status: 'pending' };
            this.save(again);
          }
          failed++;
          lastError = e.message || String(e);
          console.warn('[queue] sync fail', e);
        }
      }
    } finally {
      this.recoverStuck();
      this._flushing = false;
      document.dispatchEvent(new CustomEvent('av:queue-updated', { detail: { sent, failed } }));
      document.dispatchEvent(new CustomEvent('av:historial-changed'));
    }

    return { sent, failed, error: lastError };
  },
};
