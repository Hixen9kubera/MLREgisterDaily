# Kubera · ML Tracker

Web app para registrar diariamente todos los cambios y ventas de **2 cuentas de MercadoLibre**, persistir el histórico en **Supabase** y trackear el objetivo semanal de ventas (default **MX$1,800,000**, editable desde la UI). Incluye monitoreo de precios de la competencia con notificaciones automáticas.

---

## 📋 Changelog reciente

### 2026-05-25 — Monitoreo de competidores (vía catálogos ML)
- **Botón "Monitorear" en cada tarjeta de competencia** → guarda el competidor en watchlist.
- **Endpoint oficial `/products/{catalog_id}/items`** (no requiere scraping ni Apify recurrente).
  - Extrae el `catalog_id` (formato `MLMU####`) del URL de Apify.
  - Llama a ML para obtener el ganador del buy-box: precio + item_id real + seller.
- **Cron diario integrado** al snapshot de 8 AM CDMX.
- **Sliding window de 3 registros** en `reporte_monitoreo_competencia_diario`:
  solo se inserta cuando el precio cambia respecto al registro previo. Si llega un 4to cambio, se borra el más viejo.
- **Archive mensual automático** al día 1: resumen completo (min/max/avg + historia de cambios) en `reporte_monitoreo_competencia_30day` + limpieza del diario.
- **Bell de notificaciones** en el header con badge de no leídas, dropdown agrupado por fecha, polling cada 60s.
- **Vista `/competidores`** con tabla global de watchlist (precio actual vs inicial, Δ%, último check, estado).
- **Auto-desactivar** competidores con 60+ días en `paused/closed`.
- Limitación honesta: items sin catálogo ML (URL `/MLM-####-...`) no se pueden monitorear; el botón se deshabilita con tooltip.

### 2026-05-25 — Otras mejoras del día
- Comparativa de competencia con Apify (scraping de búsqueda ML) con cache 6h.
- Mosaico responsivo de 6 productos por página.
- Imágenes HD del producto (CDN ML `-O.jpg` en vez de `-I.jpg`).
- Búsqueda de productos en el header del Dashboard (autocomplete).
- Pagination 10/página en lista de Productos.

### 2026-05-22 — Hora exacta y métricas finas
- Filtros de ventas usan timezone **CDMX** (00:00–23:59) en lugar de UTC.
- Cron diario corrige a las 8 AM CDMX (timezone explícito en CronTrigger).
- Excluir órdenes canceladas para matchear "Ventas brutas" del panel ML.
- Diferenciación entre **abandonos** (sin pago, ignorar) y **cancelaciones reales** (con pago previo).
- Gráfica de **ventas por hora del día** con 3 series (brutas / reales / cancelaciones).
- Re-sync de ventas via paid_amount agregado a tabla sales.

### 2026-05-20 — Producción
- Deploy en Railway con scheduler interno (APScheduler) corriendo a las 8 AM CDMX.
- Integración Apify para descubrir competidores via búsqueda ML.

### Anterior
- Snapshot diario de ~2,000 productos × 2 cuentas via ML API.
- Visitas únicas 1d/7d/30d por producto.
- Detección de cambios con expansion granular (atributos, tags, variaciones).
- Top 10 productos por revenue / ticket / stock value / visitas.
- Paginación en cards de stock bajo / inactivos / antigüedad.

---

## ⚠️ Seguridad — leer primero

El archivo `backend/.env` contiene credenciales que pegaste en el chat (DB MySQL, Fernet key, contraseñas). Está en `.gitignore`, pero **rota esas credenciales** ya que también quedaron en el historial de la conversación con Claude:

- Contraseña MySQL Hostinger
- `DB_ENCRYPTION_KEY` (genera nueva y re-cifra los tokens existentes)
- Contraseña WP / WooCommerce keys
- API key de Gemini

Después de rotar, edita `backend/.env` con los nuevos valores.

---

## Arquitectura

