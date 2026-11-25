alter table public.campaign_admin_sessions
    drop constraint if exists campaign_admin_sessions_operator_id_fkey;

create table if not exists public.campaign_admin_login_attempts (
    bucket text primary key check (bucket ~ '^[0-9a-f]{64}$'),
    attempts integer not null check (attempts between 1 and 10),
    window_ends timestamptz not null
);

create index if not exists campaign_admin_login_attempts_expiry
    on public.campaign_admin_login_attempts (window_ends);

alter table public.campaign_admin_login_attempts enable row level security;
revoke all on public.campaign_admin_login_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.campaign_admin_login_attempts to service_role;

create or replace function public.campaign_allow_admin_login(p_bucket text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
    attempt_time timestamptz := statement_timestamp();
begin
    delete from public.campaign_admin_login_attempts
        where window_ends <= attempt_time - interval '1 hour';

    insert into public.campaign_admin_login_attempts as login_attempt
        (bucket, attempts, window_ends)
    values (p_bucket, 1, attempt_time + interval '5 minutes')
    on conflict (bucket) do update set
        attempts = case when login_attempt.window_ends <= attempt_time
            then 1 else login_attempt.attempts + 1 end,
        window_ends = case when login_attempt.window_ends <= attempt_time
            then excluded.window_ends else login_attempt.window_ends end
    where login_attempt.window_ends <= attempt_time or login_attempt.attempts < 10;

    return found;
end
$$;

revoke all on function public.campaign_allow_admin_login(text) from public, anon, authenticated;
grant execute on function public.campaign_allow_admin_login(text) to service_role;
