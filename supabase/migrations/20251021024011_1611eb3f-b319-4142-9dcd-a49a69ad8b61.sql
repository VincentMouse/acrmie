-- Restore processing_at (TS Call Date) from lead history
-- This shows when telesales completed the call that set L6
-- Keep processing_by null - it will be set when CS actually processes the appointment

UPDATE appointments
SET processing_at = lead_history.created_at
FROM (
  SELECT DISTINCT ON (lh.lead_id) 
    lh.lead_id,
    lh.created_at
  FROM lead_history lh
  WHERE lh.new_status = 'L6-Appointment set'
  ORDER BY lh.lead_id, lh.created_at ASC
) AS lead_history
WHERE appointments.lead_id = lead_history.lead_id
  AND appointments.processing_at IS NULL;