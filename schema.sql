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
