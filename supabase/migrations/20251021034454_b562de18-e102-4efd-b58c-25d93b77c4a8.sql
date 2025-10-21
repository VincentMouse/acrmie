-- Allow customer_service to register appointments via View modal by permitting updates
-- Update the UPDATE policy on public.appointments to include customer_service in WITH CHECK
ALTER POLICY "Users can update their appointments"
ON public.appointments
USING (
  (assigned_to = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'tele_sales'::app_role)
  OR has_role(auth.uid(), 'customer_service'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'customer_service'::app_role)
  OR (assigned_to = auth.uid())
);
