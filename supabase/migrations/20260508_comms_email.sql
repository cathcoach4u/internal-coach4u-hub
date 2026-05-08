-- Add email channel and subject field to messages table
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS subject TEXT;

-- Extend channel check to include email
ALTER TABLE sms_messages DROP CONSTRAINT IF EXISTS sms_messages_channel_check;
ALTER TABLE sms_messages ADD CONSTRAINT sms_messages_channel_check
  CHECK (channel IN ('sms','whatsapp','email'));

-- Add to_email / from_email for email threading
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS to_email   TEXT;
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS from_email TEXT;
