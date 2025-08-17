# Cefalometría (PWA)

Herramienta para trazos cefalométricos con análisis de **Steiner** y **Björk–Jarabak**. Soporta calibración por regla, exportación **CSV**, **PNG** y **PDF**, y funciona como **PWA**.

## Desarrollo
```bash
npm install
npm run dev
```
Abre la URL local (ej. http://localhost:5173).

## Build
```bash
npm run build
```
Despliega `dist/` en un hosting estático con HTTPS (ej. Cloudflare Pages).

## Estructura
- `src/App.tsx`: App principal con trazos, cálculos y exportaciones.
- `public/sw.js`: Service Worker.
- `public/manifest.webmanifest`: Manifest PWA.
- `public/icons`: Iconos PWA.
