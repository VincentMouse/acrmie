
-- Fix the log_lead_changes trigger function - remove reference to non-existent updated_by field
CREATE OR REPLACE FUNCTION public.log_lead_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    INSERT INTO public.lead_history (
      lead_id,
      changed_by,
      old_status,
      new_status,
      old_assigned_to,
      new_assigned_to
    ) VALUES (
      NEW.id,
      COALESCE(auth.uid(), NEW.created_by), -- Use auth.uid(), or fall back to created_by
      OLD.status,
      NEW.status,
      OLD.assigned_to,
      NEW.assigned_to
    );
  END IF;
  RETURN NEW;
END;
$function$;
