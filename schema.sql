-- Coach4U CRM Schema
-- Paste this into Supabase SQL Editor and click Run

-- CONTACTS (master list)
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  contact_type TEXT DEFAULT 'Individual',
  strengths TEXT,
  sharepoint_link TEXT,
  is_prospect BOOLEAN DEFAULT false,
  prospect_stage TEXT DEFAULT 'Lead',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CLIENTS (relationships)
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  relationship_name TEXT NOT NULL,
  role TEXT,
  status TEXT DEFAULT 'Active',
  practitioner TEXT DEFAULT 'Cath',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CLIENT MEMBERS (junction: links contacts to clients)
CREATE TABLE client_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'Member',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TASKS
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  owner TEXT DEFAULT 'Cath',
  priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'To Do',
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ROW LEVEL SECURITY
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Policies: all authenticated users can do everything (tighten later)
CREATE POLICY "Authenticated read contacts" ON contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert contacts" ON contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update contacts" ON contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete contacts" ON contacts FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read clients" ON clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert clients" ON clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update clients" ON clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete clients" ON clients FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read client_members" ON client_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert client_members" ON client_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update client_members" ON client_members FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete client_members" ON client_members FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read tasks" ON tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert tasks" ON tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update tasks" ON tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete tasks" ON tasks FOR DELETE TO authenticated USING (true);

-- GALLUP CODE REQUESTS — workflow tracker for CliftonStrengths assessment requests
CREATE TABLE gallup_code_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  product_type TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'New',
  discount_code TEXT DEFAULT 'DH7HGTMAZ',
  code_value TEXT,
  payment_confirmed_at TIMESTAMPTZ,
  purchased_at TIMESTAMPTZ,
  code_sent_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  exported_at TIMESTAMPTZ,
  filed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE gallup_code_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read gallup_code_requests" ON gallup_code_requests FOR SELECT USING (true);
CREATE POLICY "insert gallup_code_requests" ON gallup_code_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "update gallup_code_requests" ON gallup_code_requests FOR UPDATE USING (true);
CREATE POLICY "delete gallup_code_requests" ON gallup_code_requests FOR DELETE USING (true);

-- PULSE TABLES — client-facing portals use the anon key, so INSERT must allow anon role.
-- pulse_results: SAFE Pulse check-in submissions
-- brain_pulse_submissions: ThriveHQ Brain Pulse check-in submissions
-- If clients get "new row violates row-level security policy" on submission, run these in Supabase SQL Editor:
--
-- CREATE POLICY "anon insert pulse_results" ON pulse_results FOR INSERT TO anon WITH CHECK (true);
-- CREATE POLICY "anon select pulse_results" ON pulse_results FOR SELECT TO anon USING (true);
--
-- CREATE POLICY "anon insert brain_pulse_submissions" ON brain_pulse_submissions FOR INSERT TO anon WITH CHECK (true);
-- CREATE POLICY "anon select brain_pulse_submissions" ON brain_pulse_submissions FOR SELECT TO anon USING (true);

-- ============================================================
-- POST-v3.62.6 ADDITIONS
-- Idempotent — safe to run against an existing DB (uses IF NOT EXISTS / DO $$ guards).
-- Run the entire block in Supabase SQL Editor.
-- ============================================================

-- Column additions to original tables
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS membership_start_date DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS renewal_date DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS strength_1 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS strength_2 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS strength_3 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS strength_4 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS strength_5 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS strength_6 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS strength_7 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS strength_8 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS strength_9 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS strength_10 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_opted_out BOOLEAN DEFAULT false;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS xero_link TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS file_notes_link TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referred_by TEXT;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS requester TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS work_category TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS focus_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS section TEXT;

-- PROSPECTS
CREATE TABLE IF NOT EXISTS prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  status TEXT DEFAULT 'Lead',
  source TEXT,
  interest TEXT,
  follow_up_date DATE,
  notes TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full prospects" ON prospects FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PROSPECT NOTES
CREATE TABLE IF NOT EXISTS prospect_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  note TEXT,
  note_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE prospect_notes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full prospect_notes" ON prospect_notes FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PULSE RESULTS (SAFE Pulse)
CREATE TABLE IF NOT EXISTS pulse_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  answers JSONB,
  self_awareness_score NUMERIC,
  aim_score NUMERIC,
  foundation_score NUMERIC,
  emotion_score NUMERIC,
  total_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE pulse_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "anon insert pulse_results" ON pulse_results FOR INSERT TO anon WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon select pulse_results" ON pulse_results FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth full pulse_results" ON pulse_results FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- BRAIN PULSE SUBMISSIONS
