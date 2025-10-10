-- Clear stuck appointments that are currently being processed
UPDATE appointments 
SET processing_by = NULL, processing_at = NULL 
WHERE processing_by IS NOT NULL;