```
┌──────────────┐    pg_cron 03:00 CDMX     ┌──────────────────┐
│   Supabase   │ ────────────────────────► │ FastAPI /cron/   │
│ (Postgres)   │   pg_net.http_post +      │  snapshot        │
│              │   X-Cron-Secret           │                  │
│ ml_accounts  │                           │  1. lee tokens   │
│ products_    │                           │     cifrados de  │
│   snapshot   │  ◄──── upserts diarios ── │     MySQL        │
│ product_     │                           │  2. ML API:      │
│   changes    │                           │     items, sales │
│ sales        │                           │  3. diff vs ayer │
│ goals        │                           │  4. escribe a SB │
│ cron_runs    │                           └──────────────────┘
└──────────────┘
        ▲
        │ REST
        │
┌──────────────┐
│ React (Vite) │  Dashboard · Productos · Cambios semana/mes · Objetivo
└──────────────┘
```

**Por qué este split:** los tokens ML viven cifrados en MySQL Hostinger (Fernet). Reusamos esa fuente y guardamos en Supabase **únicamente** snapshots, diffs, ventas, métricas y objetivos.

---

## 1) Setup Supabase

1. Entra a tu proyecto: https://supabase.com/dashboard/project/xaxbkijcxzvrwyrqnjzi
2. **SQL Editor → New query** y corre [`backend/supabase/migrations/001_init.sql`](backend/supabase/migrations/001_init.sql).
3. Settings → API → copia `anon` y `service_role` keys → pégalas en `backend/.env`.
4. (Opcional, después de desplegar) corre [`backend/supabase/migrations/002_pg_cron.sql`](backend/supabase/migrations/002_pg_cron.sql) reemplazando `backend_url` y `cron_secret`.

---

## 2) Setup Backend (FastAPI)

```powershell
cd C:\Users\diaz2\kubera-ml-tracker\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Edita .env con tus claves Supabase + verifica que ML_TOKENS_TABLE
# coincida con tu tabla real en MySQL.

uvicorn app.main:app --reload --port 8000
```

Abre http://localhost:8000/docs para ver Swagger.

### Verificar que MySQL conecta y desencripta

```powershell
python -c "from app.db.mysql_tokens import list_ml_tokens; print(list_ml_tokens())"
```

Si tus columnas en MySQL se llaman distinto (ej. `user_id` en vez de `ml_user_id`), ajusta las variables `ML_TOKENS_*_COL` en `backend/.env`.

### Disparar el snapshot manualmente

```powershell
curl -X POST http://localhost:8000/cron/snapshot -H "X-Cron-Secret: TU_CRON_SHARED_SECRET"
```

---

## 3) Setup Frontend (React + Vite)

```powershell
cd C:\Users\diaz2\kubera-ml-tracker\frontend
npm install
npm run dev
```

Abre http://localhost:5173

---

## 4) Programar el job diario

Tienes **3 alternativas**, elige una:

### A) Supabase pg_cron (recomendada — corre aunque la app esté apagada)
Requiere que el backend FastAPI tenga URL pública (Render, Fly, Railway, Cloudflare Tunnel).
Después corre `002_pg_cron.sql` con tu URL pública y `CRON_SHARED_SECRET`.

### B) Scheduler local dentro de FastAPI (dev)
```ini
# backend/.env
ENABLE_LOCAL_SCHEDULER=true
LOCAL_SCHEDULER_HOUR=3
```
Solo funciona mientras `uvicorn` esté corriendo.

### C) GitHub Actions / Vercel Cron
Endpoint POST a `/cron/snapshot` con header `X-Cron-Secret`.

---

## Monitoreo de competidores (módulo agregado el 2026-05-25)

### Cómo agregar un competidor a monitoreo
1. Entra al detalle de tu producto (`/productos/{ml_item_id}`).
2. Click en **"Comparar con otros"** → carga 25 competidores via Apify (o caché 6h).
3. En cada tarjeta hay un botón **"☆ Monitorear"** → toggle a **"★ Dejar de monitorear"**.
4. Solo funciona para items con URL de catálogo ML (`/up/MLMU####`).

