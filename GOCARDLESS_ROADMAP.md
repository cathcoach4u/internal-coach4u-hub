# GoCardless Mandate Integration - Complete Roadmap

## 🎯 Overview

Automate payment mandate tracking in your CRM so you know exactly when clients have completed the payment setup required for their intake session.

**Status**: Clients complete mandate form → Webhook sent → CRM auto-updated → You see status immediately

---

## 📚 Documentation Files

### 1. **GOCARDLESS_SETUP.md** (Backend Setup)
**What**: Complete backend configuration
- Create Supabase database table
- Deploy Edge Function for webhooks
- Configure GoCardless webhook endpoint
- Get API credentials

**When**: Complete FIRST (before any CRM work)
**Time**: ~30 minutes to deploy
**Checklist**:
- [ ] Create `payment_mandates` table
- [ ] Deploy `gocardless-webhook` Edge Function
- [ ] Add environment variables to Supabase
- [ ] Configure webhook in GoCardless dashboard
- [ ] Test with sample mandate

---

### 2. **GOCARDLESS_CRM_NEXT_STEPS.md** (Frontend UI)
**What**: CRM displays for mandate status
- Load mandate data on app startup
- Show status badges in contact cards
- Display in client list
- Add to couples intake workflow
- Dashboard widget for overview
- Filter clients by mandate status

**When**: After GOCARDLESS_SETUP.md is working
**Time**: ~1 hour to implement all 7 phases
**Implementation Phases**:
1. Load data (5 min)
2. Contact card badge (10 min)
3. Client list badges (5 min)
4. Couples workflow (10 min)
5. Dashboard widget (5 min)
6. Filtering (10 min)
7. Automation (15 min, optional)

---

## 🚀 Quick Start Path

### Week 1: Backend Setup
```
Day 1: Copy GOCARDLESS_SETUP.md instructions
  └─ Run SQL in Supabase
  └─ Create Edge Function
  └─ Add environment variables

Day 2: Configure GoCardless
  └─ Login to GoCardless dashboard
  └─ Create webhook
  └─ Add webhook URL
  └─ Copy webhook secret

Day 3: Test webhook
  └─ Fill out mandate form
  └─ Check payment_mandates table
  └─ Verify contact was updated
```

### Week 2: CRM UI Implementation
```
Day 1: Phase 1 (Load data)
  └─ Add loadPaymentMandates() function
  └─ Test data appears in browser console

Day 2: Phase 2-3 (Display)
  └─ Add mandate badge to contact card
  └─ Add mandate badge to client list
  └─ Visual verification in app

Day 3: Phase 4-6 (Integration)
  └─ Add to couples intake checklist
  └─ Add dashboard widget
  └─ Add filter by status

Bonus: Phase 7 (Automation)
  └─ Auto-mark workflow stages
```

---

## 🔄 Complete Workflow Example

**Client journey:**
1. Client receives link: `https://pay.gocardless.com/...`
2. Fills out mandate form with email `jane@example.com`
3. Confirms mandate in email
4. GoCardless sends webhook to your Edge Function
5. Edge Function:
   - Verifies webhook signature
   - Fetches mandate details from GoCardless
   - Finds contact by email (jane@example.com)
   - Stores mandate in `payment_mandates` table
   - Updates contact's `mandate_status`, `mandate_reference`, `mandate_received_at`
6. You see in CRM:
   - ✓ Green badge "Mandate received" on contact
   - ✓ Dashboard shows 0 pending mandates
   - ✓ Couples intake checklist shows both items complete

---

## 📊 What Gets Created

### Database
- **payment_mandates** table with:
  - Mandate ID, reference, status
  - Linked contact_id
  - Created/confirmed dates
  - GoCardless metadata

### Supabase Functions
- **gocardless-webhook**: Receives and validates webhooks

### CRM Updates
- Mandate status badges (green/yellow/red)
- Contact card mandate section
- Client list filtering by mandate status
- Dashboard widget for pending mandates
- Couples intake pre-session checklist

---

## 🔐 Security Features

- ✓ Webhook signature verification (HMAC-SHA256)
- ✓ Environment variables for secrets (not in code)
- ✓ Contact email matching for privacy
- ✓ Supabase RLS policies (optional)
- ✓ Only mandate.* events processed

