/**
 * ============================================================
 * API 1 · PERMISOS  — Q Berries
 * Spreadsheet exclusivo de permisos (NO mezclar con trabajadores)
 * ============================================================
 *
 * SETUP
 * 1) Abre el Google Sheet BD-PERMISOS (el que ya tienes)
 * 2) Extensiones → Apps Script → pega ESTE archivo completo
 * 3) Guardar → Implementar → Nueva versión → Aplicación web
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier persona
 * 4) Copia la URL …/exec  →  core/api-config.js → PERMISOS_URL
 *
 * ENDPOINTS
 *  POST { action: "crearPermiso", data: {...} }
 *  GET  ?action=listarPermisos&limit=100
 *  GET  ?action=ping
 *
 * Usa «Hoja 1» (NO crea otra hoja)
 */

var SHEET_NAME = 'Hoja 1';

var HEADERS = [
  'fechaRegistro',
  'horaRegistro',
  'dni',
  'nombres',
  'cargo',
  'fIngreso',
  'motivo',
  'fechaSalida',
  'horaSalida',
  'observacion',
  'responsable',
  'dniResponsable',
  'puestoResponsable',
  'carnetVerificado',
  'carnetDniEscaneado',
  'carnetVerificadoAt',
  'device',
  'syncStatus'
];

/* -------------------- HTTP -------------------- */

var _jsonpCb = '';

function doGet(e) {
  e = e || { parameter: {} };
  var p = e.parameter || {};
  _jsonpCb = String(p.callback || '').trim();
  var action = String(p.action || 'ping').trim();

  try {
    if (action === 'ping') {
      var ssPing = SpreadsheetApp.getActiveSpreadsheet();
      return jsonOut_({
        ok: true,
        api: 'permisos',
        sheet: SHEET_NAME,
        spreadsheet: ssPing ? ssPing.getName() : '',
        ts: nowIso_()
      });
    }
    if (action === 'existePaseHoy') {
      var chk = existePaseHoy_(p.dni, p.fecha || '');
      return jsonOut_({
        ok: true,
        exists: !!chk,
        data: chk || null,
        dni: clean_(p.dni),
        fecha: clean_(p.fecha) || hoyLima_()
      });
    }
    if (action === 'listarPermisos') {
      var rows = listarPermisos_(p);
      return jsonOut_({ ok: true, api: 'permisos', data: rows, count: rows.length });
    }
    if (action === 'obtenerPermiso') {
      var one = obtenerPermiso_(p.id);
      if (!one) return jsonOut_({ ok: false, message: 'No encontrado' });
      return jsonOut_({ ok: true, data: one });
    }
    return jsonOut_({ ok: false, message: 'Acción GET no válida: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, message: String(err) });
  }
}

function doPost(e) {
  _jsonpCb = '';
  try {
    var body = parseBody_(e);
    var action = String(body.action || 'crearPermiso').trim();
    var data = body.data || body;

    if (action === 'crearPermiso' || action === 'guardarPermiso') {
      var saved = crearPermiso_(data);
      return jsonOut_({ ok: true, api: 'permisos', id: saved.id, data: saved });
    }
    if (action === 'listarPermisos') {
      return jsonOut_({ ok: true, data: listarPermisos_(body) });
    }
    return jsonOut_({ ok: false, message: 'Acción POST no válida: ' + action });
  } catch (err) {
    var msg = String(err && err.message ? err.message : err).replace(/^Error:\s*/i, '');
    var code = /ya tiene un pase/i.test(msg) ? 'DUPLICATE' : 'ERROR';
    return jsonOut_({ ok: false, code: code, message: msg });
  }
}

/* -------------------- Lógica -------------------- */

function crearPermiso_(data) {
  data = data || {};

  // Candado: evita 2 POST a la vez (cola offline en paralelo)
  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(30000);
    if (!got) throw new Error('El servidor está ocupado. Intente de nuevo.');

    var sh = sheet_();
    var id = String(data.id || uid_()).trim();

    var fechaRegistro = clean_(data.fechaRegistro);
    var horaRegistro = clean_(data.horaRegistro);
    if (!fechaRegistro || !horaRegistro) {
      var tz = 'America/Lima';
      fechaRegistro = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
      horaRegistro = Utilities.formatDate(new Date(), tz, 'HH:mm:ss');
    }

    var dni = clean_(data.dni);
    if (!dni) throw new Error('DNI requerido');

    // Anti-duplicado estricto (dentro del lock)
    var ya = existePaseHoy_(dni, fechaRegistro);
    if (ya) {
      throw new Error(
        'Este trabajador ya tiene un pase de salida hoy (' +
          (ya.horaSalida || ya.horaRegistro || '') +
          '). No se puede registrar otro el mismo día.'
      );
    }

    var row = [
      fechaRegistro,
      horaRegistro,
      dni,
      clean_(data.nombres),
      clean_(data.cargo),
      clean_(data.fIngreso),
      clean_(data.motivo),
      clean_(data.fechaSalida),
      clean_(data.horaSalida),
      clean_(data.observacion),
      clean_(data.responsable),
      clean_(data.dniResponsable),
      clean_(data.puestoResponsable),
      data.carnetVerificado ? 'SI' : 'NO',
      clean_(data.carnetDniEscaneado),
      clean_(data.carnetVerificadoAt),
      clean_(data.device).substring(0, 180),
      'synced'
    ];

    sh.appendRow(row);

    return {
      id: id,
      fechaRegistro: fechaRegistro,
      horaRegistro: horaRegistro,
      dni: dni,
      nombres: clean_(data.nombres),
      motivo: clean_(data.motivo),
      fechaSalida: clean_(data.fechaSalida),
      horaSalida: clean_(data.horaSalida),
      syncStatus: 'synced'
    };
  } finally {
    if (got) {
      try {
        lock.releaseLock();
      } catch (_) {}
    }
  }
}

/** Busca si el DNI ya tiene pase el día indicado (fechaRegistro o fechaSalida) */
function existePaseHoy_(dni, fecha) {
  dni = clean_(dni);
  if (!dni) return null;
  var day = clean_(fecha) || hoyLima_();
  var rows = listarPermisos_({ dni: dni, limit: 500 });
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var fr = String(r.fechaRegistro || '').substring(0, 10);
    var fs = String(r.fechaSalida || '').substring(0, 10);
    // Normaliza posibles Date → string
    if (Object.prototype.toString.call(r.fechaRegistro) === '[object Date]') {
      fr = Utilities.formatDate(r.fechaRegistro, 'America/Lima', 'yyyy-MM-dd');
    }
    if (Object.prototype.toString.call(r.fechaSalida) === '[object Date]') {
      fs = Utilities.formatDate(r.fechaSalida, 'America/Lima', 'yyyy-MM-dd');
    }
    if (fr === day || fs === day) return r;
  }
  return null;
}

