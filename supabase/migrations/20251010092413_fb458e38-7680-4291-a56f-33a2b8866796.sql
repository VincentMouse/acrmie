-- Add service_product column to appointments table
ALTER TABLE public.appointments 
ADD COLUMN service_product TEXT;