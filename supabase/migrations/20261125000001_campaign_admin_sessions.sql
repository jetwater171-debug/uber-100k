create table if not exists public.campaign_admin_sessions (
    operator_id uuid primary key references auth.users (id) on delete cascade,
    token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
    expires_at timestamptz not null
);

alter table public.campaign_admin_sessions enable row level security;
revoke all on public.campaign_admin_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.campaign_admin_sessions to service_role;
