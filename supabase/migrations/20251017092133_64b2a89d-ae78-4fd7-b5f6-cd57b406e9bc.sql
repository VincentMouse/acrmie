-- Create a secure function for updating user roles
-- This function uses SECURITY DEFINER to bypass RLS during the operation
CREATE OR REPLACE FUNCTION public.update_user_roles(
  _user_id uuid,
  _roles app_role[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can call this function
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can update user roles';
  END IF;

  -- Delete existing roles for the user
  DELETE FROM public.user_roles
  WHERE user_id = _user_id;

  -- Insert new roles
  IF array_length(_roles, 1) > 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT _user_id, unnest(_roles);
  END IF;
END;
$$;