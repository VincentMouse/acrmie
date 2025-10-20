-- Add nickname column to profiles table
ALTER TABLE public.profiles ADD COLUMN nickname TEXT;

-- Create function to generate nickname from full name
CREATE OR REPLACE FUNCTION public.generate_nickname(full_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  name_parts TEXT[];
  first_name TEXT;
  last_initial TEXT;
BEGIN
  -- Split the full name by spaces
  name_parts := string_to_array(trim(full_name), ' ');
  
  -- Get first name
  first_name := name_parts[1];
  
  -- Get first letter of last name (last element in array)
  IF array_length(name_parts, 1) > 1 THEN
    last_initial := substring(name_parts[array_length(name_parts, 1)] from 1 for 1);
    RETURN first_name || last_initial;
  ELSE
    -- If only one name, just return it
    RETURN first_name;
  END IF;
END;
$$;

-- Create trigger function to auto-generate nickname
CREATE OR REPLACE FUNCTION public.set_nickname()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.nickname := generate_nickname(NEW.full_name);
  RETURN NEW;
END;
$$;

-- Create trigger to set nickname on insert or update
CREATE TRIGGER set_profile_nickname
BEFORE INSERT OR UPDATE OF full_name ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_nickname();

-- Update existing profiles to have nicknames
UPDATE public.profiles SET nickname = generate_nickname(full_name) WHERE nickname IS NULL;