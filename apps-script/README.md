# Apps Script · 2 APIs (2 Spreadsheets)

## 1) API Permisos → `01-permisos/code.gs`
1. Crea Sheet: **AV Permisos 2026**
2. Pegar `01-permisos/code.gs`
3. Implementar Web App → copiar URL
4. Pegar en `core/api-config.js` → `PERMISOS_URL`

**POST** subir permiso · **GET** listar / ping

## 2) API Trabajadores → `02-trabajadores/code.gs`
1. Crea Sheet: **AV Trabajadores 2026**
2. Hoja `Trabajadores` con: `DNI | Nombres | Cargo | FIngreso | Area | Fundo`
3. Pegar `02-trabajadores/code.gs`
4. Implementar Web App → copiar URL
5. Pegar en `core/api-config.js` → `TRABAJADORES_URL`

**GET** listar/buscar · **POST** upsert / bulkUpsert

## `api-config.js`

```js
PERMISOS_URL: 'https://script.google.com/macros/s/XXXX_PERMISOS/exec',
TRABAJADORES_URL: 'https://script.google.com/macros/s/YYYY_TRABAJADORES/exec',
```
