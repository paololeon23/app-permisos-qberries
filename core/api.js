/**
 * API de permisos (POST crear / GET listar)
 */
window.AV = window.AV || {};

AV.api = {
  async crearPermiso(data) {
    const url = API_CONFIG.PERMISOS_URL;
    const res = await AV.network.post(url, { action: 'crearPermiso', data });
    if (res && res.ok === false) {
      const err = new Error(res.message || 'No se pudo registrar');
      err.code = res.code || 'API_ERROR';
      err.data = res;
      throw err;
    }
    // Exige confirmación real del servidor (con id)
    if (!res || res.opaque || !(res.id || res.data?.id || res.ok === true)) {
      const err = new Error('El servidor no confirmó el registro');
      err.code = 'NO_CONFIRM';
      throw err;
    }
    // Si respondió con forma de "trabajadores" (count sin id de permiso), incorrecto
    if (res.api && res.api !== 'permisos' && !res.id && !res.data?.id) {
      const err = new Error('URL de API incorrecta: no es la de permisos. Vuelve a implementar el code.gs en BD-PERMISOS.');
      err.code = 'WRONG_API';
      throw err;
    }
    return res;
  },

  async listarPermisos() {
    // No usar GET todavía — historial solo local
    return { ok: true, data: AV.queue.history(), localOnly: true };
  },

  /** Duplicados: solo historial/cola local (sin GET al servidor) */
  async existePaseHoy(dni, fecha) {
    const day = fecha || AV.today();
    const local = AV.queue.findPaseHoy(dni, day);
    return { ok: true, exists: !!local, data: local || null, localOnly: true };
  },

  /**
   * Guarda permiso: online → POST; offline / fallo → cola local
   * Solo sube (POST). Sin GET.
   */
  async guardarPermiso(permiso) {
    const record = {
      id: permiso.id || AV.uid(),
      ...permiso,
      createdAt: permiso.createdAt || new Date().toISOString(),
      device: navigator.userAgent.slice(0, 120),
    };

    // Duplicado local del mismo día
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
      AV.queue.addHistory({ ...record, syncStatus: 'synced', remoteId: res?.id || res?.data?.id });
      return { ok: true, offline: false, data: record, remote: res };
    } catch (e) {
      if (e.code === 'DUPLICATE' || /ya (tiene|registr[oó])/i.test(e.message || '')) {
        // Ya quedó en el servidor: historial como enviado, sin encolar
        AV.queue.addHistory({ ...record, syncStatus: 'synced' });
        throw e;
      }
      // Sin red o fallo → cola (sin duplicar si ya está)
      const queued = AV.queue.enqueue(record);
      return { ok: true, offline: true, data: queued || record, error: e.message };
    }
  },
};
