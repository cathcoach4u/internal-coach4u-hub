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

## Part B — Add the permissions

1. In the app, left menu: **API permissions**.
2. Click **+ Add a permission → Microsoft Graph**.
3. Choose **Application permissions** (not Delegated).
4. Add each of these (search, tick, **Add permissions**):
   - **Calendars.ReadWrite** — read/write calendars
   - **Mail.Read** — read email in the scoped mailboxes *(added per Cath's request)*
   - **User.Read.All** — resolve names/mailboxes (optional but useful)

✅ **Checkpoint:** both `Calendars.ReadWrite` and `Mail.Read` appear with status
"Not granted" (we fix that in Part D).

> ⚠️ **Sensitivity note:** `Mail.Read` means the one client secret now unlocks the
> **contents of email** in the scoped mailboxes, not just calendar times. The
> Application Access Policy in Part E fences BOTH to your mailbox list, so this is
> contained — but treat that secret as high-value accordingly.

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
   - Add these secrets:
     - `MS_GRAPH_CLIENT_SECRET` — the secret value you just copied
     - `MS_GRAPH_CLIENT_ID` — the Application (client) ID from Part A
     - `MS_GRAPH_TENANT_ID` — the Directory (tenant) ID from Part A
   - The client ID and tenant ID aren't secret, but keeping all three together lets the
     Edge Function read them cleanly.

---

## Part D — Grant admin consent

1. Back to **API permissions**.
2. Click **Grant admin consent for [your org]**.
3. Confirm. Status for `Calendars.ReadWrite` flips to **Granted ✓** (green).

🚩 **If "Grant admin consent" is greyed out:** you're not a Global Admin on the
tenant. Either sign in as the admin account, or tell Claude — we adjust the approach.

---

## Part E — Scope the app to ONLY these mailboxes  (the safeguard)

`Calendars.ReadWrite` + `Mail.Read` as Application permissions are **tenant-wide by
default** — they could touch every mailbox's calendar AND email. This step fences
them to only the mailboxes below, so even if the secret leaked it could not reach
anyone else.

**Intended scope (all in the one tenant — confirmed via Entra → Custom domain names):**

| Address | Type | Real mailbox to scope |
|---|---|---|
| `cath@coach4u.com.au` | Mailbox | itself |
| `cath@coachingwithcath.com.au` | Mailbox (same tenant) | itself |
| `Coach4U@…onmicrosoft.com` | Bookings mailbox | itself |
| `contact@coach4u.com.au` | Mailbox (confirm) | itself |
| `Bakers@coach4u.com.au` | **Alias** | the underlying mailbox it delivers to |
| `admin@coach4u.com.au` | **Alias** | the underlying mailbox it delivers to |

> ✅ **All domains are verified in the SAME tenant** (COACH4U / NETORGFT4053847) —
> `coach4u.com.au` and `coachingwithcath.com.au` both appear under Entra → Custom
> domain names. So one app registration, one secret, and one Access Policy cover
> everything. (Earlier drafts wrongly assumed coachingwithcath was a separate
> tenant — it is not. There is no separate "Part F".)
>
> 🔎 **Aliases have no inbox or calendar of their own.** `Bakers@` and `admin@` are
> aliases, so they can't be scoped directly — we scope the **real mailbox behind
> them**. Resolve it first (Part E.0). The policy allows a mail-enabled security
> **group**: we create the group, add the real mailboxes, and bind the app to it.

### Part E.0 — Resolve what the aliases point to

In Exchange Online PowerShell (connect as in step 1 below), run:

```powershell
# Show every address attached to each mailbox; find which mailbox owns the alias
Get-Mailbox -ResultSize Unlimited |
  Where-Object { $_.EmailAddresses -match "bakers@coach4u.com.au" -or $_.EmailAddresses -match "admin@coach4u.com.au" } |
  Select-Object DisplayName, PrimarySmtpAddress, RecipientTypeDetails, @{n='Aliases';e={$_.EmailAddresses}}
```

- If a row comes back → its **PrimarySmtpAddress** is the real mailbox to scope (use
  that, not the alias). `RecipientTypeDetails` tells you if it's a SharedMailbox/UserMailbox.
- If **nothing** comes back → the address is attached to a Microsoft 365 Group or
  Teams channel, which has a group mailbox (different handling). Send the output to Claude.

This runs in **Exchange Online PowerShell** (not the web portal). Claude will walk
through it live; the commands are:

```powershell
# 1. Connect (opens a browser sign-in as an Exchange admin)
Install-Module ExchangeOnlineManagement -Scope CurrentUser   # first time only
Connect-ExchangeOnline -UserPrincipalName admin@coach4u.com.au

# 2. Create a mail-enabled security group to hold the allowed mailboxes
New-DistributionGroup -Name "Coach4U Calendar Sync Scope" `
  -Alias calsync-scope -Type Security `
  -PrimarySmtpAddress calsync-scope@coach4u.com.au

# 3. Add each REAL mailbox to the group.
#    Use the PrimarySmtpAddress values — for Bakers@/admin@ use the underlying
#    mailbox found in Part E.0, NOT the alias address.
$members = @(
  "cath@coach4u.com.au",
  "cath@coachingwithcath.com.au",     # same tenant — personal calendar
  "contact@coach4u.com.au"            # confirm it's a real mailbox
  # "<real mailbox behind Bakers@>",  # from Part E.0
  # "<real mailbox behind admin@>",   # from Part E.0
  # "<Bookings mailbox primary SMTP>" # confirm exact address
)
foreach ($m in $members) { Add-DistributionGroupMember -Identity calsync-scope -Member $m }

# 4. Create the Application Access Policy tying the APP to the group.
#    This single policy covers BOTH Calendars.ReadWrite and Mail.Read.
#    Replace <APP_CLIENT_ID> with the Application (client) ID from Part A.
New-ApplicationAccessPolicy -AppId "<APP_CLIENT_ID>" `
  -PolicyScopeGroupId calsync-scope@coach4u.com.au `
  -AccessRight RestrictAccess `
  -Description "Coach4U Calendar Sync limited to scoped mailboxes"

# 5. Verify — should return Granted/Denied per mailbox
Test-ApplicationAccessPolicy -Identity cath@coach4u.com.au -AppId "<APP_CLIENT_ID>"
Test-ApplicationAccessPolicy -Identity someone-else@coach4u.com.au -AppId "<APP_CLIENT_ID>"  # should be DENIED
```

✅ **Checkpoint:** Test shows **Granted** for every scoped mailbox and **Denied** for
any mailbox not in the group. Policy can take up to ~30 min to apply. The policy
restricts BOTH calendar and mail access to this group.

---

## Personal calendar — no separate setup needed

`cath@coachingwithcath.com.au` lives in the **same tenant** (confirmed in Entra →
Custom domain names), so it's just another mailbox in the scope group above. One
registration / secret / policy covers it. **There is no separate Part F.**

---

## What to send back to Claude

- ✅ Application (client) ID: `__________`
- ✅ Directory (tenant) ID: `__________`
- ✅ Confirmation that admin consent shows **Granted**
- ✅ Confirmation the secret is saved in Supabase as `MS_GRAPH_CLIENT_SECRET`
- ✅ Confirmation the Application Access Policy (Part E) is in place and `Test-ApplicationAccessPolicy` shows **Granted** for the 5 scoped mailboxes / **Denied** for others

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
- **The personal calendar** (`cath@coachingwithcath.com.au`) is in the **same tenant**
  (confirmed via Entra → Custom domain names), so it's covered by this one
  registration — just add its mailbox to the scope group. No separate setup.
- **Cost:** none. App registration + Graph calendar/mail access are included in M365.
