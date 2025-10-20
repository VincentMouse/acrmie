-- Add pending_reschedule flag to appointments table
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS pending_reschedule BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN appointments.pending_reschedule IS 'Indicates if appointment was rescheduled after clinic registration and needs clinic adjustment';