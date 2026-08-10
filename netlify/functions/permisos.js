/**
 * Proxy Netlify → Apps Script PERMISOS (seguro)
 * - Token solo desde env Netlify (el cliente NUNCA lo impone)
 * - Solo acciones permitidas
 * - URL de Google solo en el servidor
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store',
};

const ALLOW_GET = new Set(['ping', 'listarPermisos', 'existePaseHoy', 'obtenerPermiso']);
const ALLOW_POST = new Set(['crearPermiso', 'guardarPermiso', 'listarPermisos']);

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
    body: JSON.stringify(body),
  };
}

async function forwardGoogle(url, opts) {
  const res = await fetch(url, { redirect: 'follow', ...opts });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = {
      ok: false,
      code: 'BAD_UPSTREAM',
      message: 'Respuesta inválida del servidor',
      raw: String(text).slice(0, 180),
    };
  }
  return { res, data };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const scriptUrl = process.env.PERMISOS_SCRIPT_URL;
  const token = String(process.env.API_TOKEN || '').trim();

  if (!scriptUrl) {
    return json(500, { ok: false, code: 'NO_CONFIG', message: 'Falta PERMISOS_SCRIPT_URL' });
  }
  if (!token) {
    return json(500, { ok: false, code: 'NO_CONFIG', message: 'Falta API_TOKEN en Netlify' });
  }

  try {
    if (event.httpMethod === 'GET') {
      const qs = new URLSearchParams(event.queryStringParameters || {});
      const action = String(qs.get('action') || 'ping').trim();
      if (!ALLOW_GET.has(action)) {
        return json(403, { ok: false, code: 'FORBIDDEN', message: 'Acción no permitida: ' + action });
      }
      qs.set('action', action);
      qs.set('token', token); // siempre server token
      const url = scriptUrl + (scriptUrl.includes('?') ? '&' : '?') + qs.toString();
      const { res, data } = await forwardGoogle(url, { method: 'GET' });
      return json(res.ok ? 200 : 502, data);
    }

    if (event.httpMethod === 'POST') {
      let body = {};
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        body = {};
      }
      const action = String(body.action || 'crearPermiso').trim();
      if (!ALLOW_POST.has(action)) {
        return json(403, { ok: false, code: 'FORBIDDEN', message: 'Acción no permitida: ' + action });
      }
      // Sanitizar: forzar action + token del servidor
      const safe = {
        action,
        data: body.data != null ? body.data : body,
        token,
      };
      // Evitar que "data" contenga token / action raros del cliente
      if (safe.data && typeof safe.data === 'object' && !Array.isArray(safe.data)) {
        const d = { ...safe.data };
        delete d.token;
        delete d.apiToken;
        delete d.API_TOKEN;
        safe.data = d;
      }

      const { res, data } = await forwardGoogle(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(safe),
      });
      return json(res.ok ? 200 : 502, data);
    }

    return json(405, { ok: false, message: 'Método no permitido' });
  } catch (err) {
    return json(502, { ok: false, code: 'PROXY_ERROR', message: String(err.message || err) });
  }
};
