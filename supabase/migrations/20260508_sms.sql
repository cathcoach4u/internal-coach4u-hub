-- SMS opt-out flag on contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN DEFAULT FALSE;

-- SMS messages table
CREATE TABLE IF NOT EXISTS sms_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contact_id   UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  client_id    UUID        REFERENCES clients(id)  ON DELETE SET NULL,
  direction    TEXT        NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_number  TEXT        NOT NULL,
  to_number    TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  twilio_sid   TEXT,
  status       TEXT        DEFAULT 'sent'
);

CREATE INDEX IF NOT EXISTS sms_messages_contact_id_idx ON sms_messages(contact_id);
CREATE INDEX IF NOT EXISTS sms_messages_created_at_idx ON sms_messages(created_at DESC);

-- RLS
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read sms_messages"
  ON sms_messages FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert sms_messages"
  ON sms_messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');