### Cómo funciona el monitoreo
- Al agregar: se extrae `catalog_id` del URL → se llama `/products/{catalog_id}/items` → se guarda el item_id real, precio y seller del ganador del buy-box.
- Cada día a las 8 AM CDMX: el cron consulta el mismo endpoint con concurrencia (12 workers) para todos los watched. Tiempo ~2s para 100 competidores.
- Sliding window: solo se inserta en `reporte_monitoreo_competencia_diario` cuando el precio cambia. Max 3 registros por competidor.
- El día 1 de cada mes: archivar mes anterior en `reporte_monitoreo_competencia_30day` con `changes_history` JSON (todos los cambios) + min/max/avg.

### Disparar el job manualmente
```powershell
# Local
cd backend
.\.venv\Scripts\Activate.ps1
python -c "from app.services.competitor_monitor import run_competitor_monitoring_job; import json; print(json.dumps(run_competitor_monitoring_job(), indent=2))"

# Vía API (en producción)
curl -X POST https://TU-RAILWAY-URL/competitors/run-monitoring
```

### Notificaciones
- Cada cambio de precio genera una fila en `notifications` con dirección (`up`/`down`/`flat`) y % delta.
- El bell icon del header polea cada 60s la cuenta de no leídas.
- Dropdown agrupado por fecha (Hoy / Ayer / Hace X días).
- Click en una notificación → te lleva al detalle del producto + marca como leída.

---

## Modelo de datos (Supabase)

| Tabla | Propósito |
|---|---|
| `ml_accounts` | metadata de cada cuenta ML (id, nickname). Tokens NO viven aquí. |
| `products_snapshot` | foto diaria de cada producto. PK lógica = (account, item, date). |
| `product_changes` | diffs campo-a-campo cuando snapshot D ≠ D-1. Filtras por semana/mes. |
| `sales` | órdenes de ML (1 fila por orden-item). Upsert en cada corrida. |
| `metrics_daily` | (placeholder) visitas, conversión, preguntas. |
| `goals` | 1 fila por semana ISO. Default 1.8M MXN. Editable desde UI. |
| `cron_runs` | bitácora de cada ejecución del job. |
| `competitor_watchlist` | competidores que estás monitoreando (catalog_id, precio inicial vs actual). |
| `reporte_monitoreo_competencia_diario` | snapshots diarios cuando hay cambio de precio (max 3 por watched). |
| `reporte_monitoreo_competencia_30day` | resumen mensual archivado con `changes_history`. |
| `notifications` | bell del header: cambios de precio recientes. |
| `competition_cache` | resultados de Apify cacheados por 6h por producto. |

Campos trackeados en `product_changes`: `title`, `price`, `original_price`, `available_quantity`, `sold_quantity`, `status`, `listing_type_id`, `condition`, `permalink`, `thumbnail`, `category_id`, `health`.

---

## API principales

| Método | Path | Descripción |
|---|---|---|
| GET | `/dashboard/summary` | progreso semanal, vendido, objetivo, último snapshot |
| GET | `/dashboard/sales-by-day?days=14` | serie diaria para gráfica |
| GET | `/products?account_id=&q=&limit=&offset=` | productos del último snapshot |
| GET | `/products/{ml_item_id}` | detalle |
| GET | `/products/{ml_item_id}/changes?range=week\|month` | changelog del producto |
| GET | `/products/{ml_item_id}/sales?days=30` | ventas recientes |
| GET\|PUT | `/goals/current` | leer/actualizar objetivo de la semana |
| POST | `/cron/snapshot` | dispara el job (requiere `X-Cron-Secret`) |

---

## Pendientes / TODO conocidos

- Verificar nombres exactos de columnas en la tabla MySQL `ml_tokens` y ajustar `ML_TOKENS_*_COL` en `.env`.
- Configurar `ML_CLIENT_ID` / `ML_CLIENT_SECRET` para que el backend pueda refrescar tokens automáticamente.
- Agregar autenticación a las rutas públicas (hoy son abiertas; protege detrás de Cloudflare Access o agrega JWT).
- Métricas (visitas/conversión) están como tabla pero falta poblar — la API ML `/users/{id}/items_visits` requiere endpoints adicionales por ítem.
