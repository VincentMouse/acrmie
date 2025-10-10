-- Drop existing update policy for appointments
DROP POLICY IF EXISTS "Users can update their appointments" ON public.appointments;

-- Create new update policy that explicitly allows admins to change assigned_to
CREATE POLICY "Users and admins can update appointments"
ON public.appointments
FOR UPDATE
USING (
  (assigned_to = auth.uid()) 
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'tele_sales'::app_role)
  OR has_role(auth.uid(), 'customer_service'::app_role)
)
WITH CHECK (
  (assigned_to = auth.uid()) 
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'tele_sales'::app_role)
  OR has_role(auth.uid(), 'customer_service'::app_role)
);