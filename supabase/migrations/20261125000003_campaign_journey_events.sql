create table if not exists public.campaign_journey_events (
    session uuid not null,
    page text not null check (page in ('inicio', 'oferta', 'cadastro', 'questionario', 'regiao', 'analise')),
    event text not null check (event ~ '^[a-z0-9_]{1,32}$'),
    day date not null,
    occurred_at timestamptz not null,
    primary key (session, page, event, day)
);

create index if not exists campaign_journey_events_day_idx
    on public.campaign_journey_events (day desc, occurred_at desc);

alter table public.campaign_journey_events enable row level security;
revoke all on public.campaign_journey_events from public, anon, authenticated;
grant select, insert on public.campaign_journey_events to service_role;
