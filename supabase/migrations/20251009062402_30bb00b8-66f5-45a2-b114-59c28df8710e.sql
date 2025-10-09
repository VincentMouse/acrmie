-- Add cooldown_until column to leads table
ALTER TABLE public.leads
ADD COLUMN cooldown_until timestamp with time zone;

-- Add index for better query performance on cooldown checks
CREATE INDEX idx_leads_cooldown ON public.leads(cooldown_until) WHERE cooldown_until IS NOT NULL;