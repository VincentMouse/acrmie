-- Add processing columns to appointments table
ALTER TABLE public.appointments
ADD COLUMN processing_by uuid REFERENCES auth.users(id),
ADD COLUMN processing_at timestamp with time zone;

-- Add index for better performance
CREATE INDEX idx_appointments_processing_by ON public.appointments(processing_by);

COMMENT ON COLUMN public.appointments.processing_by IS 'User currently processing this appointment';
COMMENT ON COLUMN public.appointments.processing_at IS 'When the appointment processing started';