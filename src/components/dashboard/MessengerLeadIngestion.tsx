import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, CalendarIcon, Check, ChevronsUpDown } from 'lucide-react';
import { z } from 'zod';
import { validatePhoneNumber } from '@/lib/phoneValidation';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const newLeadSchema = z.object({
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits'),
  customerName: z.string().trim().min(1, 'Customer name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  serviceId: z.string().trim().min(1, 'Service/Product is required'),
  campaignName: z.string().optional(),
  marketerId: z.string().trim().min(1, 'Marketer is required'),
  branchId: z.string().trim().min(1, 'Branch is required'),
  onlineSalesNotes: z.string().optional(),
});

const bookingSchema = z.object({
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits'),
  customerName: z.string().trim().min(1, 'Customer name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().optional(),
  serviceId: z.string().trim().min(1, 'Service/Product is required'),
  marketerId: z.string().trim().min(1, 'Marketer is required'),
  branchId: z.string().trim().min(1, 'Branch is required'),
  timeSlotId: z.string().trim().min(1, 'Appointment time slot is required'),
  onlineSalesNotes: z.string().optional(),
});

export function MessengerLeadIngestion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [leadType, setLeadType] = useState<'booking' | 'new_lead'>('new_lead');
  const [formData, setFormData] = useState({
    phone: '',
    customerName: '',
    email: '',
    address: '',
    serviceId: '',
    campaignName: '',
    marketerId: '',
    branchId: '',
    timeSlotId: '',
    onlineSalesNotes: '',
  });
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>();
  const [openServiceCombo, setOpenServiceCombo] = useState(false);
  const [openMarketerCombo, setOpenMarketerCombo] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch marketers (users with marketer role)
  const { data: marketers } = useQuery({
    queryKey: ['marketers'],
    queryFn: async () => {
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, profiles!inner(id, full_name, email)')
        .eq('role', 'marketer');
      
      if (rolesError) throw rolesError;
      return userRoles?.map(ur => ur.profiles).filter(Boolean) || [];
    },
  });

  // Fetch services for selected branch
  const { data: branchServices } = useQuery({
    queryKey: ['branch-services', selectedBranch],
    queryFn: async () => {
      if (!selectedBranch) return [];
      
      const { data, error } = await supabase
        .from('services_products')
        .select('*')
        .eq('branch_id', selectedBranch)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedBranch,
  });

  // Fetch available time slots for booking
  const { data: availableTimeSlots } = useQuery({
    queryKey: ['time-slots', selectedBranch, appointmentDate],
    queryFn: async () => {
      if (!selectedBranch || !appointmentDate) return [];
      
      const { data, error } = await supabase
        .from('time_slots')
        .select('*')
        .eq('branch_id', selectedBranch)
        .eq('slot_date', format(appointmentDate, 'yyyy-MM-dd'))
        .order('slot_time');
      
      if (error) throw error;
      
      // Filter slots where booked_count < max_capacity
      return data?.filter(slot => (slot.booked_count || 0) < (slot.max_capacity || 7)) || [];
    },
    enabled: !!selectedBranch && !!appointmentDate && leadType === 'booking',
  });

  // Reset dependent fields when branch changes
  useEffect(() => {
    setFormData(prev => ({ ...prev, serviceId: '', timeSlotId: '' }));
    setAppointmentDate(undefined);
  }, [selectedBranch]);

  // Reset time slot when date changes
  useEffect(() => {
    setFormData(prev => ({ ...prev, timeSlotId: '' }));
  }, [appointmentDate]);

  const checkDuplicateMutation = useMutation({
    mutationFn: async (phone: string) => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, first_name, last_name, phone')
        .eq('phone', phone)
        .limit(1);

      if (error) throw error;
      return data;
    },
  });

  const createLeadMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Validate and normalize phone
      const phoneValidation = validatePhoneNumber(data.phone);
      if (!phoneValidation.isValid) {
        throw new Error(`Invalid phone number: ${phoneValidation.error}`);
      }

      // Check for duplicates using normalized phone
      const duplicates = await checkDuplicateMutation.mutateAsync(phoneValidation.normalized);
      
      const [firstName, ...lastNameParts] = data.customerName.trim().split(' ');
      const lastName = lastNameParts.join(' ') || firstName;

      // Get service details
      const selectedService = branchServices?.find(s => s.id === data.serviceId);

      const leadData = {
        first_name: firstName,
        last_name: lastName,
        phone: phoneValidation.normalized,
        email: data.email || null,
        address: data.address || null,
        service_product: selectedService?.name || '',
        campaign_name: data.campaignName || null,
        marketer_name: marketers?.find(m => m.id === data.marketerId)?.full_name || '',
        notes: data.onlineSalesNotes || null,
        status: leadType === 'booking' ? 'L6-Appointment set' as const : 'L0-Fresh Lead' as const,
        created_by: user.id,
        assigned_to: leadType === 'booking' ? user.id : null,
        assigned_at: leadType === 'booking' ? new Date().toISOString() : null,
        funnel_id: null,
        is_duplicate: duplicates && duplicates.length > 0,
        duplicate_of: duplicates && duplicates.length > 0 ? duplicates[0].id : null,
      };

      const { data: insertedLead, error: leadError } = await supabase
        .from('leads')
        .insert([leadData])
        .select()
        .single();
      
      if (leadError) throw leadError;

      // If booking, create appointment
      if (leadType === 'booking' && insertedLead) {
        const selectedTimeSlot = availableTimeSlots?.find(ts => ts.id === data.timeSlotId);
        if (!selectedTimeSlot) throw new Error('Time slot not found');

        const appointmentDateTime = new Date(`${selectedTimeSlot.slot_date}T${selectedTimeSlot.slot_time}`);
        
        const appointmentData = {
          lead_id: insertedLead.id,
          assigned_to: user.id,
          branch_id: data.branchId,
          appointment_date: appointmentDateTime.toISOString(),
          service_product: selectedService?.name || '',
          notes: data.onlineSalesNotes || null,
          created_by: user.id,
          time_slot_id: data.timeSlotId,
        };

        const { error: appointmentError } = await supabase
          .from('appointments')
          .insert([appointmentData]);
        
        if (appointmentError) throw appointmentError;

        // Update time slot booked count
        await supabase
          .from('time_slots')
          .update({ booked_count: (selectedTimeSlot.booked_count || 0) + 1 })
          .eq('id', data.timeSlotId);
      }
      
      return { isDuplicate: duplicates && duplicates.length > 0, duplicateOf: duplicates?.[0], isBooking: leadType === 'booking' };
    },
    onSuccess: ({ isDuplicate, duplicateOf, isBooking }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (isBooking) {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['time-slots'] });
      }
      
      if (isDuplicate && duplicateOf) {
        toast({
          title: `Messenger ${isBooking ? 'booking' : 'lead'} created with duplicate flag`,
          description: `This phone number matches existing lead: ${duplicateOf.first_name} ${duplicateOf.last_name}`,
          variant: 'destructive',
        });
      } else {
        toast({ 
          title: `Messenger ${isBooking ? 'booking' : 'lead'} created`,
          description: isBooking ? 'Lead with appointment has been added' : 'New lead has been added to the pipeline',
        });
      }
      
      setIsOpen(false);
      setFormData({ 
        phone: '', 
        customerName: '', 
        email: '', 
        address: '', 
        serviceId: '', 
        campaignName: '', 
        marketerId: '', 
        branchId: '',
        timeSlotId: '',
        onlineSalesNotes: '' 
      });
      setSelectedBranch('');
      setAppointmentDate(undefined);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create messenger lead',
        description: error.message,
        variant: 'destructive'
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const schema = leadType === 'booking' ? bookingSchema : newLeadSchema;
      const validated = schema.parse(formData);
      createLeadMutation.mutate(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Validation error',
          description: error.errors[0].message,
          variant: 'destructive',
        });
      }
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Messenger Lead Ingestion</h2>
            <p className="text-muted-foreground mt-1">
              Add leads from messenger conversations - bookings or new leads.
            </p>
          </div>

          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Leads
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Messenger Leads</DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Lead Type *</Label>
                  <Tabs value={leadType} onValueChange={(v) => setLeadType(v as 'booking' | 'new_lead')}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="new_lead">New Lead</TabsTrigger>
                      <TabsTrigger value="booking">Booking</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-statusUpdate">Status Update</Label>
                  <Input
                    id="messenger-statusUpdate"
                    value={leadType === 'booking' ? 'L6 - Appointment Set' : 'L0 - Fresh Lead'}
                    readOnly
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-leadGenDate">Lead Generation Date</Label>
                  <Input
                    id="messenger-leadGenDate"
                    value={new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
                    readOnly
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-marketer">Marketer *</Label>
                  <Popover open={openMarketerCombo} onOpenChange={setOpenMarketerCombo}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openMarketerCombo}
                        className="w-full justify-between"
                      >
                        {formData.marketerId
                          ? marketers?.find((m) => m.id === formData.marketerId)?.full_name
                          : "Select marketer..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0 z-[100]" align="start">
                      <Command>
                        <CommandInput placeholder="Search marketer..." />
                        <CommandList>
                          <CommandEmpty>No marketer found.</CommandEmpty>
                          <CommandGroup>
                            {marketers?.map((marketer) => (
                              <CommandItem
                                key={marketer.id}
                                value={marketer.full_name}
                                onSelect={() => {
                                  setFormData({ ...formData, marketerId: marketer.id });
                                  setOpenMarketerCombo(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.marketerId === marketer.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {marketer.full_name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-phone">Phone Number *</Label>
                  <Input
                    id="messenger-phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-customerName">Customer Name *</Label>
                  <Input
                    id="messenger-customerName"
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-email">Email Address (Optional)</Label>
                  <Input
                    id="messenger-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="customer@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-branch">Branch *</Label>
                  <Select
                    value={formData.branchId}
                    onValueChange={(value) => {
                      setFormData({ ...formData, branchId: value });
                      setSelectedBranch(value);
                    }}
                  >
                    <SelectTrigger id="messenger-branch">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      {branches?.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-service">Service/Product *</Label>
                  <Popover open={openServiceCombo} onOpenChange={setOpenServiceCombo}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openServiceCombo}
                        className="w-full justify-between"
                        disabled={!selectedBranch}
                      >
                        {formData.serviceId
                          ? branchServices?.find((s) => s.id === formData.serviceId)?.name
                          : "Select service..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0 z-[100]" align="start">
                      <Command>
                        <CommandInput placeholder="Search service..." />
                        <CommandList>
                          <CommandEmpty>No service found.</CommandEmpty>
                          <CommandGroup>
                            {branchServices?.map((service) => (
                              <CommandItem
                                key={service.id}
                                value={service.name}
                                onSelect={() => {
                                  setFormData({ ...formData, serviceId: service.id });
                                  setOpenServiceCombo(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.serviceId === service.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {service.name} - {service.category}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-campaignName">Campaign Name (Optional)</Label>
                  <Input
                    id="messenger-campaignName"
                    value={formData.campaignName}
                    onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                  />
                </div>

                {leadType === 'booking' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="messenger-address">Home Address (Optional)</Label>
                      <Input
                        id="messenger-address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="123 Street Name, City"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="messenger-appointmentDate">Appointment Date *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="messenger-appointmentDate"
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !appointmentDate && "text-muted-foreground"
                            )}
                            disabled={!selectedBranch}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {appointmentDate ? format(appointmentDate, 'PPP') : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[100]" align="start">
                          <Calendar
                            mode="single"
                            selected={appointmentDate}
                            onSelect={setAppointmentDate}
                            disabled={(date) => date < new Date()}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="messenger-timeSlot">Appointment Time *</Label>
                      <Select
                        value={formData.timeSlotId}
                        onValueChange={(value) => setFormData({ ...formData, timeSlotId: value })}
                        disabled={!appointmentDate || !selectedBranch}
                      >
                        <SelectTrigger id="messenger-timeSlot">
                          <SelectValue placeholder="Select time slot" />
                        </SelectTrigger>
                        <SelectContent className="z-[100]">
                          {availableTimeSlots?.map((slot) => (
                            <SelectItem key={slot.id} value={slot.id}>
                              {slot.slot_time} ({slot.booked_count || 0}/{slot.max_capacity || 7} booked)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="messenger-onlineSalesNotes">Online Sales Notes (Optional)</Label>
                  <Input
                    id="messenger-onlineSalesNotes"
                    value={formData.onlineSalesNotes}
                    onChange={(e) => setFormData({ ...formData, onlineSalesNotes: e.target.value })}
                    placeholder="Enter any notes..."
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={createLeadMutation.isPending}
                >
                  {createLeadMutation.isPending ? 'Creating...' : `Create ${leadType === 'booking' ? 'Booking' : 'Lead'}`}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Card>
  );
}
