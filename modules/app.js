/**
 * Bootstrap app — tabs rápidas + init módulos
 */
(() => {
  const switchTab = (name) => {
    document.querySelectorAll('.panel').forEach((p) => {
      p.classList.toggle('is-active', p.dataset.panel === name);
    });
    document.querySelectorAll('.nav-btn').forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (name === 'historial') AV.historial.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Prefetch segunda pestaña al primer idle
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => AV.historial.render());
  }

  async function boot() {
    // Recuperar cola/historial aunque se haya cerrado la app
    try {
      await AV.storage.hydrate();
    } catch (e) {
      console.warn('[boot] hydrate', e);
    }

    AV.pwa.updateNetPill();
    AV.pwa.updateQueuePill();
    AV.pwa.maybeShowInstallHint();
    AV.pwa.lockZoom();
    await AV.pwa.register();

    AV.registro.init();
    AV.historial.init();

    await AV.workers.init();
    // Voces del sistema (offline)
    AV.voice?.init?.();
    const count = AV.workers.count();
    console.info(`[workers] ${count} en catálogo`);
    AV.registro.updateCatalogMeta();

    if (window.lucide) lucide.createIcons();

    // Solo automáticamente al tener/recuperar internet (sin botón obligatorio)
    AV.pwa.ensurePendingWatch();
    if (navigator.onLine) {
      AV.pwa.scheduleAutoSync('boot', 600);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
