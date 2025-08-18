# Cefalometría (React + Vite)

Herramienta para trazos cefalométricos con calibración, exportación (PNG/PDF/CSV) y resumen clínico.
Autor: **Fernando Juárez — @dr.juarez**.

## Requisitos
- Node.js 18+ y npm

## Ejecutar en local
```bash
npm install
npm run dev
# abre http://localhost:5173
```

## Build de producción
```bash
npm run build
npm run preview  # opcional para probar el build
```

> Usamos Tailwind vía CDN en `index.html` (no hace falta pipeline de Tailwind).

## Despliegue en Cloudflare Pages
1. Conecta tu repo de GitHub.
2. **Build command**: `npm run build`
3. **Build output directory**: `dist`
4. Node version: 18+ (por defecto está bien).
5. Deploy.

## Notas
- Las imágenes y datos se procesan **localmente** en el navegador (no se suben al servidor).
- Si el navegador bloquea popups/descargas, usa el enlace manual que aparece después de exportar.
