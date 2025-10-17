-- The user_roles table already supports multiple roles per user
-- through its unique constraint on (user_id, role)
-- But we need to ensure RLS policies allow proper management

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can delete roles" ON public.user_roles;

-- Recreate policies with better permissions
CREATE POLICY "Anyone can view roles" 
ON public.user_roles 
FOR SELECT 
USING (true);

CREATE POLICY "Admins and service role can insert roles" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR auth.jwt()->>'role' = 'service_role'
);

CREATE POLICY "Admins and service role can update roles" 
ON public.user_roles 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.jwt()->>'role' = 'service_role'
);

CREATE POLICY "Admins and service role can delete roles" 
ON public.user_roles 
FOR DELETE 
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.jwt()->>'role' = 'service_role'
);