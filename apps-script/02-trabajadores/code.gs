/**
 * ============================================================
 * API 2 · TRABAJADORES  — Q Berries
 * Spreadsheet: BD-TRABAJADORES (NO crea hojas nuevas)
 * ============================================================
 *
 * SETUP
 * 1) Abre el Google Sheet BD-TRABAJADORES (el que ya tienes)
 * 2) La data debe estar en «Hoja 1» con SOLO estas columnas (fila 1):
 *      DNI | Nombres y Apellidos | Cargo | Fecha Ingreso Empresa
 * 3) Extensiones → Apps Script → pega ESTE archivo completo
 * 4) Implementar → Aplicación web
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier persona
 * 5) Copia la URL …/exec  →  core/api-config.js → TRABAJADORES_URL
 *
 * ENDPOINTS
 *  GET  ?action=contarTrabajadores
 *  GET  ?action=obtenerPorDni&dni=70839380
 *  GET  ?action=listarTrabajadores
 *  GET  ?action=buscarTrabajador&q=quispe
 *  GET  ?action=ping
 *  POST { action: "listarTrabajadores" }
 *  POST { action: "upsertTrabajador", data: {...} }
 *  POST { action: "bulkUpsert", data: [ {...}, {...} ] }
 */

/** Nombre exacto de tu hoja — no se creará otra */
var SHEET_NAME = 'Hoja 1';

var HEADERS = [
  'DNI',
  'Nombres y Apellidos',
  'Cargo',
  'Fecha Ingreso Empresa'
];

/* -------------------- HTTP -------------------- */

var _jsonpCb = '';

function doGet(e) {
  e = e || { parameter: {} };
  var p = e.parameter || {};
  _jsonpCb = String(p.callback || '').trim();
  var action = String(p.action || 'listarTrabajadores').trim();

  try {
    if (action === 'ping') {
      return jsonOut_({ ok: true, api: 'trabajadores', ts: nowIso_() });
    }
    if (action === 'contarTrabajadores') {
      return jsonOut_({ ok: true, count: contarTrabajadores_(), api: 'trabajadores' });
    }
    if (action === 'obtenerPorDni') {
      var byDni = obtenerPorDni_(p.dni || p.q || '');
      if (!byDni) return jsonOut_({ ok: false, message: 'DNI no encontrado', data: null });
      return jsonOut_({ ok: true, data: byDni });
    }
    if (action === 'listarTrabajadores') {
      var allGet = listarTrabajadores_();
      return jsonOut_({ ok: true, data: allGet, count: allGet.length });
    }
    if (action === 'buscarTrabajador') {
      var found = buscarTrabajadores_(p.q || p.dni || '');
      return jsonOut_({ ok: true, data: found, count: found.length });
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
    var action = String(body.action || 'listarTrabajadores').trim();
    var data = body.data != null ? body.data : body;

    if (action === 'listarTrabajadores') {
      var all = listarTrabajadores_();
      return jsonOut_({ ok: true, data: all, count: all.length });
    }
    if (action === 'buscarTrabajador') {
      var q = body.q || body.dni || (data && (data.q || data.dni)) || '';
      var found = buscarTrabajadores_(q);
      return jsonOut_({ ok: true, data: found, count: found.length });
    }
    if (action === 'upsertTrabajador') {
      var one = upsertTrabajador_(data);
      return jsonOut_({ ok: true, data: one });
    }
    if (action === 'bulkUpsert') {
      var arr = Array.isArray(data) ? data : (data.items || []);
      var n = bulkUpsert_(arr);
      return jsonOut_({ ok: true, upserted: n });
    }
    return jsonOut_({ ok: false, message: 'Acción POST no válida: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, message: String(err) });
  }
}

/* -------------------- Lógica -------------------- */

function listarTrabajadores_() {
  var sh = sheet_();
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (h) {
    return String(h || '').toLowerCase().trim();
  });

  var iDni = col_(headers, ['dni', 'documento', 'doc']);
  var iNom = col_(headers, [
    'nombres y apellidos',
    'nombres',
    'apellidos y nombres',
    'apellidosnombres',
    'nombre',
    'trabajador'
  ]);
  var iCargo = col_(headers, ['cargo', 'puesto', 'ocupacion', 'ocupación']);
  var iFi = col_(headers, [
    'fecha ingreso empresa',
    'fechaingresoempresa',
    'fingreso',
    'f_ingreso',
    'fechaingreso',
    'fecha ingreso',
    'f-ingreso',
    'ingreso'
  ]);

  var out = [];
  var seen = {};

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var dni = iDni >= 0 ? String(row[iDni] || '').trim() : '';
    if (!dni || seen[dni]) continue;
    seen[dni] = true;

    out.push({
      dni: dni,
      nombres: iNom >= 0 ? String(row[iNom] || '').trim() : '',
      cargo: iCargo >= 0 ? String(row[iCargo] || '').trim() : '',
      fIngreso: iFi >= 0 ? asIsoDate_(row[iFi]) : ''
    });
  }

  out.sort(function (a, b) {
    return String(a.nombres).localeCompare(String(b.nombres), 'es');
  });
  return out;
}

/** Solo cantidad (rápido para comparar vs JSON local) */
function contarTrabajadores_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var dniCol = sh.getRange(2, 1, last, 1).getValues();
  var n = 0;
  for (var i = 0; i < dniCol.length; i++) {
    if (String(dniCol[i][0] || '').trim()) n++;
  }
  return n;
}

