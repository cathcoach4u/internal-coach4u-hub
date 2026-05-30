-- ============================================================================
-- Calendar Partner — Phase 1 table: calendar_events
-- Run this once in the Supabase SQL Editor (Internal Hub project
-- uoixetfvboevjxlkfyqy) to enable the in-app Calendar > Week View.
-- ============================================================================

create table if not exists public.calendar_events (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('work','bookings','personal')),
  graph_event_id  text,                -- Microsoft Graph event id (for sync/de-dupe)
  ical_uid        text,                -- stable iCalUId across calendars
  subject         text,
  start_ts        timestamptz not null,
  end_ts          timestamptz,
  is_all_day      boolean default false,
  location        text,
  attendees       jsonb,               -- array of emails or {email}/{emailAddress:{address}}
  organizer       text,
  body_preview    text,                -- first chars of body (booking forms carry client name/email/phone)
  contact_id      uuid references public.contacts(id) on delete set null,
  client_id       uuid references public.clients(id)  on delete set null,
  web_link        text,
  show_as         text,                -- free | busy | tentative | oof
  status          text default 'confirmed', -- confirmed | cancelled
  etag            text,
  last_synced     timestamptz default now(),
  created_at      timestamptz default now()
);

-- One row per Graph event per source; lets the sync upsert safely.
create unique index if not exists calendar_events_graph_uidx
  on public.calendar_events (source, graph_event_id);

create index if not exists calendar_events_start_idx   on public.calendar_events (start_ts);
create index if not exists calendar_events_contact_idx on public.calendar_events (contact_id);

-- ── Row Level Security ──
-- The app uses the anon (publishable) role behind Supabase Auth login.
alter table public.calendar_events enable row level security;

-- Read for any session (the CRM is sign-in gated).
drop policy if exists calendar_events_read on public.calendar_events;
create policy calendar_events_read
  on public.calendar_events for select
  using (true);

-- Allow the app / sync to insert + update + delete.
-- (Tighten to authenticated-only if/when the CRM moves off the anon role.)
drop policy if exists calendar_events_write on public.calendar_events;
create policy calendar_events_write
  on public.calendar_events for all
  using (true) with check (true);

-- ============================================================================
-- After running this, the Calendar > Week View stops showing the setup banner.
-- Seeding: Claude (in-session, as the VA) can pull the three Outlook calendars
-- via Microsoft Graph and upsert rows here so the real week appears.
-- ============================================================================
