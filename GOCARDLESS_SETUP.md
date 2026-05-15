# GoCardless Mandate Integration Setup

## Overview
Automatically sync GoCardless payment mandate status into the CRM so you know when clients have completed the payment setup.

---

## Step 1: Create Supabase Table

Run this SQL in Supabase SQL Editor:

```sql
-- Create payment_mandates table
CREATE TABLE IF NOT EXISTS payment_mandates (
  id TEXT PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  mandate_reference TEXT UNIQUE,
  customer_email TEXT,
  status TEXT CHECK (status IN ('pending_submission', 'submitted', 'active', 'failed', 'cancelled', 'expired')),
  gocardless_mandate_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  metadata JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_mandates_contact_id ON payment_mandates(contact_id);
CREATE INDEX IF NOT EXISTS idx_payment_mandates_email ON payment_mandates(customer_email);
CREATE INDEX IF NOT EXISTS idx_payment_mandates_status ON payment_mandates(status);

-- Add mandate fields to contacts table (optional, for quick access)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS mandate_status TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS mandate_reference TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS mandate_received_at TIMESTAMPTZ;
```

---

## Step 2: Create Supabase Edge Function

Create a new Edge Function in Supabase:
**Project** → **Edge Functions** → **Create New Function** → Name: `gocardless-webhook`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const GOCARDLESS_ACCESS_TOKEN = Deno.env.get("GOCARDLESS_ACCESS_TOKEN");
const GOCARDLESS_WEBHOOK_SECRET = Deno.env.get("GOCARDLESS_WEBHOOK_SECRET");

