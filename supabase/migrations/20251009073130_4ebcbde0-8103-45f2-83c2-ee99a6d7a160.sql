-- Add assigned_at timestamp to track when lead was assigned
ALTER TABLE public.leads
ADD COLUMN assigned_at timestamp with time zone;

-- Create index for efficient querying of expired assignments
CREATE INDEX idx_leads_assigned_at ON public.leads(assigned_at) WHERE assigned_at IS NOT NULL;