CREATE TABLE IF NOT EXISTS brain_pulse_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  stage TEXT,
  grand_total NUMERIC,
  capacity_total NUMERIC,
  wellbeing_total NUMERIC,
  strengths_total NUMERIC,
  ef_total NUMERIC,
  answers JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE brain_pulse_submissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "anon insert brain_pulse_submissions" ON brain_pulse_submissions FOR INSERT TO anon WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon select brain_pulse_submissions" ON brain_pulse_submissions FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth full brain_pulse_submissions" ON brain_pulse_submissions FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CONNECTION PULSE SUBMISSIONS
CREATE TABLE IF NOT EXISTS connection_pulse_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  answers JSONB,
  total_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE connection_pulse_submissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "anon insert connection_pulse" ON connection_pulse_submissions FOR INSERT TO anon WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon select connection_pulse" ON connection_pulse_submissions FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- INTAKE SUBMISSIONS
CREATE TABLE IF NOT EXISTS intake_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'New',
  first_name TEXT, last_name TEXT, preferred_name TEXT,
  email TEXT, phone TEXT,
  address_line_1 TEXT, address_line_2 TEXT, suburb TEXT, state TEXT, postcode TEXT,
  emergency_contact_name TEXT, emergency_contact_phone TEXT,
  secondary_first_name TEXT, secondary_last_name TEXT, secondary_preferred_name TEXT,
  secondary_email TEXT, secondary_phone TEXT,
  secondary_address_line_1 TEXT, secondary_address_line_2 TEXT,
  secondary_suburb TEXT, secondary_state TEXT, secondary_postcode TEXT,
  secondary_emergency_contact_name TEXT, secondary_emergency_contact_phone TEXT,
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE intake_submissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "anon insert intake_submissions" ON intake_submissions FOR INSERT TO anon WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth full intake_submissions" ON intake_submissions FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- THRIVEHQ TRIALS
CREATE TABLE IF NOT EXISTS thrivehq_trials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  name TEXT, email TEXT, phone TEXT,
  trial_start DATE, trial_end DATE,
  status TEXT DEFAULT 'Active',
  source TEXT, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE thrivehq_trials ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full thrivehq_trials" ON thrivehq_trials FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- MEMBERSHIP RENEWALS
CREATE TABLE IF NOT EXISTS membership_renewals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  period_start DATE, period_end DATE,
  amount NUMERIC,
  renewed_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE membership_renewals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full membership_renewals" ON membership_renewals FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TASK LOGS
CREATE TABLE IF NOT EXISTS task_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  log_type TEXT,
  message TEXT,
  posted_by TEXT,
  response_required BOOLEAN DEFAULT false,
  sent_to_teams BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE task_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full task_logs" ON task_logs FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- REFERRERS
CREATE TABLE IF NOT EXISTS referrers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  meeting_link TEXT,
  status TEXT DEFAULT 'Active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE referrers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full referrers" ON referrers FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- REFERRER MEMBERS
