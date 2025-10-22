-- Fix appointments where CS agent (RosannaS) was incorrectly set as assigned_to
-- Restore assigned_to to the telesales agent (created_by) and set processing_by to the CS agent

UPDATE appointments
SET 
  assigned_to = created_by,  -- Restore telesales agent
  processing_by = 'e1159126-b013-4706-9522-3d39e66a5db9'  -- Set RosannaS as the processor
WHERE id IN (
  '262d8a42-72ca-41b0-ac2c-d1cc137749fc',
  '163940ca-0ad9-4a4d-a045-cf156b1ecb50',
  '8c167c25-57d0-46c6-b044-c2d0d5e60233',
  'ad592d5f-22c6-42a3-9c35-3ffbc5328514'
);