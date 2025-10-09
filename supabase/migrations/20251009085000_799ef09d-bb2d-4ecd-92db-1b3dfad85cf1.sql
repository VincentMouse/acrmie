-- Add columns to track L1 custom cooldown logic
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS l1_contact_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS l1_last_contact_period INTEGER,
ADD COLUMN IF NOT EXISTS l1_last_contact_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS l1_period_1_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS l1_period_2_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS l1_period_3_count INTEGER DEFAULT 0;

COMMENT ON COLUMN public.leads.l1_contact_count IS 'Total number of L1 contact attempts (max 6)';
COMMENT ON COLUMN public.leads.l1_last_contact_period IS 'Last contact time period (1, 2, or 3)';
COMMENT ON COLUMN public.leads.l1_last_contact_time IS 'Timestamp of last L1 contact';
COMMENT ON COLUMN public.leads.l1_period_1_count IS 'Number of contacts in period 1 (9:30am-12pm)';
COMMENT ON COLUMN public.leads.l1_period_2_count IS 'Number of contacts in period 2 (12:01pm-5pm)';
COMMENT ON COLUMN public.leads.l1_period_3_count IS 'Number of contacts in period 3 (5:01pm-6:30pm)';