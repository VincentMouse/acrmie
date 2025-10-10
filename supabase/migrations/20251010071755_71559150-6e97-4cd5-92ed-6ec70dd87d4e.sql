-- Clear stuck appointments from processing state
UPDATE appointments 
SET processing_by = NULL, processing_at = NULL 
WHERE processing_by IS NOT NULL;