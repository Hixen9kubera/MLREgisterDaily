-- pg_cron + pg_net job que llama al endpoint /cron/snapshot del backend FastAPI
-- cada día a las 03:00 America/Mexico_City (09:00 UTC).
--
-- Antes de correr esto:
--   1) Ya debe estar desplegado el backend FastAPI en una URL pública.
--   2) Reemplaza :backend_url y :cron_secret abajo, o usa supabase vault para guardarlos.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: invoca el endpoint con header X-Cron-Secret
create or replace function public.trigger_daily_ml_snapshot()
returns void language plpgsql security definer as $$
declare
  v_url text;
  v_secret text;
begin
  -- Lee de la tabla de configuración (crear con seed abajo)
  select value into v_url    from public.app_config where key = 'backend_url';
  select value into v_secret from public.app_config where key = 'cron_secret';

  perform net.http_post(
    url := v_url || '/cron/snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 600000
  );
end $$;

create table if not exists public.app_config (
    key text primary key,
    value text not null,
    updated_at timestamptz not null default now()
);

-- Seeds (REEMPLAZA estos valores)
insert into public.app_config (key, value) values
  ('backend_url', 'https://REEMPLAZA-CON-TU-DOMINIO'),
  ('cron_secret', 'REEMPLAZA-CON-EL-MISMO-CRON_SHARED_SECRET-DEL-.env')
on conflict (key) do nothing;

-- Programar el job a las 03:00 hora CDMX = 09:00 UTC
select cron.schedule(
  'kubera-ml-daily-snapshot',
  '0 9 * * *',
  $$ select public.trigger_daily_ml_snapshot(); $$
);
