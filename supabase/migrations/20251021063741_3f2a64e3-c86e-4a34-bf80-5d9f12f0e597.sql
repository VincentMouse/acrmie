-- Update appointments that are missing processing_at to use their created_at timestamp
UPDATE appointments 
SET processing_at = created_at 
WHERE processing_at IS NULL;