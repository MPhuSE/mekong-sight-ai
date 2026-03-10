-- Create per-farm alert threshold configuration for rice/shrimp varieties.
-- Run this in Supabase SQL editor before using the "Cau hinh nguong canh bao" UI.

create table if not exists public.farm_alert_configs (
  farm_id uuid primary key references public.farms(id) on delete cascade,
  rice_variety text not null,
  shrimp_variety text not null,
  rice_warning_max double precision not null,
  rice_critical_max double precision not null,
  shrimp_warning_min double precision not null,
  shrimp_warning_max double precision not null,
  shrimp_critical_min double precision not null,
  shrimp_critical_max double precision not null,
  shrimp_optimal_min double precision not null,
  shrimp_optimal_max double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_farm_alert_configs_farm_id on public.farm_alert_configs(farm_id);