function hoyLima_() {
  return Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
}

function listarPermisos_(params) {
  params = params || {};
  var sh = sheet_();
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = values[i][c];
    }
    out.push(obj);
  }
  out.reverse();

  var dni = clean_(params.dni);
  if (dni) {
    out = out.filter(function (r) {
      return String(r.dni || '') === dni;
    });
  }

  var limit = parseInt(params.limit, 10);
  if (!limit || limit < 1) limit = 100;
  return out.slice(0, limit);
}

function obtenerPermiso_(id) {
  id = clean_(id);
  if (!id) return null;
  var rows = listarPermisos_({ limit: 5000 });
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === id) return rows[i];
  }
  return null;
}

/* -------------------- Helpers -------------------- */

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No hay spreadsheet activo. Abre BD-PERMISOS y pega el script allí.');

  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    // Usa la primera hoja existente — NO crea otra
    sh = ss.getSheets()[0];
    if (!sh) throw new Error('El archivo no tiene hojas');
  }

  ensureHeaders_(sh);
  return sh;
}

function ensureHeaders_(sh) {
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();

  // Hoja vacía → poner encabezados
  if (lastRow === 0 || lastCol === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#1b6b3a')
      .setFontColor('#ffffff');
    return;
  }

  var current = sh.getRange(1, 1, 1, Math.max(lastCol, HEADERS.length)).getValues()[0];
  var first = String(current[0] || '').trim().toLowerCase();

  // Si la fila 1 no parece encabezado de permisos, y no hay datos útiles, escribe headers
  if (first !== 'fecharegistro' && first !== 'dni' && lastRow <= 1) {
    sh.clear();
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#1b6b3a')
      .setFontColor('#ffffff');
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    // fallback form-urlencoded
    var out = {};
    var parts = String(e.postData.contents).split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      if (kv.length >= 2) {
        out[decodeURIComponent(kv[0])] = decodeURIComponent(kv.slice(1).join('=').replace(/\+/g, ' '));
      }
    }
    return out;
  }
}

function jsonOut_(obj) {
  var out = JSON.stringify(obj);
  if (_jsonpCb) {
    return ContentService
      .createTextOutput(_jsonpCb + '(' + out + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(out)
    .setMimeType(ContentService.MimeType.JSON);
}

function json_(obj) {
  return jsonOut_(obj);
}

function nowIso_() {
  return new Date().toISOString();
}

function uid_() {
  return 'P' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
}

function clean_(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * Prueba desde el editor:
 * 1) Arriba elige la función "myFunction" o "testPing"
 * 2) Pulsa Ejecutar ▶
 * 3) Autoriza permisos la primera vez
 * 4) Ver: Ver → Registros (Logs)
 */
function myFunction() {
  testPing();
}

/** Prueba rápida: debe imprimir {"ok":true,"api":"permisos",...} */
function testPing() {
  var out = doGet({ parameter: { action: 'ping' } }).getContent();
  Logger.log(out);
}
