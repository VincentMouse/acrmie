-- Add booking_id column to appointments table for clinic registration
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS booking_id TEXT;

-- Add comment to explain the field
COMMENT ON COLUMN public.appointments.booking_id IS 'Booking ID from clinic system when appointment is registered';