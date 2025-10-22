-- Update leads table RLS policy to allow telesales to insert leads
DROP POLICY IF EXISTS "Admins, sales managers, and online sales can insert leads" ON public.leads;

CREATE POLICY "Admins, sales managers, tele sales, and online sales can insert leads" 
ON public.leads 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'sales_manager'::app_role) OR 
  has_role(auth.uid(), 'tele_sales'::app_role) OR 
  has_role(auth.uid(), 'online_sales'::app_role)
);