CREATE TABLE IF NOT EXISTS referrer_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES referrers(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE referrer_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full referrer_members" ON referrer_members FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- REFERRER PAYMENTS
CREATE TABLE IF NOT EXISTS referrer_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES referrers(id) ON DELETE CASCADE,
  amount NUMERIC,
  payment_date DATE,
  period TEXT,
  status TEXT DEFAULT 'Pending',
  notes TEXT,
  statement_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE referrer_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full referrer_payments" ON referrer_payments FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FINANCE TRANSACTIONS
CREATE TABLE IF NOT EXISTS finance_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_date DATE,
  description TEXT,
  amount NUMERIC,
  category TEXT,
  type TEXT,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full finance_transactions" ON finance_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- BILLS
CREATE TABLE IF NOT EXISTS bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  amount NUMERIC,
  due_date DATE,
  frequency TEXT,
  category TEXT,
  status TEXT DEFAULT 'Active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full bills" ON bills FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CONTACT REPORTS (file attachments)
CREATE TABLE IF NOT EXISTS contact_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  report_type TEXT,
  filename TEXT,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE contact_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full contact_reports" ON contact_reports FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AGENTS
CREATE TABLE IF NOT EXISTS agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  type TEXT DEFAULT 'standalone',
  platform TEXT,
  description TEXT, purpose TEXT,
  used_by TEXT, used_for TEXT, not_used_for TEXT,
  trigger_type TEXT, model TEXT,
  parent_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  owner TEXT, copilot_url TEXT,
  source_of_truth_url TEXT, knowledge_urls TEXT,
  system_prompt TEXT, stages_content TEXT,
  health TEXT, notes TEXT,
  review_frequency_days INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full agents" ON agents FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AGENT VERSIONS
CREATE TABLE IF NOT EXISTS agent_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  version_number INTEGER,
  changed_by TEXT,
  change_note TEXT,
  name TEXT, status TEXT, type TEXT, platform TEXT,
  description TEXT, purpose TEXT, used_by TEXT, used_for TEXT, not_used_for TEXT,
  trigger_type TEXT, model TEXT, owner TEXT,
  source_of_truth_url TEXT, knowledge_urls TEXT,
  system_prompt TEXT, stages_content TEXT,
  health TEXT, notes_snapshot TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE agent_versions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full agent_versions" ON agent_versions FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AGENT ISSUES
CREATE TABLE IF NOT EXISTS agent_issues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT, description TEXT,
  fix_applied TEXT,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE agent_issues ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full agent_issues" ON agent_issues FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AGENT STAGES
CREATE TABLE IF NOT EXISTS agent_stages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT, trigger_phrase TEXT, purpose TEXT,
  default_sender TEXT, stage_order INTEGER,
  platform_rule TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE agent_stages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full agent_stages" ON agent_stages FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AGENT TEMPLATES (messages within stages)
CREATE TABLE IF NOT EXISTS agent_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id UUID REFERENCES agent_stages(id) ON DELETE CASCADE,
  persona TEXT, platform TEXT,
  subject TEXT, body TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE agent_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full agent_templates" ON agent_templates FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AGENT AI SESSIONS
CREATE TABLE IF NOT EXISTS agent_ai_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  action TEXT, input TEXT, output TEXT,
  model TEXT, tokens_in INTEGER, tokens_out INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE agent_ai_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full agent_ai_sessions" ON agent_ai_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- COUPLES INTAKE SESSIONS
CREATE TABLE IF NOT EXISTS couples_intake_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id TEXT UNIQUE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  p1_name TEXT, p2_name TEXT,
  session_date DATE,
  step_notes JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE couples_intake_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full couples_intake_sessions" ON couples_intake_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- STRENGTHS INSIGHTS (AI readings)
CREATE TABLE IF NOT EXISTS strengths_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  insight_type TEXT,
  content TEXT,
  strengths_snapshot JSONB,
  model TEXT, tokens_in INTEGER, tokens_out INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE strengths_insights ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full strengths_insights" ON strengths_insights FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PAYMENT PLATFORMS
CREATE TABLE IF NOT EXISTS payment_platforms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  type TEXT,
  status TEXT DEFAULT 'Active',
  notes TEXT,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE payment_platforms ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full payment_platforms" ON payment_platforms FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- APP SETTINGS (key-value store)
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full app_settings" ON app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SMS MESSAGES (unified SMS + WhatsApp channel)
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','whatsapp','email')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  subject TEXT,
  to_email TEXT,
  from_email TEXT,
  twilio_sid TEXT,
  status TEXT DEFAULT 'sent'
);
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS to_email TEXT;
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS from_email TEXT;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full sms_messages" ON sms_messages FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon insert sms_messages" ON sms_messages FOR INSERT TO anon WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- COMMS LISTS (group messaging)
CREATE TABLE IF NOT EXISTS comms_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  filter_type TEXT NOT NULL DEFAULT 'manual' CHECK (filter_type IN ('thrivehq','manual'))
);
ALTER TABLE comms_lists ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full comms_lists" ON comms_lists FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- COMMS LIST MEMBERS
CREATE TABLE IF NOT EXISTS comms_list_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID REFERENCES comms_lists(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  UNIQUE(list_id, contact_id)
);
ALTER TABLE comms_list_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full comms_list_members" ON comms_list_members FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- GROUP MESSAGE TEMPLATES
CREATE TABLE IF NOT EXISTS group_message_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE group_message_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full group_message_templates" ON group_message_templates FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PROMPTS (IT > Prompts — saved Claude/AI prompts)
CREATE TABLE IF NOT EXISTS prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full prompts" ON prompts FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PLAYBOOK LOG (Admin > Playbook)
CREATE TABLE IF NOT EXISTS playbook_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  log_date DATE NOT NULL,
  entries JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE playbook_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full playbook_log" ON playbook_log FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PAYMENT MANDATES (GoCardless — frontend ready, backend pending)
CREATE TABLE IF NOT EXISTS payment_mandates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  mandate_id TEXT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE payment_mandates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "auth full payment_mandates" ON payment_mandates FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
