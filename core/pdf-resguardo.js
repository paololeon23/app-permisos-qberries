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

    // Android: compartir archivo suele funcionar mejor que <a download>
    try {
      var file = new File([blob], name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Pase de salida', text: name }).catch(function () {
          AV.pdf._downloadAnchor(blob, name);
        });
        return;
      }
    } catch (_) {}

    this._downloadAnchor(blob, name);
  },

  _downloadAnchor(blob, name) {
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

  _field(label, value) {
    return (
      '<div class="pdf-field"><label>' +
      AV.escape(label) +
      '</label><span>' +
      AV.escape(value == null || value === '' ? '-' : value) +
      '</span></div>'
    );
  },

  /** Vista previa HTML (Android no muestra PDF en iframe) */
  _renderPreviewHtml(permiso) {
    var p = permiso || {};
    var motivo = this.safe(p.motivo || '-');
    if (p.motivoDetalle && /^otro/i.test(motivo)) {
      motivo = 'Otro: ' + this.safe(p.motivoDetalle);
    }
    var logo = './assets/logo-qberries.png';
    var carnet = p.carnetVerificado
      ? '<div class="pdf-carnet is-ok"><strong>CARNET VERIFICADO POR QR</strong><br>DNI ' +
        AV.escape(p.carnetDniEscaneado || p.dni || '') +
        (p.carnetVerificadoAt ? ' · ' + AV.escape(p.carnetVerificadoAt) : '') +
        '</div>'
      : '<div class="pdf-carnet is-wait"><strong>Pendiente de verificación de carnet</strong></div>';

    var cuando = '-';
    try {
      cuando = new Date(p.createdAt || Date.now()).toLocaleString('es-PE');
    } catch (_) {}

    return (
      '<article class="pdf-doc">' +
      '<div class="pdf-doc-top">' +
      '<img src="' +
      logo +
      '" alt="Q Berries" />' +
      '<div class="pdf-doc-brand"><p class="co">Q BERRIES</p><p class="ti">PASE DE SALIDA</p></div>' +
      '</div>' +
      '<div class="pdf-sec">DATOS DEL TRABAJADOR</div>' +
      '<div class="pdf-grid">' +
      this._field('DNI', p.dni) +
      this._field('Apellidos y nombres', p.nombres) +
      this._field('Cargo', p.cargo) +
      this._field('F. Ingreso', AV.fmtDate ? AV.fmtDate(p.fIngreso) : p.fIngreso) +
      '</div>' +
      '<div class="pdf-sec">MOTIVO DEL PASE</div>' +
      '<div class="pdf-motivo">' +
      AV.escape(motivo) +
      '</div>' +
      '<div class="pdf-sec">SALIDA</div>' +
      '<div class="pdf-grid">' +
      this._field('Fecha salida', AV.fmtDate ? AV.fmtDate(p.fechaSalida) : p.fechaSalida) +
      this._field('Hora de salida', AV.fmtTime12 ? AV.fmtTime12(p.horaSalida) : p.horaSalida) +
      '</div>' +
      '<div class="pdf-sec">RESPONSABLE QUE AUTORIZA</div>' +
      '<div class="pdf-grid">' +
      this._field('Responsable', p.responsable || '-') +
      this._field('DNI', p.dniResponsable || '-') +
      this._field('Puesto', p.puestoResponsable || '-') +
      '</div>' +
      (p.observacion
        ? '<div class="pdf-sec">OBSERVACIÓN</div><div class="pdf-field"><span>' +
          AV.escape(p.observacion) +
          '</span></div>'
        : '') +
      '<div class="pdf-sec">VERIFICACIÓN DE CARNET</div>' +
      carnet +
      '<div class="pdf-foot"><span>Generado: ' +
      AV.escape(cuando) +
      '</span><span>' +
      AV.escape(p.syncStatus === 'synced' ? 'Estado: enviado' : 'Vista previa') +
      '</span></div>' +
      '</article>'
    );
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
    var preview = document.getElementById('pdfPreview');
    var dl = document.getElementById('pdfModalDownload');
    var wa = document.getElementById('pdfModalWhatsapp');
    if (!modal) return null;

    if (loading) {
      loading.hidden = false;
      loading.classList.remove('is-err');
      loading.textContent = 'Generando vista previa…';
    }
    if (preview) {
      preview.hidden = true;
      preview.innerHTML = '';
    }
    if (dl) dl.disabled = true;
    if (wa) wa.disabled = true;

    modal.hidden = false;
    modal.classList.add('is-open');
    document.body.classList.add('pdf-modal-open');
    return { modal: modal, loading: loading, preview: preview, dl: dl, wa: wa };
  },

  _closeModal() {
    var modal = document.getElementById('pdfModal');
    var preview = document.getElementById('pdfPreview');
    if (preview) {
      preview.innerHTML = '';
      preview.hidden = true;
    }
    if (modal) {
      modal.classList.remove('is-open');
      modal.hidden = true;
    }
    document.body.classList.remove('pdf-modal-open');
  },

  _whatsappText(p) {
    p = p || {};
    var fecha = AV.fmtDate ? AV.fmtDate(p.fechaSalida) : p.fechaSalida || '-';
    var hora = AV.fmtTime12 ? AV.fmtTime12(p.horaSalida) : p.horaSalida || '-';
    return (
      '*Pase de salida · Q Berries*\n' +
      'DNI: ' + (p.dni || '-') + '\n' +
      'Nombre: ' + (p.nombres || '-') + '\n' +
      'Motivo: ' + (p.motivo || '-') + '\n' +
      'Salida: ' + fecha + ' ' + hora + '\n' +
      'Responsable: ' + (p.responsable || '-')
    );
  },

  async shareWhatsApp() {
    var built = this._currentBuilt;
    if (!built || !built.blob) {
      AV.toast('warning', 'PDF', 'Espere a que se genere el documento');
      return;
    }
    var name = this.safe(built.filename || 'pase-salida.pdf').replace(/\s+/g, '_');
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    var text = this._whatsappText(this._currentPermiso || {});

    try {
      var file = new File([built.blob], name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Pase de salida Q Berries',
          text: text,
        });
        AV.toast('success', 'WhatsApp', 'Elija WhatsApp en el menú compartir');
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn('[pdf] share file', e);
    }

    // Fallback: descarga el PDF + abre WhatsApp con el resumen
    try {
      this._downloadAnchor(built.blob, name);
    } catch (_) {}
    var waUrl = 'https://wa.me/?text=' + encodeURIComponent(text + '\n\n(Adjunte el PDF descargado)');
    window.open(waUrl, '_blank', 'noopener');
    AV.toast('info', 'WhatsApp', 'Se descargó el PDF; adjúntelo en el chat');
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
    var waBtn = document.getElementById('pdfModalWhatsapp');
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
          setTimeout(function () {
            self._closeModal();
          }, 250);
        }
      });
    }
    if (waBtn) {
      waBtn.addEventListener('click', function () {
        self.shareWhatsApp();
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

  /** Vista previa: modal AL TOQUE (HTML en celular; PDF listo para descargar) */
  preview(permiso) {
    var self = this;
    this._bindModalOnce();
    this._currentPermiso = permiso || null;
    var ui = this._openModalShell();

    var dniKey = String((permiso && permiso.dni) || '');
    if (!dniKey || dniKey.length < 8) {
      if (ui && ui.loading) {
        ui.loading.hidden = false;
        ui.loading.textContent = 'Ingrese un DNI válido';
        ui.loading.classList.add('is-err');
      }
      return Promise.resolve({ downloaded: false });
    }

    var sig = this._fingerprint(permiso);
    var built = null;
    if (this._prefetch && this._prefetch.sig === sig && this._prefetch.url) {
      built = this._prefetch;
    } else if (this._prefetch && this._prefetch.dni === dniKey && this._prefetch.url) {
      // Solo reutilizar si huella coincide lo suficiente; si no, regenerar
      if (this._prefetch.sig === sig) built = this._prefetch;
    }

    return new Promise(function (resolve) {
      self._previewResolve = resolve;

      var showBuilt = function (b) {
        if (!b || !ui) return;
        self._currentBuilt = b;
        self._currentPermiso = permiso || self._currentPermiso;
        if (ui.preview) {
          ui.preview.innerHTML = self._renderPreviewHtml(permiso);
          ui.preview.hidden = false;
        }
        if (ui.loading) ui.loading.hidden = true;
        if (ui.dl) ui.dl.disabled = false;
        if (ui.wa) ui.wa.disabled = false;
      };

      // Mostrar HTML al toque (aunque el PDF aún se genere)
      if (ui && ui.preview) {
        ui.preview.innerHTML = self._renderPreviewHtml(permiso);
        ui.preview.hidden = false;
        if (ui.loading) ui.loading.hidden = true;
      }

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
          // Igual se ve la vista previa HTML; solo falla el archivo descargable
          if (ui && ui.dl) ui.dl.disabled = true;
          if (ui && ui.loading) {
            ui.loading.hidden = false;
            ui.loading.textContent = 'Vista previa OK. No se pudo armar el archivo PDF.';
            ui.loading.classList.add('is-err');
          }
        });
    });
  },

  /** Limpia prefetch para no mostrar PDF de otra persona */
  clearPrefetch() {
    this._prefetch = null;
    this._currentBuilt = null;
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
