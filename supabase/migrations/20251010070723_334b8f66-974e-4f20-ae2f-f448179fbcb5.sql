-- First, recreate the policy with WITH CHECK clause to ensure admins can change assigned_to
DROP POLICY IF EXISTS "Users can update their appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users and admins can update appointments" ON public.appointments;

-- Create comprehensive update policy with both USING and WITH CHECK
CREATE POLICY "Users can update their appointments"
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
  -- Admins and sales managers can reassign appointments to anyone
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  -- Other users can only update their own appointments
  OR assigned_to = auth.uid()
);