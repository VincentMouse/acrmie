-- Update the insert policy for appointments table to include online_sales role
DROP POLICY IF EXISTS "Authorized users can create appointments" ON public.appointments;

CREATE POLICY "Authorized users can create appointments"
ON public.appointments
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'tele_sales'::app_role)
  OR has_role(auth.uid(), 'online_sales'::app_role)
);