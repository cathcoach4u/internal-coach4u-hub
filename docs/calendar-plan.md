# Calendar Partner — Plan

A way for Cath to **request appointments in natural language**, **see the week**, and keep
**two Outlook (Microsoft 365) calendars in two-way sync** — all inside the Coach4U CRM,
with appointments linked to existing clients/contacts in Supabase.

> Diagrams: [`calendar-architecture.svg`](./calendar-architecture.svg) · [`calendar-roadmap.svg`](./calendar-roadmap.svg)

## Decisions (confirmed with Cath)

| Question | Answer |
|---|---|
| Calendar host | **Microsoft 365** mailboxes, purchased/managed via GoDaddy → reached through **Microsoft Graph API** |
| How many calendars | **Two separate mailboxes/logins** |
| App ↔ Outlook relationship | **Two-way sync** (Outlook keeps working as backup) |
| Where bookings are requested | **In-app booking panel + AI box** (plus optional "ask Claude in a session") |

## Phase 0 finding — access is already proven

A live Microsoft 365 connection in the Claude session successfully read Cath's calendar
(`outlook_calendar_search`) with no setup. This confirms the **GoDaddy-managed M365 tenant
permits Graph access**. Observations:

- Primary calendar: `cath@coach4u.com.au`
- Second source: `Coach4U@NETORGFT4053847.onmicrosoft.com` — appears to be a **Microsoft Bookings**
  mailbox feeding client session bookings (e.g. "90 minute session with Cath – …").
- Booking events carry **client name, email, phone in the event body** → reliable auto-linking
  to CRM `contacts`.

> In-session access (the "ask Claude" path) works today. The standalone app still needs an
> Azure app registration (Phase 0 plumbing), but the tenant is now known to allow it.

## Architecture

1. **Inputs** — in-app booking box, week view, or Claude session
2. **CRM app** (`index.html`, new *Calendar* area) — AI parses request → matches client → confirm card
3. **Supabase** — secure middle layer holding Graph tokens + Anthropic key; Edge Functions;
   new tables; links to existing `contacts`/`clients`
4. **Microsoft Graph** — OAuth (delegated, `Calendars.ReadWrite` + `offline_access`), one sign-in
   per mailbox; change-notification webhooks
5. **Two Outlook M365 calendars** — source/destination, two-way synced

### New Supabase tables (proposed)

- `calendar_accounts` — one row per connected mailbox (email, display name, token refs,
  webhook subscription id + expiry)
- `calendar_events` — synced events (graph_event_id, ical_uid, subject, start, end, location,
  attendees, body, `contact_id` FK, `client_id` FK, status, etag, last_synced, source)
- `calendar_requests` — natural-language booking requests + parsed result + status
  (pending/confirmed/failed) for audit

## Roadmap (each phase ships value on its own)

- **Phase 0 — Access & setup** *(prereq, mostly cleared)*: Azure app registration for the
  standalone app; connect both mailboxes (sign in once each).
- **Phase 1 — Read-only week view** *(MVP / fast win)*: pull both calendars into Supabase;
  new Calendar space + colour-coded week view; auto-link events to clients by email.
  **Replaces the Outlook calendar view.**
- **Phase 2 — Book from the app + AI box**: natural-language booking, client match, confirm
  card, write event into Outlook; reschedule/cancel.
- **Phase 3 — True two-way live sync**: Graph webhooks (Outlook → app), auto-renew
  subscriptions (cron), loop-guard, conflict + delete handling.
- **Phase 4 — Smart PA polish**: free-busy suggestions ("when am I free Tuesday?"), recurring
  sessions, reminders, request log, weekly summary to Teams/WhatsApp, manage via Claude session.

## Open items to confirm

- Confirm the two mailboxes: `cath@coach4u.com.au` + the Bookings mailbox `Coach4U@…onmicrosoft.com`,
  or a different second account?
- Whether the Bookings flow should remain the client-facing booking entry (app reads it) or be
  superseded by app-side booking.
