import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Mail, Search, Plus, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { format, setHours, setMinutes } from 'date-fns';
import { CalendarIcon, Check } from 'lucide-react';
import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizePhoneNumber, validatePhoneNumber } from '@/lib/phoneValidation';

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  created_at: string;
};

type Lead = {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  service_product: string;
  created_at: string;
  campaign_name: string | null;
};

type Appointment = {
  id: string;
  lead_id: string;
  appointment_date: string;
  confirmation_status: string;
  check_in_status: string | null;
  service_product: string | null;
  revenue: number | null;
  notes: string | null;
};

export function Customers() {
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [emailValue, setEmailValue] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');
  const [phoneSearchError, setPhoneSearchError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isTeleSales, isCustomerService, isLoading: isRoleLoading } = useUserRole();
  const requiresPhoneSearch = isTeleSales || isCustomerService;

  // Create Customer Modal States
  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [customerType, setCustomerType] = useState<'consultation' | 'followup' | ''>('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [appointmentDate, setAppointmentDate] = useState<Date>();
  const [appointmentTimeSlot, setAppointmentTimeSlot] = useState('');
  const [concern, setConcern] = useState('');
  const [expectation, setExpectation] = useState('');
  const [budget, setBudget] = useState('');
  const [suggestedService, setSuggestedService] = useState('');
  const [suggestedServiceDetails, setSuggestedServiceDetails] = useState<{price: number, treatments: number} | null>(null);
  const [additionalSuggestedService, setAdditionalSuggestedService] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [concurrentService, setConcurrentService] = useState('');
  const [concurrentServiceDetails, setConcurrentServiceDetails] = useState<{price: number, treatments: number} | null>(null);
  const [sessionNumber, setSessionNumber] = useState('');
  const [openSuggestedServiceCombo, setOpenSuggestedServiceCombo] = useState(false);
  const [openAdditionalServiceCombo, setOpenAdditionalServiceCombo] = useState(false);
  const [openConcurrentServiceCombo, setOpenConcurrentServiceCombo] = useState(false);

  // Call Modal States
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [callLead, setCallLead] = useState<Lead | null>(null);
  const [callCustomerType, setCallCustomerType] = useState<'consultation' | 'followup' | ''>('');
  const [callSelectedBranch, setCallSelectedBranch] = useState('');
  const [callAppointmentDate, setCallAppointmentDate] = useState<Date>();
  const [callAppointmentTimeSlot, setCallAppointmentTimeSlot] = useState('');
  const [callConcern, setCallConcern] = useState('');
  const [callExpectation, setCallExpectation] = useState('');
  const [callBudget, setCallBudget] = useState('');
  const [callSuggestedService, setCallSuggestedService] = useState('');
  const [callSuggestedServiceDetails, setCallSuggestedServiceDetails] = useState<{price: number, treatments: number} | null>(null);
  const [callAdditionalSuggestedService, setCallAdditionalSuggestedService] = useState('');
  const [callAdditionalNotes, setCallAdditionalNotes] = useState('');
  const [callConcurrentService, setCallConcurrentService] = useState('');
  const [callConcurrentServiceDetails, setCallConcurrentServiceDetails] = useState<{price: number, treatments: number} | null>(null);
  const [callSessionNumber, setCallSessionNumber] = useState('');
  const [openCallSuggestedServiceCombo, setOpenCallSuggestedServiceCombo] = useState(false);
  const [openCallAdditionalServiceCombo, setOpenCallAdditionalServiceCombo] = useState(false);
  const [openCallConcurrentServiceCombo, setOpenCallConcurrentServiceCombo] = useState(false);

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', searchQuery, requiresPhoneSearch],
    queryFn: async () => {
      // For Tele Sales and Customer Service, only fetch if there's a search query
      if (requiresPhoneSearch && !searchQuery) {
        return [];
      }

      let query = supabase
        .from('customers')
        .select('*');

      // If user requires phone search, filter by exact phone match
      if (requiresPhoneSearch && searchQuery) {
        query = query.eq('phone', searchQuery);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data as Customer[];
    },
    enabled: !isRoleLoading,
  });

  const handlePhoneSearch = () => {
    const validation = validatePhoneNumber(phoneSearch);
    if (!validation.isValid) {
      setPhoneSearchError(validation.error || 'Invalid phone number');
      return;
    }
    setPhoneSearchError('');
    setSearchQuery(validation.normalized);
  };

  const handlePhoneSearchChange = (value: string) => {
    setPhoneSearch(value);
    if (value.trim()) {
      const validation = validatePhoneNumber(value);
      if (!validation.isValid) {
        setPhoneSearchError(validation.error || 'Invalid phone number');
      } else {
        setPhoneSearchError('');
      }
    } else {
      setPhoneSearchError('');
    }
  };

  const { data: leadsMap } = useQuery({
    queryKey: ['customer-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group leads by phone number
      const grouped = (data as Lead[]).reduce((acc, lead) => {
        const phone = (lead as any).phone;
        if (!acc[phone]) {
          acc[phone] = [];
        }
        acc[phone].push(lead);
        return acc;
      }, {} as Record<string, Lead[]>);

      return grouped;
    },
  });

  const { data: appointmentsMap } = useQuery({
    queryKey: ['customer-appointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: false });

      if (error) throw error;

      // Group appointments by lead_id
      const grouped = (data as any[]).reduce((acc, appointment) => {
        const leadId = appointment.lead_id;
        if (!acc[leadId]) {
          acc[leadId] = [];
        }
        acc[leadId].push({
          id: appointment.id,
          lead_id: appointment.lead_id,
          appointment_date: appointment.appointment_date,
          confirmation_status: appointment.confirmation_status,
          check_in_status: appointment.check_in_status,
          service_product: appointment.service_product,
          revenue: appointment.revenue,
          notes: appointment.notes,
        });
        return acc;
      }, {} as Record<string, Appointment[]>);

      return grouped;
    },
  });

  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [addressValue, setAddressValue] = useState('');

  const updateEmailMutation = useMutation({
    mutationFn: async ({ customerId, email }: { customerId: string; email: string }) => {
      const { error } = await supabase
        .from('customers')
        .update({ email })
        .eq('id', customerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Email updated',
        description: 'Customer email has been updated successfully.',
      });
      setEditingEmail(null);
      setEmailValue('');
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update email. Please try again.',
        variant: 'destructive',
      });
      console.error('Error updating email:', error);
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: async ({ customerId, address }: { customerId: string; address: string }) => {
      const { error } = await supabase
        .from('customers')
        .update({ address })
        .eq('id', customerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Address updated',
        description: 'Customer address has been updated successfully.',
      });
      setEditingAddress(null);
      setAddressValue('');
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update address. Please try again.',
        variant: 'destructive',
      });
      console.error('Error updating address:', error);
    },
  });

  const handleEmailSave = (customerId: string) => {
    if (emailValue.trim()) {
      updateEmailMutation.mutate({ customerId, email: emailValue.trim() });
    }
  };

  const handleAddressSave = (customerId: string) => {
    if (addressValue.trim()) {
      updateAddressMutation.mutate({ customerId, address: addressValue.trim() });
    }
  };

  // Fetch branches
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch services/products for selected branch
  const { data: branchServices } = useQuery({
    queryKey: ['branch-services', selectedBranch],
    queryFn: async () => {
      if (!selectedBranch) return [];
      const { data, error } = await supabase
        .from('services_products')
        .select('*')
        .eq('branch_id', selectedBranch)
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBranch,
  });

  // Fetch available time slots
  const { data: availableTimeSlots } = useQuery({
    queryKey: ['time-slots', selectedBranch, appointmentDate],
    queryFn: async () => {
      if (!selectedBranch || !appointmentDate) return [];
      const { data, error } = await supabase
        .from('time_slots')
        .select('*')
        .eq('branch_id', selectedBranch)
        .eq('slot_date', format(appointmentDate, 'yyyy-MM-dd'))
        .order('slot_time', { ascending: true });
      if (error) throw error;
      // Filter slots where booked_count < max_capacity
      return data?.filter(slot => (slot.booked_count || 0) < (slot.max_capacity || 7)) || [];
    },
    enabled: !!selectedBranch && !!appointmentDate,
  });

  // Fetch services/products for call modal branch
  const { data: callBranchServices } = useQuery({
    queryKey: ['call-branch-services', callSelectedBranch],
    queryFn: async () => {
      if (!callSelectedBranch) return [];
      const { data, error } = await supabase
        .from('services_products')
        .select('*')
        .eq('branch_id', callSelectedBranch)
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!callSelectedBranch,
  });

  // Fetch available time slots for call modal
  const { data: callAvailableTimeSlots } = useQuery({
    queryKey: ['call-time-slots', callSelectedBranch, callAppointmentDate],
    queryFn: async () => {
      if (!callSelectedBranch || !callAppointmentDate) return [];
      const { data, error } = await supabase
        .from('time_slots')
        .select('*')
        .eq('branch_id', callSelectedBranch)
        .eq('slot_date', format(callAppointmentDate, 'yyyy-MM-dd'))
        .order('slot_time', { ascending: true });
      if (error) throw error;
      return data?.filter(slot => (slot.booked_count || 0) < (slot.max_capacity || 7)) || [];
    },
    enabled: !!callSelectedBranch && !!callAppointmentDate,
  });

  const createCustomerMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const normalizedPhone = normalizePhoneNumber(phone);

      // Create lead
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .insert({
          first_name: firstName,
          last_name: lastName,
          phone: normalizedPhone,
          email: email || null,
          address: address || null,
          status: 'L6-Appointment set',
          service_product: branchServices?.find(s => s.id === (customerType === 'consultation' ? suggestedService : concurrentService))?.name || '',
          assigned_to: user.id,
          created_by: user.id,
        })
        .select()
        .single();

      if (leadError) throw leadError;

      // Get time slot details
      const { data: timeSlotData, error: timeSlotError } = await supabase
        .from('time_slots')
        .select('*')
        .eq('id', appointmentTimeSlot)
        .single();

      if (timeSlotError) throw timeSlotError;

      // Create appointment
      const appointmentDateTime = setMinutes(
        setHours(appointmentDate!, parseInt(timeSlotData.slot_time.split(':')[0])),
        parseInt(timeSlotData.slot_time.split(':')[1])
      );

      const appointmentNotes = customerType === 'consultation'
        ? `Concern: ${concern}\nExpectation: ${expectation}\nBudget: ${budget}\nSuggested Service: ${branchServices?.find(s => s.id === suggestedService)?.name}\n${additionalSuggestedService ? `Additional Suggested Service: ${branchServices?.find(s => s.id === additionalSuggestedService)?.name}\n` : ''}${additionalNotes ? `Notes: ${additionalNotes}` : ''}`
        : `Concurrent Service: ${branchServices?.find(s => s.id === concurrentService)?.name}\nSession Number: ${sessionNumber}`;

      const { error: appointmentError } = await supabase
        .from('appointments')
        .insert({
          lead_id: leadData.id,
          assigned_to: user.id,
          branch_id: selectedBranch,
          time_slot_id: appointmentTimeSlot,
          appointment_date: appointmentDateTime.toISOString(),
          service_product: branchServices?.find(s => s.id === (customerType === 'consultation' ? suggestedService : concurrentService))?.name,
          notes: appointmentNotes,
          created_by: user.id,
        });

      if (appointmentError) throw appointmentError;

      // Update time slot booked count
      await supabase
        .from('time_slots')
        .update({ booked_count: (timeSlotData.booked_count || 0) + 1 })
        .eq('id', appointmentTimeSlot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-leads'] });
      queryClient.invalidateQueries({ queryKey: ['customer-appointments'] });
      setIsCreateCustomerModalOpen(false);
      // Reset form
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setCustomerType('');
      setSelectedBranch('');
      setAppointmentDate(undefined);
      setAppointmentTimeSlot('');
      setConcern('');
      setExpectation('');
      setBudget('');
      setSuggestedService('');
      setSuggestedServiceDetails(null);
      setAdditionalSuggestedService('');
      setAdditionalNotes('');
      setConcurrentService('');
      setConcurrentServiceDetails(null);
      setSessionNumber('');
      toast({
        title: 'Customer created',
        description: 'Customer and appointment have been created successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to create customer. Please try again.',
        variant: 'destructive',
      });
      console.error('Error creating customer:', error);
    },
  });

  const processLeadCallMutation = useMutation({
    mutationFn: async () => {
      if (!callLead) throw new Error('No lead selected');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Update lead status to L6
      const { error: leadError } = await supabase
        .from('leads')
        .update({ 
          status: 'L6-Appointment set',
          assigned_to: user.id,
          processed_at: new Date().toISOString(),
          service_product: callBranchServices?.find(s => s.id === (callCustomerType === 'consultation' ? callSuggestedService : callConcurrentService))?.name || callLead.service_product,
        })
        .eq('id', callLead.id);

      if (leadError) throw leadError;

      // Get time slot details
      const { data: timeSlotData, error: timeSlotError } = await supabase
        .from('time_slots')
        .select('*')
        .eq('id', callAppointmentTimeSlot)
        .single();

      if (timeSlotError) throw timeSlotError;

      // Create appointment
      const appointmentDateTime = setMinutes(
        setHours(callAppointmentDate!, parseInt(timeSlotData.slot_time.split(':')[0])),
        parseInt(timeSlotData.slot_time.split(':')[1])
      );

      const appointmentNotes = callCustomerType === 'consultation'
        ? `Concern: ${callConcern}\nExpectation: ${callExpectation}\nBudget: ${callBudget}\nSuggested Service: ${callBranchServices?.find(s => s.id === callSuggestedService)?.name}\n${callAdditionalSuggestedService ? `Additional Suggested Service: ${callBranchServices?.find(s => s.id === callAdditionalSuggestedService)?.name}\n` : ''}${callAdditionalNotes ? `Notes: ${callAdditionalNotes}` : ''}`
        : `Concurrent Service: ${callBranchServices?.find(s => s.id === callConcurrentService)?.name}\nSession Number: ${callSessionNumber}`;

      const { error: appointmentError } = await supabase
        .from('appointments')
        .insert({
          lead_id: callLead.id,
          assigned_to: user.id,
          branch_id: callSelectedBranch,
          time_slot_id: callAppointmentTimeSlot,
          appointment_date: appointmentDateTime.toISOString(),
          service_product: callBranchServices?.find(s => s.id === (callCustomerType === 'consultation' ? callSuggestedService : callConcurrentService))?.name,
          notes: appointmentNotes,
          created_by: user.id,
        });

      if (appointmentError) throw appointmentError;

      // Update time slot booked count
      await supabase
        .from('time_slots')
        .update({ booked_count: (timeSlotData.booked_count || 0) + 1 })
        .eq('id', callAppointmentTimeSlot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-leads'] });
      queryClient.invalidateQueries({ queryKey: ['customer-appointments'] });
      setIsCallModalOpen(false);
      // Reset call form
      setCallLead(null);
      setCallCustomerType('');
      setCallSelectedBranch('');
      setCallAppointmentDate(undefined);
      setCallAppointmentTimeSlot('');
      setCallConcern('');
      setCallExpectation('');
      setCallBudget('');
      setCallSuggestedService('');
      setCallSuggestedServiceDetails(null);
      setCallAdditionalSuggestedService('');
      setCallAdditionalNotes('');
      setCallConcurrentService('');
      setCallConcurrentServiceDetails(null);
      setCallSessionNumber('');
      toast({
        title: 'Appointment set',
        description: 'Lead has been updated and appointment created successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to process lead call. Please try again.',
        variant: 'destructive',
      });
      console.error('Error processing lead call:', error);
    },
  });

  const handleOpenCallModal = (lead: Lead) => {
    setCallLead(lead);
    setIsCallModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'L0-Fresh Lead': 'bg-gray-500',
      'L1-Call back': 'bg-blue-500',
      'L2-Call reschedule': 'bg-yellow-500',
      'L3-Cancelled': 'bg-green-500',
      'L4-Blacklisted': 'bg-red-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Customers</h2>
        <Badge variant="outline">{customers?.length || 0} Total Customers</Badge>
      </div>

      {requiresPhoneSearch && (
        <div className="mb-6">
          <Label htmlFor="phone-search" className="text-sm font-medium mb-2 block">
            Search Customer by Phone Number
          </Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                id="phone-search"
                placeholder="Enter exact phone number (10 digits, starting with 9)"
                value={phoneSearch}
                onChange={(e) => handlePhoneSearchChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !phoneSearchError && handlePhoneSearch()}
                className={cn("w-full", phoneSearchError && "border-destructive")}
              />
              {phoneSearchError && (
                <p className="text-sm text-destructive mt-1">{phoneSearchError}</p>
              )}
            </div>
            <Button onClick={handlePhoneSearch} disabled={!!phoneSearchError || !phoneSearch.trim()}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
          {searchQuery && customers?.length === 0 && !phoneSearchError && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground mb-3">No customer found with this phone number.</p>
              <Button 
                onClick={() => {
                  setPhone(phoneSearch);
                  setIsCreateCustomerModalOpen(true);
                }}
                variant="outline"
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Customer
              </Button>
            </div>
          )}

          {searchQuery && customers && customers.length > 0 && isTeleSales && (
            <div className="mt-4">
              {customers.map((customer) => {
                const customerLeads = leadsMap?.[customer.phone] || [];
                const latestLead = customerLeads[0]; // Leads are already sorted by created_at desc
                const shouldShowCallButton = latestLead && 
                  latestLead.status !== 'L0-Fresh Lead' && 
                  latestLead.status !== 'L6-Appointment set';

                if (!shouldShowCallButton) return null;

                return (
                  <div key={customer.id} className="p-4 bg-primary/5 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Customer: {customer.name}</p>
                        <p className="text-sm text-muted-foreground">Latest Lead Status: {latestLead.status}</p>
                      </div>
                      <Button
                        onClick={() => handleOpenCallModal(latestLead)}
                        className="gap-2"
                      >
                        <Phone className="h-4 w-4" />
                        Call
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {customers?.map((customer) => {
          const customerLeads = leadsMap?.[customer.phone] || [];
          const isExpanded = expandedCustomer === customer.id;

          return (
            <Collapsible
              key={customer.id}
              open={isExpanded}
              onOpenChange={(open) => setExpandedCustomer(open ? customer.id : null)}
            >
              <Card className="overflow-hidden">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center flex-1 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 mr-3" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mr-3" />
                      )}
                      <div className="flex items-center gap-8 flex-1 min-w-0">
                        <h3 className="font-semibold text-sm w-48 truncate">{customer.name}</h3>
                        <p className="text-sm text-muted-foreground w-32 flex-shrink-0">{customer.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground ml-4 flex-shrink-0">
                      {customer.email ? (
                        <>
                          <Mail className="h-3 w-3" />
                          <span className="truncate max-w-[200px]">{customer.email}</span>
                        </>
                      ) : (
                        <span className="text-xs italic">No email</span>
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-muted/30 p-3 rounded-lg">
                        <Label htmlFor={`email-${customer.id}`} className="text-sm font-medium mb-2 block">
                          {customer.email ? 'Email Address' : 'Add Email Address'}
                        </Label>
                        {customer.email ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-4 w-4" />
                            {customer.email}
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              id={`email-${customer.id}`}
                              type="email"
                              placeholder="Enter email address"
                              value={editingEmail === customer.id ? emailValue : ''}
                              onChange={(e) => {
                                setEditingEmail(customer.id);
                                setEmailValue(e.target.value);
                              }}
                              className="flex-1"
                            />
                            <button
                              onClick={() => handleEmailSave(customer.id)}
                              disabled={!emailValue.trim() || updateEmailMutation.isPending}
                              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="bg-muted/30 p-3 rounded-lg">
                        <Label htmlFor={`address-${customer.id}`} className="text-sm font-medium mb-2 block">
                          {customer.address ? 'Home Address' : 'Add Home Address'}
                        </Label>
                        {customer.address ? (
                          <div className="text-sm text-muted-foreground">
                            {customer.address}
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              id={`address-${customer.id}`}
                              placeholder="Enter home address"
                              value={editingAddress === customer.id ? addressValue : ''}
                              onChange={(e) => {
                                setEditingAddress(customer.id);
                                setAddressValue(e.target.value);
                              }}
                              className="flex-1"
                            />
                            <button
                              onClick={() => handleAddressSave(customer.id)}
                              disabled={!addressValue.trim() || updateAddressMutation.isPending}
                              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-3 text-sm">Leads</h4>
                      {customerLeads.length > 0 ? (
                        <div className="space-y-4">
                          {customerLeads.map((lead) => {
                            const leadAppointments = appointmentsMap?.[lead.id] || [];
                            return (
                              <div key={lead.id} className="border rounded-lg overflow-hidden">
                                <div className="bg-muted/30 p-3">
                                  <div className="grid grid-cols-5 gap-4 text-sm">
                                    <div>
                                      <span className="font-medium">Name:</span>
                                      <p className="text-muted-foreground">{lead.first_name} {lead.last_name}</p>
                                    </div>
                                    <div>
                                      <span className="font-medium">Service/Product:</span>
                                      <p className="text-muted-foreground">{lead.service_product}</p>
                                    </div>
                                    <div>
                                      <span className="font-medium">Campaign:</span>
                                      <p className="text-muted-foreground">{lead.campaign_name || '-'}</p>
                                    </div>
                                    <div>
                                      <span className="font-medium">Status:</span>
                                      <div className="mt-1">
                                        <Badge className={getStatusColor(lead.status)}>
                                          {lead.status}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div>
                                      <span className="font-medium">Date:</span>
                                      <p className="text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</p>
                                    </div>
                                  </div>
                                </div>
                                
                                {leadAppointments.length > 0 && (
                                  <div className="p-3 bg-background border-t">
                                    <h5 className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Appointments for this lead</h5>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="text-xs">Appointment Date</TableHead>
                                          <TableHead className="text-xs">Service/Product</TableHead>
                                          <TableHead className="text-xs">Confirmation</TableHead>
                                          <TableHead className="text-xs">Check-in</TableHead>
                                          <TableHead className="text-xs">Revenue</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {leadAppointments.map((appointment) => (
                                          <TableRow key={appointment.id}>
                                            <TableCell className="text-xs">
                                              {new Date(appointment.appointment_date).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-xs">{appointment.service_product || '-'}</TableCell>
                                            <TableCell>
                                              <Badge variant={appointment.confirmation_status === 'confirmed' ? 'default' : 'secondary'} className="text-xs">
                                                {appointment.confirmation_status}
                                              </Badge>
                                            </TableCell>
                                            <TableCell>
                                              {appointment.check_in_status ? (
                                                <Badge className="text-xs">{appointment.check_in_status}</Badge>
                                              ) : (
                                                <span className="text-xs text-muted-foreground">-</span>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                              {appointment.revenue ? `₱${appointment.revenue}` : '-'}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          No leads found for this customer
                        </div>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}

        {!customers?.length && (
          <div className="text-center py-8 text-muted-foreground">
            {isTeleSales && !searchQuery
              ? 'Enter a phone number to search for a customer'
              : 'No customers found. Customers will be created automatically when leads are ingested.'}
          </div>
        )}
      </div>

      {/* Create Customer Modal */}
      <Dialog open={isCreateCustomerModalOpen} onOpenChange={setIsCreateCustomerModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Customer (L6 - Appointment Set)</DialogTitle>
            <DialogDescription>
              Fill in customer details and appointment information
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Customer Details */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="first-name">First Name *</Label>
                <Input
                  id="first-name"
                  placeholder="Enter first name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="last-name">Last Name *</Label>
                <Input
                  id="last-name"
                  placeholder="Enter last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone-create">Phone Number *</Label>
                <Input
                  id="phone-create"
                  placeholder="Enter phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email-create">Email</Label>
                <Input
                  id="email-create"
                  type="email"
                  placeholder="Enter email (optional)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="address-create">Address</Label>
                <Input
                  id="address-create"
                  placeholder="Enter address (optional)"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>

            {/* Appointment Details */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer-type-create">Type of Customer *</Label>
                <Select value={customerType} onValueChange={(val) => setCustomerType(val as 'consultation' | 'followup')}>
                  <SelectTrigger id="customer-type-create">
                    <SelectValue placeholder="Select customer type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultation">Consultation needed</SelectItem>
                    <SelectItem value="followup">Follow up sessions</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch-create">Branch *</Label>
                <Select 
                  value={selectedBranch} 
                  onValueChange={(value) => {
                    setSelectedBranch(value);
                    setAppointmentDate(undefined);
                    setAppointmentTimeSlot('');
                  }}
                >
                  <SelectTrigger id="branch-create">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches?.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-date-create">Appointment Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="appointment-date-create"
                      variant="outline"
                      disabled={!selectedBranch}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !appointmentDate && "text-muted-foreground",
                        !selectedBranch && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {appointmentDate ? format(appointmentDate, 'PPP') : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={appointmentDate}
                      onSelect={(date) => {
                        setAppointmentDate(date);
                        setAppointmentTimeSlot('');
                      }}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-time-create">Appointment Time *</Label>
                <Select 
                  value={appointmentTimeSlot} 
                  onValueChange={setAppointmentTimeSlot}
                  disabled={!selectedBranch || !appointmentDate}
                >
                  <SelectTrigger 
                    id="appointment-time-create"
                    className={cn(
                      (!selectedBranch || !appointmentDate) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <SelectValue placeholder="Select time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTimeSlots && availableTimeSlots.length > 0 ? (
                      availableTimeSlots.map((slot) => (
                        <SelectItem key={slot.id} value={slot.id}>
                          {slot.slot_time} ({slot.max_capacity - (slot.booked_count || 0)} slots available)
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-slots" disabled>
                        No available slots
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Consultation specific fields */}
              {customerType === 'consultation' && (
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-semibold text-sm">Consultation Details</h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="concern-create">Concern *</Label>
                    <Textarea
                      id="concern-create"
                      placeholder="Enter customer's concern..."
                      value={concern}
                      onChange={(e) => setConcern(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expectation-create">Expectation *</Label>
                    <Textarea
                      id="expectation-create"
                      placeholder="Enter customer's expectation..."
                      value={expectation}
                      onChange={(e) => setExpectation(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="budget-create">Budget *</Label>
                    <Input
                      id="budget-create"
                      placeholder="Enter budget amount..."
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="suggested-service-create">Service/Product *</Label>
                    <Popover open={openSuggestedServiceCombo} onOpenChange={setOpenSuggestedServiceCombo}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openSuggestedServiceCombo}
                          className="w-full justify-between"
                          disabled={!selectedBranch}
                        >
                          {suggestedService
                            ? branchServices?.find((service) => service.id === suggestedService)?.name
                            : "Select service..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
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
                                    setSuggestedService(service.id);
                                    setSuggestedServiceDetails({
                                      price: service.price,
                                      treatments: service.number_of_treatments || 0
                                    });
                                    setOpenSuggestedServiceCombo(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      suggestedService === service.id ? "opacity-100" : "opacity-0"
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

                  {suggestedServiceDetails && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Price</Label>
                        <Input
                          value={suggestedServiceDetails.price}
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Number of Treatments</Label>
                        <Input
                          value={suggestedServiceDetails.treatments || 'N/A'}
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="additional-suggested-service-create">Additional Suggested Service</Label>
                    <Popover open={openAdditionalServiceCombo} onOpenChange={setOpenAdditionalServiceCombo}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openAdditionalServiceCombo}
                          className="w-full justify-between"
                          disabled={!selectedBranch}
                        >
                          {additionalSuggestedService
                            ? branchServices?.find((service) => service.id === additionalSuggestedService)?.name
                            : "Select service (optional)..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
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
                                    setAdditionalSuggestedService(service.id);
                                    setOpenAdditionalServiceCombo(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      additionalSuggestedService === service.id ? "opacity-100" : "opacity-0"
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
                    <Label htmlFor="additional-notes-create">Additional Notes</Label>
                    <Textarea
                      id="additional-notes-create"
                      placeholder="Enter any additional notes..."
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {/* Follow-up session specific fields */}
              {customerType === 'followup' && (
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-semibold text-sm">Follow-up Session Details</h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="concurrent-service-create">Concurrent Service *</Label>
                    <Popover open={openConcurrentServiceCombo} onOpenChange={setOpenConcurrentServiceCombo}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openConcurrentServiceCombo}
                          className="w-full justify-between"
                          disabled={!selectedBranch}
                        >
                          {concurrentService
                            ? branchServices?.find((service) => service.id === concurrentService)?.name
                            : "Select service..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
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
                                    setConcurrentService(service.id);
                                    setConcurrentServiceDetails({
                                      price: service.price,
                                      treatments: service.number_of_treatments || 0
                                    });
                                    setOpenConcurrentServiceCombo(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      concurrentService === service.id ? "opacity-100" : "opacity-0"
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

                  {concurrentServiceDetails && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Price</Label>
                        <Input
                          value={concurrentServiceDetails.price}
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Number of Treatments</Label>
                        <Input
                          value={concurrentServiceDetails.treatments || 'N/A'}
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="session-number-create">Session Number *</Label>
                    <Input
                      id="session-number-create"
                      placeholder="Enter session number..."
                      value={sessionNumber}
                      onChange={(e) => setSessionNumber(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateCustomerModalOpen(false);
                setFirstName('');
                setLastName('');
                setPhone('');
                setEmail('');
                setAddress('');
                setCustomerType('');
                setSelectedBranch('');
                setAppointmentDate(undefined);
                setAppointmentTimeSlot('');
                setConcern('');
                setExpectation('');
                setBudget('');
                setSuggestedService('');
                setSuggestedServiceDetails(null);
                setAdditionalSuggestedService('');
                setAdditionalNotes('');
                setConcurrentService('');
                setConcurrentServiceDetails(null);
                setSessionNumber('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createCustomerMutation.mutate()}
              disabled={
                !firstName ||
                !lastName ||
                !phone ||
                !customerType ||
                !selectedBranch ||
                !appointmentDate ||
                !appointmentTimeSlot ||
                createCustomerMutation.isPending ||
                (customerType === 'consultation' && (!concern || !expectation || !budget || !suggestedService)) ||
                (customerType === 'followup' && (!concurrentService || !sessionNumber))
              }
            >
              Create Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call Modal for Existing Customer Lead */}
      <Dialog open={isCallModalOpen} onOpenChange={setIsCallModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Process Lead Call - Set Appointment (L6)
            </DialogTitle>
            <DialogDescription>
              Update the lead status to L6 and create an appointment
            </DialogDescription>
          </DialogHeader>

          {callLead && (
            <div className="space-y-6">
              {/* Customer Details */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-semibold text-sm mb-3">Customer Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Name:</span>
                    <p className="text-muted-foreground">{callLead.first_name} {callLead.last_name}</p>
                  </div>
                  <div>
                    <span className="font-medium">Phone:</span>
                    <p className="text-muted-foreground font-mono">{(callLead as any).phone}</p>
                  </div>
                  <div>
                    <span className="font-medium">Current Status:</span>
                    <Badge className={getStatusColor(callLead.status)}>{callLead.status}</Badge>
                  </div>
                  <div>
                    <span className="font-medium">Service/Product:</span>
                    <p className="text-muted-foreground">{callLead.service_product || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Appointment Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="call-customer-type">Type of Customer *</Label>
                  <Select value={callCustomerType} onValueChange={(value) => setCallCustomerType(value as 'consultation' | 'followup')}>
                    <SelectTrigger id="call-customer-type">
                      <SelectValue placeholder="Select customer type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consultation">Consultation needed</SelectItem>
                      <SelectItem value="followup">Follow up sessions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="call-branch">Branch *</Label>
                  <Select 
                    value={callSelectedBranch} 
                    onValueChange={(value) => {
                      setCallSelectedBranch(value);
                      setCallAppointmentDate(undefined);
                      setCallAppointmentTimeSlot('');
                    }}
                  >
                    <SelectTrigger id="call-branch">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches?.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="call-appointment-date">Appointment Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="call-appointment-date"
                        variant="outline"
                        disabled={!callSelectedBranch}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !callAppointmentDate && "text-muted-foreground",
                          !callSelectedBranch && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {callAppointmentDate ? format(callAppointmentDate, 'PPP') : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={callAppointmentDate}
                        onSelect={(date) => {
                          setCallAppointmentDate(date);
                          setCallAppointmentTimeSlot('');
                        }}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="call-appointment-time">Appointment Time *</Label>
                  <Select 
                    value={callAppointmentTimeSlot} 
                    onValueChange={setCallAppointmentTimeSlot}
                    disabled={!callSelectedBranch || !callAppointmentDate}
                  >
                    <SelectTrigger 
                      id="call-appointment-time"
                      className={cn(
                        (!callSelectedBranch || !callAppointmentDate) && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <SelectValue placeholder="Select time slot" />
                    </SelectTrigger>
                    <SelectContent>
                      {callAvailableTimeSlots && callAvailableTimeSlots.length > 0 ? (
                        callAvailableTimeSlots.map((slot) => (
                          <SelectItem key={slot.id} value={slot.id}>
                            {slot.slot_time} ({slot.max_capacity - (slot.booked_count || 0)} slots available)
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-slots" disabled>
                          No available slots
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Consultation specific fields */}
                {callCustomerType === 'consultation' && (
                  <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold text-sm">Consultation Details</h4>
                    
                    <div className="space-y-2">
                      <Label htmlFor="call-concern">Concern *</Label>
                      <Textarea
                        id="call-concern"
                        placeholder="Enter customer's concern..."
                        value={callConcern}
                        onChange={(e) => setCallConcern(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="call-expectation">Expectation *</Label>
                      <Textarea
                        id="call-expectation"
                        placeholder="Enter customer's expectation..."
                        value={callExpectation}
                        onChange={(e) => setCallExpectation(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="call-budget">Budget *</Label>
                      <Input
                        id="call-budget"
                        placeholder="Enter budget..."
                        value={callBudget}
                        onChange={(e) => setCallBudget(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="call-suggested-service">Suggested Service *</Label>
                      <Popover open={openCallSuggestedServiceCombo} onOpenChange={setOpenCallSuggestedServiceCombo}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openCallSuggestedServiceCombo}
                            className="w-full justify-between"
                            disabled={!callSelectedBranch}
                          >
                            {callSuggestedService
                              ? callBranchServices?.find((service) => service.id === callSuggestedService)?.name
                              : "Select service..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search service..." />
                            <CommandList>
                              <CommandEmpty>No service found.</CommandEmpty>
                              <CommandGroup>
                                {callBranchServices?.map((service) => (
                                  <CommandItem
                                    key={service.id}
                                    value={service.name}
                                    onSelect={() => {
                                      setCallSuggestedService(service.id);
                                      setCallSuggestedServiceDetails({
                                        price: service.price,
                                        treatments: service.number_of_treatments || 0
                                      });
                                      setOpenCallSuggestedServiceCombo(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        callSuggestedService === service.id ? "opacity-100" : "opacity-0"
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

                    {callSuggestedServiceDetails && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Price</Label>
                          <Input
                            value={callSuggestedServiceDetails.price}
                            readOnly
                            className="bg-muted"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Number of Treatments</Label>
                          <Input
                            value={callSuggestedServiceDetails.treatments || 'N/A'}
                            readOnly
                            className="bg-muted"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="call-additional-suggested-service">Additional Suggested Service</Label>
                      <Popover open={openCallAdditionalServiceCombo} onOpenChange={setOpenCallAdditionalServiceCombo}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openCallAdditionalServiceCombo}
                            className="w-full justify-between"
                            disabled={!callSelectedBranch}
                          >
                            {callAdditionalSuggestedService
                              ? callBranchServices?.find((service) => service.id === callAdditionalSuggestedService)?.name
                              : "Select service (optional)..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search service..." />
                            <CommandList>
                              <CommandEmpty>No service found.</CommandEmpty>
                              <CommandGroup>
                                {callBranchServices?.map((service) => (
                                  <CommandItem
                                    key={service.id}
                                    value={service.name}
                                    onSelect={() => {
                                      setCallAdditionalSuggestedService(service.id);
                                      setOpenCallAdditionalServiceCombo(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        callAdditionalSuggestedService === service.id ? "opacity-100" : "opacity-0"
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
                      <Label htmlFor="call-additional-notes">Additional Notes</Label>
                      <Textarea
                        id="call-additional-notes"
                        placeholder="Enter any additional notes..."
                        value={callAdditionalNotes}
                        onChange={(e) => setCallAdditionalNotes(e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>
                )}

                {/* Follow-up session specific fields */}
                {callCustomerType === 'followup' && (
                  <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold text-sm">Follow-up Session Details</h4>
                    
                    <div className="space-y-2">
                      <Label htmlFor="call-concurrent-service">Concurrent Service *</Label>
                      <Popover open={openCallConcurrentServiceCombo} onOpenChange={setOpenCallConcurrentServiceCombo}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openCallConcurrentServiceCombo}
                            className="w-full justify-between"
                            disabled={!callSelectedBranch}
                          >
                            {callConcurrentService
                              ? callBranchServices?.find((service) => service.id === callConcurrentService)?.name
                              : "Select service..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search service..." />
                            <CommandList>
                              <CommandEmpty>No service found.</CommandEmpty>
                              <CommandGroup>
                                {callBranchServices?.map((service) => (
                                  <CommandItem
                                    key={service.id}
                                    value={service.name}
                                    onSelect={() => {
                                      setCallConcurrentService(service.id);
                                      setCallConcurrentServiceDetails({
                                        price: service.price,
                                        treatments: service.number_of_treatments || 0
                                      });
                                      setOpenCallConcurrentServiceCombo(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        callConcurrentService === service.id ? "opacity-100" : "opacity-0"
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

                    {callConcurrentServiceDetails && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Price</Label>
                          <Input
                            value={callConcurrentServiceDetails.price}
                            readOnly
                            className="bg-muted"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Number of Treatments</Label>
                          <Input
                            value={callConcurrentServiceDetails.treatments || 'N/A'}
                            readOnly
                            className="bg-muted"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="call-session-number">Session Number *</Label>
                      <Input
                        id="call-session-number"
                        placeholder="Enter session number..."
                        value={callSessionNumber}
                        onChange={(e) => setCallSessionNumber(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCallModalOpen(false);
                setCallLead(null);
                setCallCustomerType('');
                setCallSelectedBranch('');
                setCallAppointmentDate(undefined);
                setCallAppointmentTimeSlot('');
                setCallConcern('');
                setCallExpectation('');
                setCallBudget('');
                setCallSuggestedService('');
                setCallSuggestedServiceDetails(null);
                setCallAdditionalSuggestedService('');
                setCallAdditionalNotes('');
                setCallConcurrentService('');
                setCallConcurrentServiceDetails(null);
                setCallSessionNumber('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => processLeadCallMutation.mutate()}
              disabled={
                !callCustomerType ||
                !callSelectedBranch ||
                !callAppointmentDate ||
                !callAppointmentTimeSlot ||
                processLeadCallMutation.isPending ||
                (callCustomerType === 'consultation' && (!callConcern || !callExpectation || !callBudget || !callSuggestedService)) ||
                (callCustomerType === 'followup' && (!callConcurrentService || !callSessionNumber))
              }
            >
              Set Appointment (L6)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
