-- Add password_changed field to profiles table to track first login
ALTER TABLE public.profiles
ADD COLUMN password_changed BOOLEAN DEFAULT FALSE;

-- Update existing users to have password_changed = true (they're already in the system)
UPDATE public.profiles
SET password_changed = TRUE;