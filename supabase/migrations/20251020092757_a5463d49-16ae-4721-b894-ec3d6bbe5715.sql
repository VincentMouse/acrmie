-- Update the SELECT policy for appointments to restrict tele_sales to their own appointments
DROP POLICY IF EXISTS "Users can view their appointments" ON public.appointments;

CREATE POLICY "Users can view their appointments" 
ON public.appointments
FOR SELECT
USING (
  -- Admins can see all appointments
  has_role(auth.uid(), 'admin'::app_role) 
  -- Sales managers can see all appointments
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  -- Tele sales can only see appointments assigned to them
  OR (has_role(auth.uid(), 'tele_sales'::app_role) AND assigned_to = auth.uid())
  -- Online sales can see appointments assigned to them
  OR (has_role(auth.uid(), 'online_sales'::app_role) AND assigned_to = auth.uid())
);