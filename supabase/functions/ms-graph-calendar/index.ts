// ============================================================================
// ms-graph-calendar — Coach4U Calendar Partner (Phase 2)
// ----------------------------------------------------------------------------
// One Edge Function for all calendar actions against Microsoft Graph, using
// APPLICATION (client-credentials) auth. The Azure app is fenced by an
// Application Access Policy to only the 5 scoped mailboxes, so this function
// can never touch anything else in the tenant.
//
// Actions (POST body { action, ... }):
//   sync       — pull events for all 3 calendar sources into calendar_events
//   book       — create an event (default source 'bookings' → clients see Coach4U)
//   reschedule — move an existing event (new start/end)
//   cancel     — delete an existing event
//   freebusy   — union availability across the 3 sources for a window
//
// Secrets required (Supabase → Edge Functions → Secrets):
//   MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Source → mailbox (the 3 calendars in the plan; all inside the scope group)
const SOURCE_MAILBOX: Record<string, string> = {
  work:     'cath@coach4u.com.au',
  bookings: 'Coach4U@NETORGFT4053847.onmicrosoft.com',
  personal: 'cath@coachingwithcath.com.au',
}
const SYNC_WINDOW_BACK_DAYS = 7
const SYNC_WINDOW_FWD_DAYS  = 90
const SYDNEY_TZ = 'Australia/Sydney'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ── Microsoft Graph token (client credentials) ──────────────────────────────
async function getGraphToken(): Promise<string> {
  const tenant = Deno.env.get('MS_GRAPH_TENANT_ID')
  const clientId = Deno.env.get('MS_GRAPH_CLIENT_ID')
  const secret = Deno.env.get('MS_GRAPH_CLIENT_SECRET')
  if (!tenant || !clientId || !secret) {
    throw new Error('Missing MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET')
  }
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Graph token error: ${data.error_description || data.error || res.status}`)
  return data.access_token as string
}

async function graph(token: string, method: string, path: string, body?: unknown, extraHeaders: Record<string,string> = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed: any = null
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  if (!res.ok) {
    const msg = parsed?.error?.message || parsed?.error_description || (typeof parsed === 'string' ? parsed : res.statusText)
    throw new Error(`Graph ${method} ${path} → ${res.status}: ${msg}`)
  }
  return parsed
}

// Graph returns local-tz dateTime without offset; we request UTC and add 'Z'
const utcIso = (dt?: { dateTime?: string }) => (dt?.dateTime ? dt.dateTime.replace(/(\.\d+)?$/, '') + 'Z' : null)

function mapEvent(source: string, ev: any) {
  const attendees = Array.isArray(ev.attendees)
    ? ev.attendees.map((a: any) => ({ email: a?.emailAddress?.address || '', name: a?.emailAddress?.name || '' })).filter((a: any) => a.email)
    : []
  return {
    source,
    graph_event_id: ev.id,
    ical_uid: ev.iCalUId || null,
    subject: ev.subject || '(no title)',
    start_ts: utcIso(ev.start),
    end_ts: utcIso(ev.end),
    is_all_day: !!ev.isAllDay,
    location: ev.location?.displayName || null,
    attendees,
    organizer: ev.organizer?.emailAddress?.address || null,
    body_preview: (ev.bodyPreview || '').slice(0, 500),
    web_link: ev.webLink || null,
    show_as: ev.showAs || null,
    status: ev.isCancelled ? 'cancelled' : 'confirmed',
    etag: ev['@odata.etag'] || null,
    last_synced: new Date().toISOString(),
  }
}

// ── Actions ─────────────────────────────────────────────────────────────────
async function doSync(token: string, db: any, opts: { sources?: string[] }) {
  const sources = (opts.sources && opts.sources.length ? opts.sources : Object.keys(SOURCE_MAILBOX))
    .filter((s) => SOURCE_MAILBOX[s])
  const now = new Date()
  const start = new Date(now.getTime() - SYNC_WINDOW_BACK_DAYS * 86400000).toISOString()
  const end = new Date(now.getTime() + SYNC_WINDOW_FWD_DAYS * 86400000).toISOString()
  const summary: Record<string, number> = {}

  for (const source of sources) {
    const mailbox = SOURCE_MAILBOX[source]
    const rows: any[] = []
    let url = `/users/${encodeURIComponent(mailbox)}/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$top=100&$select=id,iCalUId,subject,start,end,isAllDay,location,attendees,organizer,bodyPreview,webLink,showAs,isCancelled`
    // page through results
    while (url) {
      const page: any = await graph(token, 'GET', url, undefined, { Prefer: `outlook.timezone="UTC"` })
      ;(page.value || []).forEach((ev: any) => rows.push(mapEvent(source, ev)))
      const next = page['@odata.nextLink']
      url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : ''
    }

    // best-effort contact linking by attendee email
    if (rows.length) {
      const { data: contacts } = await db.from('contacts').select('id,email')
      const byEmail = new Map<string, string>()
      ;(contacts || []).forEach((c: any) => { if (c.email) byEmail.set(c.email.toLowerCase().trim(), c.id) })
      const self = new Set(Object.values(SOURCE_MAILBOX).map((m) => m.toLowerCase()))
      for (const r of rows) {
        const match = (r.attendees || [])
          .map((a: any) => (a.email || '').toLowerCase().trim())
          .find((e: string) => e && !self.has(e) && byEmail.has(e))
        ;(r as any).contact_id = match ? byEmail.get(match) : null
      }
    }

    // upsert fresh rows
    if (rows.length) {
      const { error } = await db.from('calendar_events').upsert(rows, { onConflict: 'source,graph_event_id' })
      if (error) throw new Error(`Upsert ${source}: ${error.message}`)
    }

    // remove events that disappeared from Outlook within this window
    const keepIds = rows.map((r) => r.graph_event_id)
    let del = db.from('calendar_events').delete().eq('source', source).gte('start_ts', start).lte('start_ts', end)
    if (keepIds.length) del = del.not('graph_event_id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`)
    await del
    summary[source] = rows.length
  }
  return { synced: summary }
}

