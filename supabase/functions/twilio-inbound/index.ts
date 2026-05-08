import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Twilio STOP keywords (AU standard)
const STOP_WORDS = new Set(['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT'])
const START_WORDS = new Set(['UNSTOP','START'])

serve(async (req) => {
  try {
    const formData = await req.formData()
    const from   = formData.get('From')  as string
    const to     = formData.get('To')    as string
    const body   = (formData.get('Body') as string || '').trim()
    const sid    = formData.get('MessageSid') as string

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Match contact by trailing 9 digits of the from number
    const digits = from.replace(/\D/g, '')
    const suffix = digits.slice(-9)

    const { data: matchedContacts } = await supabase
      .from('contacts')
      .select('id, phone, sms_opted_out')

    const contact = (matchedContacts || []).find(c => {
      if (!c.phone) return false
      return c.phone.replace(/\D/g, '').endsWith(suffix)
    })

    const upperBody = body.toUpperCase()

    // Handle opt-out / opt-in
    if (contact) {
      if (STOP_WORDS.has(upperBody)) {
        await supabase
          .from('contacts')
          .update({ sms_opted_out: true })
          .eq('id', contact.id)
      } else if (START_WORDS.has(upperBody)) {
        await supabase
          .from('contacts')
          .update({ sms_opted_out: false })
          .eq('id', contact.id)
      }
    }

    // Store inbound message
    const { error: insertError } = await supabase.from('sms_messages').insert({
      contact_id: contact?.id || null,
      client_id:  null,
      channel:    'sms',
      direction:  'inbound',
      from_number: from,
      to_number:   to,
      body,
      twilio_sid:  sid,
      status:      'received',
    })
    if (insertError) console.error('sms_messages insert error:', JSON.stringify(insertError))

    // Empty TwiML — no auto-reply
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { 'Content-Type': 'text/xml' } }
    )
  } catch (e) {
    console.error('twilio-inbound error:', e)
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }
})
