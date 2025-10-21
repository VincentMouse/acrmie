-- Revert appointments RLS policy back to role-based access
DROP POLICY IF EXISTS "All authenticated users can view appointments" ON appointments;

CREATE POLICY "Users can view appointments based on role"
ON appointments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'sales_manager'::app_role) OR 
  has_role(auth.uid(), 'customer_service'::app_role) OR 
  (has_role(auth.uid(), 'tele_sales'::app_role) AND assigned_to = auth.uid()) OR
  (has_role(auth.uid(), 'online_sales'::app_role) AND assigned_to = auth.uid())
);