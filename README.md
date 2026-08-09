# Permisos Q Berries · 2026

PWA interna offline-first para registrar permisos laborales en celular/tablet.
Arquitectura: **HTML/JS** → **Google Apps Script (`code.gs`)** → **Google Sheets**.

## Cómo probar en el celular

1. Sirve la carpeta por HTTPS o localhost (PWA / Service Worker lo requieren).
2. En PC: `npx --yes serve .` desde esta carpeta, o publica en Drive/GitHub Pages/Netlify.
3. Abre en el celular → **Añadir a pantalla de inicio**.
4. Sin internet sigue buscando trabajadores (`data/workers.json` + cache) y guarda en cola local.

## Configurar APIs

Edita `core/api-config.js`:

```js
PERMISOS_URL: 'https://script.google.com/macros/s/XXXX/exec',      // POST crear / GET listar
TRABAJADORES_URL: 'https://script.google.com/macros/s/YYYY/exec', // GET trabajadores
```

Pueden ser **2 Spreadsheets / 2 Web Apps** distintos (recomendado).

## Backend Sheets (2 APIs)

| API | Archivo | Sheet | Config |
|-----|---------|-------|--------|
| Permisos (POST/GET) | `apps-script/01-permisos/code.gs` | AV Permisos 2026 | `PERMISOS_URL` |
| Trabajadores (GET) | `apps-script/02-trabajadores/code.gs` | AV Trabajadores 2026 | `TRABAJADORES_URL` |

1. Crea cada Spreadsheet por separado.
2. Pega el `code.gs` correspondiente en Apps Script.
3. Implementar → Web App → Ejecutar como yo → Cualquier persona.
4. Copia cada URL a `core/api-config.js`.

Detalle: `apps-script/README.md`.

## Módulos

| Ruta | Rol |
|------|-----|
| `index.html` | UI + pestañas Registro / Historial |
| `core/` | Red, API, cola offline, catálogo, PDF, PWA |
| `modules/registro/` | Formulario + firmas |
| `modules/historial/` | Consulta local + PDF |
| `data/workers.json` | Catálogo offline de respaldo |
| `service-worker.js` | Cache app shell |

## Campos del permiso

DNI, Apellidos y nombres, Cargo, F. Ingreso, Motivo (Salud / Personal / Por tarea / Justificación de falta), Fecha/Hora salida, Responsable (nombre, DNI, puesto, área), Firmas (trabajador + responsable) → PDF resguardo.
