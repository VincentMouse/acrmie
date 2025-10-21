-- Update appointments RLS policy to allow all authenticated users to view
DROP POLICY IF EXISTS "Users can view appointments based on role" ON appointments;

CREATE POLICY "All authenticated users can view appointments"
ON appointments
FOR SELECT
TO authenticated
USING (true);