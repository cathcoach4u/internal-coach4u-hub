# Calendar — Microsoft Graph Write Access (Azure App Registration)

This is the one prerequisite that unlocks **everything** still pending on the calendar:

- **Booking from the app** ("book Sarah Tuesday 2pm" → real event in Outlook)
- **Live two-way sync** (Outlook changes flow into the app automatically, and back)
- **Auto-refresh** (no more manual re-seeding)

Until this exists, the app can *read* calendars (already working) but cannot *write* to them.

> **Who needs to do this:** Cath (or whoever has admin on the `coach4u.com.au`
> Microsoft 365). Claude cannot do this step — it happens inside Microsoft's
> Azure/Entra portal, behind your login.

---

## What you'll end up with (3 values to send back)

1. **Application (client) ID** — safe to share
2. **Directory (tenant) ID** — safe to share
3. **Client secret** — *secret*. Don't paste in chat; we'll put it straight into Supabase. (Guide shows where.)

These three let a small, secure background function (in Supabase) talk to Microsoft Graph as "Coach4U Calendar Sync".

---

## Part A — Register the app  (the key gate)

1. Go to **https://entra.microsoft.com** (Microsoft Entra admin center).
2. Sign in with **cath@coach4u.com.au** (the M365 account GoDaddy set up).
3. Left menu: **Identity → Applications → App registrations**.
4. Click **+ New registration**.
5. Fill in:
   - **Name:** `Coach4U Calendar Sync`
   - **Supported account types:** *Accounts in this organizational directory only* (single tenant)
   - **Redirect URI:** leave blank for now
6. Click **Register**.

✅ **Checkpoint:** You land on the app's **Overview** page showing
**Application (client) ID** and **Directory (tenant) ID**. Copy both — send them to Claude.

🚩 **If step 3 or 4 is blocked** ("you don't have access", or App registrations is
missing): your GoDaddy plan may restrict admin. Tell Claude — there's a clean
workaround (register the app in a free separate Microsoft tenant and point it at
your mailboxes), so this is a detour, not a dead end.

---

## Part B — Add the calendar permission

1. In the app, left menu: **API permissions**.
2. Click **+ Add a permission → Microsoft Graph**.
3. Choose **Application permissions** (not Delegated).
4. Search **Calendars.ReadWrite**, tick it, click **Add permissions**.
5. (Optional but useful) also add **Calendars.Read** and **User.Read.All** the same way.

✅ **Checkpoint:** `Calendars.ReadWrite` appears in the permissions list with
status "Not granted" (we fix that in Part D).

---

## Part C — Create the client secret

1. Left menu: **Certificates & secrets**.
2. Tab **Client secrets → + New client secret**.
3. Description: `Coach4U sync`; Expiry: **24 months** (longest available).
4. Click **Add**.
5. **Immediately copy the secret VALUE** (the long string, not the "Secret ID").
   It is shown **once** — if you leave the page it's hidden forever and you start over.

🔒 **Handling the secret:** don't paste it into chat. Put it into Supabase:
   - Supabase dashboard → project **uoixetfvboevjxlkfyqy** → **Project Settings → Edge Functions → Secrets** (or **Vault**)
   - Add secret named `MS_GRAPH_CLIENT_SECRET`, paste the value, save.
   - (Claude will tell you the exact two extra secret names to add alongside it.)

---

## Part D — Grant admin consent

1. Back to **API permissions**.
2. Click **Grant admin consent for [your org]**.
3. Confirm. Status for `Calendars.ReadWrite` flips to **Granted ✓** (green).

🚩 **If "Grant admin consent" is greyed out:** you're not a Global Admin on the
tenant. Either sign in as the admin account, or tell Claude — we adjust the approach.

---

## What to send back to Claude

- ✅ Application (client) ID: `__________`
- ✅ Directory (tenant) ID: `__________`
- ✅ Confirmation that admin consent shows **Granted**
- ✅ Confirmation the secret is saved in Supabase as `MS_GRAPH_CLIENT_SECRET`

With those, Claude builds the Supabase Edge Function that:
- pulls all calendars on a schedule (real auto-sync — replaces manual re-seeding)
- creates events in the **Bookings** mailbox when you book a client (so clients see "Coach4U")
- writes to work/personal when you book those

---

## Notes & decisions

- **Why Application permissions (not Delegated):** an unattended background sync is
  far more reliable with app-level access — no login sessions to keep alive, and the
  Bookings mailbox (a shared/resource mailbox) is handled cleanly. We can scope it to
  *only your mailboxes* with an Application Access Policy for safety.
- **The personal calendar** (`cath@coachingwithcath.com.au`) is a **separate tenant**.
  Read access already works via the in-session connector. To *write* to it we repeat
  Parts A–D in that tenant (a second small registration). We can do work + bookings
  first and add personal-write after — it doesn't block the main flow.
- **Cost:** none. App registration + Graph calendar access are included in M365.
