# GoCardless Integration - Next Steps for CRM UI

## Prerequisites
Before starting these steps, you must have:
- ✓ Created `payment_mandates` table in Supabase
- ✓ Deployed Edge Function `gocardless-webhook`
- ✓ Configured GoCardless webhook to point to your Edge Function
- ✓ Added environment variables (GOCARDLESS_ACCESS_TOKEN, GOCARDLESS_WEBHOOK_SECRET)
- ✓ Tested webhook with at least one mandate

---

## Phase 1: Load Mandate Data in CRM

### Step 1A: Add function to load mandates on startup

In `index.html`, add to the `loadAll()` function:

```javascript
async function loadPaymentMandates(){
  const {data,error}=await supabase.from('payment_mandates').select('*');
  if(error){console.error('Error loading mandates:',error);return;}
  window.paymentMandates=data||[];
  console.log('Loaded '+paymentMandates.length+' payment mandates');
}
```

Then call it in `loadAll()`:
```javascript
async function loadAll(){
  try{
    await Promise.all([
      loadContacts(),
      loadClients(),
      // ... other loads
      loadPaymentMandates(),  // ADD THIS
    ]);
    // ...
```

### Step 1B: Helper function to get mandate for a contact

Add this helper function:
```javascript
function getContactMandate(contactId){
  return (window.paymentMandates||[]).find(m=>m.contact_id===contactId);
}

function getMandateStatusBadge(status){
  const styles={
    active:'<span style="font-size:10px;background:#dcfce7;color:#15803d;padding:2px 7px;border-radius:99px;font-weight:700;">✓ Mandate received</span>',
    submitted:'<span style="font-size:10px;background:#fef3c7;color:#d97706;padding:2px 7px;border-radius:99px;font-weight:700;">⏳ Pending confirmation</span>',
    pending_submission:'<span style="font-size:10px;background:#fee2e2;color:#dc2626;padding:2px 7px;border-radius:99px;font-weight:700;">⚠ Not started</span>',
    failed:'<span style="font-size:10px;background:#fee2e2;color:#dc2626;padding:2px 7px;border-radius:99px;font-weight:700;">✕ Failed</span>',
    cancelled:'<span style="font-size:10px;background:#f3f4f6;color:#6b7280;padding:2px 7px;border-radius:99px;font-weight:700;">Cancelled</span>',
  };
  return styles[status]||'';
}
```

---

## Phase 2: Show Mandate Status in Contact Card

### Step 2A: Update contact modal to display mandate

In the contact profile modal (look for `openContactModal` function), add this section after personal details:

```javascript
const mandate=getContactMandate(contact.id);
let mandateSection='';
if(mandate){
  mandateSection=`<div style="margin-top:14px;padding:12px;background:#f8fafc;border-radius:8px;border-left:3px solid ${mandate.status==='active'?'#15803d':'#d97706'};">
    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Payment Mandate</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      ${getMandateStatusBadge(mandate.status)}
    </div>
    ${mandate.mandate_reference?`<div style="font-size:11px;color:#475569;">Ref: ${mandate.mandate_reference}</div>`:''}
    ${mandate.confirmed_at?`<div style="font-size:11px;color:#94a3b8;">Received: ${new Date(mandate.confirmed_at).toLocaleDateString('en-AU')}</div>`:''}
  </div>`;
}
```

Add `mandateSection` to your contact modal HTML output.

---

## Phase 3: Add Mandate Status to Client List

### Step 3A: Show mandate status in client cards

In `renderClients()` function, add mandate badge to each client card:

```javascript
const mandate=getContactMandate(client.id);
const mandateBadge=mandate?getMandateStatusBadge(mandate.status):'';

// Add to card output:
html+=`<div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
  ${mandateBadge}
</div>`;
```

---

## Phase 4: Couples Intake Flow Integration

### Step 4A: Show mandate checklist in couples intake

In `renderCouplesIntakeSOP()` or client modal, add a pre-session checklist:

```javascript
const intake=getContactMandate(selectedContactId);
const intakeComplete=intake&&intake.status==='active';

let checklistHTML=`<div style="padding:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-top:12px;">
  <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:10px;">Pre-Session Checklist</div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
    <span style="font-size:16px;">${intakeComplete?'✓':'○'}</span>
    <span style="font-size:13px;color:#475569;">Intake form completed</span>
  </div>
  <div style="display:flex;align-items:center;gap:8px;">
    <span style="font-size:16px;">${intake?'✓':'○'}</span>
    <span style="font-size:13px;color:#475569;">Payment mandate received</span>
    ${intake&&intake.mandate_reference?`<span style="font-size:11px;color:#94a3b8;">(${intake.mandate_reference})</span>`:''}
  </div>
</div>`;
```

---

## Phase 5: Dashboard Widget

### Step 5A: Add mandate status to Home dashboard

In `renderDashboard()`, add a "Pending Mandates" card:

