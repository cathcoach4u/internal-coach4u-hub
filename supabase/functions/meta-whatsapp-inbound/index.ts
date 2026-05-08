import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STOP_WORDS = new Set(['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT'])
const START_WORDS = new Set(['UNSTOP','START'])

serve(async (req) => {
  // Meta webhook verification (GET)
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  try {
    const payload = await req.json()
    const entry   = payload.entry?.[0]
    const change  = entry?.changes?.[0]
    const value   = change?.value
    const messages = value?.messages

    // Ignore non-message events (status updates etc.)
    if (!messages?.length) return new Response('OK', { status: 200 })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    for (const message of messages) {
      const from = message.from   // e.g. "61412345678"
      const body = (message.text?.body || message.type || '').trim()
      const msgId = message.id

      // Match contact by phone suffix
      const suffix = from.slice(-9)
      const { data: allContacts } = await supabase
        .from('contacts')
        .select('id, phone, whatsapp_opted_out')

      const contact = (allContacts || []).find(c => {
        if (!c.phone) return false
        return c.phone.replace(/\D/g, '').endsWith(suffix)
      })

      const upperBody = body.toUpperCase()

      if (contact) {
        if (STOP_WORDS.has(upperBody)) {
          await supabase.from('contacts').update({ whatsapp_opted_out: true }).eq('id', contact.id)
        } else if (START_WORDS.has(upperBody)) {
          await supabase.from('contacts').update({ whatsapp_opted_out: false }).eq('id', contact.id)
        }
      }

      await supabase.from('sms_messages').insert({
        contact_id:  contact?.id || null,
        client_id:   null,
        channel:     'whatsapp',
        direction:   'inbound',
        from_number: from,
        to_number:   value?.metadata?.display_phone_number || 'whatsapp',
        body,
        twilio_sid:  msgId,
        status:      'received',
      })
    }

    return new Response('OK', { status: 200 })
  } catch (e) {
    console.error('meta-whatsapp-inbound error:', e)
    return new Response('OK', { status: 200 }) // always 200 to Meta
  }
})