---

## 🎯 Success Criteria

After implementation, you should be able to:

- [ ] See "✓ Mandate received" badge on client cards
- [ ] Filter clients by "Mandate received" / "Pending"
- [ ] View mandate reference number on contact
- [ ] See confirmation date in contact details
- [ ] Dashboard shows count of pending mandates
- [ ] Couples intake shows mandate in pre-session checklist
- [ ] Receive webhook in logs when client completes form
- [ ] No manual data entry needed (fully automated)

---

## 🛠️ Tech Stack

| Component | Technology | Location |
|-----------|-----------|----------|
| Webhooks | Supabase Edge Functions | `gocardless-webhook` |
| Database | PostgreSQL (Supabase) | `payment_mandates` table |
| API | GoCardless v2 REST API | `api.gocardless.com` |
| Webhook Verification | HMAC-SHA256 | Edge Function |
| CRM | Vanilla JS | `index.html` |

---

## 📋 File Locations

### Documentation
- `GOCARDLESS_SETUP.md` - Backend setup guide
- `GOCARDLESS_CRM_NEXT_STEPS.md` - Frontend implementation
- `GOCARDLESS_ROADMAP.md` - This file

### Implementation Files
- `index.html` - CRM UI updates (loadPaymentMandates, helpers, render functions)
- Supabase Edge Function - `gocardless-webhook` function
- Supabase Database - `payment_mandates` table + `contacts` fields

---

## ⚠️ Troubleshooting

### Webhook not firing?
- Check GoCardless webhook logs
- Verify webhook URL is correct
- Check Supabase function logs
- Test signature verification

### Contact not matched?
- Email addresses don't match exactly
- Case-sensitive comparison
- Whitespace differences
- Use debug logging to verify

### Status not updating?
- Check function runs successfully
- Verify contact_id is set
- Check RLS policies on payment_mandates
- Look at Supabase function logs

### Environment variables not working?
- Redeploy function after adding secrets
- Check variable names exactly
- Verify in Supabase project settings

---

## 📞 Integration Points

This integration connects:
- GoCardless → Your Supabase backend
- Supabase → Your CRM (index.html)
- Contacts table → Mandates table
- Couples intake flow → Mandate checklist

---

## 🔮 Future Enhancements (Optional)

Once basic integration works, consider:

1. **Auto-send mandate links**
   - When intake form completed, auto-email mandate link
   - Track email send status

2. **Schedule blocking**
   - Don't allow booking intake until mandate received
   - Gray out "Book Session" button

3. **Reporting**
   - Mandate completion rate
   - Time to complete mandate after intake form
   - Dropoff analysis

4. **Reminders**
   - Auto-email reminder if mandate pending after 3 days
   - SMS reminder option

5. **Integration with other systems**
   - Send mandate status to ThriveHQ portal
   - Link to invoicing system
   - Sync to email CRM

---

## 📞 Support

For questions about:

- **GoCardless API**: See [GoCardless Docs](https://developer.gocardless.com/)
- **Supabase**: See [Supabase Docs](https://supabase.com/docs)
- **Webhook signatures**: See GOCARDLESS_SETUP.md troubleshooting section
- **CRM implementation**: See GOCARDLESS_CRM_NEXT_STEPS.md code snippets

---

## ✅ Rollout Checklist

- [ ] Read GOCARDLESS_SETUP.md completely
- [ ] Create Supabase table (SQL)
- [ ] Deploy Edge Function
- [ ] Add environment variables
- [ ] Test webhook with sample mandate
- [ ] Verify data in payment_mandates table
- [ ] Verify contact fields updated
- [ ] Read GOCARDLESS_CRM_NEXT_STEPS.md
- [ ] Implement Phase 1 (load data)
- [ ] Implement Phase 2 (contact card)
- [ ] Implement Phase 3 (client list)
- [ ] Implement Phase 4 (couples workflow)
- [ ] Implement Phase 5 (dashboard)
- [ ] Implement Phase 6 (filtering)
- [ ] Test end-to-end with real mandate
- [ ] Version bump & commit
- [ ] Deploy to production

---

**Last Updated**: 2026-05-15
**Version**: 1.0
**Status**: Ready to implement
