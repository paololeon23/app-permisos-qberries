/**
 * Proxy gratis Netlify → Apps Script TRABAJADORES
 *
 * Variables de entorno Netlify:
 *   TRABAJADORES_SCRIPT_URL = https://script.google.com/macros/s/.../exec
 *   API_TOKEN               = (mismo token que en Apps Script)
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const scriptUrl = process.env.TRABAJADORES_SCRIPT_URL;
  const token = process.env.API_TOKEN || '';

  if (!scriptUrl) {
    return json(500, {
      ok: false,
      code: 'NO_CONFIG',
      message: 'Falta TRABAJADORES_SCRIPT_URL en variables de Netlify',
    });
  }

  try {
    if (event.httpMethod === 'GET') {
      const qs = new URLSearchParams(event.queryStringParameters || {});
      if (token) qs.set('token', token);
      const url = scriptUrl + (scriptUrl.includes('?') ? '&' : '?') + qs.toString();
      const res = await fetch(url, { redirect: 'follow' });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, message: 'Respuesta inválida del servidor Google', raw: text.slice(0, 200) };
      }
      return json(res.ok ? 200 : 502, data);
    }

    if (event.httpMethod === 'POST') {
      let body = {};
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        body = {};
      }
      if (token) body.token = token;

      const res = await fetch(scriptUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, message: 'Respuesta inválida del servidor Google', raw: text.slice(0, 200) };
      }
      return json(res.ok ? 200 : 502, data);
    }

    return json(405, { ok: false, message: 'Método no permitido' });
  } catch (err) {
    return json(502, { ok: false, code: 'PROXY_ERROR', message: String(err.message || err) });
  }
};
