-- Make funnel_id nullable for cold leads that don't have a funnel yet
ALTER TABLE public.leads ALTER COLUMN funnel_id DROP NOT NULL;