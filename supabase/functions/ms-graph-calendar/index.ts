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

  // Client emails are kept ONLY as recipients of our branded confirmation —
  // deliberately NOT added as Outlook attendees, so Microsoft does not also
  // fire its own (cold) calendar invite. One branded email, no duplicate.
  const clientList: string[] = (p.attendees || []).map((a: any) => {
    const e = typeof a === 'string' ? a : a?.email
    const n = (typeof a === 'object' && a?.name) || ''
    return e ? (n ? `${n} (${e})` : e) : ''
  }).filter(Boolean)
  const recipients: string[] = (p.attendees || [])
    .map((a: any) => (typeof a === 'string' ? a : a?.email))
    .filter((e: string) => e && /.+@.+\..+/.test(e))

  // Client name(s)+email written into the event notes so the booking shows who
  // it's with when opened (they're not formal attendees, to avoid the invite).
  const clientHeader = clientList.length
    ? `<p style="margin:0 0 8px"><strong>Client:</strong> ${esc(clientList.join(', '))}</p>` : ''
  const eventBody = clientHeader + (p.body || '')

  // Prefer UTC in the response so the saved row (and the .ics) carry correct UTC.
  const event = await graph(token, 'POST', `/users/${encodeURIComponent(mailbox)}/events`, {
    subject: p.subject,
    body: { contentType: 'HTML', content: eventBody },
    start: { dateTime: p.start, timeZone: p.timeZone || SYDNEY_TZ },
    end:   { dateTime: p.end,   timeZone: p.timeZone || SYDNEY_TZ },
    location: p.location ? { displayName: p.location } : undefined,
    isOnlineMeeting: !!p.online_meeting,
    allowNewTimeProposals: false,
  }, { Prefer: 'outlook.timezone="UTC"' })

  const row: any = mapEvent(source, event)
  row.contact_id = p.contact_id || null
  row.client_id = p.client_id || null
  const { error } = await db.from('calendar_events').upsert([row], { onConflict: 'source,graph_event_id' })
  if (error) throw new Error(`Save booking: ${error.message}`)

  // Coach4U confirmation email — sent from the booking mailbox so the client sees
  // the team, with a calendar (.ics) attachment so they can add it to their calendar.
  let confirmation_sent = false
  if (p.send_confirmation && recipients.length) {
    try {
      // Send as raw MIME multipart so both a real plain-text part AND the branded
      // HTML part go out (plus the .ics) — plain-text clients get a clean, complete
      // version with the actual links, not a stripped-HTML mess.
      const subject = 'Your session is confirmed — ' + p.subject
      const mime = buildMime(mailbox, recipients, subject, confirmationHtml(p), confirmationText(p), buildIcs(row, p))
      const sres = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/sendMail`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body: b64(mime),
      })
      if (!sres.ok) { const t = await sres.text(); throw new Error(`sendMail ${sres.status}: ${t.slice(0, 200)}`) }
      confirmation_sent = true
    } catch (e) {
      // event is already created; surface the email problem without failing the booking
      return { event: row, confirmation_sent: false, confirmation_error: (e as Error).message }
    }
  }
  return { event: row, confirmation_sent }
}

function esc(s: string) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
// Branded, email-safe HTML (table layout + inline styles) following the Coach4U
// Journey Card formula: logo + navy header, teal-accented details, amber
// "need to change?" box with WhatsApp + contact@, ABN footer.
function confirmationHtml(p: any) {
  const logo = 'https://cathcoach4u.github.io/internal-coach4u-hub/C4U.png'
  const when = p.when_text ? esc(p.when_text) : ''
  const meet = p.meeting_url || ''
  const joinBtn = meet
    ? `<tr><td style="padding:10px 0 0;"><a href="${meet}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:8px;">Join on Microsoft Teams</a></td></tr>
      <tr><td style="padding:8px 0 0;font-size:12px;color:#94a3b8;word-break:break-all;">Or paste this link: <a href="${meet}" style="color:#0d9488;">${esc(meet)}</a></td></tr>`
    : ''
  const detailRow = (label: string, val: string) => val
    ? `<tr><td style="padding:5px 0;"><span style="display:inline-block;min-width:62px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.6px;font-weight:700;">${label}</span> <span style="color:#1e293b;font-size:14px;font-weight:600;">${val}</span></td></tr>`
    : ''
  return `<div style="background:#f1f5f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;border-collapse:collapse;">
    <tr><td style="background-color:#1e3a5f;background-image:linear-gradient(135deg,#1e3a5f 0%,#234b78 100%);padding:26px 28px;border-radius:12px 12px 0 0;text-align:center;">
      <img src="${logo}" alt="Coach4U" width="60" height="60" style="display:block;margin:0 auto 10px;border:0;outline:none;">
      <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:.4px;">Your session is confirmed</div>
    </td></tr>
    <tr><td style="background:#ffffff;padding:26px 28px;color:#1e293b;font-size:14px;line-height:1.65;">
      <p style="margin:0 0 14px;">Hi there,</p>
      <p style="margin:0 0 18px;">Your session with ${esc(p.host || 'Cath Baker')} is confirmed. Here are the details:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-left:4px solid #0d9488;border-radius:8px;margin:0 0 18px;">
        <tr><td style="padding:14px 18px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
            ${detailRow('When', when)}
            ${joinBtn}
          </table>
        </td></tr>
      </table>
      <p style="margin:0 0 18px;color:#475569;">A calendar file is attached to this email so you can add the session to your own calendar.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin:0 0 20px;">
        <tr><td style="padding:14px 18px;">
          <div style="font-size:13px;font-weight:700;color:#9a3412;margin-bottom:8px;">Need to change or reschedule?</div>
          <div style="font-size:13px;color:#7c2d12;line-height:1.8;">
            WhatsApp us: <a href="https://wa.me/61485695168" style="color:#0d9488;font-weight:700;text-decoration:none;">+61 485 695 168</a><br>
            Email us: <a href="mailto:contact@coach4u.com.au" style="color:#0d9488;font-weight:700;text-decoration:none;">contact@coach4u.com.au</a><br>
            Or simply reply to this email and we'll sort it out.
          </div>
        </td></tr>
      </table>
      <p style="margin:0 0 4px;">Looking forward to it.</p>
      <p style="margin:16px 0 0;">Thanks<br><strong>Cath</strong><br><span style="color:#64748b;">Coach4U</span></p>
    </td></tr>
    <tr><td style="background:#f8fafc;padding:16px 28px;border-radius:0 0 12px 12px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;line-height:1.6;">
      SARUBA PTY LTD t/a Coach4U &middot; ABN 50 678 462 178
    </td></tr>
  </table>
  </div>`
}

// Plain-text alternative — clean, complete, with the real links (for clients
// that display text instead of HTML). Mirrors the HTML content.
function confirmationText(p: any) {
  const L: string[] = [
    'YOUR SESSION IS CONFIRMED',
    '',
    'Hi there,',
    '',
    'Your session with ' + (p.host || 'Cath Baker') + ' is confirmed. Here are the details:',
    '',
  ]
  if (p.when_text) L.push('When: ' + p.when_text)
  if (p.meeting_url) { L.push(''); L.push('Join on Microsoft Teams:'); L.push(p.meeting_url) }
  L.push('')
  L.push('A calendar file (session.ics) is attached so you can add the session to your own calendar.')
  L.push('')
  L.push('NEED TO CHANGE OR RESCHEDULE?')
  L.push('  WhatsApp us: +61 485 695 168  (https://wa.me/61485695168)')
  L.push('  Email us: contact@coach4u.com.au')
  L.push("  Or simply reply to this email and we'll sort it out.")
  L.push('')
  L.push('Looking forward to it.')
  L.push('')
  L.push('Thanks')
  L.push('Cath')
  L.push('Coach4U')
  L.push('')
  L.push('SARUBA PTY LTD t/a Coach4U · ABN 50 678 462 178')
  return L.join('\r\n')
}

// ── Raw MIME multipart builder (text + html alternative, plus .ics attachment) ─
function encHeader(s: string) { return /[^\x00-\x7F]/.test(s) ? '=?UTF-8?B?' + b64(s) + '?=' : s }
function b64wrap(s: string) { return b64(s).replace(/(.{76})/g, '$1\r\n') }
function buildMime(from: string, to: string[], subject: string, html: string, text: string, ics: string) {
  const bMix = 'c4u_mix_' + Math.random().toString(36).slice(2)
  const bAlt = 'c4u_alt_' + Math.random().toString(36).slice(2)
  return [
    `From: Coach4U <${from}>`,
    `Reply-To: Coach4U <contact@coach4u.com.au>`,
    `To: ${to.join(', ')}`,
    `Subject: ${encHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${bMix}"`,
    '',
    `--${bMix}`,
    `Content-Type: multipart/alternative; boundary="${bAlt}"`,
    '',
    `--${bAlt}`,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64wrap(text),
    '',
    `--${bAlt}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64wrap(html),
    '',
    `--${bAlt}--`,
    '',
    `--${bMix}`,
    'Content-Type: text/calendar; method=PUBLISH; charset="utf-8"; name="session.ics"',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="session.ics"',
    '',
    b64wrap(ics),
    '',
    `--${bMix}--`,
    '',
  ].join('\r\n')
}

// ── Calendar (.ics) attachment ──────────────────────────────────────────────
function b64(s: string) { return btoa(unescape(encodeURIComponent(s))) }
function icsEsc(s: string) { return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n') }
// row.start_ts/end_ts are UTC ISO ending in 'Z' → 20260531T000000Z
function icsDt(iso: string) { return (iso || '').replace(/\.\d+/, '').replace(/[-:]/g, '') }
function buildIcs(row: any, p: any) {
  const uid = (row.ical_uid || row.graph_event_id || ('c4u-' + Date.now())) + ''
  const loc = p.meeting_url || row.location || ''
  const desc = p.meeting_url ? ('Join here: ' + p.meeting_url) : ''
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Coach4U//Booking//EN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + uid,
    'DTSTAMP:' + icsDt(new Date().toISOString()),
    'DTSTART:' + icsDt(row.start_ts),
    'DTEND:' + icsDt(row.end_ts),
    'SUMMARY:' + icsEsc(p.subject),
    loc ? 'LOCATION:' + icsEsc(loc) : '',
    desc ? 'DESCRIPTION:' + icsEsc(desc) : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean)
  return lines.join('\r\n')
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

async function doUpdate(token: string, db: any, p: any) {
  const newSource = p.source
  const oldSource = p.orig_source || p.source
  const newMailbox = SOURCE_MAILBOX[newSource]
  const oldMailbox = SOURCE_MAILBOX[oldSource]
  if (!newMailbox || !oldMailbox) throw new Error(`Unknown calendar source`)
  if (!p.graph_event_id) throw new Error('update requires source, graph_event_id')

  // preserve the existing contact/client link (upsert replaces the whole row)
  const { data: existing } = await db.from('calendar_events')
    .select('contact_id,client_id').eq('source', oldSource).eq('graph_event_id', p.graph_event_id).maybeSingle()
  const keepContact = (p.contact_id !== undefined ? p.contact_id : (existing ? existing.contact_id : null)) || null
  const keepClient  = (p.client_id  !== undefined ? p.client_id  : (existing ? existing.client_id  : null)) || null

  // Same calendar → edit in place
  if (newSource === oldSource) {
    const patch: any = {}
    if (p.subject !== undefined) patch.subject = p.subject
    if (p.start && p.end) {
      patch.start = { dateTime: p.start, timeZone: p.timeZone || SYDNEY_TZ }
      patch.end =   { dateTime: p.end,   timeZone: p.timeZone || SYDNEY_TZ }
    }
    if (p.location !== undefined) patch.location = { displayName: p.location || '' }
    if (p.body !== undefined) patch.body = { contentType: 'HTML', content: p.body || '' }
    const event = await graph(token, 'PATCH', `/users/${encodeURIComponent(oldMailbox)}/events/${p.graph_event_id}`, patch, { Prefer: 'outlook.timezone="UTC"' })
    const row: any = mapEvent(oldSource, event)
    row.contact_id = keepContact; row.client_id = keepClient
    await db.from('calendar_events').upsert([row], { onConflict: 'source,graph_event_id' })
    return { event: row }
  }

  // Different calendar → move: recreate on the new calendar, delete from the old one
  let bodyContent = p.body
  if (bodyContent === undefined) {
    const orig = await graph(token, 'GET', `/users/${encodeURIComponent(oldMailbox)}/events/${p.graph_event_id}?$select=body`)
    bodyContent = orig && orig.body ? orig.body.content : ''
  }
  const created = await graph(token, 'POST', `/users/${encodeURIComponent(newMailbox)}/events`, {
    subject: p.subject,
    body: { contentType: 'HTML', content: bodyContent || '' },
    start: { dateTime: p.start, timeZone: p.timeZone || SYDNEY_TZ },
    end:   { dateTime: p.end,   timeZone: p.timeZone || SYDNEY_TZ },
    location: p.location ? { displayName: p.location } : undefined,
    allowNewTimeProposals: false,
  }, { Prefer: 'outlook.timezone="UTC"' })
  try { await graph(token, 'DELETE', `/users/${encodeURIComponent(oldMailbox)}/events/${p.graph_event_id}`) } catch (_e) { /* original may be Bookings-owned */ }
  await db.from('calendar_events').delete().eq('source', oldSource).eq('graph_event_id', p.graph_event_id)
  const row: any = mapEvent(newSource, created)
  row.contact_id = keepContact; row.client_id = keepClient
  await db.from('calendar_events').upsert([row], { onConflict: 'source,graph_event_id' })
  return { event: row, moved: true }
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
      case 'update':     return json(await doUpdate(token, db, body))
      case 'cancel':     return json(await doCancel(token, db, body))
      case 'freebusy':   return json(await doFreeBusy(token, body))
      default:           return json({ error: `Unknown action '${action}'` }, 400)
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
