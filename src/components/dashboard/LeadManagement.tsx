import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Clock } from 'lucide-react';

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
  
  // Determine if this is the Lead Management page (only assigned leads) or Leads page (all leads)
  const isLeadManagementPage = location.pathname === '/dashboard/lead-management';

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

  const setCooldownMutation = useMutation({
    mutationFn: async ({ leadId, hours }: { leadId: string; hours: number }) => {
      const cooldownUntil = new Date();
      cooldownUntil.setHours(cooldownUntil.getHours() + hours);

      const { error } = await supabase
        .from('leads')
        .update({ cooldown_until: cooldownUntil.toISOString() })
        .eq('id', leadId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Cooldown set', description: 'Contact cooldown has been set for this lead' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to set cooldown', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

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
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">
          {isLeadManagementPage ? 'My Assigned Leads' : 'Lead Management'}
        </h2>
        
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
      </div>

      {/* Status Summary */}
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cooldown</TableHead>
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
                    (lead.status === 'status_1' || lead.status === 'status_5') && (isTeleSales || isAdmin || isSalesManager) && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            Set Cooldown
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Set Contact Cooldown</DialogTitle>
                            <DialogDescription>
                              Choose how long before this lead can be contacted again.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-2 pt-4">
                            <Button
                              onClick={() => setCooldownMutation.mutate({ leadId: lead.id, hours: 24 })}
                              disabled={setCooldownMutation.isPending}
                            >
                              24 Hours
                            </Button>
                            <Button
                              onClick={() => setCooldownMutation.mutate({ leadId: lead.id, hours: 48 })}
                              disabled={setCooldownMutation.isPending}
                            >
                              48 Hours
                            </Button>
                            <Button
                              onClick={() => setCooldownMutation.mutate({ leadId: lead.id, hours: 72 })}
                              disabled={setCooldownMutation.isPending}
                            >
                              72 Hours
                            </Button>
                            <Button
                              onClick={() => setCooldownMutation.mutate({ leadId: lead.id, hours: 168 })}
                              disabled={setCooldownMutation.isPending}
                            >
                              1 Week
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
