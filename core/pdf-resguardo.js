/**
 * PDF resguardo — Pase de salida Q Berries
 * Offline-first: logo en cache, vista previa en modal, descarga.
 * Helvetica solo ASCII → normalizamos texto.
 */
window.AV = window.AV || {};

AV.pdf = {
  _logoCache: null,
  _logoPromise: null,
  _lastUrl: null,

  _getJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (typeof window.jsPDF === 'function') return window.jsPDF;
    if (window.jsPDF && window.jsPDF.jsPDF) return window.jsPDF.jsPDF;
    return null;
  },

  /** Solo ASCII seguro para jsPDF */
  safe(text) {
    var s = String(text == null ? '' : text);
    try {
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (_) {}
    s = s
      .replace(/ñ/g, 'n')
      .replace(/Ñ/g, 'N')
      .replace(/[^\x20-\x7E\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return s || '-';
  },

  /** Precarga logo (rápido al tocar el botón, online u offline vía SW/cache) */
  warmup() {
    return this._loadLogo();
  },

  async _loadLogo() {
    if (this._logoCache) return this._logoCache;
    if (this._logoPromise) return this._logoPromise;

    var self = this;
    this._logoPromise = (async function () {
      try {
        var res = await fetch('./assets/logo-qberries-white.png', { cache: 'force-cache' });
        if (!res.ok) res = await fetch('./assets/logo-qberries.png', { cache: 'force-cache' });
        if (!res.ok) return null;
        var blob = await res.blob();
        var raw = await new Promise(function (resolve, reject) {
          var r = new FileReader();
          r.onload = function () {
            resolve(r.result);
          };
          r.onerror = reject;
          r.readAsDataURL(blob);
        });

        var dataUrl = await new Promise(function (resolve) {
          var img = new Image();
          img.onload = function () {
            var c = document.createElement('canvas');
            var pad = 14;
            c.width = img.width + pad * 2;
            c.height = img.height + pad * 2;
            var ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, pad, pad);
            resolve(c.toDataURL('image/png'));
          };
          img.onerror = function () {
            resolve(raw);
          };
          img.src = raw;
        });

        self._logoCache = dataUrl;
        return dataUrl;
      } catch (_) {
        return null;
      } finally {
        self._logoPromise = null;
      }
    })();

    return this._logoPromise;
  },

  _filename(p) {
    var S = this.safe.bind(this);
    var day = String(p.fechaSalida || p.fechaRegistro || AV.today() || '').replace(/-/g, '');
    return 'PaseSalida_' + S(p.dni || 'sinDNI') + '_' + (day || 'borrador') + '.pdf';
  },

  _revokeLast() {
    if (this._lastUrl) {
      try {
        URL.revokeObjectURL(this._lastUrl);
      } catch (_) {}
      this._lastUrl = null;
    }
  },

  _downloadBlob(blob, filename) {
    var name = this.safe(filename).replace(/\s+/g, '_');
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    }, 60000);
  },

  /** Construye el PDF formal y devuelve blob + url */
  async build(permiso) {
    var JsPDF = this._getJsPDF();
    if (!JsPDF) {
      throw new Error('No se cargo la libreria PDF. Recarga la pagina e intenta de nuevo.');
    }

    var p = permiso || {};
    var S = this.safe.bind(this);
    var doc = new JsPDF({ unit: 'mm', format: 'a4', compress: false });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var margin = 14;
    var y = 12;
    var colW = (W - margin * 2 - 6) / 2;

    // Un solo marco (más rápido)
    doc.setDrawColor(27, 107, 58);
    doc.setLineWidth(0.45);
    doc.rect(8, 8, W - 16, H - 16);

    // Logo solo si ya está en cache (no bloquear)
    var logo = this._logoCache || null;
    if (!logo && !this._logoPromise) {
      this.warmup();
    } else if (!logo && this._logoPromise) {
      try {
        logo = await Promise.race([
          this._logoPromise,
          new Promise(function (r) {
            setTimeout(function () {
              r(null);
            }, 80);
          }),
        ]);
      } catch (_) {
        logo = null;
      }
    }
    if (logo) {
      try {
        doc.addImage(logo, 'PNG', margin, y, 36, 16);
      } catch (e) {
        console.warn('[pdf] logo omitido', e);
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(27, 107, 58);
    doc.text('Q BERRIES', W - margin, y + 6, { align: 'right' });
    doc.setFontSize(10);
    doc.setTextColor(30, 40, 35);
    doc.text('PASE DE SALIDA', W - margin, y + 13, { align: 'right' });

    y = 34;
    doc.setDrawColor(27, 107, 58);
    doc.setLineWidth(0.45);
    doc.line(margin, y, W - margin, y);
    y += 8;

    function section(title) {
      doc.setFillColor(238, 246, 241);
      doc.roundedRect(margin, y - 4, W - margin * 2, 7, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(27, 107, 58);
      doc.text(title, margin + 2, y + 0.8);
      y += 9;
    }

    /** Fila alineada: etiqueta arriba, valor debajo, subrayado */
    function row(label, value, x, yy, w) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(110, 110, 110);
      doc.text(S(label).toUpperCase(), x, yy);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.2);
      doc.setTextColor(20, 20, 20);
      var lines = doc.splitTextToSize(S(value), Math.max(10, w - 1));
      doc.text(lines.slice(0, 3), x, yy + 4.8);
      var bump = Math.max(0, (lines.length - 1) * 4);
      doc.setDrawColor(210, 215, 220);
      doc.setLineWidth(0.18);
      doc.line(x, yy + 7 + bump, x + w, yy + 7 + bump);
      return bump;
    }

    /** Dos columnas alineadas en la misma fila */
    function pair(labL, valL, labR, valR) {
      var bL = row(labL, valL, margin, y, colW);
      var bR = row(labR, valR, margin + colW + 6, y, colW);
      y += 13 + Math.max(bL, bR);
    }

    section('DATOS DEL TRABAJADOR');
    pair('DNI', p.dni, 'Apellidos y nombres', p.nombres);
    pair(
      'Cargo',
      p.cargo,
      'F. Ingreso',
      AV.fmtDate ? AV.fmtDate(p.fIngreso) : p.fIngreso
    );

    section('MOTIVO DEL PASE');
    // Solo la opcion elegida (no todas las cajas)
    var motivoTexto = S(p.motivo || '-');
    var motivoDetalle = S(p.motivoDetalle || '');
    if (motivoDetalle && motivoTexto.toLowerCase().indexOf('otro') === 0) {
      motivoTexto = 'Otro: ' + motivoDetalle;
    }
    doc.setDrawColor(27, 107, 58);
    doc.setFillColor(238, 246, 241);
    doc.roundedRect(margin, y - 2, W - margin * 2, 12, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(27, 107, 58);
    doc.text(motivoTexto, margin + 4, y + 5.5);
    y += 16;

    section('SALIDA');
    pair(
      'Fecha salida',
      AV.fmtDate ? AV.fmtDate(p.fechaSalida) : p.fechaSalida,
      'Hora de salida',
      AV.fmtTime12 ? AV.fmtTime12(p.horaSalida) : p.horaSalida
    );

    section('RESPONSABLE QUE AUTORIZA');
    pair('Responsable', p.responsable || '-', 'DNI', p.dniResponsable || '-');
    var bumpPuesto = row('Puesto', p.puestoResponsable || '-', margin, y, W - margin * 2);
    y += 14 + bumpPuesto;

    if (p.observacion) {
      section('OBSERVACION');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(30, 30, 30);
      var obs = doc.splitTextToSize(S(p.observacion), W - margin * 2);
      doc.text(obs, margin, y);
      y += obs.length * 4.5 + 6;
    }

    if (y > 235) {
      doc.addPage();
      y = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(27, 107, 58);
    doc.text('VERIFICACION DE CARNET', margin, y);
    y += 8;

    doc.setDrawColor(27, 107, 58);
    if (p.carnetVerificado) {
      doc.setFillColor(236, 253, 243);
      doc.roundedRect(margin, y, W - margin * 2, 22, 2, 2, 'FD');
      doc.setTextColor(6, 118, 71);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('CARNET VERIFICADO POR QR', margin + 4, y + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 40);
      doc.text(
        S('DNI escaneado: ' + (p.carnetDniEscaneado || p.dni) + '  |  ' + (p.carnetVerificadoAt || '')),
        margin + 4,
        y + 15
      );
    } else {
      doc.setFillColor(255, 251, 235);
      doc.roundedRect(margin, y, W - margin * 2, 16, 2, 2, 'FD');
      doc.setTextColor(181, 71, 8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Pendiente de verificacion de carnet', margin + 4, y + 10);
    }
    y += 28;

    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    var cuando = '-';
    try {
      cuando = new Date(p.createdAt || Date.now()).toLocaleString('es-PE');
    } catch (_) {}
    doc.text(S('Generado: ' + cuando + ' · Pase de salida Q Berries'), margin, y);
    doc.text(
      p.syncStatus === 'synced' ? 'Estado: enviado' : p.id ? 'Estado: pendiente' : 'Vista previa',
      W - margin,
      y,
      { align: 'right' }
    );

    // Pie
    doc.setFontSize(6.5);
    doc.setTextColor(150, 150, 150);
    doc.text('Documento interno · Q Berries', W / 2, H - 11, { align: 'center' });

    var filename = this._filename(p);
    var blob = doc.output('blob');
    this._revokeLast();
    var url = URL.createObjectURL(blob);
    this._lastUrl = url;

    return { doc: doc, blob: blob, url: url, filename: filename };
  },

  /** Abre el modal nativo al instante (sin SweetAlert) */
  _openModalShell() {
    var modal = document.getElementById('pdfModal');
    var loading = document.getElementById('pdfLoading');
    var frame = document.getElementById('pdfFrame');
    var dl = document.getElementById('pdfModalDownload');
    if (!modal) return null;

    if (loading) {
      loading.hidden = false;
      loading.classList.remove('is-err');
      loading.textContent = 'Cargando PDF…';
    }
    if (frame) {
      frame.hidden = true;
      try {
        frame.removeAttribute('src');
      } catch (_) {}
    }
    if (dl) dl.disabled = true;

    modal.hidden = false;
    modal.classList.add('is-open');
    document.body.classList.add('pdf-modal-open');
    return { modal: modal, loading: loading, frame: frame, dl: dl };
  },

  _closeModal() {
    var modal = document.getElementById('pdfModal');
    var frame = document.getElementById('pdfFrame');
    if (frame) {
      try {
        frame.removeAttribute('src');
      } catch (_) {}
      frame.hidden = true;
    }
    if (modal) {
      modal.classList.remove('is-open');
      modal.hidden = true;
    }
    document.body.classList.remove('pdf-modal-open');
  },

  _bindModalOnce() {
    if (this._modalBound) return;
    this._modalBound = true;
    var self = this;
    var close = function () {
      self._closeModal();
      if (self._previewResolve) {
        self._previewResolve({ downloaded: false });
        self._previewResolve = null;
      }
    };
    var closeBtn = document.getElementById('pdfModalClose');
    var cancelBtn = document.getElementById('pdfModalCancel');
    var overlay = document.getElementById('pdfModal');
    var dlBtn = document.getElementById('pdfModalDownload');
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target && e.target.id === 'pdfModal') close();
      });
    }
    if (dlBtn) {
      dlBtn.addEventListener('click', function () {
        if (self._currentBuilt) {
          self._downloadBlob(self._currentBuilt.blob, self._currentBuilt.filename);
          if (self._previewResolve) {
            self._previewResolve({ downloaded: true });
            self._previewResolve = null;
          }
          self._closeModal();
        }
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.getElementById('pdfModal')?.classList.contains('is-open')) {
        close();
      }
    });
  },

  _fingerprint(p) {
    if (!p) return '';
    return [p.dni, p.nombres, p.motivo, p.fechaSalida, p.horaSalida, p.responsable, p.carnetVerificado].join('|');
  },

  /** Vista previa: modal AL TOQUE, PDF enseguida */
  preview(permiso) {
    var self = this;
    this._bindModalOnce();
    var ui = this._openModalShell();

    var dniKey = String((permiso && permiso.dni) || '');
    var sig = this._fingerprint(permiso);
    var built = null;
    if (this._prefetch && this._prefetch.sig === sig && this._prefetch.url) {
      built = this._prefetch;
    } else if (this._prefetch && this._prefetch.dni === dniKey && this._prefetch.url) {
      built = this._prefetch;
    }

    return new Promise(function (resolve) {
      self._previewResolve = resolve;

      var showBuilt = function (b) {
        if (!b || !ui) return;
        self._currentBuilt = b;
        if (ui.frame) {
          ui.frame.src = b.url + '#toolbar=0&view=FitH';
          ui.frame.hidden = false;
        }
        if (ui.loading) ui.loading.hidden = true;
        if (ui.dl) ui.dl.disabled = false;
      };

      if (built) {
        requestAnimationFrame(function () {
          showBuilt(built);
        });
        return;
      }

      self
        .build(permiso)
        .then(function (b) {
          self._prefetch = {
            dni: dniKey,
            sig: sig,
            blob: b.blob,
            url: b.url,
            filename: b.filename,
          };
          showBuilt(b);
        })
        .catch(function (err) {
          console.error('[pdf]', err);
          if (ui && ui.loading) {
            ui.loading.textContent = 'No se pudo generar el PDF';
            ui.loading.classList.add('is-err');
          }
        });
    });
  },

  /** Prefetch en segundo plano al encontrar DNI */
  async prefetch(permiso) {
    try {
      await this.warmup();
      var sig = this._fingerprint(permiso);
      var built = await this.build(permiso);
      this._prefetch = {
        dni: String((permiso && permiso.dni) || ''),
        sig: sig,
        blob: built.blob,
        url: built.url,
        filename: built.filename,
      };
    } catch (e) {
      console.warn('[pdf] prefetch', e);
    }
  },

  async generar(permiso) {
    var built = await this.build(permiso);
    this._downloadBlob(built.blob, built.filename);
    return { filename: built.filename };
  },
};
