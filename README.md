# cge-verifier

Módulo de auditoría de boletas CGE para el CMS. Verifica que la suma de kWh facturados en todas las boletas coincida con la lectura actual del medidor eléctrico.

## Lógica central

```
Σ kWh (todas las boletas) = Lectura actual del medidor
```

El medidor arranca en 0. Si hay diferencia, el sistema la calcula en kWh y estima el monto en CLP.

## Stack

- **Worker**: Cloudflare Worker con Hono
- **Storage**: Cloudflare R2 (PDFs, retención 90 días)
- **DB**: Supabase PostgreSQL, schema `cge`
- **Auth**: Supabase Auth con Google OAuth
- **Pagos**: Mercado Pago Checkout Pro
- **Parser**: pdf-parse (PDF con text layer, sin OCR)

## Estructura del proyecto

```
cge-verifier/
├── parser/
│   ├── index.js        # Parser y analizador principal
│   └── patterns.js     # Regex para extraer campos del PDF
├── worker/
│   └── index.js        # API Hono (Cloudflare Worker)
├── schema/
│   └── supabase.sql    # Schema de base de datos
├── .github/workflows/
│   └── deploy-cge.yml  # CI/CD deploy automático
├── wrangler.toml
└── package.json
```

## Secrets requeridos (GitHub → Settings → Secrets)

| Secret | Descripción |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Token de Cloudflare con permisos Workers + R2 |
| `CLOUDFLARE_ACCOUNT_ID` | ID de tu cuenta Cloudflare |
| `SUPABASE_URL` | URL del proyecto Supabase (cms-core) |
| `SUPABASE_ANON_KEY` | Anon key de Supabase |
| `MP_ACCESS_TOKEN` | Access token de Mercado Pago (producción) |
| `WORKER_URL` | URL pública del Worker desplegado |

## Setup inicial

```bash
# 1. Instalar dependencias
npm install

# 2. Aplicar schema en Supabase (ya hecho vía MCP)
# Schema: cge con tablas: analyses, bills, findings, payments

# 3. Crear bucket R2
npx wrangler r2 bucket create cge-bills

# 4. Deploy
npm run deploy
```

## Flujo del usuario

1. Login con Google (Supabase Auth)
2. Crea análisis → ingresa lectura del medidor
3. Sube PDFs de boletas (upload directo a R2 con URL firmada)
4. Worker procesa → extrae kWh, detecta hallazgos
5. Preview gratuito: resumen de cuadratura + meses faltantes
6. Paga $2.990 → reporte completo con gráficos y detalle

## Hallazgos detectados

| Tipo | Severidad | Descripción |
|------|-----------|-------------|
| `meter_mismatch` | critical | Σ boletas ≠ medidor |
| `consumption_spike` | warning | Pico estadístico (vacaciones, etc.) |
| `billing_arithmetic` | critical | Cargos no cuadran con total |
| `missing_months` | info | Meses sin boleta detectados |

## Modelo de cobro

- Preview: **gratis siempre**
- Reporte completo: **$2.990 CLP** (Mercado Pago)
- Los PDFs se eliminan de R2 a los 90 días

---

Parte del CMS modular. Schema `cge` aislado del schema `scraping` y del schema público.
