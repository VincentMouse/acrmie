-- Clear incorrect processing_by data that came from lead history (L6 telesales)
-- processing_by should only be set by CS agents when they actually process the appointment
UPDATE appointments
SET processing_by = NULL,
    processing_at = NULL
WHERE processing_at IS NOT NULL
  AND check_in_status IS NULL
  AND is_completed = false;