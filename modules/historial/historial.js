/**
 * Historial local: pendiente / enviado (sync automático al recuperar internet)
 */
window.AV = window.AV || {};

AV.historial = {
  init() {
    document.addEventListener('av:historial-changed', () => this.render());
    document.addEventListener('av:queue-updated', () => this.render());

    AV.queue.recoverStuck();
    AV.pwa.updateQueuePill();
    this.render();
  },

  render() {
    const el = document.getElementById('historialList');
    const summary = document.getElementById('historialSummary');
    if (!el) return;
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
            <span class="hist-sum-pill is-local"><i data-lucide="smartphone"></i> Solo este celular</span>
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
          <p class="helper" style="margin-top:8px">Los registros quedan aquí hasta enviarse</p>
        </div>`;
      if (window.lucide) lucide.createIcons({ nodes: [el] });
      return;
    }

    el.innerHTML = items
      .map((p) => {
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
                ? 'Subido al servidor'
                : 'Guardado en el celular — se enviará solo al detectar internet'
            }
          </p>
        </article>`;
      })
      .join('');

    if (window.lucide) lucide.createIcons({ nodes: [el] });
  },
};
