-- Add call duration tracking to leads table
ALTER TABLE public.leads 
ADD COLUMN call_duration_seconds INTEGER DEFAULT 0;

COMMENT ON COLUMN public.leads.call_duration_seconds IS 'Duration of the last call in seconds for reporting';

-- Create agent_status table to track current agent activity
CREATE TABLE public.agent_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('in_call', 'idle')),
  status_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on agent_status
ALTER TABLE public.agent_status ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view agent status
CREATE POLICY "All authenticated users can view agent status"
  ON public.agent_status FOR SELECT
  USING (true);

-- Users can update their own status
CREATE POLICY "Users can update their own status"
  ON public.agent_status FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_agent_status_user_id ON public.agent_status(user_id);
CREATE INDEX idx_leads_call_duration ON public.leads(call_duration_seconds);