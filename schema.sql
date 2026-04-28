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
CREATE POLICY "anon read gallup_code_requests" ON gallup_code_requests FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert gallup_code_requests" ON gallup_code_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update gallup_code_requests" ON gallup_code_requests FOR UPDATE TO anon USING (true);
CREATE POLICY "anon delete gallup_code_requests" ON gallup_code_requests FOR DELETE TO anon USING (true);

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
