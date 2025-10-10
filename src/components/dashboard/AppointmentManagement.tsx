import { useState, useEffect, useRef } from 'react';
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
import { Calendar, Phone, Eye, Check, ChevronsUpDown, Search, Filter, Clock } from 'lucide-react';
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
  
  // State to force re-render when time override changes
  const [, setTimeOverrideTrigger] = useState(0);
  
  // Get effective time (with override support)
  const getEffectiveTime = (): Date => {
    const stored = localStorage.getItem('timeOverride');
    return stored ? new Date(stored) : new Date();
  };
  
  // Search and filter states
  const [searchPhone, setSearchPhone] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterAssignedTo, setFilterAssignedTo] = useState('');
  const [filterConfirmationStatus, setFilterConfirmationStatus] = useState('');
  const [filterRegistrationStatus, setFilterRegistrationStatus] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  
  // Schedule appointment modal
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  
  // Call processing modal
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [callAppointment, setCallAppointment] = useState<any>(null);
  const [callStatus, setCallStatus] = useState('');
  
  // Update modal (post-appointment)
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateAppointment, setUpdateAppointment] = useState<any>(null);
  const [checkInStatus, setCheckInStatus] = useState('');
  const [updateServiceId, setUpdateServiceId] = useState('');
  const [updateRevenue, setUpdateRevenue] = useState('');
  const [noteFromClinic, setNoteFromClinic] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [openUpdateServiceCombo, setOpenUpdateServiceCombo] = useState(false);
  
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

  // Heartbeat and timer refs
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const releaseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Listen for time override changes
  useEffect(() => {
    const handleTimeOverrideChange = () => {
      setTimeOverrideTrigger(prev => prev + 1);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    };

    window.addEventListener('timeOverrideChanged', handleTimeOverrideChange);
    return () => {
      window.removeEventListener('timeOverrideChanged', handleTimeOverrideChange);
    };
  }, [queryClient]);

  // Fetch appointments with related data
  const { data: appointments, isLoading } = useQuery({
    queryKey: ['appointments', searchPhone, filterDate, filterAssignedTo, filterConfirmationStatus, filterRegistrationStatus, filterBranch],
    queryFn: async () => {
      let query = supabase
        .from('appointments')
        .select(`
          *,
          lead:leads(first_name, last_name, phone, service_product, notes),
          branch:branches(name),
          time_slot:time_slots(slot_date, slot_time)
        `);

      // Apply filters
      if (filterDate) {
        query = query.gte('appointment_date', `${filterDate}T00:00:00`)
                     .lt('appointment_date', `${filterDate}T23:59:59`);
      }
      if (filterAssignedTo) {
        query = query.eq('assigned_to', filterAssignedTo);
      }
      if (filterConfirmationStatus) {
        query = query.eq('confirmation_status', filterConfirmationStatus);
      }
      if (filterRegistrationStatus === 'registered') {
        query = query.not('booking_id', 'is', null);
      } else if (filterRegistrationStatus === 'not_registered') {
        query = query.is('booking_id', null);
      }
      if (filterBranch) {
        query = query.eq('branch_id', filterBranch);
      }

      query = query.order('appointment_date', { ascending: true });

      const { data, error } = await query;

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
          
          let filteredData = data.map(appointment => ({
            ...appointment,
            assigned: appointment.assigned_to ? profileMap.get(appointment.assigned_to) : null,
            processing: appointment.processing_by ? profileMap.get(appointment.processing_by) : null
          }));

          // Apply phone search filter (client-side for partial matches)
          if (searchPhone) {
            filteredData = filteredData.filter(appointment => 
              appointment.lead?.phone?.includes(searchPhone)
            );
          }

          return filteredData;
        }
      }
      
      // Apply phone search even if no userIds
      let filteredData = data || [];
      if (searchPhone) {
        filteredData = filteredData.filter(appointment => 
          appointment.lead?.phone?.includes(searchPhone)
        );
      }
      
      return filteredData;
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

  // Fetch all users for filter dropdown
  const { data: allUsers } = useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      
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

      // First check if user already has an appointment in call
      const { data: existingInCall } = await supabase
        .from('appointments')
        .select('id')
        .eq('processing_by', user.id)
        .not('processing_at', 'is', null)
        .maybeSingle();

      if (existingInCall) {
        throw new Error('ALREADY_IN_CALL');
      }

      // Claim the appointment
      const { data, error } = await supabase
        .from('appointments')
        .update({
          assigned_to: user.id,
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
        serviceProduct: servicesMap.get(appointment.service_product) || appointment.service_product || '',
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
      
      // Clear any pending release timer
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
      
      toast({
        title: 'Call started',
        description: 'You are now processing this appointment',
      });
    },
    onError: (error: any) => {
      if (error.message === 'ALREADY_IN_CALL') {
        toast({
          title: 'Already in call',
          description: 'You can only process one appointment at a time. Please finish your current call first.',
          variant: 'destructive',
        });
      } else if (error.message === 'RACE_CONDITION') {
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

  // Refresh heartbeat
  const refreshHeartbeatMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const { error } = await supabase
        .from('appointments')
        .update({
          processing_at: new Date().toISOString(),
        })
        .eq('id', appointmentId)
        .eq('processing_by', user?.id);

      if (error) throw error;
    },
  });

  // Finish call and update status
  const finishCallMutation = useMutation({
    mutationFn: async ({ appointmentId, status }: { appointmentId: string; status: string }) => {
      // Combine appointment date and time
      const combinedDateTime = `${editableFields.appointmentDate}T${editableFields.appointmentTime}:00`;
      
      const { error } = await supabase
        .from('appointments')
        .update({
          confirmation_status: status,
          processing_by: null,
          processing_at: null,
          appointment_date: combinedDateTime,
          branch_id: editableFields.branchId,
          notes: editableFields.notes,
          service_product: selectedServiceId || editableFields.serviceProduct,
        })
        .eq('id', appointmentId);

      if (error) throw error;
      
      // Update lead info if phone or name changed
      if (callAppointment?.lead_id) {
        const nameParts = editableFields.customerName.trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        const { error: leadError } = await supabase
          .from('leads')
          .update({
            first_name: firstName,
            last_name: lastName,
            phone: editableFields.phone,
          })
          .eq('id', callAppointment.lead_id);
        
        if (leadError) throw leadError;
      }
    },
    onSuccess: () => {
      // Clear heartbeat
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      // Clear release timer
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
      
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

  // Update post-appointment results
  const updatePostAppointmentMutation = useMutation({
    mutationFn: async (data: {
      appointmentId: string;
      checkInStatus: string;
      serviceId?: string;
      revenue?: string;
      noteFromClinic?: string;
      rescheduleDate?: string;
      rescheduleTime?: string;
    }) => {
      // If rescheduling, update appointment date and revert to confirmed
      if (data.checkInStatus === 'rescheduled' && data.rescheduleDate && data.rescheduleTime) {
        const combinedDateTime = `${data.rescheduleDate}T${data.rescheduleTime}:00`;
        
        const { error } = await supabase
          .from('appointments')
          .update({
            check_in_status: null,
            check_in_updated_at: null,
            confirmation_status: 'confirmed',
            appointment_date: combinedDateTime,
            revenue: null,
            note_from_clinic: null,
          })
          .eq('id', data.appointmentId);

        if (error) throw error;
      } else {
        // Normal check-in status update
        const updateData: any = {
          check_in_status: data.checkInStatus,
          check_in_updated_at: new Date().toISOString(),
        };

        if (data.serviceId) {
          updateData.service_product = data.serviceId;
        }
        
        if (data.revenue) {
          updateData.revenue = parseFloat(data.revenue);
        }
        
        if (data.noteFromClinic) {
          updateData.note_from_clinic = data.noteFromClinic;
        }

        const { error } = await supabase
          .from('appointments')
          .update(updateData)
          .eq('id', data.appointmentId);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setIsUpdateModalOpen(false);
      setUpdateAppointment(null);
      setCheckInStatus('');
      setUpdateServiceId('');
      setUpdateRevenue('');
      setNoteFromClinic('');
      setRescheduleDate('');
      setRescheduleTime('');
      
      toast({
        title: 'Update successful',
        description: 'Post-appointment results have been saved',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update appointment results',
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
      // Stop heartbeat
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      // Start 1-minute release timer
      releaseTimerRef.current = setTimeout(() => {
        releaseAppointmentMutation.mutate(callAppointment.id);
      }, 60000); // 1 minute
      
      setCallAppointment(null);
      setCallStatus('');
      // Reset service selection states
      setSelectedServiceId('');
      setServiceDetails(null);
      setOpenServiceCombo(false);
    }
    setIsCallModalOpen(open);
  };

  // Heartbeat effect - refresh processing_at every 30 seconds while modal is open
  useEffect(() => {
    if (isCallModalOpen && callAppointment?.id) {
      // Start heartbeat
      heartbeatIntervalRef.current = setInterval(() => {
        refreshHeartbeatMutation.mutate(callAppointment.id);
      }, 30000); // 30 seconds

      return () => {
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
      };
    }
  }, [isCallModalOpen, callAppointment?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
      }
    };
  }, []);

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

  const handleUpdateAppointment = (appointment: any) => {
    setUpdateAppointment(appointment);
    setCheckInStatus('');
    setUpdateServiceId('');
    setUpdateRevenue('');
    setNoteFromClinic('');
    setRescheduleDate('');
    setRescheduleTime('');
    setIsUpdateModalOpen(true);
  };

  const handleSubmitUpdate = () => {
    if (!updateAppointment || !checkInStatus) {
      toast({
        title: 'Validation error',
        description: 'Please select a check-in status',
        variant: 'destructive',
      });
      return;
    }

    // Validate required fields for specific statuses
    if (['paid_new_session', 'only_buy_medicine'].includes(checkInStatus)) {
      if (!updateServiceId || !updateRevenue) {
        toast({
          title: 'Validation error',
          description: 'Service/Product and Revenue are required for this status',
          variant: 'destructive',
        });
        return;
      }
    }

    // Validate reschedule fields
    if (checkInStatus === 'rescheduled') {
      if (!rescheduleDate || !rescheduleTime) {
        toast({
          title: 'Validation error',
          description: 'Please select new appointment date and time',
          variant: 'destructive',
        });
        return;
      }
    }

    updatePostAppointmentMutation.mutate({
      appointmentId: updateAppointment.id,
      checkInStatus,
      serviceId: updateServiceId || undefined,
      revenue: updateRevenue || undefined,
      noteFromClinic: noteFromClinic || undefined,
      rescheduleDate: rescheduleDate || undefined,
      rescheduleTime: rescheduleTime || undefined,
    });
  };

  // Check if appointment needs update status (D+1)
  const needsUpdate = (appointment: any) => {
    if (appointment.check_in_status) return false; // Already has check-in status
    
    const appointmentDate = new Date(appointment.appointment_date);
    const today = getEffectiveTime();
    today.setHours(0, 0, 0, 0);
    
    const dayAfterAppointment = new Date(appointmentDate);
    dayAfterAppointment.setDate(dayAfterAppointment.getDate() + 1);
    dayAfterAppointment.setHours(0, 0, 0, 0);
    
    return today >= dayAfterAppointment;
  };

  // Check if no-show is within 3 days and still updatable
  const isNoShowUpdatable = (appointment: any) => {
    if (appointment.check_in_status !== 'no_show') return false;
    
    const checkInDate = new Date(appointment.check_in_updated_at);
    const today = getEffectiveTime();
    const daysDiff = Math.floor((today.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return daysDiff <= 3;
  };

  // Check if appointment is final (cannot be edited)
  const isFinalStatus = (appointment: any) => {
    if (!appointment.check_in_status) return false;
    
    const finalStatuses = [
      'paid_new_session',
      'follow_up_session',
      'consultation_only',
      'service_completed',
      'only_buy_medicine',
      'rescheduled',
      'cancelled'
    ];
    
    return finalStatuses.includes(appointment.check_in_status);
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading appointments...</div>;
  }

  const upcomingAppointments = appointments?.filter(apt => 
    new Date(apt.appointment_date) >= getEffectiveTime() && !apt.is_completed
  );

  const timeOverride = localStorage.getItem('timeOverride');
  const effectiveTime = getEffectiveTime();

  return (
    <Card className="p-6">
      {/* Time Override Indicator */}
      {timeOverride && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
            <span className="text-sm font-medium">Time Override Active</span>
            <span className="text-xs text-muted-foreground">
              Testing at: {effectiveTime.toLocaleString()}
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              localStorage.removeItem('timeOverride');
              window.dispatchEvent(new CustomEvent('timeOverrideChanged'));
            }}
          >
            Reset to Real Time
          </Button>
        </div>
      )}

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

      {/* Search and Filter Section */}
      <div className="mb-6 space-y-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Search & Filters</h3>
          {(searchPhone || filterDate || filterAssignedTo || filterConfirmationStatus || filterRegistrationStatus || filterBranch) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchPhone('');
                setFilterDate('');
                setFilterAssignedTo('');
                setFilterConfirmationStatus('');
                setFilterRegistrationStatus('');
                setFilterBranch('');
              }}
            >
              Clear All
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Phone Search */}
          <div className="space-y-2">
            <Label htmlFor="search-phone">Search by Phone</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="search-phone"
                placeholder="Enter phone number..."
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Date Filter */}
          <div className="space-y-2">
            <Label htmlFor="filter-date">Appointment Date</Label>
            <Input
              id="filter-date"
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>

          {/* Assigned To Filter */}
          <div className="space-y-2">
            <Label htmlFor="filter-assigned">Assigned To</Label>
            <Select 
              value={filterAssignedTo || "__all__"} 
              onValueChange={(val) => setFilterAssignedTo(val === "__all__" ? '' : val)}
            >
              <SelectTrigger id="filter-assigned">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All agents</SelectItem>
                {allUsers?.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Confirmation Status Filter */}
          <div className="space-y-2">
            <Label htmlFor="filter-confirmation">Confirmation Status</Label>
            <Select 
              value={filterConfirmationStatus || "__all__"} 
              onValueChange={(val) => setFilterConfirmationStatus(val === "__all__" ? '' : val)}
            >
              <SelectTrigger id="filter-confirmation">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Registration Status Filter */}
          <div className="space-y-2">
            <Label htmlFor="filter-registration">Clinic Registration</Label>
            <Select 
              value={filterRegistrationStatus || "__all__"} 
              onValueChange={(val) => setFilterRegistrationStatus(val === "__all__" ? '' : val)}
            >
              <SelectTrigger id="filter-registration">
                <SelectValue placeholder="All appointments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All appointments</SelectItem>
                <SelectItem value="registered">Registered</SelectItem>
                <SelectItem value="not_registered">Not Registered</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Branch Filter */}
          <div className="space-y-2">
            <Label htmlFor="filter-branch">Branch</Label>
            <Select 
              value={filterBranch || "__all__"} 
              onValueChange={(val) => setFilterBranch(val === "__all__" ? '' : val)}
            >
              <SelectTrigger id="filter-branch">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All branches</SelectItem>
                {branches?.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results count */}
        <p className="text-sm text-muted-foreground">
          Showing {upcomingAppointments?.length || 0} appointment(s)
        </p>
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
              <TableHead>Check-in Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {upcomingAppointments?.map((appointment) => {
              const isRegistered = !!appointment.booking_id;
              const isProcessing = !!appointment.processing_by;
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
                    {(appointment as any).assigned?.full_name || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={appointment.confirmation_status === 'confirmed' ? 'default' : 'secondary'}>
                      {appointment.confirmation_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {appointment.check_in_status ? (
                      <Badge variant="default">
                        {appointment.check_in_status.replace(/_/g, ' ')}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {isFinalStatus(appointment) ? (
                        // Final status - only View button
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewAppointment(appointment)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Button>
                      ) : needsUpdate(appointment) || (appointment.check_in_status === 'no_show' && isNoShowUpdatable(appointment)) ? (
                        // Show Update button for D+1 or updatable no-show
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleUpdateAppointment(appointment)}
                          >
                            <Check className="w-4 h-4 mr-2" />
                            Update
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewAppointment(appointment)}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Button>
                        </>
                      ) : (
                        // Normal call flow
                        <>
                          {isProcessing && appointment.processing_by === user?.id ? (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => {
                                // Reopen the modal for the same agent
                                setCallAppointment(appointment);
                                setEditableFields({
                                  customerName: `${appointment.lead?.first_name || ''} ${appointment.lead?.last_name || ''}`.trim(),
                                  phone: appointment.lead?.phone || '',
                                  branchId: appointment.branch_id || '',
                                  appointmentDate: format(new Date(appointment.appointment_date), 'yyyy-MM-dd'),
                                  appointmentTime: format(new Date(appointment.appointment_date), 'HH:mm'),
                                  serviceProduct: servicesMap.get(appointment.service_product) || appointment.service_product || '',
                                  notes: appointment.notes || ''
                                });
                                setFieldEditStates({
                                  customerName: false,
                                  phone: false,
                                  branch: false,
                                  appointmentDate: false,
                                  appointmentTime: false,
                                  serviceProduct: false,
                                  notes: false
                                });
                                setCallStatus(appointment.confirmation_status || 'pending');
                                
                                // Clear release timer if exists
                                if (releaseTimerRef.current) {
                                  clearTimeout(releaseTimerRef.current);
                                  releaseTimerRef.current = null;
                                }
                                
                                setIsCallModalOpen(true);
                              }}
                            >
                              <Phone className="w-4 h-4 mr-2" />
                              Resume Call
                            </Button>
                          ) : isProcessing ? (
                            <Badge variant="secondary">In Call...</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => claimAppointmentMutation.mutate(appointment)}
                              disabled={claimAppointmentMutation.isPending}
                            >
                              <Phone className="w-4 h-4 mr-2" />
                              Call
                            </Button>
                          )}
                          
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewAppointment(appointment)}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Button>
                        </>
                      )}
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
                              : (servicesMap.get(editableFields.serviceProduct) || editableFields.serviceProduct || "Select service...")}
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
                      {servicesMap.get(editableFields.serviceProduct) || editableFields.serviceProduct || '-'}
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

      {/* Update Post-Appointment Modal */}
      <Dialog open={isUpdateModalOpen} onOpenChange={setIsUpdateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Post-Appointment Results</DialogTitle>
          </DialogHeader>
          
          {updateAppointment && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">
                  {updateAppointment.lead?.first_name} {updateAppointment.lead?.last_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(updateAppointment.appointment_date), 'PPP p')}
                </p>
              </div>

              {/* Check-in Status */}
              <div className="space-y-2">
                <Label>Check-in Status *</Label>
                <Select value={checkInStatus} onValueChange={setCheckInStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select check-in status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid_new_session">Paid for new session</SelectItem>
                    <SelectItem value="follow_up_session">Follow up session</SelectItem>
                    <SelectItem value="consultation_only">Consultation only</SelectItem>
                    <SelectItem value="service_completed">Service completed</SelectItem>
                    <SelectItem value="only_buy_medicine">Only buy medicine</SelectItem>
                    <SelectItem value="rescheduled">Appointment rescheduled</SelectItem>
                    <SelectItem value="no_show">No show</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Service/Product - Required for specific statuses */}
              <div className="space-y-2">
                <Label>
                  Service/Product 
                  {['paid_new_session', 'only_buy_medicine'].includes(checkInStatus) && (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>
                <Popover open={openUpdateServiceCombo} onOpenChange={setOpenUpdateServiceCombo}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openUpdateServiceCombo}
                      className="w-full justify-between"
                      disabled={!['paid_new_session', 'only_buy_medicine'].includes(checkInStatus)}
                    >
                      {updateServiceId
                        ? branchServices?.find((service) => service.id === updateServiceId)?.name
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
                                setUpdateServiceId(service.id);
                                setOpenUpdateServiceCombo(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  updateServiceId === service.id ? "opacity-100" : "opacity-0"
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

              {/* Revenue - Required for specific statuses */}
              <div className="space-y-2">
                <Label>
                  Revenue
                  {['paid_new_session', 'only_buy_medicine'].includes(checkInStatus) && (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>
                <Input
                  type="number"
                  placeholder="Enter revenue amount..."
                  value={updateRevenue}
                  onChange={(e) => setUpdateRevenue(e.target.value)}
                  disabled={!['paid_new_session', 'only_buy_medicine'].includes(checkInStatus)}
                />
              </div>

              {/* Note from Clinic */}
              <div className="space-y-2">
                <Label>Note from Clinic</Label>
                <Textarea
                  placeholder="Add notes from the clinic..."
                  value={noteFromClinic}
                  onChange={(e) => setNoteFromClinic(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Reschedule Fields - Only for rescheduled status */}
              {checkInStatus === 'rescheduled' && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-semibold">New Appointment Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>New Date *</Label>
                      <Input
                        type="date"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>New Time *</Label>
                      <Input
                        type="time"
                        value={rescheduleTime}
                        onChange={(e) => setRescheduleTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsUpdateModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmitUpdate}
                  disabled={updatePostAppointmentMutation.isPending}
                >
                  {updatePostAppointmentMutation.isPending ? 'Saving...' : 'Save Results'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
