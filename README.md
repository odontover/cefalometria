# Cefalo Tracer (React + Vite + Tailwind)

Herramienta para trazos cefalométricos con calibración y exportación (PNG/PDF/CSV). Incluye análisis Steiner y Björk–Jarabak, E-line, z-score y tolerancias (±2° / ±1 mm).

## Requisitos
- Node.js 18+

## Ejecutar en local
```bash
npm install
npm run dev
# abre http://localhost:5173
```

## Construir para producción
```bash
npm run build
npm run preview
```

La carpeta `dist/` es estática y lista para subir a cualquier hosting.

## Despliegue en Cloudflare Pages
1. Crea un nuevo proyecto conectado a tu repo de GitHub.
2. **Build command:** `npm run build`
3. **Build output directory:** `dist`
4. Guarda y despliega.

## Uso rápido
1. Sube una radiografía lateral.
2. Calibra con dos clics sobre una regla conocida (mm).
3. Coloca puntos siguiendo la lista de la izquierda (avanza automático al siguiente).
4. Exporta: **Lámina (PNG)**, **PDF (A4)**, **CSV** o **Tabla (PNG/PDF)**.

## Notas
- E-line: positivo = labio inferior por delante (protrusión); negativo = detrás (retrusión).
- Los z-score e interpretaciones usan tolerancias: ±2° o ±1 mm (y ±2 u en %).
