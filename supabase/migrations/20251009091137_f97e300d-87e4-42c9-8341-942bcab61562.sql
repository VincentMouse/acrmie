-- Revert: Restrict lead insertion to admins and sales managers only
DROP POLICY IF EXISTS "Authenticated users can insert leads" ON public.leads;

CREATE POLICY "Admins and sales managers can insert leads" 
ON public.leads 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'sales_manager'::app_role)
);