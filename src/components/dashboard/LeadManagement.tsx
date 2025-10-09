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
import { Clock, Settings, Phone, User } from 'lucide-react';

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

      // For Lead Management page, only show leads assigned to current user
      if (isLeadManagementPage && user) {
        query = query.eq('assigned_to', user.id);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as any);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const assignToMeMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('leads')
        .update({ assigned_to: user.id })
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
        .update({ assigned_to: user.id })
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

      const updates: any = { 
        status: statusUpdate as any,
        notes: callNotes ? `[${callOutcome}] ${callNotes}` : `[${callOutcome}]`
      };
      
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
      setIsLeadModalOpen(false);
      setPulledLead(null);
      setCallOutcome('');
      setCallNotes('');
      setStatusUpdate('');
      setElapsedTime(0);
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

  // Timer for lead call tracking
  useEffect(() => {
    if (!isLeadModalOpen) return;

    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isLeadModalOpen]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Lead Call Session
            </DialogTitle>
            <DialogDescription>
              Complete the call and update the lead status
            </DialogDescription>
          </DialogHeader>
          
          {pulledLead && (
            <div className="space-y-6">
              {/* Timer */}
              <div className="flex justify-center">
                <div className="text-center p-4 bg-primary/10 rounded-lg">
                  <Clock className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <div className="text-3xl font-bold text-primary">{formatTime(elapsedTime)}</div>
                  <p className="text-sm text-muted-foreground mt-1">Call Duration</p>
                </div>
              </div>

              {/* Lead Details */}
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

              {/* Call Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="call-outcome">Call Outcome *</Label>
                  <Select value={callOutcome} onValueChange={setCallOutcome}>
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
              </div>
            </div>
          )}

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
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => submitCallMutation.mutate()}
              disabled={!callOutcome || !statusUpdate || submitCallMutation.isPending}
            >
              Submit Call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cooldown Settings - Only for Admin/Sales Manager */}
      {(isAdmin || isSalesManager) && (
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
                    step="0.5"
                    placeholder={`Current: ${l1Setting?.setting_value || 0}`}
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
                    step="0.5"
                    placeholder={`Current: ${l5Setting?.setting_value || 0}`}
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

      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {isLeadManagementPage ? 'My Assigned Leads' : 'Lead Management'}
          </h2>
          
          {isLeadManagementPage ? (
            isTeleSales && (
              <Button 
                onClick={() => getLeadMutation.mutate()}
                disabled={getLeadMutation.isPending}
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
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cooldown Status</TableHead>
              <TableHead>Funnel</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Actions</TableHead>
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
                <TableCell>{lead.email || '-'}</TableCell>
                <TableCell>{lead.phone}</TableCell>
                <TableCell>
                  {(isTeleSales || isAdmin || isSalesManager) ? (
                    <Select
                      value={lead.status}
                      onValueChange={(value) => 
                        updateStatusMutation.mutate({ leadId: lead.id, status: value })
                      }
                    >
                      <SelectTrigger className="w-40">
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
                <TableCell>{lead.funnel?.name}</TableCell>
                <TableCell>{lead.assigned?.full_name || 'Unassigned'}</TableCell>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      </Card>
    </div>
  );
}
