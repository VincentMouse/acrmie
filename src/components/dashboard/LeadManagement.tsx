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
import { Clock, Settings, Phone, User, Timer, CalendarIcon, TestTube, Trash2 } from 'lucide-react';
import { format, setHours, setMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { TimeOverrideTool } from './TimeOverrideTool';

const STATUS_LABELS = {
  status_0: 'L0 - Fresh Lead',
  status_1: 'L1 - Call Back',
  status_2: 'L2 - Call Rescheduled',
  status_3: 'L3 - Cancelled',
  status_4: 'L4 - Blacklisted',
  status_5: 'L5 - Thinking',
  status_6: 'L6 - Appointment Set',
};

// L1 Time Period helpers
const getEffectiveTime = (): Date => {
  const override = localStorage.getItem('timeOverride');
  return override ? new Date(override) : new Date();
};

const getCurrentTimePeriod = (): number => {
  const now = getEffectiveTime();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // Period 1: 9:30 AM - 12:00 PM (570 - 720 minutes)
  if (timeInMinutes >= 570 && timeInMinutes <= 720) return 1;
  // Period 2: 12:01 PM - 5:00 PM (721 - 1020 minutes)
  if (timeInMinutes >= 721 && timeInMinutes <= 1020) return 2;
  // Period 3: 5:01 PM - 6:30 PM (1021 - 1110 minutes)
  if (timeInMinutes >= 1021 && timeInMinutes <= 1110) return 3;
  
  // Outside calling hours
  return 0;
};

const calculateL1Cooldown = (currentPeriod: number, lastContactPeriod: number | null): Date | null => {
  const now = getEffectiveTime();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTimeInMinutes = hours * 60 + minutes;
  
  // If this is the first contact (no last contact period)
  if (lastContactPeriod === null) {
    const cooldownDate = new Date(now);
    
    // Skip current and next period
    if (currentPeriod === 1) {
      // Current in Period 1, available in Period 3 (same day)
      cooldownDate.setHours(17, 1, 0, 0); // 5:01 PM
    } else if (currentPeriod === 2) {
      // Current in Period 2, available in Period 1 next day
      cooldownDate.setDate(cooldownDate.getDate() + 1);
      cooldownDate.setHours(9, 30, 0, 0); // 9:30 AM next day
    } else if (currentPeriod === 3) {
      // Current in Period 3, available in Period 2 next day
      cooldownDate.setDate(cooldownDate.getDate() + 1);
      cooldownDate.setHours(12, 1, 0, 0); // 12:01 PM next day
    }
    
    return cooldownDate;
  }
  
  // For subsequent contacts, ensure we follow the skip pattern
  const cooldownDate = new Date(now);
  
  if (lastContactPeriod === 1) {
    // Last was Period 1, next should be Period 3
    // Check if Period 3 start time (17:01) has passed today
    if (currentTimeInMinutes < 1021) {
      // Haven't reached Period 3 yet, set to today 5:01 PM
      cooldownDate.setHours(17, 1, 0, 0);
    } else {
      // Period 3 has started or passed, set to tomorrow 5:01 PM
      cooldownDate.setDate(cooldownDate.getDate() + 1);
      cooldownDate.setHours(17, 1, 0, 0);
    }
  } else if (lastContactPeriod === 2) {
    // Last was Period 2, next should be Period 1 next day
    cooldownDate.setDate(cooldownDate.getDate() + 1);
    cooldownDate.setHours(9, 30, 0, 0);
  } else if (lastContactPeriod === 3) {
    // Last was Period 3, next should be Period 2 next day
    cooldownDate.setDate(cooldownDate.getDate() + 1);
    cooldownDate.setHours(12, 1, 0, 0);
  }
  
  return cooldownDate;
};

export function LeadManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { isTeleSales, isAdmin, isSalesManager } = useUserRole();
  const [statusFilter, setStatusFilter] = useState<string>('all');
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
  const [showTimeOverride, setShowTimeOverride] = useState(false);
  const [showNoLeadsDialog, setShowNoLeadsDialog] = useState(false);
  const [showWipeConfirmDialog, setShowWipeConfirmDialog] = useState(false);
  
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
          assigned_at: getEffectiveTime().toISOString()
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

      const now = getEffectiveTime().toISOString();

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
          assigned_at: getEffectiveTime().toISOString()
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
      setShowNoLeadsDialog(true);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: string }) => {
      const updates: any = { status: status as any };
      
      // Auto-apply cooldown for L5
      if (status === 'status_5') {
        const setting = settings?.find(s => s.setting_key === 'l5_cooldown_hours');
        
        if (setting && setting.setting_value > 0) {
          const cooldownUntil = getEffectiveTime();
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

      // Handle L1 custom cooldown logic
      if (statusUpdate === 'status_1') {
        const currentPeriod = getCurrentTimePeriod();
        const currentContactCount = pulledLead.l1_contact_count || 0;
        
        // Check if already reached 6 contacts
        if (currentContactCount >= 6) {
          throw new Error('Lead has already received maximum 6 contact attempts');
        }
        
        // Check period limits (max 2 per period)
        const periodCounts = {
          1: pulledLead.l1_period_1_count || 0,
          2: pulledLead.l1_period_2_count || 0,
          3: pulledLead.l1_period_3_count || 0,
        };
        
        if (currentPeriod > 0 && periodCounts[currentPeriod as 1 | 2 | 3] >= 2) {
          throw new Error(`Period ${currentPeriod} has already reached maximum 2 contacts`);
        }
        
        // Update L1 tracking fields
        updates.l1_contact_count = currentContactCount + 1;
        updates.l1_last_contact_period = currentPeriod;
        updates.l1_last_contact_time = getEffectiveTime().toISOString();
        
        // Increment period-specific count
        if (currentPeriod === 1) {
          updates.l1_period_1_count = (pulledLead.l1_period_1_count || 0) + 1;
        } else if (currentPeriod === 2) {
          updates.l1_period_2_count = (pulledLead.l1_period_2_count || 0) + 1;
        } else {
          // Assign calls outside time periods to Period 3
          updates.l1_period_3_count = (pulledLead.l1_period_3_count || 0) + 1;
        }
        
        // Calculate next available time
        const cooldownUntil = calculateL1Cooldown(currentPeriod, pulledLead.l1_last_contact_period);
        if (cooldownUntil) {
          updates.cooldown_until = cooldownUntil.toISOString();
        }
      }

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
      
      // Auto-apply cooldown for L5
      if (statusUpdate === 'status_5') {
        const setting = settings?.find(s => s.setting_key === 'l5_cooldown_hours');
        
        if (setting && setting.setting_value > 0) {
          const cooldownUntil = getEffectiveTime();
          cooldownUntil.setHours(cooldownUntil.getHours() + Number(setting.setting_value));
          updates.cooldown_until = cooldownUntil.toISOString();
        }
      } else if (statusUpdate !== 'status_1') {
        // Clear cooldown for other statuses (except L1 which has custom cooldown)
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
          updated_at: getEffectiveTime().toISOString()
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

  const wipeAllDataMutation = useMutation({
    mutationFn: async () => {
      // Delete in order: lead_history, appointments, leads, customers
      const { error: historyError } = await supabase
        .from('lead_history')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (historyError) throw historyError;

      const { error: appointmentsError } = await supabase
        .from('appointments')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (appointmentsError) throw appointmentsError;

      const { error: leadsError } = await supabase
        .from('leads')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (leadsError) throw leadsError;

      const { error: customersError } = await supabase
        .from('customers')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (customersError) throw customersError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['follow-up-leads'] });
      setShowWipeConfirmDialog(false);
      toast({ 
        title: 'All data wiped', 
        description: 'All leads, lead history, appointments, and customers have been deleted',
        variant: 'destructive'
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to wipe data', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

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
    
    const now = getEffectiveTime();
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

  // Auto-set call outcome when L2 is selected, and reset when status changes
  useEffect(() => {
    if (statusUpdate === 'status_2') {
      setCallOutcome('Call Rescheduled');
      // If user has 5+ self-managed L2 leads, force assign to team
      if (selfManagedL2Count >= 5) {
        setAssignTo('team');
      }
    } else {
      // Reset call outcome when status changes from L2 or to L1
      setCallOutcome('');
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

  // Listen for time override changes and refresh data
  useEffect(() => {
    const handleTimeOverrideChange = () => {
      // Invalidate queries to refresh lead data with new effective time
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['follow-up-leads'] });
    };

    window.addEventListener('timeOverrideChanged', handleTimeOverrideChange);
    return () => window.removeEventListener('timeOverrideChanged', handleTimeOverrideChange);
  }, [queryClient]);

  // Auto-return expired leads to pool
  useEffect(() => {
    if (!isLeadManagementPage || !isTeleSales || isLeadModalOpen) return;

    const checkExpiredLeads = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const thirtyMinutesAgo = getEffectiveTime();
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
    const now = getEffectiveTime();
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

  const L1_CALL_OUTCOMES = [
    'No Answer',
    'Busy Line',
    'Can Not Be Reached'
  ];

  // Get filtered call outcomes based on status
  const getCallOutcomes = () => {
    if (statusUpdate === 'status_1') {
      return L1_CALL_OUTCOMES;
    }
    return CALL_OUTCOMES;
  };

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
      {/* No Leads Available Dialog */}
      <Dialog open={showNoLeadsDialog} onOpenChange={setShowNoLeadsDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Phone className="h-6 w-6 text-muted-foreground" />
              No Leads Available
            </DialogTitle>
            <DialogDescription className="pt-4 space-y-3">
              <p className="text-base">
                There are currently no eligible leads available for calling.
              </p>
              <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
                <p className="font-semibold">Possible reasons:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>All L0 (Fresh) leads have been assigned</li>
                  <li>L1 (Call Back) leads are in cooldown period</li>
                  <li>L5 (Thinking) leads are in cooldown period</li>
                  <li>No new leads have been ingested</li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground pt-2">
                Please check back later or contact your manager if you believe this is an error.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowNoLeadsDialog(false)}>
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <div className="space-y-3 p-4 bg-muted/50 rounded-lg h-32 flex flex-col justify-center">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">
                        {pulledLead.first_name} {pulledLead.last_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-sm">{pulledLead.phone}</span>
                    </div>
                  </div>

                  {/* Timer and Service/Product */}
                  <div className="flex flex-col p-4 bg-primary/10 rounded-lg h-32">
                    {/* Call Duration - Top 20% */}
                    <div className="text-center border-b border-primary/20 pb-1 flex-[0.2]">
                      <Clock className="h-4 w-4 mx-auto text-primary" />
                      <div className="text-xl font-bold text-primary leading-tight">{formatTime(elapsedTime)}</div>
                    </div>
                    
                    {/* Service/Product - Bottom 80% */}
                    <div className="text-center pt-2 flex-[0.8] flex flex-col justify-center">
                      <p className="text-xs text-muted-foreground mb-1">Suggested Service/Product</p>
                      <p className="font-medium text-xs">{pulledLead.service_product || '-'}</p>
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
                            {getCallOutcomes().map((outcome) => (
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
                            <Label htmlFor="callback-time">Time (Philippines Time: 10am - 7pm) *</Label>
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

      {/* Time Override Tool - Only for Admin */}
      {isAdmin && !isLeadManagementPage && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowTimeOverride(!showTimeOverride)}
              className="flex-1"
            >
              <TestTube className="h-4 w-4 mr-2" />
              {showTimeOverride ? 'Hide' : 'Show'} Time Override Tool
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowWipeConfirmDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Wipe All Data
            </Button>
          </div>
          {showTimeOverride && <TimeOverrideTool />}
        </div>
      )}

      {/* Cooldown Settings - Only for Admin/Sales Manager on Leads page */}
      {(isAdmin || isSalesManager) && !isLeadManagementPage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Lead Cooldown Settings
            </CardTitle>
            <CardDescription>
              Configure automatic cooldown period for L5 lead status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-w-md">
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
              {!isLeadManagementPage && <TableHead>Cooldown</TableHead>}
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
                    {lead.status === 'status_1' ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant="secondary" className="w-fit">
                          {lead.l1_contact_count || 0}/6 calls
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          P1: {lead.l1_period_1_count || 0}/2 | P2: {lead.l1_period_2_count || 0}/2 | P3: {lead.l1_period_3_count || 0}/2
                        </span>
                        {getRemainingCooldown(lead.cooldown_until) && (
                          <Badge variant="outline" className="w-fit gap-1">
                            <Timer className="h-3 w-3" />
                            {getRemainingCooldown(lead.cooldown_until)}
                          </Badge>
                        )}
                      </div>
                    ) : getRemainingCooldown(lead.cooldown_until) ? (
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

      {/* Wipe All Data Confirmation Dialog */}
      <Dialog open={showWipeConfirmDialog} onOpenChange={setShowWipeConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>⚠️ Wipe All Data</DialogTitle>
            <DialogDescription>
              This will permanently delete all:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Leads</li>
                <li>Lead History</li>
                <li>Appointments</li>
                <li>Customers</li>
              </ul>
              <p className="mt-3 font-semibold text-destructive">This action cannot be undone!</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowWipeConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => wipeAllDataMutation.mutate()}
              disabled={wipeAllDataMutation.isPending}
            >
              {wipeAllDataMutation.isPending ? 'Wiping...' : 'Yes, Wipe All Data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
