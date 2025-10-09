-- Create branches table
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create branch working hours table
CREATE TABLE public.branch_working_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday, 6 = Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(branch_id, day_of_week)
);

-- Create time slots table
CREATE TABLE public.time_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  slot_date DATE NOT NULL,
  slot_time TIME NOT NULL,
  booked_count INTEGER DEFAULT 0 CHECK (booked_count >= 0 AND booked_count <= 7),
  max_capacity INTEGER DEFAULT 7,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(branch_id, slot_date, slot_time)
);

-- Create services and products table
CREATE TABLE public.services_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  number_of_treatments INTEGER,
  type TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Service', 'Product')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(branch_id, code)
);

-- Add branch_id to appointments table
ALTER TABLE public.appointments ADD COLUMN branch_id UUID REFERENCES public.branches(id);
ALTER TABLE public.appointments ADD COLUMN time_slot_id UUID REFERENCES public.time_slots(id);

-- Enable RLS on all tables
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_products ENABLE ROW LEVEL SECURITY;

-- RLS Policies for branches
CREATE POLICY "All authenticated users can view branches"
  ON public.branches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and sales managers can insert branches"
  ON public.branches FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role));

CREATE POLICY "Admins and sales managers can update branches"
  ON public.branches FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role));

CREATE POLICY "Admins can delete branches"
  ON public.branches FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for branch_working_hours
CREATE POLICY "All authenticated users can view working hours"
  ON public.branch_working_hours FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and sales managers can manage working hours"
  ON public.branch_working_hours FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role));

-- RLS Policies for time_slots
CREATE POLICY "All authenticated users can view time slots"
  ON public.time_slots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can update time slots"
  ON public.time_slots FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "System can insert time slots"
  ON public.time_slots FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for services_products
CREATE POLICY "All authenticated users can view services and products"
  ON public.services_products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and sales managers can manage services and products"
  ON public.services_products FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role));

-- Create trigger for updated_at on branches
CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on services_products
CREATE TRIGGER update_services_products_updated_at
  BEFORE UPDATE ON public.services_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate time slots for a branch
CREATE OR REPLACE FUNCTION public.generate_time_slots_for_branch(
  _branch_id UUID,
  _days_ahead INTEGER DEFAULT 15
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        INSERT INTO public.time_slots (branch_id, slot_date, slot_time)
        VALUES (_branch_id, _current_date, _current_time)
        ON CONFLICT (branch_id, slot_date, slot_time) DO NOTHING;
        
        _current_time := _current_time + INTERVAL '1 hour';
      END LOOP;
    END LOOP;
    
    _current_date := _current_date + 1;
  END LOOP;
END;
$$;