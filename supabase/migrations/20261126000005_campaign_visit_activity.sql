-- Keep pre-existing visits with day-level precision.
alter table public.campaign_demo_traffic
    add column if not exists occurred_at timestamptz;

create index if not exists campaign_visible_visits_session_day_idx
    on public.campaign_demo_traffic (session, day desc)
    where reporting_visible is true;

create index if not exists campaign_visible_events_session_time_idx
    on public.campaign_journey_events (session, day desc, occurred_at desc)
    where reporting_visible is true;
