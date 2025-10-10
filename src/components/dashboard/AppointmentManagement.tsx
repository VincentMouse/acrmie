import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar, Phone, Eye, Check, ChevronsUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

export function AppointmentManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const STALE_MS = 5 * 60 * 1000;
  
  // Schedule appointment modal
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  
  // Call processing modal
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [callAppointment, setCallAppointment] = useState<any>(null);
  const [callStatus, setCallStatus] = useState('');
  
  const [editableFields, setEditableFields] = useState({
    customerName: '',
    phone: '',
    branchId: '',
    appointmentDate: '',
    appointmentTime: '',
    serviceProduct: '',
    notes: ''
  });
  
  const [fieldEditStates, setFieldEditStates] = useState({
    customerName: false,
    phone: false,
    branch: false,
    appointmentDate: false,
    appointmentTime: false,
    serviceProduct: false,
    notes: false
  });

  const [openServiceCombo, setOpenServiceCombo] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [serviceDetails, setServiceDetails] = useState<{price: number, treatments: number} | null>(null);
  
  // View modal
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewAppointment, setViewAppointment] = useState<any>(null);
  const [bookingId, setBookingId] = useState('');

  // Fetch appointments with related data
  const { data: appointments, isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          lead:leads(first_name, last_name, phone, service_product, notes),
          branch:branches(name),
          time_slot:time_slots(slot_date, slot_time)
        `)
        .order('appointment_date', { ascending: true });

      if (error) throw error;
      
      // Manually fetch profile data for assigned_to and processing_by
      if (data && data.length > 0) {
        const userIds = [...new Set([
          ...data.map(a => a.assigned_to).filter(Boolean),
          ...data.map(a => a.processing_by).filter(Boolean)
        ])];
        
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);
          
          const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
          
          return data.map(appointment => ({
            ...appointment,
            assigned: appointment.assigned_to ? profileMap.get(appointment.assigned_to) : null,
            processing: appointment.processing_by ? profileMap.get(appointment.processing_by) : null
          }));
        }
      }
      
      return data;
    },
  });

  // Fetch all services/products for name resolution
  const { data: allServices } = useQuery({
    queryKey: ['services-products-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services_products')
        .select('id, name');
      if (error) throw error;
      return data || [];
    },
  });

  const servicesMap = new Map((allServices || []).map((s: any) => [s.id, s.name]));

  // Fetch status 6 leads for scheduling
  const { data: status6Leads } = useQuery({
    queryKey: ['status-6-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('status', 'status_6')
        .is('assigned_to', null);

      if (error) throw error;
      return data;
    },
  });

  // Fetch branches for dropdown
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

  // Fetch services/products for selected branch
  const { data: branchServices } = useQuery({
    queryKey: ['branch-services', editableFields.branchId],
    queryFn: async () => {
      if (!editableFields.branchId) return [];
      
      const { data, error } = await supabase
        .from('services_products')
        .select('*')
        .eq('branch_id', editableFields.branchId)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!editableFields.branchId,
  });
  // Claim appointment for processing
  const claimAppointmentMutation = useMutation({
    mutationFn: async (appointment: any) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('appointments')
        .update({
          processing_by: user.id,
          processing_at: new Date().toISOString(),
        })
        .eq('id', appointment.id)
        .is('processing_by', null)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('RACE_CONDITION');

      return { data, appointment };
    },
    onSuccess: ({ appointment }) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      
      // Initialize editable fields
      setEditableFields({
        customerName: `${appointment.lead?.first_name || ''} ${appointment.lead?.last_name || ''}`.trim(),
        phone: appointment.lead?.phone || '',
        branchId: appointment.branch_id || '',
        appointmentDate: format(new Date(appointment.appointment_date), 'yyyy-MM-dd'),
        appointmentTime: format(new Date(appointment.appointment_date), 'HH:mm'),
        serviceProduct: appointment.service_product || '',
        notes: appointment.notes || ''
      });
      
      // Reset all edit states to locked
      setFieldEditStates({
        customerName: false,
        phone: false,
        branch: false,
        appointmentDate: false,
        appointmentTime: false,
        serviceProduct: false,
        notes: false
      });
      
      setCallAppointment(appointment);
      setCallStatus(appointment.confirmation_status || 'pending');
      setIsCallModalOpen(true);
      
      toast({
        title: 'Call started',
        description: 'You are now processing this appointment',
      });
    },
    onError: (error: any) => {
      if (error.message === 'RACE_CONDITION') {
        toast({
          title: 'Already claimed',
          description: 'Another CS is already processing this appointment',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to claim appointment',
          variant: 'destructive',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  // Release appointment when call is abandoned
  const releaseAppointmentMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const { error } = await supabase
        .from('appointments')
        .update({
          processing_by: null,
          processing_at: null,
        })
        .eq('id', appointmentId)
        .eq('processing_by', user?.id); // Only release if still assigned to current user

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  // Finish call and update status
  const finishCallMutation = useMutation({
    mutationFn: async ({ appointmentId, status }: { appointmentId: string; status: string }) => {
      const { error } = await supabase
        .from('appointments')
        .update({
          confirmation_status: status,
          processing_by: null,
          processing_at: null,
        })
        .eq('id', appointmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setIsCallModalOpen(false);
      setCallAppointment(null);
      setCallStatus('');
      
      toast({
        title: 'Call completed',
        description: 'Appointment status updated successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update appointment status',
        variant: 'destructive',
      });
    },
  });

  // Register appointment with booking ID
  const registerAppointmentMutation = useMutation({
    mutationFn: async ({ appointmentId, bookingId }: { appointmentId: string; bookingId: string }) => {
      const { error } = await supabase
        .from('appointments')
        .update({ booking_id: bookingId })
        .eq('id', appointmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setIsViewModalOpen(false);
      setViewAppointment(null);
      setBookingId('');
      
      toast({
        title: 'Appointment registered',
        description: 'Booking ID has been saved successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to register appointment',
        variant: 'destructive',
      });
    },
  });

  // Create new appointment
  const createAppointmentMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase.from('appointments').insert([{
        lead_id: data.leadId,
        assigned_to: user.id,
        appointment_date: data.appointmentDate,
        notes: data.notes,
        created_by: user.id,
      }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({ 
        title: 'Appointment created',
        description: 'New appointment has been scheduled',
      });
      setIsScheduleOpen(false);
      setSelectedLead(null);
      setAppointmentDate('');
      setScheduleNotes('');
    },
  });

  const handleScheduleAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedLead || !appointmentDate) {
      toast({
        title: 'Validation error',
        description: 'Please select a lead and appointment date',
        variant: 'destructive',
      });
      return;
    }

    createAppointmentMutation.mutate({
      leadId: selectedLead.id,
      appointmentDate,
      notes: scheduleNotes,
    });
  };

  const handleFinishCall = () => {
    if (!callAppointment || !callStatus) {
      toast({
        title: 'Validation error',
        description: 'Please select a confirmation status',
        variant: 'destructive',
      });
      return;
    }

    finishCallMutation.mutate({
      appointmentId: callAppointment.id,
      status: callStatus,
    });
  };

  const handleCallModalClose = (open: boolean) => {
    if (!open && callAppointment && !finishCallMutation.isPending) {
      // Modal is being closed without finishing the call - release the appointment
      releaseAppointmentMutation.mutate(callAppointment.id);
      setCallAppointment(null);
      setCallStatus('');
      // Reset service selection states
      setSelectedServiceId('');
      setServiceDetails(null);
      setOpenServiceCombo(false);
    }
    setIsCallModalOpen(open);
  };

  // Heartbeat to keep the lock fresh while call modal is open
  useEffect(() => {
    if (!isCallModalOpen || !callAppointment?.id || !user?.id) return;
    const interval = setInterval(async () => {
      try {
        await supabase
          .from('appointments')
          .update({ processing_at: new Date().toISOString() })
          .eq('id', callAppointment.id)
          .eq('processing_by', user.id);
      } catch (e) {
        // noop
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isCallModalOpen, callAppointment?.id, user?.id]);

  // Cleanup any of my own stale locks on mount
  useEffect(() => {
    if (!user?.id) return;
    const threshold = new Date(Date.now() - STALE_MS).toISOString();
    supabase
      .from('appointments')
      .update({ processing_by: null, processing_at: null })
      .lt('processing_at', threshold)
      .eq('processing_by', user.id);
  }, [user?.id]);
  const handleRegisterAppointment = () => {
    if (!viewAppointment || !bookingId.trim()) {
      toast({
        title: 'Validation error',
        description: 'Please enter a booking ID',
        variant: 'destructive',
      });
      return;
    }

    registerAppointmentMutation.mutate({
      appointmentId: viewAppointment.id,
      bookingId: bookingId.trim(),
    });
  };

  const handleViewAppointment = (appointment: any) => {
    setViewAppointment(appointment);
    setBookingId(appointment.booking_id || '');
    setIsViewModalOpen(true);
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading appointments...</div>;
  }

  const upcomingAppointments = appointments?.filter(apt => 
    new Date(apt.appointment_date) >= new Date() && !apt.is_completed
  );

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Appointment Management</h2>
          <p className="text-muted-foreground mt-1">
            Manage customer appointments and confirmation
          </p>
        </div>
        
        <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
          <DialogTrigger asChild>
            <Button>
              <Calendar className="w-4 h-4 mr-2" />
              Schedule Appointment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule New Appointment</DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleScheduleAppointment} className="space-y-4">
              <div className="space-y-2">
                <Label>Select Lead (Status 6) *</Label>
                <select
                  className="w-full p-2 border rounded"
                  value={selectedLead?.id || ''}
                  onChange={(e) => {
                    const lead = status6Leads?.find(l => l.id === e.target.value);
                    setSelectedLead(lead);
                  }}
                  required
                >
                  <option value="">Select a lead...</option>
                  {status6Leads?.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.first_name} {lead.last_name} - {lead.phone}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointmentDate">Appointment Date & Time *</Label>
                <Input
                  id="appointmentDate"
                  type="datetime-local"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduleNotes">Notes</Label>
                <Textarea
                  id="scheduleNotes"
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  placeholder="Add any notes about the appointment..."
                />
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={createAppointmentMutation.isPending}
              >
                {createAppointmentMutation.isPending ? 'Scheduling...' : 'Schedule Appointment'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer Name</TableHead>
              <TableHead>Service/Product</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Appointment Date</TableHead>
              <TableHead>Appointment Time</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Confirmation Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {upcomingAppointments?.map((appointment) => {
              const isRegistered = !!appointment.booking_id;
              const isStale = appointment.processing_at ? (new Date(appointment.processing_at).getTime() < Date.now() - STALE_MS) : false;
              const isProcessing = !!appointment.processing_by && !isStale;
              const serviceName = servicesMap.get(appointment.service_product) || appointment.service_product || '-';
              
              return (
                <TableRow 
                  key={appointment.id}
                  className={isRegistered ? 'bg-green-50 dark:bg-green-950/20' : ''}
                >
                  <TableCell className="font-medium">
                    {appointment.lead?.first_name} {appointment.lead?.last_name}
                  </TableCell>
                  <TableCell>{serviceName}</TableCell>
                  <TableCell>{appointment.branch?.name || '-'}</TableCell>
                  <TableCell>
                    {appointment.time_slot?.slot_date 
                      ? format(new Date(appointment.time_slot.slot_date), 'PPP')
                      : format(new Date(appointment.appointment_date), 'PPP')}
                  </TableCell>
                  <TableCell>
                    {appointment.time_slot?.slot_time 
                      ? appointment.time_slot.slot_time 
                      : format(new Date(appointment.appointment_date), 'p')}
                  </TableCell>
                  <TableCell>
                    {isProcessing ? (
                      <Badge variant="default">
                        {(appointment as any).processing?.full_name || 'Processing...'}
                      </Badge>
                    ) : (
                      (appointment as any).assigned?.full_name || '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={appointment.confirmation_status === 'confirmed' ? 'default' : 'secondary'}>
                      {appointment.confirmation_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {isProcessing && appointment.processing_by === user?.id ? (
                        <Badge variant="outline">In Call...</Badge>
                      ) : !isProcessing ? (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => claimAppointmentMutation.mutate(appointment)}
                          disabled={claimAppointmentMutation.isPending}
                        >
                          <Phone className="w-4 h-4 mr-2" />
                          Call
                        </Button>
                      ) : (
                        <Badge variant="secondary">Busy</Badge>
                      )}
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewAppointment(appointment)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Call Processing Modal */}
      <Dialog open={isCallModalOpen} onOpenChange={handleCallModalClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Process Appointment Call</DialogTitle>
          </DialogHeader>
          
          {callAppointment && (
            <div className="space-y-4">
              {/* Customer Name */}
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-2">
                  <Label>Customer Name</Label>
                  <Input
                    value={editableFields.customerName}
                    onChange={(e) => setEditableFields(prev => ({ ...prev, customerName: e.target.value }))}
                    disabled={!fieldEditStates.customerName}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-6"
                  onClick={() => setFieldEditStates(prev => ({ ...prev, customerName: !prev.customerName }))}
                >
                  {fieldEditStates.customerName ? "Lock" : "Edit"}
                </Button>
              </div>

              {/* Phone Number */}
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    value={editableFields.phone}
                    onChange={(e) => setEditableFields(prev => ({ ...prev, phone: e.target.value }))}
                    disabled={!fieldEditStates.phone}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-6"
                  onClick={() => setFieldEditStates(prev => ({ ...prev, phone: !prev.phone }))}
                >
                  {fieldEditStates.phone ? "Lock" : "Edit"}
                </Button>
              </div>

              {/* Branch */}
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-2">
                  <Label>Branch</Label>
                  <Select
                    value={editableFields.branchId}
                    onValueChange={(value) => setEditableFields(prev => ({ ...prev, branchId: value }))}
                    disabled={!fieldEditStates.branch}
                  >
                    <SelectTrigger>
                      <SelectValue />
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
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-6"
                  onClick={() => setFieldEditStates(prev => ({ ...prev, branch: !prev.branch }))}
                >
                  {fieldEditStates.branch ? "Lock" : "Edit"}
                </Button>
              </div>

              {/* Appointment Date */}
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-2">
                  <Label>Appointment Date</Label>
                  <Input
                    type="date"
                    value={editableFields.appointmentDate}
                    onChange={(e) => setEditableFields(prev => ({ ...prev, appointmentDate: e.target.value }))}
                    disabled={!fieldEditStates.appointmentDate}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-6"
                  onClick={() => setFieldEditStates(prev => ({ ...prev, appointmentDate: !prev.appointmentDate }))}
                >
                  {fieldEditStates.appointmentDate ? "Lock" : "Edit"}
                </Button>
              </div>

              {/* Appointment Time */}
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-2">
                  <Label>Appointment Time</Label>
                  <Input
                    type="time"
                    value={editableFields.appointmentTime}
                    onChange={(e) => setEditableFields(prev => ({ ...prev, appointmentTime: e.target.value }))}
                    disabled={!fieldEditStates.appointmentTime}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-6"
                  onClick={() => setFieldEditStates(prev => ({ ...prev, appointmentTime: !prev.appointmentTime }))}
                >
                  {fieldEditStates.appointmentTime ? "Lock" : "Edit"}
                </Button>
              </div>

              {/* Service/Product */}
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-2">
                  <Label>Service/Product</Label>
                  {fieldEditStates.serviceProduct ? (
                    <div className="space-y-2">
                      <Popover open={openServiceCombo} onOpenChange={setOpenServiceCombo}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openServiceCombo}
                            className="w-full justify-between"
                            disabled={!editableFields.branchId}
                          >
                            {selectedServiceId
                              ? branchServices?.find((service) => service.id === selectedServiceId)?.name
                              : editableFields.serviceProduct || "Select service..."}
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
                                      setSelectedServiceId(service.id);
                                      setEditableFields(prev => ({ ...prev, serviceProduct: service.name }));
                                      setServiceDetails({
                                        price: service.price,
                                        treatments: service.number_of_treatments || 0
                                      });
                                      setOpenServiceCombo(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedServiceId === service.id ? "opacity-100" : "opacity-0"
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
                      
                      {serviceDetails && (
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Price</Label>
                            <Input
                              value={serviceDetails.price}
                              readOnly
                              className="bg-muted h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Number of Treatments</Label>
                            <Input
                              value={serviceDetails.treatments || 'N/A'}
                              readOnly
                              className="bg-muted h-8 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm">
                      {editableFields.serviceProduct || '-'}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-6"
                  onClick={() => setFieldEditStates(prev => ({ ...prev, serviceProduct: !prev.serviceProduct }))}
                >
                  {fieldEditStates.serviceProduct ? "Lock" : "Edit"}
                </Button>
              </div>

              {/* Notes */}
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={editableFields.notes}
                    onChange={(e) => setEditableFields(prev => ({ ...prev, notes: e.target.value }))}
                    disabled={!fieldEditStates.notes}
                    placeholder="Add notes about the appointment..."
                    rows={3}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-6"
                  onClick={() => setFieldEditStates(prev => ({ ...prev, notes: !prev.notes }))}
                >
                  {fieldEditStates.notes ? "Lock" : "Edit"}
                </Button>
              </div>

              {/* Status */}
              <div className="space-y-2 pt-4 border-t">
                <Label>Status *</Label>
                <Select value={callStatus} onValueChange={setCallStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">C0: Pending</SelectItem>
                    <SelectItem value="no_answer">C1: No Answer</SelectItem>
                    <SelectItem value="rescheduled">C2: Appointment reschedule</SelectItem>
                    <SelectItem value="cancelled">C3: Cancel appointment</SelectItem>
                    <SelectItem value="confirmed">C6: Confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsCallModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleFinishCall}
                  disabled={finishCallMutation.isPending}
                >
                  {finishCallMutation.isPending ? 'Saving...' : 'Finish Call'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Appointment Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
          </DialogHeader>
          
          {viewAppointment && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Customer Information</h3>
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <span className="text-sm text-muted-foreground">Name</span>
                    <p className="font-medium">
                      {viewAppointment.lead?.first_name} {viewAppointment.lead?.last_name}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Phone</span>
                    <p className="font-medium">{viewAppointment.lead?.phone}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Appointment Information</h3>
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <span className="text-sm text-muted-foreground">Service/Product</span>
                    <p className="font-medium">{servicesMap.get(viewAppointment.service_product) || viewAppointment.service_product || '-'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Branch</span>
                    <p className="font-medium">{viewAppointment.branch?.name}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Date</span>
                    <p className="font-medium">
                      {format(new Date(viewAppointment.appointment_date), 'PPP')}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Time</span>
                    <p className="font-medium">
                      {viewAppointment.time_slot?.slot_time || format(new Date(viewAppointment.appointment_date), 'p')}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Confirmation Status</span>
                    <p>
                      <Badge variant={viewAppointment.confirmation_status === 'confirmed' ? 'default' : 'secondary'}>
                        {viewAppointment.confirmation_status}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Assigned To</span>
                    <p className="font-medium">{viewAppointment.assigned?.full_name || '-'}</p>
                  </div>
                </div>
              </div>

              {viewAppointment.notes && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Notes</h3>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{viewAppointment.notes}</p>
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-4 border-t">
                <h3 className="font-semibold text-lg">Clinic Registration</h3>
                {viewAppointment.booking_id ? (
                  <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-muted-foreground">Booking ID</span>
                        <p className="font-medium text-lg">{viewAppointment.booking_id}</p>
                      </div>
                      <Badge variant="default">Registered</Badge>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Register this appointment to the clinic by entering the booking ID
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter booking ID..."
                        value={bookingId}
                        onChange={(e) => setBookingId(e.target.value)}
                      />
                      <Button 
                        onClick={handleRegisterAppointment}
                        disabled={registerAppointmentMutation.isPending}
                      >
                        {registerAppointmentMutation.isPending ? 'Registering...' : 'Register'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4">
                <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