async function doBook(token: string, db: any, p: any) {
  const source = p.source || 'bookings'
  const mailbox = SOURCE_MAILBOX[source]
  if (!mailbox) throw new Error(`Unknown source '${source}'`)
  if (!p.subject || !p.start || !p.end) throw new Error('book requires subject, start, end (ISO)')

  const attendees = (p.attendees || []).map((a: any) => ({
    emailAddress: { address: typeof a === 'string' ? a : a.email, name: (typeof a === 'object' && a.name) || '' },
    type: 'required',
  }))

  const event = await graph(token, 'POST', `/users/${encodeURIComponent(mailbox)}/events`, {
    subject: p.subject,
    body: { contentType: 'HTML', content: p.body || '' },
    start: { dateTime: p.start, timeZone: p.timeZone || SYDNEY_TZ },
    end:   { dateTime: p.end,   timeZone: p.timeZone || SYDNEY_TZ },
    location: p.location ? { displayName: p.location } : undefined,
    attendees,
    isOnlineMeeting: !!p.online_meeting,
    allowNewTimeProposals: false,
  })

  const row: any = mapEvent(source, event)
  row.contact_id = p.contact_id || null
  row.client_id = p.client_id || null
  const { error } = await db.from('calendar_events').upsert([row], { onConflict: 'source,graph_event_id' })
  if (error) throw new Error(`Save booking: ${error.message}`)
  return { event: row }
}

async function doReschedule(token: string, db: any, p: any) {
  const mailbox = SOURCE_MAILBOX[p.source]
  if (!mailbox) throw new Error(`Unknown source '${p.source}'`)
  if (!p.graph_event_id || !p.start || !p.end) throw new Error('reschedule requires source, graph_event_id, start, end')
  const event = await graph(token, 'PATCH', `/users/${encodeURIComponent(mailbox)}/events/${p.graph_event_id}`, {
    start: { dateTime: p.start, timeZone: p.timeZone || SYDNEY_TZ },
    end:   { dateTime: p.end,   timeZone: p.timeZone || SYDNEY_TZ },
  })
  const row: any = mapEvent(p.source, event)
  await db.from('calendar_events').upsert([row], { onConflict: 'source,graph_event_id' })
  return { event: row }
}

async function doCancel(token: string, db: any, p: any) {
  const mailbox = SOURCE_MAILBOX[p.source]
  if (!mailbox) throw new Error(`Unknown source '${p.source}'`)
  if (!p.graph_event_id) throw new Error('cancel requires source, graph_event_id')
  await graph(token, 'DELETE', `/users/${encodeURIComponent(mailbox)}/events/${p.graph_event_id}`)
  await db.from('calendar_events').delete().eq('source', p.source).eq('graph_event_id', p.graph_event_id)
  return { cancelled: true }
}

async function doFreeBusy(token: string, p: any) {
  if (!p.start || !p.end) throw new Error('freebusy requires start, end (ISO)')
  const anchor = SOURCE_MAILBOX.work
  const result = await graph(token, 'POST', `/users/${encodeURIComponent(anchor)}/calendar/getSchedule`, {
    schedules: Object.values(SOURCE_MAILBOX),
    startTime: { dateTime: p.start, timeZone: p.timeZone || SYDNEY_TZ },
    endTime:   { dateTime: p.end,   timeZone: p.timeZone || SYDNEY_TZ },
    availabilityViewInterval: p.interval || 30,
  })
  return { schedules: result.value }
}

// ── Handler ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: { user }, error: authError } = await db.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const action = body.action
    const token = await getGraphToken()

    switch (action) {
      case 'sync':       return json(await doSync(token, db, body))
      case 'book':       return json(await doBook(token, db, body))
      case 'reschedule': return json(await doReschedule(token, db, body))
      case 'cancel':     return json(await doCancel(token, db, body))
      case 'freebusy':   return json(await doFreeBusy(token, body))
      default:           return json({ error: `Unknown action '${action}'` }, 400)
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
