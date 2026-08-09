/**
 * Configuración de APIs — Q Berries · Permisos
 */
window.API_CONFIG = {
  /** POST/GET: registrar y listar permisos */
  PERMISOS_URL:
    'https://script.google.com/macros/s/AKfycbxWxRtWPycpxD3gxzD2FbUoMxErmItFLRyG5MyD2arCH8NusKMLu8kdeVLAnMpmjZpk/exec',

  /** GET: consultar trabajadores (catálogo) */
  TRABAJADORES_URL:
    'https://script.google.com/macros/s/AKfycbwtpmEa5-910h9BSjKP5_Q8lxjPvlPUX4flci-T9aCMglJH4Wv5pKtkmuIhf-DUJwyi/exec',

  /** Tiempo máx. de red antes de usar cola offline (ms) */
  TIMEOUT_MS: 12000,

  /** Versión de caché local de trabajadores */
  WORKERS_CACHE_KEY: 'av_permisos_workers_v1',
  QUEUE_KEY: 'av_permisos_queue_v1',
  HISTORY_KEY: 'av_permisos_historial_v1',

  APP_NAME: 'Pase de salida Q Berries',
  APP_VERSION: '1.0.2',
  COMPANY: 'Q Berries',
  YEAR: 2026,
  TIMEZONE: 'America/Lima',
};
