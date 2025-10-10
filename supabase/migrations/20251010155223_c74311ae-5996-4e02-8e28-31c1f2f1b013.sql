-- Add check-in status and related fields to appointments table
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS check_in_status TEXT,
ADD COLUMN IF NOT EXISTS revenue NUMERIC,
ADD COLUMN IF NOT EXISTS note_from_clinic TEXT,
ADD COLUMN IF NOT EXISTS check_in_updated_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster queries on check_in_status
CREATE INDEX IF NOT EXISTS idx_appointments_check_in_status ON public.appointments(check_in_status);

-- Create index for appointments needing auto-cancellation (no_show status)
CREATE INDEX IF NOT EXISTS idx_appointments_no_show ON public.appointments(check_in_status, check_in_updated_at) 
WHERE check_in_status = 'no_show';