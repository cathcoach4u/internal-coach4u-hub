-- Opt-out flags on contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sms_opted_out       BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_opted_out  BOOLEAN DEFAULT FALSE;

-- Unified messages table (SMS + WhatsApp)
CREATE TABLE IF NOT EXISTS sms_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contact_id   UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  client_id    UUID        REFERENCES clients(id)  ON DELETE SET NULL,
  channel      TEXT        NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','whatsapp')),
  direction    TEXT        NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_number  TEXT        NOT NULL,
  to_number    TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  twilio_sid   TEXT,
  status       TEXT        DEFAULT 'sent'
);

-- If the table already exists (from a previous migration), add the channel column
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'sms'
  CHECK (channel IN ('sms','whatsapp'));

CREATE INDEX IF NOT EXISTS sms_messages_contact_id_idx ON sms_messages(contact_id);
CREATE INDEX IF NOT EXISTS sms_messages_created_at_idx ON sms_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS sms_messages_channel_idx    ON sms_messages(channel);

-- RLS
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can read sms_messages"
    ON sms_messages FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can insert sms_messages"
    ON sms_messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
