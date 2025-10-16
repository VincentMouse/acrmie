-- Clear all customer, lead, and booking related data
-- Preserve users, branches, and configuration data

-- Delete appointments (bookings) first due to foreign key dependencies
DELETE FROM public.appointments;

-- Delete lead history
DELETE FROM public.lead_history;

-- Delete leads
DELETE FROM public.leads;

-- Delete customers
DELETE FROM public.customers;

-- Delete time slots
DELETE FROM public.time_slots;