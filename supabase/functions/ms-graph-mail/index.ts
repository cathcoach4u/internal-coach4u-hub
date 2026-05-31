// ============================================================================
// ms-graph-mail — Coach4U email helper (client-linked email)
// ----------------------------------------------------------------------------
// Lean email support: surface a client's emails inside the hub, draft AI
// replies in Cath's voice (the AI call happens client-side), and send/delete
// only behind an explicit confirm in the UI. Outlook stays the main inbox.
//
// APPLICATION (client-credentials) auth, fenced by the same Application Access
// Policy as ms-graph-calendar. Email mailboxes searched: contact@ + cath work
// + cath personal (Bookings is calendar-only — excluded here).
//
// Actions (POST { action, ... }):
//   list   — find recent messages involving a client's email address(es)
//   get    — full body of one message (for drafting / reading)
//   send   — send a reply (or a new message); confirm-gated in the UI
//   delete — move a message to Deleted Items; confirm-gated in the UI
//
// Secrets: MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Email sources (Bookings deliberately excluded — it's calendar-only)
const MAIL_MAILBOX: Record<string, string> = {
  contact:  'contact@coach4u.com.au',
  work:     'cath@coach4u.com.au',
  personal: 'cath@coachingwithcath.com.au',
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

async function getGraphToken(): Promise<string> {
  const tenant = Deno.env.get('MS_GRAPH_TENANT_ID')
  const clientId = Deno.env.get('MS_GRAPH_CLIENT_ID')
  const secret = Deno.env.get('MS_GRAPH_CLIENT_SECRET')
  if (!tenant || !clientId || !secret) throw new Error('Missing MS_GRAPH_* secrets')
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: secret,
      scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Graph token: ${data.error_description || data.error || res.status}`)
  return data.access_token
}

async function graph(token: string, method: string, path: string, body?: unknown, extra: Record<string,string> = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed: any = null
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  if (!res.ok) {
    const msg = parsed?.error?.message || (typeof parsed === 'string' ? parsed : res.statusText)
    throw new Error(`Graph ${method} ${path} → ${res.status}: ${msg}`)
  }
  return parsed
}

function mapMsg(source: string, mailbox: string, m: any) {
  return {
    id: m.id,
    source, mailbox,
    subject: m.subject || '(no subject)',
    from: { name: m.from?.emailAddress?.name || '', email: m.from?.emailAddress?.address || '' },
    to: (m.toRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean),
    received: m.receivedDateTime || null,
    preview: m.bodyPreview || '',
    web_link: m.webLink || null,
    is_read: !!m.isRead,
    has_attachments: !!m.hasAttachments,
  }
}

// ── list: messages involving any of the given email addresses ───────────────
async function doList(token: string, p: any) {
  const emails: string[] = (p.emails || []).map((e: string) => (''+e).trim().toLowerCase()).filter(Boolean)
  if (!emails.length) return { messages: [] }
  const sources = (p.sources && p.sources.length ? p.sources : Object.keys(MAIL_MAILBOX)).filter((s: string) => MAIL_MAILBOX[s])
  const search = emails.map((e) => `"${e}"`).join(' OR ')
  const seen = new Set<string>()
  const out: any[] = []
  for (const source of sources) {
    const mailbox = MAIL_MAILBOX[source]
    const path = `/users/${encodeURIComponent(mailbox)}/messages?$search=${encodeURIComponent(`"${search}"`.replace(/^"|"$/g,''))}&$top=${p.top || 25}&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,webLink,isRead,hasAttachments`
    try {
      const page: any = await graph(token, 'GET', path, undefined, { ConsistencyLevel: 'eventual' })
      ;(page.value || []).forEach((m: any) => {
        if (seen.has(m.id)) return
        seen.add(m.id)
        out.push(mapMsg(source, mailbox, m))
      })
    } catch (e) {
      // one mailbox failing shouldn't kill the whole list
      out.push({ _error: `${source}: ${(e as Error).message}` })
    }
  }
  out.sort((a, b) => (b.received || '').localeCompare(a.received || ''))
  return { messages: out }
}

async function doGet(token: string, p: any) {
  const mailbox = MAIL_MAILBOX[p.source]
  if (!mailbox || !p.message_id) throw new Error('get requires source, message_id')
  const m: any = await graph(token, 'GET',
    `/users/${encodeURIComponent(mailbox)}/messages/${p.message_id}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,webLink,isRead`)
  return {
    id: m.id, source: p.source,
    subject: m.subject, from: { name: m.from?.emailAddress?.name, email: m.from?.emailAddress?.address },
    to: (m.toRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean),
    received: m.receivedDateTime,
    body_html: m.body?.contentType === 'html' ? m.body?.content : null,
    body_text: m.body?.contentType !== 'html' ? m.body?.content : null,
    web_link: m.webLink,
  }
}

// ── send: reply to a thread, or a fresh message ─────────────────────────────
async function doSend(token: string, p: any) {
  const mailbox = MAIL_MAILBOX[p.source]
  if (!mailbox) throw new Error(`Unknown source '${p.source}'`)
  if (!p.body) throw new Error('send requires body')
  if (p.reply_to_message_id) {
    // reply keeps threading + original recipients; comment is the new text
    await graph(token, 'POST', `/users/${encodeURIComponent(mailbox)}/messages/${p.reply_to_message_id}/reply`, {
      comment: p.body,
    })
    return { sent: true, mode: 'reply' }
  }
  if (!p.to || !p.to.length || !p.subject) throw new Error('new message requires to[], subject, body')
  await graph(token, 'POST', `/users/${encodeURIComponent(mailbox)}/sendMail`, {
    message: {
      subject: p.subject,
      body: { contentType: 'HTML', content: p.body },
      toRecipients: p.to.map((a: string) => ({ emailAddress: { address: a } })),
      ccRecipients: (p.cc || []).map((a: string) => ({ emailAddress: { address: a } })),
    },
    saveToSentItems: true,
  })
  return { sent: true, mode: 'new' }
}

async function doDelete(token: string, p: any) {
  const mailbox = MAIL_MAILBOX[p.source]
  if (!mailbox || !p.message_id) throw new Error('delete requires source, message_id')
  // move to Deleted Items (recoverable) rather than hard delete
  await graph(token, 'POST', `/users/${encodeURIComponent(mailbox)}/messages/${p.message_id}/move`, {
    destinationId: 'deleteditems',
  })
  return { deleted: true }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authError } = await db.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const token = await getGraphToken()
    switch (body.action) {
      case 'list':   return json(await doList(token, body))
      case 'get':    return json(await doGet(token, body))
      case 'send':   return json(await doSend(token, body))
      case 'delete': return json(await doDelete(token, body))
      default:       return json({ error: `Unknown action '${body.action}'` }, 400)
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
