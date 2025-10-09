-- Update the handle_lead_customer function to include email
CREATE OR REPLACE FUNCTION public.handle_lead_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert or update customer based on phone number
  INSERT INTO public.customers (name, phone, address, email)
  VALUES (
    NEW.first_name || ' ' || NEW.last_name,
    NEW.phone,
    NEW.address,
    NEW.email
  )
  ON CONFLICT (phone) 
  DO UPDATE SET
    name = EXCLUDED.name,
    address = COALESCE(EXCLUDED.address, customers.address),
    email = COALESCE(EXCLUDED.email, customers.email),
    updated_at = now();
  
  RETURN NEW;
END;
$function$;