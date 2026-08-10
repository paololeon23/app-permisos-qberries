/**
 * Historial local: pendiente / enviado
 * - Botón PDF por tarjeta
 * - Se borra del celular a las 48h (solo local; Sheets no se toca)
 */
window.AV = window.AV || {};

AV.historial = {
  init() {
    document.addEventListener('av:historial-changed', () => this.render());
    document.addEventListener('av:queue-updated', () => this.render());

    AV.queue.recoverStuck();
    AV.queue.pruneLocalHistory(48);
    AV.pwa.updateQueuePill();

    const list = document.getElementById('historialList');
    list?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-hist-pdf]');
      if (!btn) return;
      const idx = Number(btn.getAttribute('data-hist-pdf'));
      this.openPdf(idx);
    });

    this.render();
  },

  openPdf(idx) {
    const items = AV.queue.history();
    const p = items[idx];
    if (!p) {
      AV.toast('warning', 'PDF', 'No se encontró ese pase en el historial');
      return;
    }
    AV.pdf.preview(p).catch((err) => {
      console.error('[historial pdf]', err);
      AV.toast('error', 'PDF', err.message || 'No se pudo abrir');
    });
  },

  render() {
    const el = document.getElementById('historialList');
    const summary = document.getElementById('historialSummary');
    if (!el) return;

    AV.queue.pruneLocalHistory(48);
    const items = AV.queue.history();
    const pending = items.filter((p) => (p.syncStatus || 'pending') !== 'synced').length;
    const sent = items.length - pending;

    if (summary) {
      if (!items.length) {
        summary.hidden = true;
      } else {
        summary.hidden = false;
        summary.innerHTML = `
          <div class="hist-summary">
            <span class="hist-sum-pill is-local"><i data-lucide="smartphone"></i> Solo este celular · 48h</span>
            <span class="hist-sum-pill is-ok">${sent} enviado(s)</span>
            <span class="hist-sum-pill is-wait">${pending} pendiente(s)</span>
          </div>`;
        if (window.lucide) lucide.createIcons({ nodes: [summary] });
      }
    }

    if (!items.length) {
      el.innerHTML = `
        <div class="empty-state">
          <i data-lucide="inbox"></i>
          <div>Aún no hay pases en este celular</div>
          <p class="helper" style="margin-top:8px">Se guardan aquí hasta 48 horas (solo local)</p>
        </div>`;
      if (window.lucide) lucide.createIcons({ nodes: [el] });
      return;
    }

    el.innerHTML = items
      .map((p, idx) => {
        const status = p.syncStatus || 'pending';
        const synced = status === 'synced';
        const when = p._savedAt || p.createdAt || '';
        let whenLabel = '';
        try {
          whenLabel = when ? new Date(when).toLocaleString('es-PE') : '';
        } catch (_) {}

        return `
        <article class="hist-item ${synced ? 'is-synced' : 'is-pending'}">
          <div class="hist-top">
            <strong>${AV.escape(p.nombres || 'Sin nombre')}</strong>
            <span class="badge ${synced ? 'synced' : 'pending'}">${
              synced ? 'Enviado' : 'Pendiente de subir'
            }</span>
          </div>
          <div class="hist-meta">
            <span>DNI ${AV.escape(p.dni)}</span>
            <span>${AV.escape(p.motivo || '-')}</span>
            ${whenLabel ? `<span>${AV.escape(whenLabel)}</span>` : ''}
          </div>
          <p class="helper hist-foot">
            ${
              synced
                ? 'Subido al servidor · se borra del celular a las 48h'
                : 'Guardado en el celular — se enviará solo al detectar internet'
            }
          </p>
          <div class="hist-actions">
            <button type="button" class="btn btn-pdf btn-sm" data-hist-pdf="${idx}">
              <i data-lucide="file-text"></i> Ver PDF
            </button>
          </div>
        </article>`;
      })
      .join('');

    if (window.lucide) lucide.createIcons({ nodes: [el] });
  },
};
