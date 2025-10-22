-- Update generate_time_slots_for_branch to preserve existing bookings
CREATE OR REPLACE FUNCTION public.generate_time_slots_for_branch(_branch_id uuid, _days_ahead integer DEFAULT 15)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _working_hour RECORD;
  _current_date DATE;
  _end_date DATE;
  _current_time TIME;
BEGIN
  _current_date := CURRENT_DATE;
  _end_date := _current_date + _days_ahead;
  
  -- Loop through each day
  WHILE _current_date <= _end_date LOOP
    -- Get working hours for this day of week
    FOR _working_hour IN 
      SELECT start_time, end_time
      FROM public.branch_working_hours
      WHERE branch_id = _branch_id
        AND day_of_week = EXTRACT(DOW FROM _current_date)::INTEGER
        AND is_active = true
    LOOP
      -- Generate hourly slots
      _current_time := _working_hour.start_time;
      WHILE _current_time < _working_hour.end_time LOOP
        -- Insert only if doesn't exist (preserves booked_count)
        INSERT INTO public.time_slots (branch_id, slot_date, slot_time)
        VALUES (_branch_id, _current_date, _current_time)
        ON CONFLICT (branch_id, slot_date, slot_time) DO NOTHING;
        
        _current_time := _current_time + INTERVAL '1 hour';
      END LOOP;
    END LOOP;
    
    _current_date := _current_date + 1;
  END LOOP;
  
  -- Delete time slots that are outside the new working hours
  DELETE FROM public.time_slots ts
  WHERE ts.branch_id = _branch_id
    AND ts.slot_date >= CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1
      FROM public.branch_working_hours bwh
      WHERE bwh.branch_id = ts.branch_id
        AND bwh.day_of_week = EXTRACT(DOW FROM ts.slot_date)::INTEGER
        AND bwh.is_active = true
        AND ts.slot_time >= bwh.start_time
        AND ts.slot_time < bwh.end_time
    );
END;
$function$;