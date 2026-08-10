/**
 * Módulo Registro — flujo principal: solo DNI → autocompleta
 */
window.AV = window.AV || {};

AV.registro = {
  form: null,
  lastSaved: null,
  fpIngreso: null,
  fpFecha: null,
  fpHora: null,
  _lookupToken: 0,
  _lookupTokenResp: 0,
  carnetOk: false,
  carnetDni: '',
  carnetAt: '',
  dniBlockedHoy: false,
  lastPaseHoy: null,

  enablePdfButton() {
    const btn = document.getElementById('btnPdfPreview');
    const hint = document.getElementById('pdfHint');
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('hidden');
    }
    if (hint) {
      hint.textContent = this.lastSaved
        ? 'Toque para ver / descargar el PDF'
        : 'Toque Ver PDF — se abre en pantalla al instante';
    }
  },

  disablePdfButton(msg) {
    const btn = document.getElementById('btnPdfPreview');
    const hint = document.getElementById('pdfHint');
    if (btn) btn.disabled = true;
    if (hint && msg) hint.textContent = msg;
  },

  /** Habilita PDF cuando ya hay DNI + nombre (datos del trabajador) */
  refreshPdfFromForm() {
    const dni = document.getElementById('dni')?.value.trim() || '';
    const nombres = document.getElementById('nombres')?.value.trim() || '';
    if (dni.length >= 8 && nombres) {
      this.enablePdfButton();
    } else if (!this.lastSaved && !(AV.queue.history() || []).length) {
      this.disablePdfButton('Ingrese el DNI para generar el PDF');
    }
  },

  async descargarPdf(permiso) {
    let data = permiso || this.lastSaved;
    if (!data) {
      const draft = this.collect();
      if (!draft.dni || draft.dni.length < 8 || !draft.nombres) {
        AV.toast('warning', 'PDF', 'Primero ingrese un DNI válido');
        return false;
      }
      data = draft;
    }
    // Modal con vista previa (online / offline)
    await AV.pdf.preview(data);
    return true;
  },

  /**
   * Misma persona no puede registrar otro pase el mismo día.
   * Local primero; si hay red, confirma en Sheets.
   */
  async checkPaseHoy(dni) {
    const key = String(dni || '').trim();
    this.dniBlockedHoy = false;
    this.lastPaseHoy = null;
    if (key.length < 8) return null;

    // Solo historial/cola LOCAL (sin GET al servidor)
    const local = AV.queue.findPaseHoy(key);
    if (local) {
      this.dniBlockedHoy = true;
      this.lastPaseHoy = local;
      return local;
    }
    return null;
  },

  markDniBlocked(pase) {
    const hora = pase?.horaSalida || pase?.horaRegistro || '';
    this.setDniStatus(
      'err',
      hora
        ? `Ya tiene pase de salida hoy (${hora}). No se puede registrar otro.`
        : 'Ya tiene pase de salida hoy. No se puede registrar otro.'
    );
    const btn = document.getElementById('btnGuardar');
    if (btn) btn.disabled = true;
  },

  clearDniBlock() {
    this.dniBlockedHoy = false;
    this.lastPaseHoy = null;
    const btn = document.getElementById('btnGuardar');
    if (btn) btn.disabled = false;
  },

  init() {
    this.form = document.getElementById('formPermiso');
    if (!this.form) return;

    const es = flatpickr.l10ns?.es;

    // fIngreso: solo lectura (viene del trabajador) — nunca abrir calendario
    this.fpIngreso = flatpickr('#fIngreso', {
      locale: es,
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      allowInput: false,
      clickOpens: false,
      disableMobile: true,
    });
    if (this.fpIngreso?.altInput) {
      this.fpIngreso.altInput.readOnly = true;
      this.fpIngreso.altInput.placeholder = '-';
      this.fpIngreso.altInput.tabIndex = -1;
    }

    // fechaSalida: abrir SOLO con clic (no con focus → evitaba “se abre solo”)
    this.fpFecha = flatpickr('#fechaSalida', {
      locale: es,
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      defaultDate: AV.today(),
      allowInput: false,
      clickOpens: false,
      closeOnSelect: true,
      disableMobile: true,
      onClose: (_, __, fp) => {
        try {
          fp.altInput?.blur();
          fp.input?.blur();
        } catch (_) {}
      },
    });
    this._bindFechaOnlyClick(this.fpFecha);

    // Si tocan fuera / cambian de pestaña: cerrar calendarios colgados
    document.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target;
        if (t?.closest?.('.flatpickr-calendar') || t?.closest?.('.flatpickr-input') || t?.classList?.contains?.('flatpickr-input')) {
          return;
        }
        // altInput de flatpickr
        if (t?.closest?.('.input-wrap') && (t === this.fpFecha?.altInput || t === this.fpFecha?.input)) {
          return;
        }
        this.closeCalendars();
      },
      true
    );
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.closeCalendars();
    });

    const horaEl = document.getElementById('horaSalida');
    horaEl.readOnly = true;
    horaEl.placeholder = 'Toque para elegir hora';
    if (!horaEl.value) horaEl.value = AV.nowTime();
    // Solo click (no focus): al cerrar Swal el foco vuelve al input y reabriría el modal
    horaEl.addEventListener('click', (e) => {
      e.preventDefault();
      this.closeCalendars();
      this.openHoraModal();
    });
    horaEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.closeCalendars();
        this.openHoraModal();
      }
    });

    this.stampRegistro();
    // Hora registro solo se guarda al enviar (servidor / payload), no se muestra en UI

    this.form.querySelectorAll('input[name="motivo"]').forEach((r) => {
      r.addEventListener('change', () => {
        this.syncMotivoUI();
        this.toggleMotivoOtro();
      });
    });
    this.syncMotivoUI();
    this.toggleMotivoOtro();

    const dniInput = document.getElementById('dni');
    dniInput.addEventListener('input', () => {
      dniInput.value = dniInput.value.replace(/\D/g, '').slice(0, 12);
      this.invalidateCarnet();
      this.clearDniBlock();
      this.onDniInput(dniInput.value);
    });
    dniInput.addEventListener('blur', () => this.onDniInput(dniInput.value, true));

    // PDF se actualiza al completar datos del formulario
    this.form.addEventListener('input', () => this.refreshPdfFromForm());
    this.form.addEventListener('change', () => this.refreshPdfFromForm());
    this.refreshPdfFromForm();

    const dniResp = document.getElementById('dniResponsable');
    dniResp.addEventListener('input', () => {
      dniResp.value = dniResp.value.replace(/\D/g, '').slice(0, 12);
      this.onDniResponsable(dniResp.value);
    });
    dniResp.addEventListener('blur', () => this.onDniResponsable(dniResp.value, true));

    document.getElementById('btnScanCarnet')?.addEventListener('click', () => this.scanCarnet());

    document.addEventListener('av:workers-ready', () => this.updateCatalogMeta());
    this.updateCatalogMeta();
    this.renderCarnetStatus();

    document.getElementById('btnPdfPreview')?.addEventListener('click', () => {
      // Abrir sin await previo → modal al toque
      this.descargarPdf().catch((e) => {
        console.error('[pdf]', e);
        AV.toast('error', 'No se pudo generar el PDF', e.message || 'Error desconocido');
      });
    });

    // Precarga logo PDF para que abra rápido
    AV.pdf.warmup();

    // Si ya hay historial, habilitar PDF del último
    if (AV.queue.history().length) {
      this.lastSaved = AV.queue.history()[0];
      this.enablePdfButton();
    }

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
  },

  /** Abre fecha solo con clic; evita reopen por focus/teclado */
  _bindFechaOnlyClick(fp) {
    if (!fp) return;
    const openSafe = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (fp.isOpen) {
        fp.close();
        return;
      }
      this.fpIngreso?.close();
      fp.open();
    };
    const el = fp.altInput || fp.input;
    if (!el || el._avFpBound) return;
    el._avFpBound = true;
    el.readOnly = true;
    el.setAttribute('inputmode', 'none');
    el.addEventListener('click', openSafe);
    el.addEventListener('mousedown', (e) => e.preventDefault()); // evita focus → reopen
    el.addEventListener('focus', () => {
      // Si algo enfoca el campo (p.ej. al cerrar un modal), no abrir calendario
      if (!fp.isOpen) el.blur();
    });
  },

  closeCalendars() {
    try {
      this.fpFecha?.close();
    } catch (_) {}
    try {
      this.fpIngreso?.close();
    } catch (_) {}
    // Limpiar calendarios huérfanos en el body
    document.querySelectorAll('.flatpickr-calendar.open').forEach((cal) => {
      cal.classList.remove('open');
      cal.style.display = 'none';
    });
  },

  invalidateCarnet() {
    this.carnetOk = false;
    this.carnetDni = '';
    this.carnetAt = '';
    this.renderCarnetStatus();
  },

  renderCarnetStatus() {
    const el = document.getElementById('carnetStatus');
    if (!el) return;
    if (this.carnetOk) {
      el.className = 'carnet-status is-ok';
      el.innerHTML = `
        <i data-lucide="shield-check"></i>
        <div>
          <strong>Carnet verificado</strong>
          <span>DNI ${AV.escape(this.carnetDni)} confirmado · ${AV.escape(this.carnetAt)}</span>
        </div>`;
    } else {
      el.className = 'carnet-status is-pending';
      el.innerHTML = `
        <i data-lucide="shield-alert"></i>
        <div>
          <strong>Pendiente de verificación</strong>
          <span>Aún no se escaneó el carnet</span>
        </div>`;
    }
    if (window.lucide) lucide.createIcons({ nodes: [el] });
  },

  async scanCarnet() {
    this.closeCalendars();
    const dni = document.getElementById('dni')?.value.trim() || '';
    await AV.qr.openScanner({
      title: 'Escanear carnet del trabajador',
      expectedDni: dni,
      onMatch: ({ dni: scanned }) => {
        this.carnetOk = true;
        this.carnetDni = scanned;
        const stamp = AV.registroNow();
        this.carnetAt = `${AV.fmtDate(stamp.fechaRegistro)} ${stamp.horaRegistro}`;
        this.renderCarnetStatus();
      },
    });
  },

  updateCatalogMeta() {
    const el = document.getElementById('catalogMeta');
    if (!el) return;
    // Sin texto técnico para el usuario final
    el.hidden = true;
    el.textContent = '';
  },

  setDniStatus(type, text) {
    const el = document.getElementById('dniStatus');
    if (!el) return;
    el.className = 'dni-status' + (type ? ' is-' + type : '');
    el.textContent = text || '';
  },

  clearWorkerFields() {
    document.getElementById('nombres').value = '';
    document.getElementById('cargo').value = '';
    this.fpIngreso.clear();
  },

  async openHoraModal() {
    if (this._horaModalBusy) return;
    this._horaModalBusy = true;
    this.closeCalendars();

    const horaEl = document.getElementById('horaSalida');
    const actualRaw = horaEl?.value || AV.nowTime();
    const actual = AV.fmtTime12(actualRaw) || AV.nowTime();
    let picker = null;

    try {
      const result = await Swal.fire({
        title: 'Hora de salida',
        html: `
        <div class="hora-modal">
          <p class="hora-modal-hint">Seleccione la hora (AM / PM)</p>
          <input id="swalHoraPick" type="text" value="${AV.escape(actual)}" readonly tabindex="-1" />
        </div>
      `,
        showCancelButton: true,
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#1b6b3a',
        cancelButtonColor: '#6b7785',
        focusConfirm: false,
        allowOutsideClick: true,
        returnFocus: false,
        customClass: { popup: 'swal-hora' },
        didOpen: () => {
          const input = document.getElementById('swalHoraPick');
          picker = flatpickr(input, {
            enableTime: true,
            noCalendar: true,
            dateFormat: 'h:i K',
            time_24hr: false,
            defaultDate: actual,
            inline: true,
            static: true,
            clickOpens: false,
            disableMobile: true,
            minuteIncrement: 1,
          });
        },
        willClose: () => {
          try {
            picker?.destroy();
          } catch (_) {}
          picker = null;
        },
        preConfirm: () => {
          const v = document.getElementById('swalHoraPick')?.value?.trim();
          if (!v) {
            Swal.showValidationMessage('Elija una hora');
            return false;
          }
          return AV.fmtTime12(v);
        },
      });

      if (result.isConfirmed && result.value && horaEl) {
        horaEl.value = result.value;
      }
    } finally {
      try {
        horaEl?.blur();
      } catch (_) {}
      document.activeElement?.blur?.();
      setTimeout(() => {
        this._horaModalBusy = false;
      }, 400);
    }
  },

  syncMotivoUI() {
    this.form?.querySelectorAll('.motivo-opt').forEach((lab) => {
      const input = lab.querySelector('input[type="radio"]');
      lab.classList.toggle('is-selected', !!(input && input.checked));
    });
  },

  toggleMotivoOtro() {
    const wrap = document.getElementById('motivoOtroWrap');
    const input = document.getElementById('motivoOtro');
    const isOtro = this.form.querySelector('input[name="motivo"]:checked')?.value === 'Otro';
    if (!wrap || !input) return;
    wrap.hidden = !isOtro;
    input.required = isOtro;
    if (!isOtro) input.value = '';
    else setTimeout(() => input.focus(), 50);
  },

  stampRegistro() {
    // Solo en memoria / payload — no hay campos visibles en el formulario
    this._registroStamp = AV.registroNow();
  },

  fillWorker(w, opts = {}) {
    if (!w) return;
    if (!opts.skipDni) document.getElementById('dni').value = w.dni || '';
    document.getElementById('nombres').value = w.nombres || '';
    document.getElementById('cargo').value = w.cargo || '';
    if (w.fIngreso) this.fpIngreso.setDate(w.fIngreso, true);
    else this.fpIngreso.clear();
  },

  setDniRespStatus(type, text) {
    const el = document.getElementById('dniRespStatus');
    if (!el) return;
    el.className = 'dni-status' + (type ? ' is-' + type : '');
    el.textContent = text || '';
  },

  clearResponsableFields() {
    document.getElementById('responsable').value = '';
    document.getElementById('puestoResponsable').value = '';
  },

  fillResponsable(w, opts = {}) {
    if (!w) return;
    if (!opts.skipDni) document.getElementById('dniResponsable').value = w.dni || '';
    document.getElementById('responsable').value = w.nombres || '';
    document.getElementById('puestoResponsable').value = w.cargo || '—';
  },

  onDniResponsable: AV.debounce(async function (raw, force) {
    const self = AV.registro;
    const dni = String(raw || '').trim();

    if (dni.length < 8) {
      self.clearResponsableFields();
      self.setDniRespStatus('', dni.length ? 'Complete el DNI…' : '');
      return;
    }

    const token = ++self._lookupTokenResp;
    self.setDniRespStatus('loading', 'Buscando responsable…');

    try {
      const { worker, source } = await AV.workers.resolveByDni(dni);
      if (token !== self._lookupTokenResp) return;
      if (worker) {
        self.fillResponsable(worker, { skipDni: true });
        self.setDniRespStatus(
          'ok',
          source === 'remote' ? 'Responsable encontrado (Sheets)' : 'Responsable encontrado'
        );
      } else {
        self.clearResponsableFields();
        self.setDniRespStatus(
          'err',
          navigator.onLine ? 'DNI no encontrado' : 'Sin internet y no está en el listado local'
        );
        if (force) AV.toast('warning', 'DNI no encontrado', 'Verifique el número del responsable');
      }
    } catch (e) {
      if (token !== self._lookupTokenResp) return;
      self.clearResponsableFields();
      self.setDniRespStatus('err', 'No se pudo consultar');
    }
  }, 280),

  onDniInput: AV.debounce(async function (raw, force) {
    const self = AV.registro;
    const dni = String(raw || '').trim();

    if (dni.length < 8) {
      self.clearWorkerFields();
      self.clearDniBlock();
      self.setDniStatus('', dni.length ? 'Complete el DNI…' : '');
      self.refreshPdfFromForm();
      return;
    }

    const token = ++self._lookupToken;
    self.setDniStatus('loading', 'Buscando trabajador…');

    const afterFound = async (worker, source) => {
      if (token !== self._lookupToken) return;
      self.fillWorker(worker, { skipDni: true });
      self.refreshPdfFromForm();
      try {
        const draft = self.collect();
        AV.pdf.prefetch(draft);
      } catch (_) {}

      const ya = await self.checkPaseHoy(dni);
      if (token !== self._lookupToken) return;
      if (ya) {
        self.markDniBlocked(ya);
      } else {
        self.clearDniBlock();
        self.setDniStatus(
          'ok',
          source === 'remote' ? 'Trabajador encontrado (Sheets)' : 'Trabajador encontrado'
        );
      }
    };

    try {
      const { worker, source } = await AV.workers.resolveByDni(dni);
      if (token !== self._lookupToken) return;
      if (worker) {
        await afterFound(worker, source);
        return;
      }
      self.clearWorkerFields();
      self.clearDniBlock();
      self.setDniStatus(
        'err',
        navigator.onLine ? 'DNI no encontrado' : 'Sin internet y no está en el listado local'
      );
      self.refreshPdfFromForm();
      if (force) AV.toast('warning', 'DNI no encontrado', 'Verifique el número o agréguelo en BD-TRABAJADORES');
    } catch (e) {
      if (token !== self._lookupToken) return;
      self.clearWorkerFields();
      self.clearDniBlock();
      self.setDniStatus('err', 'No se pudo consultar');
      self.refreshPdfFromForm();
    }
  }, 280),

  collect() {
    const motivoRaw = this.form.querySelector('input[name="motivo"]:checked')?.value || '';
    const motivoOtro = document.getElementById('motivoOtro')?.value.trim() || '';
    const motivo =
      motivoRaw === 'Otro' && motivoOtro
        ? `Otro: ${motivoOtro}`
        : motivoRaw;

    const stamp = AV.registroNow(); // hora exacta al guardar (no se muestra en UI)
    this._registroStamp = stamp;

    return {
      id: AV.uid(),
      dni: document.getElementById('dni').value.trim(),
      nombres: document.getElementById('nombres').value.trim(),
      cargo: document.getElementById('cargo').value.trim(),
      fIngreso: document.getElementById('fIngreso').value.trim(),
      motivo,
      motivoDetalle: motivoRaw === 'Otro' ? motivoOtro : '',
      fechaSalida: document.getElementById('fechaSalida').value.trim(),
      horaSalida: AV.fmtTime12(document.getElementById('horaSalida').value.trim()),
      horaSalida24: AV.toTime24(document.getElementById('horaSalida').value.trim()),
      fechaRegistro: stamp.fechaRegistro,
      horaRegistro: stamp.horaRegistro,
      observacion: document.getElementById('observacion').value.trim(),
      responsable: document.getElementById('responsable').value.trim(),
      dniResponsable: document.getElementById('dniResponsable').value.trim(),
      puestoResponsable: document.getElementById('puestoResponsable').value.trim(),
      carnetVerificado: !!this.carnetOk,
      carnetDniEscaneado: this.carnetDni || '',
      carnetVerificadoAt: this.carnetAt || '',
      createdAt: stamp.createdAt,
    };
  },

  validate(data) {
    if (!data.dni || data.dni.length < 8) return 'Ingresa el DNI del trabajador';
    if (this.dniBlockedHoy || AV.queue.findPaseHoy(data.dni)) {
      return 'Este trabajador ya tiene un pase de salida hoy. No se puede registrar otro el mismo día.';
    }
    if (!data.nombres) return 'Ese DNI no tiene datos. Espera a que cargue o verifica el número';
    if (!data.cargo) return 'Sin cargo para este DNI';
    if (!data.fIngreso) return 'Sin fecha de ingreso para este DNI';
    if (!data.motivo) return 'Seleccione el motivo';
    if (this.form.querySelector('input[name="motivo"]:checked')?.value === 'Otro') {
      if (!document.getElementById('motivoOtro')?.value.trim()) {
        return 'Escriba el motivo en Otros';
      }
    }
    if (!data.fechaSalida) return 'Indica fecha de salida';
    if (!data.horaSalida) return 'Indica hora de salida';
    if (!data.responsable) return 'Ingrese un DNI de responsable válido';
    if (!data.dniResponsable) return 'Ingrese el DNI del responsable';
    if (!data.puestoResponsable) return 'El responsable no tiene puesto registrado';
    if (!this.carnetOk || data.carnetDniEscaneado !== data.dni) {
      return 'Debe escanear el carnet del trabajador para verificar su identidad';
    }
    return null;
  },

  async submit() {
    const data = this.collect();
    // Revalidar en tiempo real por si otro equipo ya registró
    const ya = await this.checkPaseHoy(data.dni);
    if (ya) {
      this.markDniBlocked(ya);
      AV.toast('warning', 'Pase duplicado', 'Esta persona ya tiene un pase de salida hoy');
      return;
    }
    const err = this.validate(data);
    if (err) {
      AV.toast('warning', 'Revisa el formulario', err);
      return;
    }

    const btn = document.getElementById('btnGuardar');
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML =
      '<span class="btn-spinner" aria-hidden="true"></span><span>Guardando…</span>';

    try {
      const result = await AV.api.guardarPermiso(data);
      this.lastSaved = {
        ...data,
        ...result.data,
        syncStatus: result.offline ? 'pending' : 'synced',
      };
      AV.pwa.updateQueuePill();

      const msg = result.offline
        ? 'Guardado en el dispositivo. Se enviará automáticamente cuando haya conexión.'
        : 'Pase de salida registrado correctamente.';

      const ask = await Swal.fire({
        icon: 'success',
        title: 'Pase registrado',
        text: msg,
        showCancelButton: true,
        confirmButtonText: 'Descargar PDF',
        cancelButtonText: 'Continuar',
        confirmButtonColor: '#c8102e',
        cancelButtonColor: '#6b7785',
      });

      this.enablePdfButton();

      if (ask.isConfirmed) {
        try {
          await AV.pdf.preview(this.lastSaved);
        } catch (pdfErr) {
          console.error('[pdf]', pdfErr);
          await Swal.fire({
            icon: 'error',
            title: 'No se pudo generar el PDF',
            text: pdfErr.message || 'Error al crear el documento',
            confirmButtonColor: '#1b6b3a',
          });
        }
      }

      // No ocultar el botón al limpiar
      this.resetForm(true);
      document.dispatchEvent(new CustomEvent('av:historial-changed'));
      this.enablePdfButton();
    } catch (e) {
      if (e.code === 'DUPLICATE' || /ya tiene un pase/i.test(e.message || '')) {
        this.dniBlockedHoy = true;
        this.markDniBlocked(this.lastPaseHoy || { horaSalida: '' });
        AV.toast('warning', 'Pase duplicado', e.message || 'Ya tiene pase hoy');
        return;
      }
      AV.toast('error', 'No se pudo guardar', e.message || 'Error');
    } finally {
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
      if (!this.dniBlockedHoy) btn.disabled = false;
      btn.innerHTML = '<i data-lucide="save"></i> Registrar pase de salida';
      if (window.lucide) lucide.createIcons({ nodes: [btn] });
    }
  },

  resetForm(full = true) {
    if (!full) return;
    this.form.reset();
    this.clearWorkerFields();
    this.clearResponsableFields();
    this.clearDniBlock();
    this.setDniStatus('', '');
    this.setDniRespStatus('', '');
    this.invalidateCarnet();
    this.fpFecha.setDate(AV.today(), true);
    document.getElementById('horaSalida').value = AV.nowTime();
    this.fpIngreso.clear();
    this.stampRegistro();
    this.syncMotivoUI();
    this.toggleMotivoOtro();
    this.refreshPdfFromForm();
    document.getElementById('dni')?.focus();
  },
};
