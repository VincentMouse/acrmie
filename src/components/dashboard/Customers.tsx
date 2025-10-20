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
import { ChevronDown, ChevronRight, Mail, Search, Plus } from 'lucide-react';
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
  const { isTeleSales, isLoading: isRoleLoading } = useUserRole();

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

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', searchQuery, isTeleSales],
    queryFn: async () => {
      // For Tele Sales, only fetch if there's a search query
      if (isTeleSales && !searchQuery) {
        return [];
      }

      let query = supabase
        .from('customers')
        .select('*');

      // If tele sales is searching, filter by exact phone match
      if (isTeleSales && searchQuery) {
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

      {isTeleSales && (
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
                                              {appointment.revenue ? `$${appointment.revenue}` : '-'}
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
    </Card>
  );
}
