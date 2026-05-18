-- Kubera ML Tracker — Supabase schema
-- Run in Supabase SQL editor (or `supabase db push`).

create extension if not exists "pgcrypto";
create extension if not exists "pg_net";

-- ──────────────────────────────────────────────────────────────────────────────
-- ml_accounts: ligero, solo metadata. Los tokens reales viven cifrados en MySQL.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.ml_accounts (
    id           uuid primary key default gen_random_uuid(),
    ml_user_id   bigint unique not null,
    nickname     text not null,
    label        text,
    is_active    boolean not null default true,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- products_snapshot: una fila por (cuenta, item, fecha)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.products_snapshot (
    id                  bigserial primary key,
    account_id          uuid not null references public.ml_accounts(id) on delete cascade,
    ml_item_id          text not null,
    snapshot_date       date not null,
    title               text,
    price               numeric(14,2),
    original_price      numeric(14,2),
    available_quantity  integer,
    sold_quantity       integer,
    status              text,
    listing_type_id     text,
    condition           text,
    permalink           text,
    thumbnail           text,
    category_id         text,
    health              numeric(5,4),
    raw                 jsonb,
    captured_at         timestamptz not null default now(),
    unique (account_id, ml_item_id, snapshot_date)
);

create index if not exists idx_snap_item_date on public.products_snapshot (ml_item_id, snapshot_date desc);
create index if not exists idx_snap_account_date on public.products_snapshot (account_id, snapshot_date desc);

-- ──────────────────────────────────────────────────────────────────────────────
-- product_changes: diff campo-a-campo entre snapshot D y D-1
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.product_changes (
    id            bigserial primary key,
    account_id    uuid not null references public.ml_accounts(id) on delete cascade,
    ml_item_id    text not null,
    snapshot_date date not null,
    field_name    text not null,
    old_value     text,
    new_value     text,
    detected_at   timestamptz not null default now()
);

create index if not exists idx_changes_item_date on public.product_changes (ml_item_id, snapshot_date desc);
create index if not exists idx_changes_account_date on public.product_changes (account_id, snapshot_date desc);
create index if not exists idx_changes_field on public.product_changes (field_name);

-- ──────────────────────────────────────────────────────────────────────────────
-- sales: órdenes de ML (una fila por ítem-orden)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.sales (
    id              bigserial primary key,
    account_id      uuid not null references public.ml_accounts(id) on delete cascade,
    ml_order_id     bigint not null,
    ml_item_id      text not null,
    title           text,
    quantity        integer not null,
    unit_price      numeric(14,2) not null,
    total_amount    numeric(14,2) not null,
    currency_id     text,
    status          text,
    sold_at         timestamptz not null,
    buyer_id        bigint,
    raw             jsonb,
    inserted_at     timestamptz not null default now(),
    unique (account_id, ml_order_id, ml_item_id)
);

create index if not exists idx_sales_sold_at on public.sales (sold_at desc);
create index if not exists idx_sales_account_sold_at on public.sales (account_id, sold_at desc);
create index if not exists idx_sales_item on public.sales (ml_item_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- metrics_daily: visitas, conversión, preguntas por cuenta y día
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.metrics_daily (
    id              bigserial primary key,
    account_id      uuid not null references public.ml_accounts(id) on delete cascade,
    metric_date     date not null,
    visits_total    integer,
    conversion_rate numeric(6,4),
    questions_count integer,
    items_active    integer,
    items_paused    integer,
    raw             jsonb,
    captured_at     timestamptz not null default now(),
    unique (account_id, metric_date)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- goals: objetivos semanales (1 fila por semana ISO; default 1.8M MXN)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.goals (
    id            uuid primary key default gen_random_uuid(),
    week_start    date not null unique,
    target_amount numeric(14,2) not null,
    currency      text not null default 'MXN',
    note          text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- Default goal para la semana actual (lunes ISO)
insert into public.goals (week_start, target_amount, currency)
values (date_trunc('week', current_date)::date, 1800000.00, 'MXN')
on conflict (week_start) do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- cron_runs: bitácora de ejecuciones del job diario
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.cron_runs (
    id                   bigserial primary key,
    job_name             text not null,
    started_at           timestamptz not null default now(),
    finished_at          timestamptz,
    status               text not null default 'running',
    accounts_processed   integer default 0,
    products_processed   integer default 0,
    changes_detected     integer default 0,
    sales_inserted       integer default 0,
    error_message        text
);

create index if not exists idx_cron_runs_started on public.cron_runs (started_at desc);

-- ──────────────────────────────────────────────────────────────────────────────
-- updated_at triggers
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_ml_accounts_updated on public.ml_accounts;
create trigger trg_ml_accounts_updated before update on public.ml_accounts
for each row execute function public.set_updated_at();

drop trigger if exists trg_goals_updated on public.goals;
create trigger trg_goals_updated before update on public.goals
for each row execute function public.set_updated_at();
