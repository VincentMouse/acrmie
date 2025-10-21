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
import { Clock, Settings, Phone, User, CalendarIcon, Search, Check, ChevronsUpDown, Timer, Pencil, ChevronDown, Filter } from 'lucide-react';
import { LeadEditDialog } from './LeadEditDialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format, setHours, setMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';

const STATUS_LABELS = {
  'L0-Fresh Lead': 'L0 - Fresh Lead',
  'L1-Call back': 'L1 - Call Back',
  'L2-Call reschedule': 'L2 - Call Rescheduled',
  'L3-Cancelled': 'L3 - Cancelled',
  'L4-Blacklisted': 'L4 - Blacklisted',
  'L5-Thinking': 'L5 - Thinking',
  'L6-Appointment set': 'L6 - Appointment Set',
  'hibernation': 'Hibernation',
};

// L1 Time Period helpers
const getEffectiveTime = (): Date => {
  return new Date();
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

  // Quick unassign mutation for admin
  const quickUnassignMutation = useMutation({
    mutationFn: async (phone: string) => {
      const { error } = await supabase
        .from('leads')
        .update({ 
          assigned_to: null, 
          assigned_at: null 
        })
        .eq('phone', phone);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Lead unassigned successfully' });
    },
    onError: (error) => {
      toast({ 
        title: 'Error unassigning lead', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
  const location = useLocation();
  const { isTeleSales, isAdmin, isSalesManager } = useUserRole();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [pulledLead, setPulledLead] = useState<any>(null);
  const [callOutcome, setCallOutcome] = useState<string>('');
  const [callNotes, setCallNotes] = useState<string>('');
  const [statusUpdate, setStatusUpdate] = useState<string>('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [callbackDate, setCallbackDate] = useState<Date | undefined>(undefined);
  const [callbackTime, setCallbackTime] = useState<string>('10:00');
  const [assignTo, setAssignTo] = useState<'self' | 'team'>('self');
  const [callBackIn, setCallBackIn] = useState<string>('');
  const [showNoLeadsDialog, setShowNoLeadsDialog] = useState(false);
  
  // L6 specific states
  const [customerType, setCustomerType] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>(undefined);
  const [appointmentTimeSlot, setAppointmentTimeSlot] = useState<string>('');
  // Consultation needed fields
  const [concern, setConcern] = useState<string>('');
  const [expectation, setExpectation] = useState<string>('');
  const [budget, setBudget] = useState<string>('');
  const [suggestedService, setSuggestedService] = useState<string>('');
  const [suggestedServiceDetails, setSuggestedServiceDetails] = useState<{price: number, treatments: number} | null>(null);
  const [additionalSuggestedService, setAdditionalSuggestedService] = useState<string>('');
  const [additionalNotes, setAdditionalNotes] = useState<string>('');
  // Follow up session fields
  const [concurrentService, setConcurrentService] = useState<string>('');
  const [concurrentServiceDetails, setConcurrentServiceDetails] = useState<{price: number, treatments: number} | null>(null);
  const [sessionNumber, setSessionNumber] = useState<string>('');
  // Service search states
  const [openSuggestedServiceCombo, setOpenSuggestedServiceCombo] = useState(false);
  const [openAdditionalServiceCombo, setOpenAdditionalServiceCombo] = useState(false);
  const [openConcurrentServiceCombo, setOpenConcurrentServiceCombo] = useState(false);
  
  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<any>(null);

  // Fetch lead history for the current lead
  const { data: leadHistory } = useQuery({
    queryKey: ['lead_history', pulledLead?.id],
    queryFn: async () => {
      if (!pulledLead?.id) return [];
      
      const { data, error } = await supabase
        .from('lead_history')
        .select('*')
        .eq('lead_id', pulledLead.id)
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!pulledLead?.id && isLeadModalOpen,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const leadsPerPage = 10;
  
  // Filter states - temporary selections (not applied until Search is clicked)
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [tempFilterAssignedTo, setTempFilterAssignedTo] = useState('');
  const [tempFilterOnlineSales, setTempFilterOnlineSales] = useState('');
  const [tempFilterMarketer, setTempFilterMarketer] = useState('');
  const [tempFilterServiceProduct, setTempFilterServiceProduct] = useState('');
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>();
  
  // Applied filters (used in query)
  const [filterAssignedTo, setFilterAssignedTo] = useState('');
  const [filterOnlineSales, setFilterOnlineSales] = useState('');
  const [filterMarketer, setFilterMarketer] = useState('');
  const [filterServiceProduct, setFilterServiceProduct] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  
  // Apply filters function
  const handleApplyFilters = () => {
    setFilterAssignedTo(tempFilterAssignedTo);
    setFilterOnlineSales(tempFilterOnlineSales);
    setFilterMarketer(tempFilterMarketer);
    setFilterServiceProduct(tempFilterServiceProduct);
    setDateRange(tempDateRange);
    setCurrentPage(1);
  };
  
  // Clear filters function
  const handleClearFilters = () => {
    setTempFilterAssignedTo('');
    setTempFilterOnlineSales('');
    setTempFilterMarketer('');
    setTempFilterServiceProduct('');
    setTempDateRange(undefined);
    setFilterAssignedTo('');
    setFilterOnlineSales('');
    setFilterMarketer('');
    setFilterServiceProduct('');
    setDateRange(undefined);
    setCurrentPage(1);
  };

  
  // Auto-unassign specific lead - remove after execution
  useEffect(() => {
    const hasUnassigned = localStorage.getItem('unassigned_9484414883');
    if (!hasUnassigned) {
      quickUnassignMutation.mutate('9484414883');
      localStorage.setItem('unassigned_9484414883', 'true');
    }
  }, []);
  
  // Determine if this is the Lead Management page (only assigned leads) or Leads page (all leads)
  const isLeadManagementPage = location.pathname === '/dashboard/lead-management';


  // Auto-set Call Outcome to "Appointment Booked" for L6
  useEffect(() => {
    if (statusUpdate === 'L6-Appointment set') {
      setCallOutcome('Appointment Booked');
    }
  }, [statusUpdate]);


  // Fetch branches for L6 appointment booking
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

  // Fetch all users for filter dropdowns
  const { data: allUsers } = useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nickname')
        .order('nickname');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch only online sales users for Online Sales filter
  const { data: onlineSalesUsers } = useQuery({
    queryKey: ['online-sales-users'],
    queryFn: async () => {
      const { data: userRoles, error } = await supabase
        .from('user_roles')
        .select('user_id, profiles!inner(id, nickname)')
        .eq('role', 'online_sales');
      
      if (error) throw error;
      return userRoles?.map(ur => ur.profiles).filter(Boolean) || [];
    },
  });

  // Fetch all services/products for filter
  const { data: allServicesProducts } = useQuery({
    queryKey: ['all-services-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services_products')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch available time slots for selected branch and date
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
    enabled: !!selectedBranch && !!appointmentDate,
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
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedBranch,
  });

  const { data: leads, isLoading } = useQuery({
    queryKey: ['leads', statusFilter, isLeadManagementPage, filterAssignedTo, filterOnlineSales, filterMarketer, filterServiceProduct, dateRange],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Check user roles
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user?.id || '');
      
      const isAdmin = userRoles?.some(r => r.role === 'admin') || false;
      const isSalesManager = userRoles?.some(r => r.role === 'sales_manager') || false;
      const isOnlineSales = userRoles?.some(r => r.role === 'online_sales') || false;
      
      let query = supabase
        .from('leads')
        .select(`
          *,
          funnel:funnels(name),
          assigned:profiles!leads_assigned_to_fkey(nickname),
          creator:profiles!leads_created_by_fkey(nickname)
        `)
        .order('created_at', { ascending: false });

      // For online sales users (but not admin/sales manager), only show leads they created
      if (isOnlineSales && !isAdmin && !isSalesManager && user) {
        query = query.eq('created_by', user.id);
      }
      // For Lead Management page, only show leads assigned to current user (excluding L2 - Call Rescheduled and Hibernation)
      else if (isLeadManagementPage && user) {
        query = query.eq('assigned_to', user.id).neq('status', 'L2-Call reschedule').neq('status', 'hibernation');
      }

      // Exclude hibernation leads from normal view unless filtered specifically
      if (!isLeadManagementPage && statusFilter !== 'hibernation') {
        query = query.neq('status', 'hibernation');
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as any);
      }

      // Apply additional filters
      if (filterAssignedTo) {
        query = query.eq('assigned_to', filterAssignedTo);
      }
      if (filterOnlineSales) {
        query = query.eq('created_by', filterOnlineSales);
      }
      if (filterMarketer) {
        query = query.eq('marketer_name', filterMarketer);
      }
      if (filterServiceProduct) {
        query = query.eq('service_product', filterServiceProduct);
      }
      if (dateRange?.from) {
        query = query.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endOfDay.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch last processor for each lead from history
      if (data && !isLeadManagementPage) {
        const leadIds = data.map(lead => lead.id);
        
        // Get the most recent history entry for each lead
        const { data: historyData } = await supabase
          .from('lead_history')
          .select('lead_id, changed_by, profiles!lead_history_changed_by_fkey(nickname)')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false });

        // Map last processor to each lead
        const lastProcessorMap = new Map();
        historyData?.forEach(history => {
          if (!lastProcessorMap.has(history.lead_id)) {
            lastProcessorMap.set(history.lead_id, history.profiles?.nickname);
          }
        });

        // Add last_processor to each lead
        return data.map(lead => ({
          ...lead,
          last_processor: lastProcessorMap.get(lead.id) || null
        }));
      }

      return data;
    },
  });

  // Get unique marketers from leads (computed after leads are fetched)
  const uniqueMarketers = [...new Set(leads?.map(lead => lead.marketer_name).filter(Boolean))] as string[];

  // Query for hibernation leads
  const { data: hibernationLeads, isLoading: isLoadingHibernation } = useQuery({
    queryKey: ['hibernation-leads'],
    queryFn: async () => {
      const now = getEffectiveTime().toISOString();
      
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          funnel:funnels(name),
          assigned:profiles!leads_assigned_to_fkey(nickname)
        `)
        .eq('status', 'hibernation')
        .order('l1_last_contact_time', { ascending: true });

      if (error) throw error;

      // Check if any leads need to be moved back to L1
      if (data && data.length > 0) {
        const thirtyDaysAgo = new Date(getEffectiveTime());
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        for (const lead of data) {
          if (lead.l1_last_contact_time) {
            const lastContact = new Date(lead.l1_last_contact_time);
            if (lastContact <= thirtyDaysAgo) {
              // Reset to L1 status and clear L1 counters
              await supabase
                .from('leads')
                .update({
                  status: 'L1-Call back',
                  l1_contact_count: 0,
                  l1_period_1_count: 0,
                  l1_period_2_count: 0,
                  l1_period_3_count: 0,
                  l1_last_contact_period: null,
                  cooldown_until: null,
                  assigned_to: null,
                  assigned_at: null,
                })
                .eq('id', lead.id);
            }
          }
        }
        
        // Refetch to get updated data
        const { data: updatedData } = await supabase
          .from('leads')
          .select(`
            *,
            funnel:funnels(name),
            assigned:profiles!leads_assigned_to_fkey(nickname)
          `)
          .eq('status', 'hibernation')
          .order('l1_last_contact_time', { ascending: true });
        
        return updatedData || [];
      }

      return data;
    },
    enabled: !isLeadManagementPage,
    refetchInterval: 60000, // Check every minute
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
          assigned:profiles!leads_assigned_to_fkey(nickname)
        `)
        .eq('assigned_to', user.id)
        .eq('status', 'L2-Call reschedule')
        .order('cooldown_until', { ascending: true, nullsFirst: false }); // Prioritize by callback time

      if (error) throw error;
      return data;
    },
    enabled: isLeadManagementPage,
  });

  // Count self-managed L2 leads for current user
  const selfManagedL2Count = followUpLeads?.length || 0;

  // Top agents queries - only on Lead Management page
  const { data: topAgentsToday } = useQuery<Array<{ name: string; count: number }>>({
    queryKey: ['top-agents-today'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('leads')
        .select('assigned_to, profiles!leads_assigned_to_fkey(nickname)')
        .eq('status', 'L6-Appointment set')
        .gte('processed_at', today.toISOString());
      
      if (error) throw error;
      
      // Count L6 by agent
      const counts = data.reduce((acc: any, lead: any) => {
        if (lead.assigned_to) {
          const agentId = lead.assigned_to;
          const agentName = lead.profiles?.nickname || 'Unknown';
          if (!acc[agentId]) {
            acc[agentId] = { name: agentName, count: 0 };
          }
          acc[agentId].count++;
        }
        return acc;
      }, {});
      
      // Get top 5 agents
      const topAgents = Object.values(counts)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 5) as Array<{ name: string; count: number }>;
      return topAgents;
    },
    enabled: isLeadManagementPage,
  });

  const { data: topAgentsWeek } = useQuery<Array<{ name: string; count: number }>>({
    queryKey: ['top-agents-week'],
    queryFn: async () => {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
      weekStart.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('leads')
        .select('assigned_to, profiles!leads_assigned_to_fkey(nickname)')
        .eq('status', 'L6-Appointment set')
        .gte('processed_at', weekStart.toISOString());
      
      if (error) throw error;
      
      // Count L6 by agent
      const counts = data.reduce((acc: any, lead: any) => {
        if (lead.assigned_to) {
          const agentId = lead.assigned_to;
          const agentName = lead.profiles?.nickname || 'Unknown';
          if (!acc[agentId]) {
            acc[agentId] = { name: agentName, count: 0 };
          }
          acc[agentId].count++;
        }
        return acc;
      }, {});
      
      // Get top 5 agents
      const topAgents = Object.values(counts)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 5) as Array<{ name: string; count: number }>;
      return topAgents;
    },
    enabled: isLeadManagementPage,
  });

  const { data: topAgentsMonth } = useQuery<Array<{ name: string; revenue: number; l6Count: number; avgRevenue: number }>>({
    queryKey: ['top-agents-month'],
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('revenue, lead_id, leads!appointments_lead_id_fkey(assigned_to, profiles!leads_assigned_to_fkey(nickname))')
        .gte('confirmed_at', monthStart.toISOString())
        .not('revenue', 'is', null);
      
      if (error) throw error;
      
      // Sum revenue by agent
      const revenues = appointments.reduce((acc: any, apt: any) => {
        const lead = apt.leads;
        if (lead?.assigned_to && apt.revenue) {
          const agentId = lead.assigned_to;
          const agentName = lead.profiles?.nickname || 'Unknown';
          if (!acc[agentId]) {
            acc[agentId] = { name: agentName, revenue: 0, l6Count: 0 };
          }
          acc[agentId].revenue += parseFloat(apt.revenue);
          acc[agentId].l6Count++;
        }
        return acc;
      }, {});
      
      // Calculate revenue per L6 and get top 5 agents
      const topAgents = Object.values(revenues)
        .map((agent: any) => ({
          ...agent,
          avgRevenue: agent.revenue / agent.l6Count
        }))
        .sort((a: any, b: any) => b.avgRevenue - a.avgRevenue)
        .slice(0, 5) as Array<{ name: string; revenue: number; l6Count: number; avgRevenue: number }>;
      
      return topAgents;
    },
    enabled: isLeadManagementPage,
  });

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
        .neq('status', 'L2-Call reschedule');

      if (existingLeads && existingLeads.length > 0) {
        throw new Error('You must complete your current lead before getting a new one');
      }

      const now = getEffectiveTime().toISOString();
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        attempts++;

        // HIGHEST PRIORITY: Try to get an L2 reschedule lead where callback time has arrived
        let { data: availableLead } = await supabase
          .from('leads')
          .select('*')
          .eq('status', 'L2-Call reschedule')
          .is('assigned_to', null)
          .not('cooldown_until', 'is', null)
          .lte('cooldown_until', now)
          .order('cooldown_until', { ascending: true }) // Prioritize earliest callbacks
          .limit(1)
          .maybeSingle();

        // Try to get L0 (Fresh Lead) if no priority L2
        if (!availableLead) {
          const result = await supabase
            .from('leads')
            .select('*')
            .eq('status', 'L0-Fresh Lead')
            .is('assigned_to', null)
            .or(`cooldown_until.is.null,cooldown_until.lt.${now}`)
            .limit(1)
            .maybeSingle();
          availableLead = result.data;
        }

        // If no L0, try L1 (No Answer)
        if (!availableLead) {
          const result = await supabase
            .from('leads')
            .select('*')
            .eq('status', 'L1-Call back')
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
            .eq('status', 'L5-Thinking')
            .is('assigned_to', null)
            .or(`cooldown_until.is.null,cooldown_until.lt.${now}`)
            .limit(1)
            .maybeSingle();
          availableLead = result.data;
        }

        if (!availableLead) {
          throw new Error('No available leads at this time');
        }

        // Assign the lead to the current user - with race condition protection
        // Only update if assigned_to is still null
        const { data: updatedLead, error } = await supabase
          .from('leads')
          .update({ 
            assigned_to: user.id,
            assigned_at: getEffectiveTime().toISOString()
          })
          .eq('id', availableLead.id)
          .is('assigned_to', null) // Critical: only update if still unassigned
          .select()
          .maybeSingle();

        if (error) throw error;

        // If updatedLead is null, another agent grabbed this lead first
        if (!updatedLead) {
          // Retry with a different lead
          continue;
        }

        // Successfully claimed the lead
        return updatedLead;
      }

      // If we've exhausted all retry attempts
      throw new Error('Unable to assign lead. Please try again.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Lead assigned', description: 'Lead has been assigned to you' });
    },
    onError: (error: any) => {
      setShowNoLeadsDialog(true);
    },
  });

  const updateLeadMutation = useMutation({
    mutationFn: async ({ leadId, data }: { leadId: string; data: any }) => {
      const { error } = await supabase
        .from('leads')
        .update(data)
        .eq('id', leadId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Lead updated successfully' });
      setIsEditDialogOpen(false);
      setEditingLead(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update lead', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: string }) => {
      const { error } = await supabase
        .from('leads')
        .update({ status: status as any })
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
      if (statusUpdate === 'L2-Call reschedule') {
        if (!callbackDate) throw new Error('Callback date is required for L2');
        if (!callbackTime) throw new Error('Callback time is required for L2');
      }

      // Validate L6 specific fields
      if (statusUpdate === 'L6-Appointment set') {
        if (!customerType) throw new Error('Customer type is required for L6');
        if (!selectedBranch) throw new Error('Branch is required for L6');
        if (!appointmentDate) throw new Error('Appointment date is required for L6');
        if (!appointmentTimeSlot) throw new Error('Appointment time is required for L6');
        
        if (customerType === 'consultation') {
          if (!concern) throw new Error('Concern is required for consultation');
          if (!expectation) throw new Error('Expectation is required for consultation');
          if (!budget) throw new Error('Budget is required for consultation');
          if (!suggestedService) throw new Error('Service/Product is required for consultation');
        } else if (customerType === 'followup') {
          if (!concurrentService) throw new Error('Concurrent service is required for follow-up');
          if (!sessionNumber) throw new Error('Session number is required for follow-up');
        }
      }

      const updates: any = { 
        status: statusUpdate as any,
        notes: statusUpdate === 'L6-Appointment set' 
          ? (customerType === 'consultation' 
              ? `[Appointment Booked] [Consultation] Concern: ${concern} | Expectation: ${expectation} | Budget: ${budget} | Service/Product: ${branchServices?.find(s => s.id === suggestedService)?.name || suggestedService}${additionalSuggestedService ? ` | Additional Suggested Service: ${branchServices?.find(s => s.id === additionalSuggestedService)?.name || additionalSuggestedService}` : ''}${additionalNotes ? ` | Notes: ${additionalNotes}` : ''}`
              : `[Appointment Booked] [Follow-up Session] Concurrent Service: ${branchServices?.find(s => s.id === concurrentService)?.name || concurrentService} | Session Number: ${sessionNumber}`)
          : (callNotes ? `[${callOutcome}] ${callNotes}` : `[${callOutcome}]`),
        processed_at: getEffectiveTime().toISOString(), // Track when telesales finished processing
        call_duration_seconds: elapsedTime, // Save call duration for reporting
      };


      // Handle L2 (Call Rescheduled) assignment logic
      if (statusUpdate === 'L2-Call reschedule') {
        if (assignTo === 'self') {
          // Keep assigned to current user for self-managed callback
          updates.assigned_to = pulledLead.assigned_to;
          updates.assigned_at = pulledLead.assigned_at;
        } else {
          // Return to pool (unassign)
          updates.assigned_to = null;
          updates.assigned_at = null;
        }

        // Set callback datetime in cooldown_until for priority system
        if (callbackDate && callbackTime) {
          const [hours, minutes] = callbackTime.split(':');
          const callbackDateTime = setMinutes(setHours(callbackDate, parseInt(hours)), parseInt(minutes));
          updates.cooldown_until = callbackDateTime.toISOString();
          updates.notes = `${updates.notes} | Callback: ${format(callbackDateTime, 'PPp')}`;
        }
      } else {
        // For all other statuses, unassign the lead
        // The lead will disappear from "My assigned leads" but history tracks who processed it
        updates.assigned_to = null;
        updates.assigned_at = null;
      }

      const { error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', pulledLead.id);

      if (error) throw error;

      // Create appointment for L6
      if (statusUpdate === 'L6-Appointment set' && appointmentTimeSlot) {
        const { data: { user } } = await supabase.auth.getUser();
        
        const appointmentDateTime = new Date(appointmentDate!);
        const [hours, minutes] = availableTimeSlots?.find(slot => slot.id === appointmentTimeSlot)?.slot_time.split(':') || ['0', '0'];
        appointmentDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        const { error: appointmentError } = await supabase
          .from('appointments')
          .insert({
            lead_id: pulledLead.id,
            branch_id: selectedBranch,
            time_slot_id: appointmentTimeSlot,
            appointment_date: appointmentDateTime.toISOString(),
            assigned_to: pulledLead.assigned_to || user?.id,
            created_by: user?.id,
            notes: updates.notes,
            service_product: (branchServices?.find(s => s.id === suggestedService)?.name) || (branchServices?.find(s => s.id === concurrentService)?.name) || pulledLead.service_product,
          });

        if (appointmentError) throw appointmentError;

        // Update time slot booked count
        const currentSlot = availableTimeSlots?.find(slot => slot.id === appointmentTimeSlot);
        if (currentSlot) {
          const { error: slotError } = await supabase
            .from('time_slots')
            .update({ booked_count: (currentSlot.booked_count || 0) + 1 })
            .eq('id', appointmentTimeSlot);

          if (slotError) throw slotError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['follow-up-leads'] });
      queryClient.invalidateQueries({ queryKey: ['hibernation-leads'] });
      setIsLeadModalOpen(false);
      setPulledLead(null);
      setCallOutcome('');
      setCallNotes('');
      setStatusUpdate('');
      setElapsedTime(0);
      setCallbackDate(undefined);
      setCallbackTime('10:00');
      setAssignTo('self');
      setCustomerType('');
      setSelectedBranch('');
      setAppointmentDate(undefined);
      setAppointmentTimeSlot('');
      setConcern('');
      setExpectation('');
      setBudget('');
      setSuggestedService('');
      setAdditionalSuggestedService('');
      setAdditionalNotes('');
      setConcurrentService('');
      setSessionNumber('');
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




  // Auto-set call outcome when L2 is selected, and reset when status changes
  useEffect(() => {
    if (statusUpdate === 'L2-Call reschedule') {
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

  // Timer for lead call tracking - increment elapsed time during call
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (pulledLead && isLeadModalOpen) {
      // Start timer when call dialog is open
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pulledLead, isLeadModalOpen]);

  // Update agent status when entering/exiting call
  useEffect(() => {
    const updateAgentStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (isLeadModalOpen && pulledLead) {
        // Set status to "in_call"
        await supabase
          .from('agent_status')
          .upsert({
            user_id: user.id,
            status: 'in_call',
            status_started_at: new Date().toISOString(),
            lead_id: pulledLead.id,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id'
          });
      } else {
        // Set status to "idle"
        await supabase
          .from('agent_status')
          .upsert({
            user_id: user.id,
            status: 'idle',
            status_started_at: new Date().toISOString(),
            lead_id: null,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id'
          });
      }
    };

    updateAgentStatus();
  }, [isLeadModalOpen, pulledLead]);


  // Timer state to force re-render of countdown displays
  const [timerTick, setTimerTick] = useState(0);

  // Update timer tick every second to refresh countdown displays
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Auto-return expired leads to pool
  useEffect(() => {
    if (!isLeadManagementPage || !isTeleSales || isLeadModalOpen) return;

    const checkExpiredLeads = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const thirtyMinutesAgo = new Date(); // Use real time for assignment expiry
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
              status: 'L0-Fresh Lead'
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
    const now = new Date(); // Use real time for assignment countdown
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

  const L3_CALL_OUTCOMES = [
    'Not Interested',
    'Session Already Booked',
    'Too Expensive'
  ];

  const L4_CALL_OUTCOMES = [
    'Wrong Person',
    'Incorrect Number',
    'Scam Call'
  ];

  const L5_CALL_OUTCOMES = [
    'Currently No Budget',
    'Currently Busy',
    'Spouse/Partner Disagree'
  ];

  const L6_CALL_OUTCOMES = [
    'Appointment Confirmed'
  ];

  // Get filtered call outcomes based on status
  const getCallOutcomes = () => {
    if (statusUpdate === 'L1-Call back') {
      return L1_CALL_OUTCOMES;
    }
    if (statusUpdate === 'L3-Cancelled') {
      return L3_CALL_OUTCOMES;
    }
    if (statusUpdate === 'L4-Blacklisted') {
      return L4_CALL_OUTCOMES;
    }
    if (statusUpdate === 'L5-Thinking') {
      return L5_CALL_OUTCOMES;
    }
    if (statusUpdate === 'L6-Appointment set') {
      return L6_CALL_OUTCOMES;
    }
    return CALL_OUTCOMES;
  };

  const AVAILABLE_STATUSES = Object.entries(STATUS_LABELS).filter(([key]) => key !== 'L0-Fresh Lead' && key !== 'hibernation');

  if (isLoading) {
    return <div className="text-center py-8">Loading leads...</div>;
  }

  // Calculate status summary
  const statusSummary = leads?.reduce((acc, lead) => {
    const status = lead.status as keyof typeof STATUS_LABELS;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col">
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
              <div className="grid grid-cols-3 gap-6">
                {/* Left side - Form (2/3 width) */}
                <div className="col-span-2 space-y-6">
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
                      {/* Call Outcome */}
                      <div className="space-y-2">
                        <Label htmlFor="call-outcome">Call Outcome *</Label>
                        <Select 
                          value={statusUpdate === 'L6-Appointment set' ? 'Appointment Booked' : callOutcome} 
                          onValueChange={setCallOutcome}
                          disabled={statusUpdate === 'L2-Call reschedule' || statusUpdate === 'L6-Appointment set'}
                        >
                          <SelectTrigger id="call-outcome">
                            <SelectValue placeholder="Select outcome" />
                          </SelectTrigger>
                          <SelectContent>
                            {statusUpdate === 'L6-Appointment set' ? (
                              <SelectItem value="Appointment Booked">Appointment Booked</SelectItem>
                            ) : (
                              getCallOutcomes().map((outcome) => (
                                <SelectItem key={outcome} value={outcome}>
                                  {outcome}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* L6 Specific Fields */}
                      {statusUpdate === 'L6-Appointment set' && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="customer-type">Type of Customer *</Label>
                            <Select value={customerType} onValueChange={setCustomerType}>
                              <SelectTrigger id="customer-type">
                                <SelectValue placeholder="Select customer type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="consultation">Consultation needed</SelectItem>
                                <SelectItem value="followup">Follow up sessions</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="branch">Branch *</Label>
                            <Select 
                              value={selectedBranch} 
                              onValueChange={(value) => {
                                setSelectedBranch(value);
                                setAppointmentDate(undefined);
                                setAppointmentTimeSlot('');
                              }}
                            >
                              <SelectTrigger id="branch">
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
                            <Label htmlFor="appointment-date">Appointment Date *</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  id="appointment-date"
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
                            <Label htmlFor="appointment-time">Appointment Time *</Label>
                            <Select 
                              value={appointmentTimeSlot} 
                              onValueChange={setAppointmentTimeSlot}
                              disabled={!selectedBranch || !appointmentDate}
                            >
                              <SelectTrigger 
                                id="appointment-time"
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
                                <Label htmlFor="concern">Concern *</Label>
                                <Textarea
                                  id="concern"
                                  placeholder="Enter customer's concern..."
                                  value={concern}
                                  onChange={(e) => setConcern(e.target.value)}
                                  rows={2}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="expectation">Expectation *</Label>
                                <Textarea
                                  id="expectation"
                                  placeholder="Enter customer's expectation..."
                                  value={expectation}
                                  onChange={(e) => setExpectation(e.target.value)}
                                  rows={2}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="budget">Budget *</Label>
                                <Input
                                  id="budget"
                                  placeholder="Enter budget amount..."
                                  value={budget}
                                  onChange={(e) => setBudget(e.target.value)}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="suggested-service">Service/Product *</Label>
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
                                <Label htmlFor="additional-suggested-service">Additional Suggested Service</Label>
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
                                <Label htmlFor="additional-notes">Additional Notes</Label>
                                <Textarea
                                  id="additional-notes"
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
                                <Label htmlFor="concurrent-service">Concurrent Service *</Label>
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
                                <Label htmlFor="session-number">Session Number *</Label>
                                <Input
                                  id="session-number"
                                  type="number"
                                  placeholder="Enter session number..."
                                  value={sessionNumber}
                                  onChange={(e) => setSessionNumber(e.target.value)}
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* L2 Specific Fields */}
                      {statusUpdate === 'L2-Call reschedule' && (
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

                      {/* L5 Specific Fields */}
                      {statusUpdate === 'L5-Thinking' && (
                        <div className="space-y-2">
                          <Label htmlFor="call-back-in">Call Back In *</Label>
                          <Select value={callBackIn} onValueChange={setCallBackIn}>
                            <SelectTrigger id="call-back-in">
                              <SelectValue placeholder="Select timeframe" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1_day">1 Days</SelectItem>
                              <SelectItem value="3_days">3 Days</SelectItem>
                              <SelectItem value="1_week">1 Week</SelectItem>
                              <SelectItem value="1_month">1 Month</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Call Notes - Hide for L6 */}
                      {statusUpdate !== 'L6-Appointment set' && (
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
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Right side - Quick History (1/3 width) */}
              <div className="col-span-1 space-y-4">
                <div className="sticky top-0">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Quick History
                  </h3>
                  <div className="space-y-3">
                    {leadHistory && leadHistory.length > 0 ? (
                      leadHistory.map((history, index) => (
                        <div 
                          key={history.id} 
                          className="p-3 bg-muted/50 rounded-lg border border-border space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              Attempt #{leadHistory.length - index}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(history.created_at), 'MMM d, h:mm a')}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs">
                              <span className="text-muted-foreground">Status: </span>
                              <span className="font-medium">
                                {STATUS_LABELS[history.new_status as keyof typeof STATUS_LABELS]}
                              </span>
                            </div>
                            {history.notes && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">Notes: </span>
                                <p className="text-foreground mt-1 line-clamp-3">
                                  {history.notes}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-sm text-muted-foreground bg-muted/30 rounded-lg">
                        No previous attempts
                      </div>
                    )}
                  </div>
                </div>
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
                setCallBackIn('');
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
                setOpenSuggestedServiceCombo(false);
                setOpenAdditionalServiceCombo(false);
                setOpenConcurrentServiceCombo(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => submitCallMutation.mutate()}
              disabled={
                !statusUpdate || 
                submitCallMutation.isPending ||
                (statusUpdate !== 'L6-Appointment set' && !callOutcome) ||
                (statusUpdate === 'L2-Call reschedule' && (!callbackDate || !callbackTime)) ||
                (statusUpdate === 'L5-Thinking' && !callBackIn) ||
                (statusUpdate === 'L6-Appointment set' && (!customerType || !selectedBranch || !appointmentDate || !appointmentTimeSlot ||
                  (customerType === 'consultation' && (!concern || !expectation || !budget || !suggestedService)) ||
                  (customerType === 'followup' && (!concurrentService || !sessionNumber))))
              }
            >
              Submit Call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* My Assigned Leads */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {isLeadManagementPage ? 'My Assigned Leads' : 'Lead Management'}
          </h2>
          
          {isLeadManagementPage && isTeleSales && (
            <Button 
              onClick={() => getLeadMutation.mutate()}
              disabled={getLeadMutation.isPending || (leads && leads.length > 0)}
            >
              Get Lead
            </Button>
          )}
        </div>

        {/* Advanced Filters - Only on Lead Management page */}
        {!isLeadManagementPage && (
          <Collapsible open={isFilterOpen} onOpenChange={setIsFilterOpen} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                  <Filter className="w-4 h-4 text-muted-foreground mr-2" />
                  <h3 className="font-semibold text-sm">Advanced Filters</h3>
                  <ChevronDown className={cn("w-4 h-4 ml-2 transition-transform", isFilterOpen && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
              {(searchQuery || filterAssignedTo || filterOnlineSales || filterMarketer || filterServiceProduct || dateRange) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleClearFilters}
                >
                  Clear All
                </Button>
              )}
            </div>

            <CollapsibleContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Search by name or phone */}
                <div className="space-y-1">
                  <Label htmlFor="search-query" className="text-xs">Search Name/Phone</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      id="search-query"
                      placeholder="Name or phone..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="pl-7 h-8 text-sm"
                    />
                  </div>
                </div>

                {/* Assigned To Filter */}
                <div className="space-y-1">
                  <Label htmlFor="filter-assigned" className="text-xs">Assigned To</Label>
                  <Select 
                    value={tempFilterAssignedTo || "__all__"} 
                    onValueChange={(val) => {
                      setTempFilterAssignedTo(val === "__all__" ? '' : val);
                    }}
                  >
                    <SelectTrigger id="filter-assigned" className="h-8 text-sm">
                      <SelectValue placeholder="All agents" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All agents</SelectItem>
                      <SelectItem value="__unassigned__">Unassigned</SelectItem>
                      {allUsers?.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.nickname}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Online Sales Filter */}
                <div className="space-y-1">
                  <Label htmlFor="filter-online-sales" className="text-xs">Online Sales</Label>
                  <Select 
                    value={tempFilterOnlineSales || "__all__"} 
                    onValueChange={(val) => {
                      setTempFilterOnlineSales(val === "__all__" ? '' : val);
                    }}
                  >
                    <SelectTrigger id="filter-online-sales" className="h-8 text-sm">
                      <SelectValue placeholder="All online sales" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All online sales</SelectItem>
                      {onlineSalesUsers?.map((user: any) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.nickname}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Marketer Filter */}
                <div className="space-y-1">
                  <Label htmlFor="filter-marketer" className="text-xs">Marketer</Label>
                  <Select 
                    value={tempFilterMarketer || "__all__"} 
                    onValueChange={(val) => {
                      setTempFilterMarketer(val === "__all__" ? '' : val);
                    }}
                  >
                    <SelectTrigger id="filter-marketer" className="h-8 text-sm">
                      <SelectValue placeholder="All marketers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All marketers</SelectItem>
                      {uniqueMarketers.map((marketer) => (
                        <SelectItem key={marketer} value={marketer}>
                          {marketer}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Service/Product Filter */}
                <div className="space-y-1">
                  <Label htmlFor="filter-service" className="text-xs">Service/Product</Label>
                  <Select 
                    value={tempFilterServiceProduct || "__all__"} 
                    onValueChange={(val) => {
                      setTempFilterServiceProduct(val === "__all__" ? '' : val);
                    }}
                  >
                    <SelectTrigger id="filter-service" className="h-8 text-sm">
                      <SelectValue placeholder="All services" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All services</SelectItem>
                      {allServicesProducts?.map((service) => (
                        <SelectItem key={service.id} value={service.name}>
                          {service.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Lead Generation Date Range */}
                <div className="space-y-1">
                  <Label htmlFor="date-range" className="text-xs">Lead Generation Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="date-range"
                        variant="outline"
                        className={cn(
                          "w-full h-8 justify-start text-left font-normal text-sm",
                          !tempDateRange?.from && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {tempDateRange?.from ? (
                          tempDateRange.to ? (
                            <>
                              {format(tempDateRange.from, "PP")} - {format(tempDateRange.to, "PP")}
                            </>
                          ) : (
                            format(tempDateRange.from, "PP")
                          )
                        ) : (
                          "Pick date range"
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={tempDateRange}
                        onSelect={(range) => {
                          setTempDateRange(range);
                        }}
                        initialFocus
                        numberOfMonths={2}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              {/* Search and Clear Buttons */}
              <div className="flex gap-2">
                <Button 
                  onClick={handleApplyFilters}
                  size="sm"
                  className="h-8"
                >
                  <Search className="w-3 h-3 mr-2" />
                  Search
                </Button>
                <Button 
                  onClick={handleClearFilters}
                  variant="outline"
                  size="sm"
                  className="h-8"
                >
                  Clear Filters
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

      {/* Status Summary */}
      {!isLeadManagementPage && (
        <div className="mb-4 p-3 bg-muted/50 rounded-lg">
          <h3 className="text-sm font-semibold mb-2">Lead Status Summary - Click to Filter</h3>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {Object.entries(STATUS_LABELS).filter(([key]) => key !== 'hibernation').map(([statusKey, statusLabel]) => {
              const count = statusSummary?.[statusKey] || 0;
              const isSelected = selectedStatuses.includes(statusKey);
              return (
                <button
                  key={statusKey}
                  onClick={() => {
                    setSelectedStatuses(prev => {
                      if (prev.includes(statusKey)) {
                        // Remove if already selected
                        return prev.filter(s => s !== statusKey);
                      } else {
                        // Add to selection
                        return [...prev, statusKey];
                      }
                    });
                    setCurrentPage(1); // Reset to first page
                  }}
                  className={cn(
                    "flex flex-col p-2 rounded-md border transition-all cursor-pointer hover:shadow-md",
                    isSelected 
                      ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                      : "bg-background hover:bg-accent"
                  )}
                >
                  <span className={cn(
                    "text-lg font-bold",
                    isSelected ? "text-primary-foreground" : "text-primary"
                  )}>{count}</span>
                  <span className={cn(
                    "text-xs leading-tight",
                    isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}>{statusLabel}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t flex justify-between items-center text-xs">
            <div className="flex items-center gap-3">
              <div>
                <span className="font-medium">Total Active: </span>
                <span className="font-bold text-primary">{leads?.length || 0}</span>
              </div>
              {selectedStatuses.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => {
                    setSelectedStatuses([]);
                    setCurrentPage(1);
                  }}
                >
                  Clear ({selectedStatuses.length})
                </Button>
              )}
            </div>
            <div>
              <span className="font-medium">Hibernation: </span>
              <span className="font-bold text-orange-500">{hibernationLeads?.length || 0}</span>
            </div>
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
              {!isLeadManagementPage && <TableHead>Marketer</TableHead>}
              {!isLeadManagementPage && <TableHead>Online Sales</TableHead>}
              {!isLeadManagementPage && <TableHead>Assigned To</TableHead>}
              {isLeadManagementPage && <TableHead>Time Remaining</TableHead>}
              {isLeadManagementPage && <TableHead>Actions</TableHead>}
              {!isLeadManagementPage && isAdmin && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              // Filter leads based on search query and selected statuses
              const filteredLeads = leads?.filter(lead => {
                // Search filter
                if (searchQuery) {
                  const query = searchQuery.toLowerCase();
                  const fullName = `${lead.first_name} ${lead.last_name}`.toLowerCase();
                  const phone = lead.phone.toLowerCase();
                  if (!fullName.includes(query) && !phone.includes(query)) {
                    return false;
                  }
                }
                
                // Status filter (only if statuses are selected)
                if (selectedStatuses.length > 0) {
                  if (!selectedStatuses.includes(lead.status)) {
                    return false;
                  }
                }
                
                // Assigned To filter
                if (filterAssignedTo) {
                  if (filterAssignedTo === '__unassigned__') {
                    if (lead.assigned_to !== null) return false;
                  } else if (lead.assigned_to !== filterAssignedTo) {
                    return false;
                  }
                }
                
                // Online Sales (created_by) filter
                if (filterOnlineSales && lead.created_by !== filterOnlineSales) {
                  return false;
                }
                
                // Marketer filter
                if (filterMarketer && lead.marketer_name !== filterMarketer) {
                  return false;
                }
                
                // Service/Product filter
                if (filterServiceProduct && lead.service_product !== filterServiceProduct) {
                  return false;
                }
                
                return true;
              }) || [];

              // Apply pagination to filtered results
              const paginatedLeads = filteredLeads.slice((currentPage - 1) * leadsPerPage, currentPage * leadsPerPage);

              return paginatedLeads.map((lead) => (
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
                    <Badge>{STATUS_LABELS[lead.status as keyof typeof STATUS_LABELS]}</Badge>
                  </TableCell>
                )}
                {!isLeadManagementPage && (
                  <TableCell>{lead.marketer_name || '-'}</TableCell>
                )}
                {!isLeadManagementPage && (
                  <TableCell>{lead.creator?.nickname || '-'}</TableCell>
                )}
                {!isLeadManagementPage && (
                  <TableCell>
                    {lead.assigned?.nickname || (lead as any).last_processor || 'Unassigned'}
                  </TableCell>
                )}
                {isLeadManagementPage && (
                  <TableCell>
                    {lead.assigned_at && (() => {
                      // Reference timerTick to force re-render every second
                      const _ = timerTick;
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
                    {!lead.assigned_to && isTeleSales && lead.status === 'L0-Fresh Lead' && (
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
                {!isLeadManagementPage && isAdmin && (
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingLead(lead);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
              ));
            })()}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {(() => {
        const filteredLeads = leads?.filter(lead => {
          // Search filter
          if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const fullName = `${lead.first_name} ${lead.last_name}`.toLowerCase();
            const phone = lead.phone.toLowerCase();
            if (!fullName.includes(query) && !phone.includes(query)) {
              return false;
            }
          }
          
          // Status filter (only if statuses are selected)
          if (selectedStatuses.length > 0) {
            if (!selectedStatuses.includes(lead.status)) {
              return false;
            }
          }
          
          // Assigned To filter
          if (filterAssignedTo) {
            if (filterAssignedTo === '__unassigned__') {
              if (lead.assigned_to !== null) return false;
            } else if (lead.assigned_to !== filterAssignedTo) {
              return false;
            }
          }
          
          // Online Sales (created_by) filter
          if (filterOnlineSales && lead.created_by !== filterOnlineSales) {
            return false;
          }
          
          // Marketer filter
          if (filterMarketer && lead.marketer_name !== filterMarketer) {
            return false;
          }
          
          // Service/Product filter
          if (filterServiceProduct && lead.service_product !== filterServiceProduct) {
            return false;
          }
          
          return true;
        }) || [];

        return filteredLeads.length > leadsPerPage && (
        <div className="mt-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage > 1) setCurrentPage(currentPage - 1);
                  }}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              
              {Array.from({ length: Math.ceil(filteredLeads.length / leadsPerPage) }, (_, i) => i + 1).map((page) => {
                const totalPages = Math.ceil(filteredLeads.length / leadsPerPage);
                // Show first page, last page, current page, and one page on each side of current
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(page);
                        }}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  );
                } else if (page === currentPage - 2 || page === currentPage + 2) {
                  return (
                    <PaginationItem key={page}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  );
                }
                return null;
              })}

              <PaginationItem>
                <PaginationNext 
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage < Math.ceil(filteredLeads.length / leadsPerPage)) {
                      setCurrentPage(currentPage + 1);
                    }
                  }}
                  className={currentPage >= Math.ceil(filteredLeads.length / leadsPerPage) ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
        );
      })()}
      </Card>

      {/* Hibernation Leads - Only on Leads page */}
      {!isLeadManagementPage && (
        <Card className="p-6">
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">Hibernation Leads</h2>
              <Badge variant="secondary">
                {hibernationLeads?.length || 0}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              L1 leads that completed 6 calls. Will automatically return to L1 after 30 days.
            </p>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Service/Product</TableHead>
                  <TableHead>Last Contact</TableHead>
                  <TableHead>Days in Hibernation</TableHead>
                  <TableHead>Returns to L1 in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hibernationLeads && hibernationLeads.length > 0 ? (
                  hibernationLeads.map((lead) => {
                    const lastContact = lead.l1_last_contact_time ? new Date(lead.l1_last_contact_time) : null;
                    const now = getEffectiveTime();
                    const daysInHibernation = lastContact 
                      ? Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24))
                      : 0;
                    const daysRemaining = Math.max(0, 30 - daysInHibernation);
                    
                    return (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">
                          {lead.first_name} {lead.last_name}
                          {lead.is_duplicate && (
                            <Badge variant="destructive" className="ml-2">Duplicate</Badge>
                          )}
                        </TableCell>
                        <TableCell>{lead.phone}</TableCell>
                        <TableCell>{lead.service_product || '-'}</TableCell>
                        <TableCell>
                          {lastContact ? format(lastContact, 'PPp') : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{daysInHibernation} days</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={daysRemaining === 0 ? "default" : "secondary"}>
                            {daysRemaining === 0 ? 'Ready' : `${daysRemaining} days`}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No hibernation leads at this time
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

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

      {/* Top Agents - Only on Lead Management page */}
      {isLeadManagementPage && (
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-6">Top Agents</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Today */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-primary">Today</h3>
              <div className="space-y-2">
                {topAgentsToday && topAgentsToday.length > 0 ? (
                  topAgentsToday.map((agent, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-primary">#{index + 1}</span>
                        <div>
                          <p className="font-medium">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.count} L6</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
                )}
              </div>
            </div>

            {/* This Week */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-blue-600 dark:text-blue-400">This Week</h3>
              <div className="space-y-2">
                {topAgentsWeek && topAgentsWeek.length > 0 ? (
                  topAgentsWeek.map((agent, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-blue-600 dark:text-blue-400">#{index + 1}</span>
                        <div>
                          <p className="font-medium">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.count} L6</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
                )}
              </div>
            </div>

            {/* This Month */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-green-600 dark:text-green-400">This Month</h3>
              <div className="space-y-2">
                {topAgentsMonth && topAgentsMonth.length > 0 ? (
                  topAgentsMonth.map((agent, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">#{index + 1}</span>
                        <div>
                          <p className="font-medium">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {agent.l6Count} L6, ฿{agent.revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}


      {/* Lead Edit Dialog */}
      <LeadEditDialog
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setEditingLead(null);
        }}
        onSave={(data) => updateLeadMutation.mutate({ leadId: editingLead.id, data })}
        lead={editingLead}
        isSaving={updateLeadMutation.isPending}
      />
    </div>
  );
}
