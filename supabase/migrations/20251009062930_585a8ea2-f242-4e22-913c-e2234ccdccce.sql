-- Create lead settings table for global cooldown configurations
CREATE TABLE public.lead_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value numeric NOT NULL,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lead_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "All authenticated users can view settings"
ON public.lead_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins and sales managers can update settings"
ON public.lead_settings
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'sales_manager'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'sales_manager'::app_role)
);

-- Insert default cooldown settings
INSERT INTO public.lead_settings (setting_key, setting_value) VALUES
  ('l1_cooldown_hours', 24),
  ('l5_cooldown_hours', 48);