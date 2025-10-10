-- Add confirmation_status and reminder_status columns to appointments table
ALTER TABLE public.appointments 
ADD COLUMN confirmation_status text NOT NULL DEFAULT 'pending',
ADD COLUMN reminder_status text NOT NULL DEFAULT 'not_sent';