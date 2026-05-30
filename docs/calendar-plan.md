# Calendar Partner — Plan

A way for Cath to **request appointments in natural language**, **see the week**, and keep
**two Outlook (Microsoft 365) calendars in two-way sync** — all inside the Coach4U CRM,
with appointments linked to existing clients/contacts in Supabase.

> Diagrams: [`calendar-architecture.svg`](./calendar-architecture.svg) · [`calendar-roadmap.svg`](./calendar-roadmap.svg)

## Decisions (confirmed with Cath)

| Question | Answer |
|---|---|
| Calendar host | **Microsoft 365** mailboxes, purchased/managed via GoDaddy → reached through **Microsoft Graph API** |
| How many calendars | **3 sources across 2 logins** (see below) |
| App ↔ Outlook relationship | **Two-way sync** for work + bookings; personal is **read-only / availability** |
| Where bookings are requested | **In-app booking panel + AI box** (plus optional "ask Claude in a session") |

### The three calendar sources

| Source | Login | Role | App treatment |
|---|---|---|---|
| `cath@coach4u.com.au` | coach4u.com.au (M365) | **Work** — sessions, tasks | Two-way sync, full detail |
| `Coach4U@…onmicrosoft.com` | coach4u.com.au (M365) | **Bookings — client-facing front door.** VA books here; clients see "Coach4U", giving a team feel | Two-way sync; **keep as the client-facing entry**. App/AI-created sessions must surface as **Coach4U**, never Cath's personal identity |
| `cath@coachingwithcath.com.au` | coachingwithcath.com.au | **Personal** — affects availability | **Viewable & bookable** (full detail, flagged "personal"). Counts toward availability so client sessions don't clash. **Never shown to clients.** |

**Brand rule:** the Bookings page is deliberate — it makes clients feel there's a team around
Cath. The **AI VA (Claude) now does the booking** into it, in place of the human VA. Client
sessions are created **in the Bookings mailbox**, so the client always sees "Coach4U", never
Cath's personal identity. Do not replace the Bookings page or expose Cath's personal address.

**Privacy rule:** the personal calendar is fully viewable and bookable by Cath/the AI VA, but
its events are **never surfaced to clients** — they only contribute to Cath's availability.

## Phase 0 finding — access is already proven

A live Microsoft 365 connection in the Claude session successfully read **all three calendars**
(`outlook_calendar_search`, including the personal mailbox via `calendarOwnerEmail`) with no
setup. This confirms the **GoDaddy-managed M365 tenant permits Graph access** and that delegated
read across the personal account works. Observations:

- `cath@coach4u.com.au` — work events (Gallup renewal, FocusHQ, Relate training, etc.)
- `Coach4U@NETORGFT4053847.onmicrosoft.com` — **Microsoft Bookings** mailbox feeding client
  session bookings (e.g. "90 minute session with Cath – Steven Sullivan").
- `cath@coachingwithcath.com.au` — personal (theatre, errands, weights) — readable for
  availability.
- Booking events carry **client name, email, phone in the event body** → reliable auto-linking
  to CRM `contacts`.

> In-session access (the "ask Claude" path) works today across all three calendars. The
> standalone app still needs an Azure app registration (Phase 0 plumbing), but the tenant is
> now known to allow it.

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

## Availability layer

A free/busy union across **all three** calendars drives "when is Cath free?" and prevents
double-booking. All three contribute busy blocks; client sessions are only proposed in slots
free across work, bookings, and personal. `find_meeting_availability` (Graph) computes
candidate slots; the app overlays these in the week view and the AI booking flow proposes only
genuinely-free times.

## Open items to confirm

- ~~Confirm the two mailboxes~~ → **Resolved:** work `cath@coach4u.com.au`, bookings
  `Coach4U@…onmicrosoft.com`, personal `cath@coachingwithcath.com.au`.
- ~~Where to create client sessions~~ → **Resolved:** the **AI VA (Claude) is now the VA** and
  books client sessions **into the Bookings mailbox**, so clients always see "Coach4U".
- ~~Personal calendar treatment~~ → **Resolved:** fully viewable and bookable, flagged
  "personal", never client-facing.
