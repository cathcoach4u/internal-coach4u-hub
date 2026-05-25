import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(',')
  const t   = parts.find(p => p.startsWith('t='))?.slice(2)
  const v1  = parts.find(p => p.startsWith('v1='))?.slice(3)
  if (!t || !v1) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig     = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`))
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return computed === v1
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  try {
    const rawBody      = await req.text()
    const sigHeader    = req.headers.get('stripe-signature')
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

    if (!sigHeader || !webhookSecret) {
      return new Response('Missing signature or secret', { status: 400 })
    }

    const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret)
    if (!valid) {
      return new Response('Invalid signature', { status: 400 })
    }

    const event = JSON.parse(rawBody)

    if (event.type !== 'charge.succeeded' && event.type !== 'payment_intent.succeeded') {
      return new Response(JSON.stringify({ received: true, skipped: event.type }), { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let amountCents    = 0
    let description    = ''
    let createdAt      = Date.now() / 1000
    let reference      = ''
    let customerName   = ''
    let customerEmail  = ''
    let stripeCustomerId = ''

    if (event.type === 'charge.succeeded') {
      const charge     = event.data.object
      amountCents      = charge.amount
      description      = charge.description || ''
      createdAt        = charge.created
      reference        = charge.id
      customerName     = charge.billing_details?.name || ''
      customerEmail    = charge.billing_details?.email || charge.receipt_email || ''
      stripeCustomerId = typeof charge.customer === 'string' ? charge.customer : ''
    } else {
      const pi         = event.data.object
      amountCents      = pi.amount
      description      = pi.description || ''
      createdAt        = pi.created
      reference        = pi.id
      customerEmail    = pi.receipt_email || ''
      stripeCustomerId = typeof pi.customer === 'string' ? pi.customer : ''
    }

    const gross            = Math.round(amountCents) / 100
    const gst              = Math.round((gross / 11) * 100) / 100
    const net              = Math.round((gross - gst) * 100) / 100
    const transaction_date = new Date(createdAt * 1000).toISOString().split('T')[0]

    // Try to match to a contact by email
    let contact_id: string | null = null
    if (customerEmail) {
      const { data: matched } = await supabase
        .from('contacts')
        .select('id')
        .ilike('email', customerEmail)
        .maybeSingle()
      if (matched) contact_id = matched.id
    }

    const { error } = await supabase.from('stripe_payments').insert({
      contact_id,
      stripe_reference:    reference,
      stripe_customer_id:  stripeCustomerId || null,
      customer_name:       customerName || null,
      customer_email:      customerEmail || null,
      description:         description.substring(0, 500) || null,
      transaction_date,
      gross,
      gst,
      net,
    })

    if (error) {
      console.error('DB insert error:', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    console.log(`Stripe ${event.type} recorded: $${gross} on ${transaction_date}`)
    return new Response(JSON.stringify({ received: true }), { status: 200 })

  } catch (e) {
    console.error('Webhook error:', e)
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
