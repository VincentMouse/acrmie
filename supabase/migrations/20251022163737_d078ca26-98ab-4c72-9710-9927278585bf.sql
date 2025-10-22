-- Populate processing_by for confirmed appointments that are missing the CS name
-- These appointments were confirmed by CS agent RosannaS but processing_by wasn't set

UPDATE appointments
SET processing_by = 'e1159126-b013-4706-9522-3d39e66a5db9'  -- RosannaS
WHERE id IN (
  'e06d7df8-44c9-449c-8899-2770bbd02903',  -- Efren Crisostomo
  'b150c081-a4c7-4466-8a4b-19afcd732606',  -- Richie Jei Padpad
  'a5e3075d-99c6-4f57-a48b-a0b049d37000'   -- Robitaille David
);