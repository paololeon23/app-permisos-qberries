/**
 * Configuración de APIs — Q Berries · Permisos
 * Las URLs de Google NO van aquí: solo en variables de Netlify (proxy).
 */
window.API_CONFIG = {
  /** Proxy Netlify (mismo sitio) */
  PERMISOS_URL: '/api/permisos',
  TRABAJADORES_URL: '/api/trabajadores',

  TIMEOUT_MS: 20000,

  WORKERS_CACHE_KEY: 'av_permisos_workers_v1',
  QUEUE_KEY: 'av_permisos_queue_v1',
  HISTORY_KEY: 'av_permisos_historial_v1',

  APP_NAME: 'Pase de salida Q Berries',
  APP_VERSION: '1.2.0',
  COMPANY: 'Q Berries',
  YEAR: 2026,
  TIMEZONE: 'America/Lima',
  PUBLIC_URL: 'https://pasessalida-qberries.netlify.app/',
  INSTALL_URL: 'https://pasessalida-qberries.netlify.app/instalar.html',
  LAUNCH_URL: 'https://pasessalida-qberries.netlify.app/abrir.html',
};
