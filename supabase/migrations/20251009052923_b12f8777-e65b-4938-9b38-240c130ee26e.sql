-- Create customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view customers
CREATE POLICY "All authenticated users can view customers"
ON public.customers
FOR SELECT
TO authenticated
USING (true);

-- System can insert customers
CREATE POLICY "System can insert customers"
ON public.customers
FOR INSERT
WITH CHECK (true);

-- System can update customers
CREATE POLICY "System can update customers"
ON public.customers
FOR UPDATE
USING (true);

-- Create trigger function to create/update customer when lead is inserted
CREATE OR REPLACE FUNCTION public.handle_lead_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert or update customer based on phone number
  INSERT INTO public.customers (name, phone, address)
  VALUES (
    NEW.first_name || ' ' || NEW.last_name,
    NEW.phone,
    NEW.address
  )
  ON CONFLICT (phone) 
  DO UPDATE SET
    name = EXCLUDED.name,
    address = COALESCE(EXCLUDED.address, customers.address),
    updated_at = now();
  
  RETURN NEW;
END;
$$;

-- Create trigger on leads table
CREATE TRIGGER on_lead_create_customer
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_lead_customer();

-- Add trigger for updated_at on customers
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();