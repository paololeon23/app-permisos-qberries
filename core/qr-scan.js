/**
 * Escáner de carnet QR — valida DNI del trabajador
 */
window.AV = window.AV || {};

AV.qr = {
  _scanner: null,
  _busy: false,

  /** Extrae DNI del contenido del QR (flexible) */
  parseDni(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;

    // JSON
    try {
      const j = JSON.parse(text);
      const d = j.dni || j.DNI || j.doc || j.documento || j.id;
      if (d) return String(d).replace(/\D/g, '');
    } catch (_) {}

    // URL ?dni= / &dni=
    try {
      if (/^https?:\/\//i.test(text) || text.includes('=')) {
        const u = new URL(text, 'https://local.invalid');
        const d =
          u.searchParams.get('dni') ||
          u.searchParams.get('DNI') ||
          u.searchParams.get('doc');
        if (d) return String(d).replace(/\D/g, '');
      }
    } catch (_) {}

    // "DNI: 74450913" o similar
    const labeled = text.match(/dni\s*[:#=\-]?\s*(\d{8,12})/i);
    if (labeled) return labeled[1];

    // Solo dígitos
    const only = text.replace(/\D/g, '');
    if (only.length >= 8 && only.length <= 12) return only;

    // Primer bloque de 8–12 dígitos
    const any = text.match(/(\d{8,12})/);
    return any ? any[1] : null;
  },

  async openScanner({ title, expectedDni, onMatch }) {
    if (this._busy) return;
    if (typeof Html5Qrcode === 'undefined') {
      AV.toast('error', 'Escáner', 'Librería no cargada. Recargue la app.');
      return;
    }

    const expected = String(expectedDni || '').replace(/\D/g, '');
    if (expected.length < 8) {
      AV.toast('warning', 'DNI requerido', 'Primero ingrese el DNI del trabajador');
      return;
    }

    this._busy = true;
    let resolved = false;

    const html = `
      <div class="scan-modal">
        <p class="scan-hint">Apunte al código QR del carnet</p>
        <p class="scan-expect">Debe coincidir con DNI <strong>${AV.escape(expected)}</strong></p>
        <div id="qrReader" class="qr-reader"></div>
        <p id="scanFeedback" class="scan-feedback"></p>
      </div>
    `;

    const swalPromise = Swal.fire({
      title: title || 'Escanear carnet',
      html,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Cerrar',
      cancelButtonColor: '#6b7785',
      allowOutsideClick: false,
      customClass: { popup: 'swal-scan' },
      didOpen: async () => {
        const feedback = document.getElementById('scanFeedback');
        try {
          this._scanner = new Html5Qrcode('qrReader');
          await this._scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 240, height: 240 } },
            async (decoded) => {
              if (resolved) return;
              const dni = this.parseDni(decoded);
              if (!dni) {
                if (feedback) {
                  feedback.textContent = 'QR leído, pero no se encontró un DNI válido';
                  feedback.className = 'scan-feedback is-warn';
                }
                return;
              }
              if (dni !== expected) {
                if (feedback) {
                  feedback.textContent = `Carnet DNI ${dni} no coincide con ${expected}`;
                  feedback.className = 'scan-feedback is-err';
                }
                return;
              }

              resolved = true;
              if (feedback) {
                feedback.textContent = 'DNI validado';
                feedback.className = 'scan-feedback is-ok';
              }
              // Voz local: funciona con o sin internet
              AV.voice?.dniValidado?.();
              try {
                await this.stop();
              } catch (_) {}
              if (typeof onMatch === 'function') onMatch({ dni, raw: decoded });
              Swal.close();
              AV.toast('success', 'DNI validado', `Carnet ${dni} verificado`);
            },
            () => {}
          );
        } catch (e) {
          console.error('[qr]', e);
          if (feedback) {
            feedback.textContent =
              'No se pudo abrir la cámara. Permita el acceso e intente de nuevo.';
            feedback.className = 'scan-feedback is-err';
          }
        }
      },
      willClose: async () => {
        try {
          await this.stop();
        } catch (_) {}
        this._busy = false;
      },
    });

    return swalPromise;
  },

  async stop() {
    if (!this._scanner) return;
    try {
      const s = this._scanner;
      this._scanner = null;
      if (s.isScanning) await s.stop();
      await s.clear();
    } catch (_) {}
  },
};
