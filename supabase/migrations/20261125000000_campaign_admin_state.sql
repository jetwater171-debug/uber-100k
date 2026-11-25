create table if not exists public.campaign_admin_state (
    id text primary key check (id = 'main'),
    revision integer not null default 0 check (revision >= 0),
    snapshot jsonb check (snapshot is null or jsonb_typeof(snapshot) = 'object')
);

alter table public.campaign_admin_state enable row level security;
revoke all on public.campaign_admin_state from public, anon, authenticated;
grant select, update on public.campaign_admin_state to service_role;

insert into public.campaign_admin_state (id) values ('main') on conflict do nothing;

create table if not exists public.campaign_demo_traffic (
    session uuid not null,
    page text not null check (page in ('inicio', 'oferta', 'cadastro', 'questionario', 'regiao', 'analise')),
    day date not null,
    primary key (session, page, day)
);

create index if not exists campaign_demo_traffic_day_idx on public.campaign_demo_traffic (day desc);
alter table public.campaign_demo_traffic enable row level security;
revoke all on public.campaign_demo_traffic from public, anon, authenticated;
grant select, insert on public.campaign_demo_traffic to service_role;
