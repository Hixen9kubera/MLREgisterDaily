# Kubera · ML Tracker

Web app para registrar diariamente todos los cambios y ventas de **2 cuentas de MercadoLibre**, persistir el histórico en **Supabase** y trackear el objetivo semanal de ventas (default **MX$1,800,000**, editable desde la UI).

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
