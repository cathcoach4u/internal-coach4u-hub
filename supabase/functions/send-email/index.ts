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

    const { to_email, subject, body, contact_id, client_id, from_name, from_email } = await req.json()
    if (!to_email || !subject || !body) {
      return new Response('Missing to_email, subject or body', { status: 400 })
    }

    const resendKey = Deno.env.get('RESEND_API_KEY')!
    const senderEmail = from_email || Deno.env.get('FROM_EMAIL') || 'cath@coach4u.com.au'
    const senderName  = from_name  || 'Cath — Coach4U'

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [to_email],
        subject,
        text: body,
      }),
    })

    const resendData = await resendRes.json()
    if (!resendRes.ok) {
      return new Response(
        JSON.stringify({ error: resendData.message || 'Resend error' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    await supabase.from('sms_messages').insert({
      contact_id:  contact_id  || null,
      client_id:   client_id   || null,
      channel:     'email',
      direction:   'outbound',
      from_number: senderEmail,
      to_number:   to_email,
      from_email:  senderEmail,
      to_email,
      subject,
      body,
      twilio_sid:  resendData.id,
      status:      'sent',
    })

    return new Response(
      JSON.stringify({ success: true, id: resendData.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
