import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Clock, Settings, Phone, User, Timer, CalendarIcon } from 'lucide-react';
import { format, setHours, setMinutes } from 'date-fns';
import { cn } from '@/lib/utils';

const STATUS_LABELS = {
  status_0: 'L0 - Fresh Lead',
  status_1: 'L1 - No Answer',
  status_2: 'L2 - Call Rescheduled',
  status_3: 'L3 - Cancelled',
  status_4: 'L4 - Blacklisted',
  status_5: 'L5 - Thinking',
  status_6: 'L6 - Appointment Set',
};

export function LeadManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { isTeleSales, isAdmin, isSalesManager } = useUserRole();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [l1Hours, setL1Hours] = useState<string>('');
  const [l5Hours, setL5Hours] = useState<string>('');
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [pulledLead, setPulledLead] = useState<any>(null);
  const [callOutcome, setCallOutcome] = useState<string>('');
  const [callNotes, setCallNotes] = useState<string>('');
  const [statusUpdate, setStatusUpdate] = useState<string>('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [callbackDate, setCallbackDate] = useState<Date | undefined>(undefined);
  const [callbackTime, setCallbackTime] = useState<string>('10:00');
  const [assignTo, setAssignTo] = useState<'self' | 'team'>('self');
  
  // Determine if this is the Lead Management page (only assigned leads) or Leads page (all leads)
  const isLeadManagementPage = location.pathname === '/dashboard/lead-management';

  // Fetch cooldown settings
  const { data: settings } = useQuery({
    queryKey: ['lead-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_settings')
        .select('*');
      
      if (error) throw error;
      return data;
    },
  });

  const { data: leads, isLoading } = useQuery({
    queryKey: ['leads', statusFilter, isLeadManagementPage],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      let query = supabase
        .from('leads')
        .select(`
          *,
          funnel:funnels(name),
          assigned:profiles!leads_assigned_to_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      // For Lead Management page, only show leads assigned to current user (excluding L2 - Call Rescheduled)
      if (isLeadManagementPage && user) {
        query = query.eq('assigned_to', user.id).neq('status', 'status_2');
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as any);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Query for follow-up leads (L2 - Call Rescheduled) on My Assigned Leads page
  const { data: followUpLeads, isLoading: isLoadingFollowUp } = useQuery({
    queryKey: ['follow-up-leads', isLeadManagementPage],
    queryFn: async () => {
      if (!isLeadManagementPage) return [];
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          funnel:funnels(name),
          assigned:profiles!leads_assigned_to_fkey(full_name)
        `)
        .eq('assigned_to', user.id)
        .eq('status', 'status_2')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: isLeadManagementPage,
  });

  // Count self-managed L2 leads for current user
  const selfManagedL2Count = followUpLeads?.length || 0;

  const assignToMeMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('leads')
        .update({ 
          assigned_to: user.id,
          assigned_at: new Date().toISOString()
        })
        .eq('id', leadId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Lead assigned', description: 'Lead has been assigned to you' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Assignment failed', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  const getLeadMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if user already has an assigned lead (excluding L2 - Call Rescheduled)
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('id')
        .eq('assigned_to', user.id)
        .neq('status', 'status_2');

      if (existingLeads && existingLeads.length > 0) {
        throw new Error('You must complete your current lead before getting a new one');
      }

      const now = new Date().toISOString();

      // Try to get L0 (Fresh Lead) first
      let { data: availableLead } = await supabase
        .from('leads')
        .select('*')
        .eq('status', 'status_0')
        .is('assigned_to', null)
        .or(`cooldown_until.is.null,cooldown_until.lt.${now}`)
        .limit(1)
        .single();

      // If no L0, try L1 (No Answer)
      if (!availableLead) {
        const result = await supabase
          .from('leads')
          .select('*')
          .eq('status', 'status_1')
          .is('assigned_to', null)
          .or(`cooldown_until.is.null,cooldown_until.lt.${now}`)
          .limit(1)
          .maybeSingle();
        availableLead = result.data;
      }

      // If no L1, try L5 (Thinking)
      if (!availableLead) {
        const result = await supabase
          .from('leads')
          .select('*')
          .eq('status', 'status_5')
          .is('assigned_to', null)
          .or(`cooldown_until.is.null,cooldown_until.lt.${now}`)
          .limit(1)
          .maybeSingle();
        availableLead = result.data;
      }

      if (!availableLead) {
        throw new Error('No available leads at this time');
      }

      // Assign the lead to the current user
      const { error } = await supabase
        .from('leads')
        .update({ 
          assigned_to: user.id,
          assigned_at: new Date().toISOString()
        })
        .eq('id', availableLead.id);

      if (error) throw error;

      return availableLead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Lead assigned', description: 'Lead has been assigned to you' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'No leads available', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: string }) => {
      const updates: any = { status: status as any };
      
      // Auto-apply cooldown for L1 and L5
      if (status === 'status_1' || status === 'status_5') {
        const settingKey = status === 'status_1' ? 'l1_cooldown_hours' : 'l5_cooldown_hours';
        const setting = settings?.find(s => s.setting_key === settingKey);
        
        if (setting && setting.setting_value > 0) {
          const cooldownUntil = new Date();
          cooldownUntil.setHours(cooldownUntil.getHours() + Number(setting.setting_value));
          updates.cooldown_until = cooldownUntil.toISOString();
        }
      } else {
        // Clear cooldown for other statuses
        updates.cooldown_until = null;
      }

      const { error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', leadId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Status updated', description: 'Lead status has been updated' });
    },
  });

  const submitCallMutation = useMutation({
    mutationFn: async () => {
      if (!pulledLead) throw new Error('No lead selected');
      if (!statusUpdate) throw new Error('Status update is required');

      // Validate L2 specific fields
      if (statusUpdate === 'status_2') {
        if (!callbackDate) throw new Error('Callback date is required for L2');
        if (!callbackTime) throw new Error('Callback time is required for L2');
      }

      const updates: any = { 
        status: statusUpdate as any,
        notes: callNotes ? `[${callOutcome}] ${callNotes}` : `[${callOutcome}]`,
      };

      // Handle L2 (Call Rescheduled) assignment logic
      if (statusUpdate === 'status_2') {
        if (assignTo === 'self') {
          // Keep assigned to current user for self-managed callback
          updates.assigned_to = pulledLead.assigned_to;
          updates.assigned_at = pulledLead.assigned_at;
        } else {
          // Return to pool (unassign)
          updates.assigned_to = null;
          updates.assigned_at = null;
        }

        // Set callback datetime
        if (callbackDate && callbackTime) {
          const [hours, minutes] = callbackTime.split(':');
          const callbackDateTime = setMinutes(setHours(callbackDate, parseInt(hours)), parseInt(minutes));
          updates.notes = `${updates.notes} | Callback: ${format(callbackDateTime, 'PPp')}`;
        }
      } else {
        // For other statuses, unassign the lead
        updates.assigned_to = null;
        updates.assigned_at = null;
      }
      
      // Auto-apply cooldown for L1 and L5
      if (statusUpdate === 'status_1' || statusUpdate === 'status_5') {
        const settingKey = statusUpdate === 'status_1' ? 'l1_cooldown_hours' : 'l5_cooldown_hours';
        const setting = settings?.find(s => s.setting_key === settingKey);
        
        if (setting && setting.setting_value > 0) {
          const cooldownUntil = new Date();
          cooldownUntil.setHours(cooldownUntil.getHours() + Number(setting.setting_value));
          updates.cooldown_until = cooldownUntil.toISOString();
        }
      } else {
        updates.cooldown_until = null;
      }

      const { error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', pulledLead.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['follow-up-leads'] });
      setIsLeadModalOpen(false);
      setPulledLead(null);
      setCallOutcome('');
      setCallNotes('');
      setStatusUpdate('');
      setElapsedTime(0);
      setCallbackDate(undefined);
      setCallbackTime('10:00');
      setAssignTo('self');
      toast({ title: 'Call completed', description: 'Lead has been updated successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update lead', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ settingKey, value }: { settingKey: string; value: number }) => {
      if (value <= 0) {
        throw new Error('Hours must be greater than 0');
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('lead_settings')
        .update({ 
          setting_value: value,
          updated_by: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('setting_key', settingKey);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-settings'] });
      toast({ title: 'Settings updated', description: 'Cooldown settings have been updated' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update settings', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  const handleUpdateL1Cooldown = () => {
    const hours = parseFloat(l1Hours);
    if (hours > 0) {
      updateSettingMutation.mutate({ settingKey: 'l1_cooldown_hours', value: hours });
      setL1Hours('');
    } else {
      toast({
        title: 'Invalid input',
        description: 'Hours must be greater than 0',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateL5Cooldown = () => {
    const hours = parseFloat(l5Hours);
    if (hours > 0) {
      updateSettingMutation.mutate({ settingKey: 'l5_cooldown_hours', value: hours });
      setL5Hours('');
    } else {
      toast({
        title: 'Invalid input',
        description: 'Hours must be greater than 0',
        variant: 'destructive'
      });
    }
  };

  const getRemainingCooldown = (cooldownUntil: string | null) => {
    if (!cooldownUntil) return null;
    
    const now = new Date();
    const cooldown = new Date(cooldownUntil);
    
    if (now >= cooldown) return null;
    
    const diffMs = cooldown.getTime() - now.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Auto-set call outcome when L2 is selected
  useEffect(() => {
    if (statusUpdate === 'status_2') {
      setCallOutcome('Call Rescheduled');
      // If user has 5+ self-managed L2 leads, force assign to team
      if (selfManagedL2Count >= 5) {
        setAssignTo('team');
      }
    }
  }, [statusUpdate, selfManagedL2Count]);

  // Timer for lead call tracking
  useEffect(() => {
    if (!isLeadModalOpen) return;

    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isLeadModalOpen]);

  // Auto-return expired leads to pool
  useEffect(() => {
    if (!isLeadManagementPage || !isTeleSales || isLeadModalOpen) return;

    const checkExpiredLeads = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const thirtyMinutesAgo = new Date();
      thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

      // Find leads assigned to current user that have expired
      const { data: expiredLeads } = await supabase
        .from('leads')
        .select('id')
        .eq('assigned_to', user.id)
        .lt('assigned_at', thirtyMinutesAgo.toISOString())
        .not('assigned_at', 'is', null);

      if (expiredLeads && expiredLeads.length > 0) {
        // Return expired leads to pool
        for (const lead of expiredLeads) {
          await supabase
            .from('leads')
            .update({ 
              assigned_to: null,
              assigned_at: null,
              status: 'status_0'
            })
            .eq('id', lead.id);
        }

        queryClient.invalidateQueries({ queryKey: ['leads'] });
        toast({
          title: 'Lead returned to pool',
          description: '30 minute time limit reached',
          variant: 'destructive'
        });
      }
    };

    // Check immediately
    checkExpiredLeads();

    // Then check every 10 seconds
    const interval = setInterval(checkExpiredLeads, 10000);

    return () => clearInterval(interval);
  }, [isLeadManagementPage, isTeleSales, isLeadModalOpen, queryClient, toast]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getAssignmentTimeRemaining = (assignedAt: string | null) => {
    if (!assignedAt) return null;
    
    const assigned = new Date(assignedAt);
    const now = new Date();
    const thirtyMinutes = 30 * 60 * 1000;
    const elapsed = now.getTime() - assigned.getTime();
    const remaining = thirtyMinutes - elapsed;
    
    if (remaining <= 0) return null;
    
    const mins = Math.floor(remaining / (60 * 1000));
    const secs = Math.floor((remaining % (60 * 1000)) / 1000);
    
    return { mins, secs, total: remaining };
  };

  const CALL_OUTCOMES = [
    'No Answer',
    'Wrong Number',
    'Not Interested',
    'Interested - Callback Later',
    'Interested - Thinking',
    'Price Too High',
    'Already Booked Elsewhere',
    'Request Call Back',
    'Call Rescheduled',
    'Drop Call',
    'Language Barrier',
    'Session Already Booked'
  ];

  const AVAILABLE_STATUSES = Object.entries(STATUS_LABELS).filter(([key]) => key !== 'status_0');

  if (isLoading) {
    return <div className="text-center py-8">Loading leads...</div>;
  }

  // Calculate status summary
  const statusSummary = leads?.reduce((acc, lead) => {
    const status = lead.status as keyof typeof STATUS_LABELS;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const l1Setting = settings?.find(s => s.setting_key === 'l1_cooldown_hours');
  const l5Setting = settings?.find(s => s.setting_key === 'l5_cooldown_hours');

  return (
    <div className="space-y-6">
      {/* Lead Call Modal */}
      <Dialog open={isLeadModalOpen} onOpenChange={setIsLeadModalOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Lead Call Session
            </DialogTitle>
            <DialogDescription>
              Complete the call and update the lead status
            </DialogDescription>
          </DialogHeader>
          
          <div className="overflow-y-auto flex-1 px-1 pb-4">
            {pulledLead && (
              <div className="space-y-6">
                {/* Customer Details and Timer - Same Row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Customer Details */}
                  <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {pulledLead.first_name} {pulledLead.last_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono">{pulledLead.phone}</span>
                    </div>
                  </div>

                  {/* Timer */}
                  <div className="flex items-center justify-center p-4 bg-primary/10 rounded-lg">
                    <div className="text-center">
                      <Clock className="h-6 w-6 mx-auto mb-2 text-primary" />
                      <div className="text-3xl font-bold text-primary">{formatTime(elapsedTime)}</div>
                      <p className="text-sm text-muted-foreground mt-1">Call Duration</p>
                    </div>
                  </div>
                </div>

                {/* Call Form */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="status-update">Status Update *</Label>
                    <Select value={statusUpdate} onValueChange={setStatusUpdate}>
                      <SelectTrigger id="status-update">
                        <SelectValue placeholder="Select new status" />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_STATUSES.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Show additional fields only after status is selected */}
                  {statusUpdate && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="call-outcome">Call Outcome *</Label>
                        <Select 
                          value={callOutcome} 
                          onValueChange={setCallOutcome}
                          disabled={statusUpdate === 'status_2'}
                        >
                          <SelectTrigger id="call-outcome">
                            <SelectValue placeholder="Select outcome" />
                          </SelectTrigger>
                          <SelectContent>
                            {CALL_OUTCOMES.map((outcome) => (
                              <SelectItem key={outcome} value={outcome}>
                                {outcome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* L2 Specific Fields */}
                      {statusUpdate === 'status_2' && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="callback-date">Time of Callback *</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  id="callback-date"
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !callbackDate && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {callbackDate ? format(callbackDate, 'PPP') : "Pick a date"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={callbackDate}
                                  onSelect={setCallbackDate}
                                  disabled={(date) => date < new Date()}
                                  initialFocus
                                  className="pointer-events-auto"
                                />
                              </PopoverContent>
                            </Popover>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="callback-time">Time (Vietnam Time: 10am - 7pm) *</Label>
                            <Select value={callbackTime} onValueChange={setCallbackTime}>
                              <SelectTrigger id="callback-time">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 10 }, (_, i) => {
                                  const hour = 10 + i;
                                  return (
                                    <SelectItem key={`${hour}:00`} value={`${hour}:00`}>
                                      {hour}:00
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="assign-to">Assign To *</Label>
                            <Select 
                              value={assignTo} 
                              onValueChange={(val) => setAssignTo(val as 'self' | 'team')}
                              disabled={selfManagedL2Count >= 5 && assignTo === 'self'}
                            >
                              <SelectTrigger id="assign-to">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="self" disabled={selfManagedL2Count >= 5}>
                                  Self {selfManagedL2Count >= 5 && '(Limit reached: 5/5)'}
                                </SelectItem>
                                <SelectItem value="team">All of Team</SelectItem>
                              </SelectContent>
                            </Select>
                            {selfManagedL2Count >= 5 && (
                              <p className="text-sm text-destructive">
                                You have reached the maximum of 5 self-managed callback leads
                              </p>
                            )}
                          </div>
                        </>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="call-notes">Call Notes</Label>
                        <Textarea
                          id="call-notes"
                          placeholder="Enter any additional notes about the call..."
                          value={callNotes}
                          onChange={(e) => setCallNotes(e.target.value)}
                          rows={3}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsLeadModalOpen(false);
                setPulledLead(null);
                setCallOutcome('');
                setCallNotes('');
                setStatusUpdate('');
                setElapsedTime(0);
                setCallbackDate(undefined);
                setCallbackTime('10:00');
                setAssignTo('self');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => submitCallMutation.mutate()}
              disabled={
                !callOutcome || 
                !statusUpdate || 
                submitCallMutation.isPending ||
                (statusUpdate === 'status_2' && (!callbackDate || !callbackTime))
              }
            >
              Submit Call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cooldown Settings - Only for Admin/Sales Manager on Leads page */}
      {(isAdmin || isSalesManager) && !isLeadManagementPage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Lead Cooldown Settings
            </CardTitle>
            <CardDescription>
              Configure automatic cooldown periods for L1 and L5 lead statuses
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="l1-cooldown">L1 - No Answer Cooldown (hours)</Label>
                <div className="flex gap-2">
                  <Input
                    id="l1-cooldown"
                    type="number"
                    min="1"
                    value={l1Hours}
                    onChange={(e) => setL1Hours(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateL1Cooldown();
                    }}
                  />
                  <Button 
                    onClick={handleUpdateL1Cooldown}
                    disabled={updateSettingMutation.isPending}
                  >
                    Update
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Current: {l1Setting?.setting_value || 0} hours
                </p>
              </div>

              <div className="space-y-3">
                <Label htmlFor="l5-cooldown">L5 - Thinking Cooldown (hours)</Label>
                <div className="flex gap-2">
                  <Input
                    id="l5-cooldown"
                    type="number"
                    min="1"
                    value={l5Hours}
                    onChange={(e) => setL5Hours(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateL5Cooldown();
                    }}
                  />
                  <Button 
                    onClick={handleUpdateL5Cooldown}
                    disabled={updateSettingMutation.isPending}
                  >
                    Update
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Current: {l5Setting?.setting_value || 0} hours
                </p>
              </div>
            </div>
          </CardContent>
      </Card>
      )}

      {/* My Assigned Leads */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {isLeadManagementPage ? 'My Assigned Leads' : 'Lead Management'}
          </h2>
          
          {isLeadManagementPage ? (
            isTeleSales && (
              <Button 
                onClick={() => getLeadMutation.mutate()}
                disabled={getLeadMutation.isPending || (leads && leads.length > 0)}
              >
                Get Lead
              </Button>
            )
          ) : (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

      {/* Status Summary */}
      {!isLeadManagementPage && (
        <div className="mb-6 p-4 bg-muted/50 rounded-lg">
          <h3 className="text-lg font-semibold mb-3">Lead Status Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(STATUS_LABELS).map(([statusKey, statusLabel]) => {
              const count = statusSummary?.[statusKey] || 0;
              return (
                <div key={statusKey} className="flex flex-col p-3 bg-background rounded-md border">
                  <span className="text-2xl font-bold text-primary">{count}</span>
                  <span className="text-sm text-muted-foreground">{statusLabel}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t">
            <span className="text-sm font-medium">Total Leads: </span>
            <span className="text-lg font-bold text-primary">{leads?.length || 0}</span>
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Service/Product</TableHead>
              {!isLeadManagementPage && <TableHead>Status</TableHead>}
              {!isLeadManagementPage && <TableHead>Cooldown Status</TableHead>}
              {!isLeadManagementPage && <TableHead>Assigned To</TableHead>}
              {isLeadManagementPage && <TableHead>Time Remaining</TableHead>}
              {isLeadManagementPage && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads?.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">
                  {lead.first_name} {lead.last_name}
                  {lead.is_duplicate && (
                    <Badge variant="destructive" className="ml-2">Duplicate</Badge>
                  )}
                </TableCell>
                <TableCell>{lead.phone}</TableCell>
                <TableCell>{lead.service_product || '-'}</TableCell>
                {!isLeadManagementPage && (
                  <TableCell>
                    {(isTeleSales || isAdmin || isSalesManager) ? (
                      <Select
                        value={lead.status}
                        onValueChange={(value) => 
                          updateStatusMutation.mutate({ leadId: lead.id, status: value })
                        }
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge>{STATUS_LABELS[lead.status as keyof typeof STATUS_LABELS]}</Badge>
                    )}
                  </TableCell>
                )}
                {!isLeadManagementPage && (
                  <TableCell>
                    {getRemainingCooldown(lead.cooldown_until) ? (
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {getRemainingCooldown(lead.cooldown_until)}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                )}
                {!isLeadManagementPage && <TableCell>{lead.assigned?.full_name || 'Unassigned'}</TableCell>}
                {isLeadManagementPage && (
                  <TableCell>
                    {lead.assigned_at && (() => {
                      const timeRemaining = getAssignmentTimeRemaining(lead.assigned_at);
                      if (!timeRemaining) {
                        return <span className="text-destructive text-sm font-medium">Expired</span>;
                      }
                      const { mins, secs } = timeRemaining;
                      const isUrgent = mins < 5;
                      return (
                        <Badge 
                          variant={isUrgent ? "destructive" : "secondary"} 
                          className="gap-1 font-mono"
                        >
                          <Timer className="h-3 w-3" />
                          {mins}:{secs.toString().padStart(2, '0')}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                )}
                {isLeadManagementPage && (
                  <TableCell>
                    {!lead.assigned_to && isTeleSales && lead.status === 'status_0' && (
                      <Button
                        size="sm"
                        onClick={() => assignToMeMutation.mutate(lead.id)}
                        disabled={assignToMeMutation.isPending}
                      >
                        Assign to Me
                      </Button>
                    )}
                    {lead.assigned_to && isTeleSales && isLeadManagementPage && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPulledLead(lead);
                          setIsLeadModalOpen(true);
                          setElapsedTime(0);
                        }}
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        Call
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      </Card>

      {/* My Follow-Up Leads - Only on My Assigned Leads page */}
      {isLeadManagementPage && isTeleSales && (
        <Card className="p-6">
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">My Follow-Up Leads</h2>
              <Badge variant={selfManagedL2Count >= 5 ? "destructive" : "secondary"}>
                {selfManagedL2Count}/5
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Leads scheduled for callback (L2 - Call Rescheduled)</p>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Service/Product</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {followUpLeads && followUpLeads.length > 0 ? (
                  followUpLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">
                        {lead.first_name} {lead.last_name}
                        {lead.is_duplicate && (
                          <Badge variant="destructive" className="ml-2">Duplicate</Badge>
                        )}
                      </TableCell>
                      <TableCell>{lead.phone}</TableCell>
                      <TableCell>{lead.service_product || '-'}</TableCell>
                      <TableCell>{lead.email || '-'}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPulledLead(lead);
                            setIsLeadModalOpen(true);
                            setElapsedTime(0);
                          }}
                        >
                          <Phone className="h-4 w-4 mr-2" />
                          Call
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No follow-up leads at this time
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
