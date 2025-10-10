import { useState } from 'react';
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
import { Calendar, Phone, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function AppointmentManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  // Schedule appointment modal
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  
  // Call processing modal
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [callAppointment, setCallAppointment] = useState<any>(null);
  const [callStatus, setCallStatus] = useState('');
  
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
          time_slot:time_slots(slot_date, slot_time),
          assigned:profiles!appointments_assigned_to_fkey(full_name),
          processing:profiles!appointments_processing_by_fkey(full_name)
        `)
        .order('appointment_date', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

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
      
      // Extract service name from notes
      const serviceName = appointment.lead?.service_product || '-';
      
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
              const isProcessing = !!appointment.processing_by;
              const serviceName = appointment.lead?.service_product || '-';
              
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
                      appointment.assigned?.full_name || '-'
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
      <Dialog open={isCallModalOpen} onOpenChange={setIsCallModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Appointment Call</DialogTitle>
          </DialogHeader>
          
          {callAppointment && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="font-medium">Customer:</span>
                  <span>{callAppointment.lead?.first_name} {callAppointment.lead?.last_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Phone:</span>
                  <span>{callAppointment.lead?.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Service:</span>
                  <span>{callAppointment.lead?.service_product || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Branch:</span>
                  <span>{callAppointment.branch?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Date/Time:</span>
                  <span>
                    {format(new Date(callAppointment.appointment_date), 'PPP p')}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Update Confirmation Status *</Label>
                <Select value={callStatus} onValueChange={setCallStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">C0: Pending</SelectItem>
                    <SelectItem value="no_answer">C1: No Answer</SelectItem>
                    <SelectItem value="reschedule">C2: Reschedule</SelectItem>
                    <SelectItem value="cancelled">C3: Cancelled</SelectItem>
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
                    <p className="font-medium">{viewAppointment.lead?.service_product || '-'}</p>
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
