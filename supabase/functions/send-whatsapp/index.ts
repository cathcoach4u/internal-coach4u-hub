import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
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

    // Check opt-out
    if (contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('whatsapp_opted_out')
        .eq('id', contact_id)
        .maybeSingle()
      if (contact?.whatsapp_opted_out) {
        return new Response(
          JSON.stringify({ error: 'Contact has opted out of WhatsApp' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const accessToken = Deno.env.get('META_ACCESS_TOKEN')!
    const phoneNumberId = Deno.env.get('META_PHONE_NUMBER_ID')!

    // Normalise number — Meta requires international format without +
    const toNormalised = to.replace(/\D/g, '').replace(/^0/, '61')

    const metaRes = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toNormalised,
          type: 'text',
          text: { body },
        }),
      }
    )

    const metaData = await metaRes.json()
    if (!metaRes.ok) {
      return new Response(
        JSON.stringify({ error: metaData.error?.message || 'Meta API error' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const msgId = metaData.messages?.[0]?.id

    await supabase.from('sms_messages').insert({
      contact_id: contact_id || null,
      client_id: client_id || null,
      channel: 'whatsapp',
      direction: 'outbound',
      from_number: Deno.env.get('META_WHATSAPP_NUMBER') || 'whatsapp',
      to_number: to,
      body,
      twilio_sid: msgId,
      status: 'sent',
    })

    return new Response(
      JSON.stringify({ success: true, id: msgId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
