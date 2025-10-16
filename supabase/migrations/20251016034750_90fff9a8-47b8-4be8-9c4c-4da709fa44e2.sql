-- Drop existing default values that reference the enum
ALTER TABLE public.leads ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.lead_history ALTER COLUMN new_status DROP DEFAULT;

-- Rename old enum
ALTER TYPE lead_status RENAME TO lead_status_old;

-- Create new enum with descriptive L0-L6 statuses
CREATE TYPE lead_status AS ENUM (
  'L0-Fresh Lead',
  'L1-Call back',
  'L2-Call reschedule',
  'L3-Cancelled',
  'L4-Blacklisted',
  'L5-Thinking',
  'L6-Appointment set',
  'booked',
  'checked_in',
  'completed',
  'no_show',
  'cancelled',
  'hibernation'
);

-- Update leads table status column
ALTER TABLE public.leads 
  ALTER COLUMN status TYPE lead_status 
  USING (
    CASE status::text
      WHEN 'status_0' THEN 'L0-Fresh Lead'::lead_status
      WHEN 'status_1' THEN 'L1-Call back'::lead_status
      WHEN 'status_2' THEN 'L2-Call reschedule'::lead_status
      WHEN 'status_3' THEN 'L3-Cancelled'::lead_status
      WHEN 'status_4' THEN 'L4-Blacklisted'::lead_status
      WHEN 'status_5' THEN 'L5-Thinking'::lead_status
      WHEN 'status_6' THEN 'L6-Appointment set'::lead_status
      WHEN 'booked' THEN 'booked'::lead_status
      WHEN 'checked_in' THEN 'checked_in'::lead_status
      WHEN 'completed' THEN 'completed'::lead_status
      WHEN 'no_show' THEN 'no_show'::lead_status
      WHEN 'cancelled' THEN 'cancelled'::lead_status
      WHEN 'hibernation' THEN 'hibernation'::lead_status
      ELSE 'L0-Fresh Lead'::lead_status
    END
  );

-- Update lead_history table old_status column (nullable)
ALTER TABLE public.lead_history 
  ALTER COLUMN old_status TYPE lead_status 
  USING (
    CASE 
      WHEN old_status IS NULL THEN NULL
      ELSE
        CASE old_status::text
          WHEN 'status_0' THEN 'L0-Fresh Lead'::lead_status
          WHEN 'status_1' THEN 'L1-Call back'::lead_status
          WHEN 'status_2' THEN 'L2-Call reschedule'::lead_status
          WHEN 'status_3' THEN 'L3-Cancelled'::lead_status
          WHEN 'status_4' THEN 'L4-Blacklisted'::lead_status
          WHEN 'status_5' THEN 'L5-Thinking'::lead_status
          WHEN 'status_6' THEN 'L6-Appointment set'::lead_status
          WHEN 'booked' THEN 'booked'::lead_status
          WHEN 'checked_in' THEN 'checked_in'::lead_status
          WHEN 'completed' THEN 'completed'::lead_status
          WHEN 'no_show' THEN 'no_show'::lead_status
          WHEN 'cancelled' THEN 'cancelled'::lead_status
          WHEN 'hibernation' THEN 'hibernation'::lead_status
          ELSE 'L0-Fresh Lead'::lead_status
        END
    END
  );

-- Update lead_history table new_status column (not nullable)
ALTER TABLE public.lead_history 
  ALTER COLUMN new_status TYPE lead_status 
  USING (
    CASE new_status::text
      WHEN 'status_0' THEN 'L0-Fresh Lead'::lead_status
      WHEN 'status_1' THEN 'L1-Call back'::lead_status
      WHEN 'status_2' THEN 'L2-Call reschedule'::lead_status
      WHEN 'status_3' THEN 'L3-Cancelled'::lead_status
      WHEN 'status_4' THEN 'L4-Blacklisted'::lead_status
      WHEN 'status_5' THEN 'L5-Thinking'::lead_status
      WHEN 'status_6' THEN 'L6-Appointment set'::lead_status
      WHEN 'booked' THEN 'booked'::lead_status
      WHEN 'checked_in' THEN 'checked_in'::lead_status
      WHEN 'completed' THEN 'completed'::lead_status
      WHEN 'no_show' THEN 'no_show'::lead_status
      WHEN 'cancelled' THEN 'cancelled'::lead_status
      WHEN 'hibernation' THEN 'hibernation'::lead_status
      ELSE 'L0-Fresh Lead'::lead_status
    END
  );

-- Drop old enum
DROP TYPE lead_status_old;

-- Set new default values
ALTER TABLE public.leads ALTER COLUMN status SET DEFAULT 'L0-Fresh Lead'::lead_status;
ALTER TABLE public.lead_history ALTER COLUMN new_status SET DEFAULT 'L0-Fresh Lead'::lead_status;