-- Backfill processed_at for all leads except L0
UPDATE leads 
SET processed_at = COALESCE(updated_at, created_at) 
WHERE status != 'L0-Fresh Lead' 
AND processed_at IS NULL;