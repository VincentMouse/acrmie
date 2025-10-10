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
import { Calendar, Phone, Edit2 } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function AppointmentManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [notes, setNotes] = useState('');
  
  // Modal state for call processing
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    customerName: '',
    phone: '',
    branch: '',
    appointmentDate: '',
    appointmentTime: '',
    service: '',
    notes: '',
    status: ''
  });

  const { data: appointments, isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          lead:leads(
            first_name, 
            last_name, 
            phone, 
            marketer_name,
            assigned_to,
            tele_sales:profiles!leads_assigned_to_fkey(full_name)
          ),
          branch:branches(name),
          time_slot:time_slots(slot_date, slot_time),
          assigned:profiles!appointments_assigned_to_fkey(full_name)
        `)
        .order('appointment_date', { ascending: true });

      if (error) throw error;
      
      // Fetch processing user details separately
      if (data && data.length > 0) {
        const processingUserIds = data
          .filter(apt => apt.processing_by)
          .map(apt => apt.processing_by);
        
        if (processingUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', processingUserIds);
          
          // Map processing user names to appointments
          return data.map(apt => ({
            ...apt,
            processing: profiles?.find(p => p.id === apt.processing_by)
          }));
        }
      }
      
      return data;
    },
  });

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

  const claimAppointmentMutation = useMutation({
    mutationFn: async (appointment: any) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Use a transaction-like update with WHERE clause to handle race conditions
      const { data, error } = await supabase
        .from('appointments')
        .update({
          processing_by: user.id,
          processing_at: new Date().toISOString(),
        })
        .eq('id', appointment.id)
        .is('processing_by', null) // Only update if not already claimed
        .select()
        .single();

      if (error) throw error;
      
      // If no data returned, someone else claimed it first
      if (!data) {
        throw new Error('RACE_CONDITION');
      }

      return { data, appointment };
    },
    onSuccess: ({ appointment }) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({
        title: 'Call started',
        description: 'You are now processing this appointment',
      });
      
      // Open the call modal with appointment details
      const serviceName = appointment.notes?.match(/Suggested Service: ([^\n]+)|Concurrent service: ([^\n]+)/)?.[1] || 
                         appointment.notes?.match(/Suggested Service: ([^\n]+)|Concurrent service: ([^\n]+)/)?.[2] || '-';
      
      setSelectedAppointment(appointment);
      setEditValues({
        customerName: `${appointment.lead?.first_name || ''} ${appointment.lead?.last_name || ''}`,
        phone: appointment.lead?.phone || '',
        branch: appointment.branch?.name || '',
        appointmentDate: appointment.time_slot?.slot_date 
          ? format(new Date(appointment.time_slot.slot_date), 'yyyy-MM-dd')
          : format(new Date(appointment.appointment_date), 'yyyy-MM-dd'),
        appointmentTime: appointment.time_slot?.slot_time || format(new Date(appointment.appointment_date), 'HH:mm'),
        service: serviceName,
        notes: appointment.notes || '',
        status: appointment.confirmation_status || 'pending'
      });
      setIsCallModalOpen(true);
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

  const createAppointmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

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
      setIsOpen(false);
      setSelectedLead(null);
      setAppointmentDate('');
      setNotes('');
    },
  });

  const clearAllProcessingMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('appointments')
        .update({
          processing_by: null,
          processing_at: null,
        })
        .not('processing_by', 'is', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({
        title: 'All processing states cleared',
        description: 'All appointments are now available for processing',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to clear processing states',
        variant: 'destructive',
      });
    },
  });

  const handleCreateAppointment = (e: React.FormEvent) => {
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
      notes,
    });
  };

  const getDaysUntilAppointment = (date: string) => {
    return differenceInDays(new Date(date), new Date());
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading appointments...</div>;
  }

  const upcomingAppointments = appointments?.filter(apt => 
    new Date(apt.appointment_date) >= new Date() && !apt.is_completed
  );

  const tomorrowAppointments = upcomingAppointments?.filter(apt => 
    getDaysUntilAppointment(apt.appointment_date) === 1
  );

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Appointment Management</h2>
          <p className="text-muted-foreground mt-1">
            Schedule and manage appointments for status 6 leads
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={() => clearAllProcessingMutation.mutate()}
            disabled={clearAllProcessingMutation.isPending}
          >
            Reset All Processing (Test)
          </Button>
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
            
            <form onSubmit={handleCreateAppointment} className="space-y-4">
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
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
      </div>

      {tomorrowAppointments && tomorrowAppointments.length > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
            ⚠️ Appointments Tomorrow ({tomorrowAppointments.length})
          </h3>
          <div className="space-y-2">
            {tomorrowAppointments.map((apt) => (
              <div key={apt.id} className="text-sm">
                {apt.lead?.first_name} {apt.lead?.last_name} - {format(new Date(apt.appointment_date), 'h:mm a')}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer Name</TableHead>
              <TableHead>Phone Number</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Appointment Date</TableHead>
              <TableHead>Appointment Time</TableHead>
              <TableHead>Service/Product</TableHead>
              <TableHead>Tele Sale Name</TableHead>
              <TableHead>Marketer Name</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Confirmation Status</TableHead>
              <TableHead>Assigned To</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {upcomingAppointments?.map((appointment) => {
              const daysUntil = getDaysUntilAppointment(appointment.appointment_date);
              
              // Extract service/product name from notes (it's stored in the format that includes service details)
              const serviceMatch = appointment.notes?.match(/Suggested Service: ([^\n]+)|Concurrent service: ([^\n]+)/);
              const serviceName = serviceMatch ? (serviceMatch[1] || serviceMatch[2]) : '-';
              
              return (
                <TableRow key={appointment.id}>
                  <TableCell className="font-medium">
                    {appointment.lead?.first_name} {appointment.lead?.last_name}
                  </TableCell>
                  <TableCell>{appointment.lead?.phone || '-'}</TableCell>
                  <TableCell>{appointment.branch?.name || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {appointment.time_slot?.slot_date 
                        ? format(new Date(appointment.time_slot.slot_date), 'PPP')
                        : format(new Date(appointment.appointment_date), 'PPP')}
                      {daysUntil === 0 && (
                        <Badge variant="destructive">Today</Badge>
                      )}
                      {daysUntil === 1 && (
                        <Badge variant="default">Tomorrow</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {appointment.time_slot?.slot_time 
                      ? appointment.time_slot.slot_time 
                      : format(new Date(appointment.appointment_date), 'p')}
                  </TableCell>
                  <TableCell>{serviceName}</TableCell>
                  <TableCell>{appointment.lead?.tele_sales?.full_name || '-'}</TableCell>
                  <TableCell>{appointment.lead?.marketer_name || '-'}</TableCell>
                  <TableCell className="max-w-xs">
                    <div className="truncate" title={appointment.notes || ''}>
                      {appointment.notes || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={appointment.confirmation_status === 'confirmed' ? 'default' : 'secondary'}>
                      {appointment.confirmation_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {appointment.processing_by ? (
                      <Badge variant="default">
                        Processing by {(appointment as any).processing?.full_name || 'Unknown'}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => claimAppointmentMutation.mutate(appointment)}
                        disabled={claimAppointmentMutation.isPending}
                      >
                        <Phone className="w-4 h-4 mr-2" />
                        Call
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Call Processing Modal */}
      <Dialog open={isCallModalOpen} onOpenChange={setIsCallModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Process Appointment Call</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Customer Name */}
            <div className="flex items-center gap-2">
              <Label className="w-40">Customer Name:</Label>
              {editingField === 'customerName' ? (
                <Input
                  value={editValues.customerName}
                  onChange={(e) => setEditValues({ ...editValues, customerName: e.target.value })}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                />
              ) : (
                <>
                  <span className="flex-1">{editValues.customerName}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingField('customerName')}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Phone Number */}
            <div className="flex items-center gap-2">
              <Label className="w-40">Phone Number:</Label>
              {editingField === 'phone' ? (
                <Input
                  value={editValues.phone}
                  onChange={(e) => setEditValues({ ...editValues, phone: e.target.value })}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                />
              ) : (
                <>
                  <span className="flex-1">{editValues.phone}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingField('phone')}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Branch */}
            <div className="flex items-center gap-2">
              <Label className="w-40">Branch:</Label>
              {editingField === 'branch' ? (
                <Input
                  value={editValues.branch}
                  onChange={(e) => setEditValues({ ...editValues, branch: e.target.value })}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                />
              ) : (
                <>
                  <span className="flex-1">{editValues.branch}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingField('branch')}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Appointment Date */}
            <div className="flex items-center gap-2">
              <Label className="w-40">Appointment Date:</Label>
              {editingField === 'appointmentDate' ? (
                <Input
                  type="date"
                  value={editValues.appointmentDate}
                  onChange={(e) => setEditValues({ ...editValues, appointmentDate: e.target.value })}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                />
              ) : (
                <>
                  <span className="flex-1">{editValues.appointmentDate}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingField('appointmentDate')}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Appointment Time */}
            <div className="flex items-center gap-2">
              <Label className="w-40">Appointment Time:</Label>
              {editingField === 'appointmentTime' ? (
                <Input
                  type="time"
                  value={editValues.appointmentTime}
                  onChange={(e) => setEditValues({ ...editValues, appointmentTime: e.target.value })}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                />
              ) : (
                <>
                  <span className="flex-1">{editValues.appointmentTime}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingField('appointmentTime')}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Service/Product */}
            <div className="flex items-center gap-2">
              <Label className="w-40">Service/Product:</Label>
              {editingField === 'service' ? (
                <Input
                  value={editValues.service}
                  onChange={(e) => setEditValues({ ...editValues, service: e.target.value })}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                />
              ) : (
                <>
                  <span className="flex-1">{editValues.service}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingField('service')}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Notes */}
            <div className="flex items-start gap-2">
              <Label className="w-40 mt-2">Notes:</Label>
              {editingField === 'notes' ? (
                <Textarea
                  value={editValues.notes}
                  onChange={(e) => setEditValues({ ...editValues, notes: e.target.value })}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                  rows={3}
                  className="flex-1"
                />
              ) : (
                <>
                  <span className="flex-1 whitespace-pre-wrap">{editValues.notes}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingField('notes')}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <Label className="w-40">Status:</Label>
              <Select value={editValues.status} onValueChange={(value) => setEditValues({ ...editValues, status: value })}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">C0: Pending</SelectItem>
                  <SelectItem value="no_answer">C1: No Answer</SelectItem>
                  <SelectItem value="reschedule">C2: Appointment reschedule</SelectItem>
                  <SelectItem value="cancelled">C3: Cancel appointment</SelectItem>
                  <SelectItem value="confirmed">C6: Confirmed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setIsCallModalOpen(false)}>
                Close
              </Button>
              <Button onClick={() => {
                // TODO: Save changes
                toast({
                  title: 'Changes saved',
                  description: 'Appointment details updated successfully',
                });
                setIsCallModalOpen(false);
              }}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
