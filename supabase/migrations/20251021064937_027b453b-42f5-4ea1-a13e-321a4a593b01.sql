-- Backfill processed_at for existing L6 leads
UPDATE leads 
SET processed_at = COALESCE(updated_at, created_at) 
WHERE status = 'L6-Appointment set' 
AND processed_at IS NULL;