begin;

alter table public.campaign_demo_traffic add column if not exists reporting_visible boolean;
alter table public.campaign_journey_events add column if not exists reporting_visible boolean;

create table if not exists public.campaign_admin_archive (
    checkpoint text primary key,
    revision integer not null,
    snapshot jsonb,
    archived_at timestamptz not null default now()
);

alter table public.campaign_admin_archive enable row level security;
revoke all on public.campaign_admin_archive from public, anon, authenticated, service_role;

with captured as (
    select id, revision, snapshot
    from public.campaign_admin_state
    where id = 'main'
    for update
), archived as (
    insert into public.campaign_admin_archive (checkpoint, revision, snapshot)
    select 'before-recorded-only-reports', revision, snapshot
    from captured
    on conflict (checkpoint) do nothing
    returning revision
)
update public.campaign_admin_state as current_state
set revision = current_state.revision + 1,
    snapshot = coalesce(current_state.snapshot, '{}'::jsonb) ||
        jsonb_build_object('orders', '[]'::jsonb, 'queue', '[]'::jsonb, 'audit', '[]'::jsonb)
from archived
where current_state.id = 'main' and current_state.revision = archived.revision;

create index if not exists campaign_demo_traffic_visible_day_idx
    on public.campaign_demo_traffic (day desc) where reporting_visible is true;
create index if not exists campaign_journey_events_visible_day_idx
    on public.campaign_journey_events (day desc, occurred_at desc) where reporting_visible is true;

commit;