```javascript
const pendingMandates=(window.paymentMandates||[]).filter(m=>m.status!=='active');
const mandatesHTML=`<div style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid #d97706;border-radius:12px;padding:18px 20px;margin-bottom:14px;">
  <div style="font-weight:700;color:#1e3a5f;font-size:15px;margin-bottom:4px;">💳 Payment Mandates</div>
  <div style="font-size:14px;font-weight:700;color:#d97706;">${pendingMandates.length} pending</div>
  <div style="font-size:12px;color:#64748b;margin-top:6px;">${pendingMandates.length} client${pendingMandates.length!==1?'s':''} need to complete payment setup</div>
</div>`;
```

---

## Phase 6: Filter & Search

### Step 6A: Add filter by mandate status

In client list or master list, add filter buttons:

```javascript
let filterHTML=`<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
  <button onclick="window.filterByMandateStatus('all')" style="padding:6px 12px;border-radius:99px;border:1px solid #e2e8f0;font-size:12px;font-weight:600;cursor:pointer;background:#fff;color:#64748b;">All</button>
  <button onclick="window.filterByMandateStatus('active')" style="padding:6px 12px;border-radius:99px;border:1px solid #15803d;font-size:12px;font-weight:600;cursor:pointer;background:#f0fdf4;color:#15803d;">✓ Mandate Received</button>
  <button onclick="window.filterByMandateStatus('pending')" style="padding:6px 12px;border-radius:99px;border:1px solid #d97706;font-size:12px;font-weight:600;cursor:pointer;background:#fffbeb;color:#d97706;">⏳ Pending</button>
</div>`;

window.filterByMandateStatus=function(status){
  let filtered=[...clients];
  if(status==='active'){
    filtered=filtered.filter(c=>getContactMandate(c.id)?.status==='active');
  } else if(status==='pending'){
    filtered=filtered.filter(c=>{
      const m=getContactMandate(c.id);
      return m&&m.status!=='active';
    });
  }
  // Re-render list with filtered clients
};
```

---

## Phase 7: Automation (Optional)

### Step 7A: Auto-mark Couples workflow as "Payment complete"

When displaying couples intake progress, check mandate status:

```javascript
function getCoupleIntakeProgress(coupleId){
  const client=clients.find(c=>c.id===coupleId);
  if(!client) return null;
  
  const mandate=getContactMandate(coupleId);
  const intakeForm=intakeSubmissions.find(i=>i.contact_id===coupleId);
  
  return {
    intake: !!intakeForm,
    mandate: mandate?.status==='active',
    ready: !!intakeForm && mandate?.status==='active'
  };
}
```

---

## Implementation Order

**Recommended order to implement:**

1. ✅ **Phase 1** - Load mandate data (5 min)
   - Add `loadPaymentMandates()` to `loadAll()`
   - Add helper functions

2. ✅ **Phase 2** - Contact card display (10 min)
   - Show mandate badge in contact modal
   - Quick visual feedback that mandate is received

3. ✅ **Phase 3** - Client list badges (5 min)
   - Show status in client cards
   - Scan list for pending mandates

4. ✅ **Phase 4** - Couples workflow (10 min)
   - Add to intake flow
   - Visual checklist of requirements

5. ✅ **Phase 5** - Dashboard widget (5 min)
   - Quick overview of pending mandates
   - One-click link to follow up

6. ✅ **Phase 6** - Filtering (10 min)
   - Filter clients by mandate status
   - Find pending mandates quickly

7. 🔄 **Phase 7** - Automation (optional, 15 min)
   - Auto-mark workflow stages
   - Streamline intake process

---

## Testing Checklist

- [ ] Mandate data loads on app startup
- [ ] Mandate badge shows in contact card
- [ ] Mandate status displays correctly (active/pending/failed)
- [ ] Client list shows mandate badges
- [ ] Filter by mandate status works
- [ ] Dashboard widget shows correct count
- [ ] Couples intake checklist reflects mandate status
- [ ] Manual webhook test creates/updates mandate

---

## Files to Modify

- `index.html`
  - Add `loadPaymentMandates()` function
  - Add `getContactMandate()` and `getMandateStatusBadge()` helpers
  - Update `loadAll()` to call mandate load
  - Update `renderDashboard()` for widget
  - Update `renderClients()` for badges
  - Update contact modal for mandate section
  - Add mandate filter functions

---

## After Implementation

Once all phases are complete:

1. **Version bump** (v3.55.96 → v3.56.0 or v3.55.97+)
2. **Test end-to-end** with real GoCardless mandate
3. **Monitor webhooks** in Supabase logs for errors
4. **Add to Couples Process page** optional: show mandate requirement upfront
5. **Email clients** with mandate link automatically (if building that feature)

---

## Questions?

- How to link GoCardless customer ID to contact in form?
- Want to auto-email mandate link to couples?
- Need reports on mandate completion rate?
- Should mandate block scheduling of intake session?
