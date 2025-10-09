-- Add new fields to leads table for cold lead ingestion
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS service_product text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS campaign_name text,
ADD COLUMN IF NOT EXISTS marketer_name text;

-- Add comment to explain the fields
COMMENT ON COLUMN public.leads.address IS 'Customer address - optional field for cold leads';
COMMENT ON COLUMN public.leads.service_product IS 'Service or product the lead is interested in';
COMMENT ON COLUMN public.leads.campaign_name IS 'Marketing campaign name for tracking';
COMMENT ON COLUMN public.leads.marketer_name IS 'Name of the marketer who generated this lead';