serve(async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.text();
    const signature = req.headers.get("webhook-signature");

    // Verify GoCardless signature
    const crypto = await import("https://deno.land/std@0.168.0/crypto/mod.ts");
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(GOCARDLESS_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const computed = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const computedSignature = btoa(String.fromCharCode(...new Uint8Array(computed)));

    if (signature !== computedSignature) {
      return new Response("Invalid signature", { status: 401 });
    }

    const payload = JSON.parse(body);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Process each event
    for (const event of payload.events || []) {
      if (event.type.startsWith("mandate.")) {
        const mandateId = event.links?.mandate;
        if (!mandateId) continue;

        // Fetch mandate details from GoCardless
        const mandateRes = await fetch(
          `https://api.gocardless.com/mandates/${mandateId}`,
          {
            headers: {
              "Authorization": `Bearer ${GOCARDLESS_ACCESS_TOKEN}`,
              "GoCardless-Version": "2015-07-06",
            },
          }
        );

        if (!mandateRes.ok) {
          console.error("Failed to fetch mandate from GoCardless:", await mandateRes.text());
          continue;
        }

        const mandateData = await mandateRes.json();
        const mandate = mandateData.mandates;

        // Find contact by customer email (you may need to fetch customer details)
        let contactId = null;
        
        // Try to find contact by email if we have customer info
        if (mandate.links?.customer) {
          const customerRes = await fetch(
            `https://api.gocardless.com/customers/${mandate.links.customer}`,
            {
              headers: {
                "Authorization": `Bearer ${GOCARDLESS_ACCESS_TOKEN}`,
                "GoCardless-Version": "2015-07-06",
              },
            }
          );

          if (customerRes.ok) {
            const customerData = await customerRes.json();
            const customerEmail = customerData.customers?.email;

            if (customerEmail) {
              // Find contact by email
              const { data: contacts } = await supabase
                .from("contacts")
                .select("id")
                .eq("email", customerEmail)
                .limit(1);

              if (contacts && contacts.length > 0) {
                contactId = contacts[0].id;
              }
            }
          }
        }

        // Upsert mandate record
        const { error: upsertErr } = await supabase
          .from("payment_mandates")
          .upsert(
            {
              id: mandate.id,
              contact_id: contactId,
              mandate_reference: mandate.reference,
              customer_email: mandate.links?.customer || null,
              status: mandate.status,
              gocardless_mandate_id: mandate.id,
              received_at: mandate.status === "active" ? new Date().toISOString() : null,
              confirmed_at: mandate.status === "active" ? new Date().toISOString() : null,
              metadata: mandate,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

        if (upsertErr) {
          console.error("Supabase upsert error:", upsertErr);
          continue;
        }

        // Update contact's mandate status if we found a match
        if (contactId && mandate.status === "active") {
          await supabase
            .from("contacts")
            .update({
              mandate_status: mandate.status,
              mandate_reference: mandate.reference,
              mandate_received_at: new Date().toISOString(),
            })
            .eq("id", contactId);
        }

        console.log(`Processed mandate ${mandate.id} with status: ${mandate.status}`);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

---

## Step 3: Deploy and Configure Environment Variables

1. In Supabase, go to Edge Functions → `gocardless-webhook` → Settings
2. Add secrets:
   - `GOCARDLESS_ACCESS_TOKEN`: Your GoCardless API access token
   - `GOCARDLESS_WEBHOOK_SECRET`: Your webhook signing secret (from GoCardless)

3. Copy the function URL (looks like: `https://your-project.supabase.co/functions/v1/gocardless-webhook`)

---

## Step 4: Configure Webhook in GoCardless

1. Log in to GoCardless dashboard
2. Go to **Settings** → **Webhooks**
3. Click **Create Webhook**
4. **URL**: Paste your Edge Function URL
5. **Events**: Select:
   - `mandate.created`
   - `mandate.submitted`
   - `mandate.active`
   - `mandate.failed`
   - `mandate.cancelled`
   - `mandate.expired`
6. Save and test the webhook

---

## Step 5: Get Your GoCardless Credentials

### Access Token:
1. GoCardless Dashboard → **Settings** → **API Access**
2. Copy your **Access Token**

### Webhook Secret:
1. When you create the webhook, GoCardless shows you the **Signing Secret**
2. Copy it to Supabase environment variables

---

## Step 6: Update Couples Intake Form (Optional)

If using ThriveHQ intake or custom form, you can pre-fill customer email:

```html
<!-- Add hidden field to form with email from intake -->
<input type="hidden" name="customer_email" value="[contact.email]">
```

This helps GoCardless webhooks match back to contacts automatically.

---

## Step 7: Display Mandate Status in CRM

The contact now has:
- `mandate_status` (pending_submission | submitted | active | failed | etc.)
- `mandate_reference` (visible reference number)
- `mandate_received_at` (when confirmed)

You can now:
- Show badge in contact card: "✓ Mandate received"
- Filter clients by "Mandate pending" in list views
- Add checklist in client profile: "Payment mandate ✓"

---

## Testing

1. Access the GoCardless form: `https://pay.gocardless.com/billing/static/collect-customer-details?id=BRF01KRFKN55VGFWQEYHKKMSEM3ATNFS`
2. Use test customer email (e.g., `test@example.com`)
3. GoCardless will send webhook to your Edge Function
4. Check Supabase `payment_mandates` table for new record
5. Verify contact fields were updated

---

## Troubleshooting

**Webhook not firing?**
- Check GoCardless webhook logs (Settings → Webhooks → Test Log)
- Verify signature secret is correct
- Check Edge Function logs in Supabase

**Email not matching?**
- Ensure customer email in GoCardless matches contact email in CRM
- Add debug logging to Edge Function
- Consider manual fallback: add mandate_reference to contact manually

**No contact_id set?**
- Customer email might not match exactly (spaces, case)
- Add `.ilike()` filter instead of `.eq()` for case-insensitive match
- Or store GoCardless customer ID and link that way

---

## Next: Integrate into CRM UI

Once working, I can add:
- Mandate status badge in contact card
- Filter by mandate status in client list
- Auto-marking "Payment & Setup" as complete in couples-process
- Dashboard widget showing pending mandates
