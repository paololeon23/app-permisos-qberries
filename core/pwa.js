/**
 * Registro PWA + Service Worker + auto-sync al recuperar internet
 */
window.AV = window.AV || {};

AV.pwa = {
  _syncTimer: null,
  _syncing: false,
  _watchTimer: null,

  async register() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      console.info('[pwa] SW registered', reg.scope);
      return reg;
    } catch (e) {
      console.warn('[pwa] SW fail', e);
      return null;
    }
  },

  updateNetPill() {
    const pill = document.getElementById('netPill');
    if (!pill) return;
    const online = navigator.onLine;
    pill.classList.toggle('offline', !online);
    pill.classList.toggle('is-offline', !online);
    pill.classList.toggle('is-online', online);
    pill.innerHTML = online
      ? '<span class="status-dot"></span><span class="status-text">En línea</span>'
      : '<span class="status-dot"></span><span class="status-text">Sin conexión</span>';
  },

  updateQueuePill() {
    const pill = document.getElementById('queuePill');
    const count = document.getElementById('queueCount');
    if (!pill) return;
    const n = AV.queue.pendingCount();
    if (count) count.textContent = String(n);
    else {
      pill.innerHTML = `<i data-lucide="cloud-upload"></i><span class="status-text"><span id="queueCount">${n}</span> pendientes</span>`;
      if (window.lucide) lucide.createIcons({ nodes: [pill] });
    }
    pill.hidden = n === 0;
  },

  maybeShowInstallHint() {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const hint = document.getElementById('installHint');
    if (hint && !standalone) hint.classList.add('show');
  },

  /** Bloquea zoom por gestos (pinch iOS / multi-touch) */
  lockZoom() {
    const blockMulti = (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', blockMulti, { passive: false });
  },

  /**
   * Sube pendientes automáticamente al detectar red.
   * Reintenta porque el evento "online" a veces llega antes de que haya internet real.
   */
  scheduleAutoSync(reason = 'online', delayMs = 800) {
    if (!navigator.onLine) return;
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => {
      this.runAutoSync(reason);
    }, delayMs);
  },

  async runAutoSync(reason = 'online') {
    if (!navigator.onLine) return;
    if (!AV.queue) return;

    AV.queue.recoverStuck();
    AV.queue.pruneLocalHistory?.(48);
    const pending = AV.queue.pendingCount();
    if (!pending) {
      this.updateQueuePill();
      document.dispatchEvent(new CustomEvent('av:historial-changed'));
      return;
    }

    if (this._syncing) return;
    this._syncing = true;

    try {
      // Verificar red real contra el proxy (no solo navigator.onLine)
      const probe = await AV.api.ping();
      if (!probe || probe.ok !== true || probe.api !== 'permisos') {
        console.warn('[auto-sync] ping falló', reason, probe);
        this.updateNetPill();
        this.updateQueuePill();
        return;
      }

      let last = { sent: 0, failed: 0, error: '' };
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (!navigator.onLine) break;
        AV.queue.recoverStuck();
        if (AV.queue.pendingCount() === 0) break;

        last = await AV.queue.flush();
        if (last.sent > 0 && AV.queue.pendingCount() === 0) break;
        if (last.error && /no autorizado|UNAUTHORIZED|WRONG_API/i.test(last.error)) break;
        if (attempt < 3 && (last.failed || AV.queue.pendingCount() > 0)) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }

      this.updateNetPill();
      this.updateQueuePill();
      document.dispatchEvent(new CustomEvent('av:historial-changed'));

      if (last.sent > 0) {
        AV.toast('success', 'Sincronizado', `${last.sent} pase(s) enviados al recuperar internet`);
      } else if (last.failed && last.error) {
        console.warn('[auto-sync]', reason, last.error);
      }
    } catch (e) {
      console.warn('[auto-sync] fail', reason, e);
    } finally {
      this._syncing = false;
      this.ensurePendingWatch();
    }
  },

  /** Mientras haya pendientes y esté en línea, reintenta cada ~20s */
  ensurePendingWatch() {
    clearInterval(this._watchTimer);
    this._watchTimer = setInterval(() => {
      if (!navigator.onLine) return;
      if (!AV.queue) return;
      AV.queue.recoverStuck();
      if (AV.queue.pendingCount() > 0 && !this._syncing) {
        this.scheduleAutoSync('watch', 0);
      }
    }, 20000);
  },
};

window.addEventListener('online', () => {
  AV.pwa.updateNetPill();
  // Esperar un momento: el móvil marca "online" un poco antes de tener datos reales
  AV.pwa.scheduleAutoSync('online', 1000);
});

window.addEventListener('offline', () => {
  AV.pwa.updateNetPill();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    AV.pwa.updateNetPill();
    AV.queue?.pruneLocalHistory?.(48);
    AV.pwa.updateQueuePill();
    if (navigator.onLine) AV.pwa.scheduleAutoSync('visible', 500);
    document.dispatchEvent(new CustomEvent('av:historial-changed'));
  }
});

window.addEventListener('pageshow', () => {
  if (navigator.onLine) AV.pwa.scheduleAutoSync('pageshow', 400);
});

document.addEventListener('av:queue-updated', () => {
  AV.pwa.updateQueuePill();
  // Si se encola algo y ya hay red, subir solo
  if (navigator.onLine) AV.pwa.scheduleAutoSync('queued', 600);
});
