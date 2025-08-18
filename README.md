# Cefalometría (React + Vite) – Fix Cloudflare

**Cambio clave**: en `package.json` usamos `"build": "vite build"` (antes tenía `tsc -b && vite build` y eso rompe en Cloudflare).

## Requisitos
- Node.js 18+
- PNPM/Yarn/NPM (Cloudflare usa npm por defecto).

## Scripts
- `npm run dev` – entorno local
- `npm run build` – build de producción (genera `dist/`)
- `npm run preview` – vista previa del build
- `npm run typecheck` – chequeo de tipos sin emitir

## Cloudflare Pages
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Node version**: 18 (Settings → Build & Deploy → Environment → `NODE_VERSION=18`)

Si el build vuelve a fallar, revisa los logs y ejecuta localmente:
```bash
npm ci
npm run build
```
