# Molly — Teams Message Stages

Six message templates Molly uses when DMing Cath in Teams. Each one is short, in Cath's voice, and matches the working rhythm in `molly-system-prompt.md`.

Paste each block into the Stages tab of the Molly agent in **Ops > Agents** so they're versioned and editable in the CRM. Use `{{placeholders}}` for dynamic content.

---

## 1. Morning Briefing

**Trigger:** Daily, around 8:30 am AEST. Workdays only.
**Default sender:** Molly
**Platform:** Teams

```
Morning.

{{active_count}} active, {{waiting_count}} waiting on you, {{overdue_count}} overdue{{overdue_summary}}.

Top of mind today:
{{top_3_to_5_tasks}}

{{new_since_eod_yesterday}}

What's top of mind — any I should park, escalate, or knock over first?

— Molly
```

**Example filled in:**

```
Morning.

11 active, 3 waiting on you, 1 overdue (Smith invoice).

Top of mind today:
• NDIS progress report — Ellie K (due 2 pm)
• Lifestart code request from yesterday
• Follow-up call with Ryan and Sarah (couples — booked 11 am)

One new since yesterday: enquiry via the bot from a couples prospect, name Jodie.

What's top of mind — any I should park, escalate, or knock over first?

— Molly
```

---

## 2. Action Confirmation

**Trigger:** Before sending anything client-facing, money-related, or non-routine.
**Default sender:** Molly
**Platform:** Teams

```
Quick check before I send.

Task: {{task_title}}
Drafted: {{message_summary}}

Go ahead, or want to tweak?

— Molly
```

**Example filled in:**

```
Quick check before I send.

Task: Reply to Jodie's couples enquiry
Drafted: a warm short reply offering Tue or Thu for the connection call, with a link to the intake form.

Go ahead, or want to tweak?

— Molly
```

---

## 3. Status Update

**Trigger:** After completing a task or making progress worth flagging.
**Default sender:** Molly
**Platform:** Teams

```
Done: {{what_was_done}}.
Next: {{next_action_or_none}}.

— Molly
```

**Example filled in:**

```
Done: NDIS report drafted and saved to Ellie K's file. Invoice ready to send when you OK it.
Next: starting the Lifestart code request now.

— Molly
```

---

## 4. Blocked

**Trigger:** When a task can't move without a decision or external input.
**Default sender:** Molly
**Platform:** Teams

```
Stuck on: {{task_title}}.
Reason: {{specific_blocker}}.
Need: {{specific_question_or_thing}}.

— Molly
```

**Example filled in:**

```
Stuck on: Lifestart code request.
Reason: Their finance contact bounced — email returned undeliverable.
Need: a different email, or do you want me to ring them?

— Molly
```

---

## 5. Midday Check-In

**Trigger:** Around 1 pm AEST. Only if there's something to flag.
**Default sender:** Molly
**Platform:** Teams

```
Half-day update.

Done: {{count_done}} — {{short_list}}
Waiting on you: {{count_waiting}} — {{short_list}}

— Molly
```

**Example filled in:**

```
Half-day update.

Done: 4 — NDIS report, Lifestart code, two follow-up emails.
Waiting on you: 2 — Smith invoice resend (OK to send?), and the Jodie reply draft.

— Molly
```

---

## 6. End of Day Summary

**Trigger:** Around 5 pm AEST. Always sent on workdays.
**Default sender:** Molly
**Platform:** Teams

```
Day's wrap.

Done today ({{count_done}}):
{{tick_list}}

Waiting on you ({{count_waiting}}):
{{waiting_list}}

Rolled to tomorrow ({{count_rolled}}):
{{rolled_list_with_reason}}

Have a good evening.

— Molly
```

**Example filled in:**

```
Day's wrap.

Done today (7):
✓ NDIS report — Ellie K
✓ Lifestart code request — Carol B
✓ Reply to Jodie (couples enquiry)
✓ Smith invoice resent
✓ Two follow-up emails (Mark, Hannah)
✓ Work Log updated

Waiting on you (2):
• Approve the Ryan & Sarah session note draft
• Decide on the Tuesday slot for Jodie's call

Rolled to tomorrow (1):
• Couples intake notes filing — moved to Tue (you mentioned you'd review yourself)

Have a good evening.

— Molly
```

---

## Maintenance

- Edit these in **Ops > Agents > Molly > Stages**. The CRM versions every save.
- If a stage's tone drifts, check it against `cath-voice-tone-v1.md` first, then this file second.
- New stages (e.g. weekly review, end-of-week summary) get added here and to the Stages tab together.
