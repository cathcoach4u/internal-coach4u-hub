import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Verify Supabase auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401 })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return new Response('Unauthorized', { status: 401 })

    const { to, body, contact_id, client_id } = await req.json()
    if (!to || !body) return new Response('Missing to or body', { status: 400 })

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const from = Deno.env.get('TWILIO_PHONE_NUMBER')!

    // Check opt-out status
    if (contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('sms_opted_out')
        .eq('id', contact_id)
        .maybeSingle()
      if (contact?.sms_opted_out) {
        return new Response(
          JSON.stringify({ error: 'Contact has opted out of SMS' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Send via Twilio
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      }
    )

    const twilioData = await twilioRes.json()
    if (!twilioRes.ok) {
      return new Response(
        JSON.stringify({ error: twilioData.message || 'Twilio error' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Store outbound message
    await supabase.from('sms_messages').insert({
      contact_id: contact_id || null,
      client_id: client_id || null,
      direction: 'outbound',
      from_number: from,
      to_number: to,
      body,
      twilio_sid: twilioData.sid,
      status: twilioData.status,
    })

    return new Response(
      JSON.stringify({ success: true, sid: twilioData.sid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
