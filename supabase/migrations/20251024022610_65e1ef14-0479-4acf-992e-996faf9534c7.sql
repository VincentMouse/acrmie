
-- Fix security issue: Add SET search_path to the restore function
CREATE OR REPLACE FUNCTION restore_leads_to_l2(
  lead_phones text[],
  assigned_user_ids uuid[],
  admin_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  i integer;
  lead_record record;
BEGIN
  -- Loop through each phone and update
  FOR i IN 1..array_length(lead_phones, 1) LOOP
    -- Get the lead record
    SELECT * INTO lead_record FROM leads WHERE phone = lead_phones[i];
    
    IF lead_record.id IS NOT NULL THEN
      -- Update the lead
      UPDATE leads
      SET 
        status = 'L2-Call reschedule',
        assigned_to = assigned_user_ids[i],
        assigned_at = CASE WHEN assigned_to IS NULL THEN now() ELSE assigned_at END,
        updated_at = now()
      WHERE phone = lead_phones[i];
      
      -- Log the history manually
      INSERT INTO lead_history (
        lead_id,
        changed_by,
        old_status,
        new_status,
        old_assigned_to,
        new_assigned_to,
        notes
      ) VALUES (
        lead_record.id,
        admin_user_id,
        lead_record.status,
        'L2-Call reschedule',
        lead_record.assigned_to,
        assigned_user_ids[i],
        'Restored to L2 status - was incorrectly in L0'
      );
    END IF;
  END LOOP;
END;
$$;
