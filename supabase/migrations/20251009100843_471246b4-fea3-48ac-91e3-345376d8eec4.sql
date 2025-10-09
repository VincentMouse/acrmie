-- Add hibernation status to the lead_status enum
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'hibernation';