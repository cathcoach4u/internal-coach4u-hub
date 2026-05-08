-- Group messaging lists for Comms hub
CREATE TABLE IF NOT EXISTS comms_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT NOT NULL,
  filter_type TEXT NOT NULL DEFAULT 'manual' CHECK (filter_type IN ('thrivehq','manual'))
);

CREATE TABLE IF NOT EXISTS comms_list_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID REFERENCES comms_lists(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  UNIQUE(list_id, contact_id)
);

ALTER TABLE comms_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users full access comms_lists"
  ON comms_lists FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users full access comms_list_members"
  ON comms_list_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
