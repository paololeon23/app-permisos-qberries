/**
 * API de permisos (POST crear vía proxy seguro /api/permisos)
 */
window.AV = window.AV || {};

AV.api = {
  _assertPermisosRes(res) {
    if (res && res.ok === false) {
      const err = new Error(res.message || 'No se pudo registrar');
      err.code = res.code || 'API_ERROR';
      err.data = res;
      throw err;
    }
    if (!res || res.opaque) {
      const err = new Error('El servidor no confirmó el registro');
      err.code = 'NO_CONFIRM';
      throw err;
    }
    if (res.code === 'UNAUTHORIZED' || /no autorizado/i.test(res.message || '')) {
      const err = new Error('No autorizado. Revise la configuración del servidor.');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    if (res.api && res.api !== 'permisos') {
      const err = new Error('Respuesta inválida: no es la API de permisos');
      err.code = 'WRONG_API';
      throw err;
    }
    if (!(res.id || res.data?.id || (res.ok === true && res.api === 'permisos'))) {
      const err = new Error('El servidor no confirmó el registro');
      err.code = 'NO_CONFIRM';
      throw err;
    }
    return res;
  },

  async crearPermiso(data) {
    const url = API_CONFIG.PERMISOS_URL;
    const res = await AV.network.post(url, { action: 'crearPermiso', data });
    return this._assertPermisosRes(res);
  },

  async ping() {
    try {
      return await AV.network.get(API_CONFIG.PERMISOS_URL, { action: 'ping' });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async listarPermisos() {
    return { ok: true, data: AV.queue.history(), localOnly: true };
  },

  async existePaseHoy(dni, fecha) {
    const day = fecha || AV.today();
    const local = AV.queue.findPaseHoy(dni, day);
    return { ok: true, exists: !!local, data: local || null, localOnly: true };
  },

  /**
   * Guarda permiso: online → POST seguro; offline / fallo → cola local
   */
  async guardarPermiso(permiso) {
    const record = {
      id: permiso.id || AV.uid(),
      ...permiso,
      createdAt: permiso.createdAt || new Date().toISOString(),
      device: navigator.userAgent.slice(0, 120),
    };

    if (AV.queue.findPaseHoy(record.dni)) {
      const err = new Error('Este trabajador ya tiene un pase de salida hoy en este dispositivo.');
      err.code = 'DUPLICATE';
      throw err;
    }

    if (!navigator.onLine) {
      AV.queue.enqueue(record);
      return { ok: true, offline: true, data: record };
    }

    try {
      const res = await this.crearPermiso(record);
      AV.queue.addHistory({
        ...record,
        syncStatus: 'synced',
        remoteId: res?.id || res?.data?.id,
      });
      return { ok: true, offline: false, data: record, remote: res };
    } catch (e) {
      if (e.code === 'DUPLICATE' || /ya (tiene|registr[oó])/i.test(e.message || '')) {
        AV.queue.addHistory({ ...record, syncStatus: 'synced' });
        throw e;
      }
      // Errores de auth/config: no encolar como si fuera "offline ok"
      if (e.code === 'UNAUTHORIZED' || e.code === 'INSECURE_URL' || e.code === 'WRONG_API') {
        throw e;
      }
      const queued = AV.queue.enqueue(record);
      return { ok: true, offline: true, data: queued || record, error: e.message };
    }
  },
};
