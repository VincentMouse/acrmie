-- Add is_active column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;

-- Create index for faster queries on active users
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- Update RLS policy to allow admins to update is_active status
CREATE POLICY "Admins can update any profile status"
ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));