/** GET exacto por DNI */
function obtenerPorDni_(dni) {
  dni = String(dni || '').trim();
  if (!dni) return null;
  var all = listarTrabajadores_();
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].dni) === dni) return all[i];
  }
  return null;
}

function buscarTrabajadores_(q) {
  q = String(q || '').trim().toLowerCase();
  var all = listarTrabajadores_();
  if (!q) return all.slice(0, 50);

  var out = [];
  for (var i = 0; i < all.length; i++) {
    var w = all[i];
    var hay = (w.dni + ' ' + w.nombres + ' ' + w.cargo).toLowerCase();
    if (hay.indexOf(q) !== -1 || w.dni.indexOf(q) !== -1) {
      out.push(w);
      if (out.length >= 80) break;
    }
  }
  return out;
}

function upsertTrabajador_(data) {
  data = data || {};
  var dni = clean_(data.dni || data.DNI);
  if (!dni) throw new Error('DNI requerido');

  var sh = sheet_();
  var values = sh.getDataRange().getValues();
  var rowData = [
    dni,
    clean_(data.nombres || data.Nombres || data['Nombres y Apellidos']),
    clean_(data.cargo || data.Cargo),
    clean_(data.fIngreso || data.FIngreso || data.fechaIngreso || data['Fecha Ingreso Empresa'])
  ];

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === dni) {
      sh.getRange(i + 1, 1, i + 1, HEADERS.length).setValues([rowData]);
      return mapWorker_(rowData);
    }
  }
  sh.appendRow(rowData);
  return mapWorker_(rowData);
}

function bulkUpsert_(items) {
  if (!items || !items.length) return 0;
  var n = 0;
  for (var i = 0; i < items.length; i++) {
    upsertTrabajador_(items[i]);
    n++;
  }
  return n;
}

function mapWorker_(row) {
  return {
    dni: row[0],
    nombres: row[1],
    cargo: row[2],
    fIngreso: row[3]
  };
}

/* -------------------- Helpers -------------------- */

/**
 * Usa la hoja existente «Hoja 1». NUNCA crea hoja nueva ni datos demo.
 */
function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    throw new Error(
      'No se encontró la hoja «' + SHEET_NAME + '». ' +
      'Usa tu BD-TRABAJADORES con columnas: DNI | Nombres y Apellidos | Cargo | Fecha Ingreso Empresa'
    );
  }
  return sh;
}

function col_(headers, names) {
  for (var i = 0; i < names.length; i++) {
    var j = headers.indexOf(names[i]);
    if (j >= 0) return j;
  }
  return -1;
}

function asIsoDate_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v || '').trim();
  // dd/mm/yyyy → yyyy-mm-dd
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    var dd = ('0' + m[1]).slice(-2);
    var mm = ('0' + m[2]).slice(-2);
    return m[3] + '-' + mm + '-' + dd;
  }
  return s;
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
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

/** alias */
function json_(obj) {
  return jsonOut_(obj);
}

function nowIso_() {
  return new Date().toISOString();
}

function clean_(v) {
  if (v == null) return '';
  return String(v).trim();
}

/** Prueba desde el editor — elegir myFunction o testListar y Ejecutar ▶ */
function myFunction() {
  testListar();
}

function testListar() {
  Logger.log(doGet({ parameter: { action: 'contarTrabajadores' } }).getContent());
}

function testPing() {
  Logger.log(doGet({ parameter: { action: 'ping' } }).getContent());
}
