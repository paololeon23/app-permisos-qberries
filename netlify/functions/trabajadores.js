/**
 * Proxy Netlify → Apps Script TRABAJADORES (seguro)
 * App móvil solo consulta por DNI / búsqueda puntual (no listado masivo ni escrituras).
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store',
};

const ALLOW_GET = new Set(['ping', 'obtenerPorDni', 'buscarTrabajador', 'contarTrabajadores']);
const ALLOW_POST = new Set(['obtenerPorDni', 'buscarTrabajador']);

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

  const scriptUrl = process.env.TRABAJADORES_SCRIPT_URL;
  const token = String(process.env.API_TOKEN || '').trim();

  if (!scriptUrl) {
    return json(500, { ok: false, code: 'NO_CONFIG', message: 'Falta TRABAJADORES_SCRIPT_URL' });
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
      qs.set('token', token);
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
      const action = String(body.action || '').trim();
      if (!ALLOW_POST.has(action)) {
        return json(403, { ok: false, code: 'FORBIDDEN', message: 'Acción no permitida: ' + action });
      }
      const safe = { ...body, action, token };
      delete safe.apiToken;
      delete safe.API_TOKEN;

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
