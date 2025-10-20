-- Update the insert policy for leads table to include online_sales role
DROP POLICY IF EXISTS "Admins and sales managers can insert leads" ON public.leads;

CREATE POLICY "Admins, sales managers, and online sales can insert leads"
ON public.leads
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'online_sales'::app_role)
);