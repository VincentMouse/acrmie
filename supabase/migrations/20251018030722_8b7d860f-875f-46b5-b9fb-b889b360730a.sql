-- Add timestamp columns for better lead tracking

-- Add processed_at to leads table to track when telesales finishes processing
ALTER TABLE public.leads 
ADD COLUMN processed_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.leads.processed_at IS 'Timestamp when telesales finished processing the lead after Get Lead';

-- Add confirmed_at to appointments table to track when CS confirms booking
ALTER TABLE public.appointments 
ADD COLUMN confirmed_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.appointments.confirmed_at IS 'Timestamp when CS confirmed the L6 appointment booking';