-- Backfill processing_at for existing appointments from lead_history
-- This updates appointments that don't have a processing_at timestamp
-- by finding when the lead was moved to L6-Appointment set status

UPDATE appointments
SET processing_at = lead_history.created_at,
    processing_by = lead_history.changed_by
FROM (
  SELECT DISTINCT ON (lh.lead_id) 
    lh.lead_id,
    lh.created_at,
    lh.changed_by
  FROM lead_history lh
  WHERE lh.new_status = 'L6-Appointment set'
  ORDER BY lh.lead_id, lh.created_at ASC
) AS lead_history
WHERE appointments.lead_id = lead_history.lead_id
  AND appointments.processing_at IS NULL;