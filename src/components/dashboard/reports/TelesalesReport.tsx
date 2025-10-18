import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Award, TrendingUp, Users, Target, CalendarIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type DateFilterType = 'generation' | 'processing';

export function TelesalesReport() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 7)),
    to: new Date(),
  });
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('generation');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (userId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const { data: telesalesStats } = useQuery({
    queryKey: ['telesales-stats', dateRange, dateFilterType],
    queryFn: async () => {
      // Get all telesales users
      const { data: telesalesUsers } = await supabase
        .from('user_roles')
        .select('user_id, profiles(full_name, email)')
        .eq('role', 'tele_sales');

      if (!telesalesUsers) return [];

      // Get stats for each telesales user
      const stats = await Promise.all(
        telesalesUsers.map(async (user) => {
          const userId = user.user_id;
          
          // Get lead count - number of times agent got a lead
          let getLeadQuery = supabase
            .from('lead_history')
            .select('lead_id', { count: 'exact', head: true })
            .eq('new_assigned_to', userId)
            .not('old_assigned_to', 'eq', userId);
          
          if (dateFilterType === 'generation') {
            // Filter by when lead was created
            const { data: leadIds } = await supabase
              .from('lead_history')
              .select('lead_id')
              .eq('new_assigned_to', userId)
              .not('old_assigned_to', 'eq', userId);
            
            if (leadIds && leadIds.length > 0) {
              let leadsQuery = supabase
                .from('leads')
                .select('id', { count: 'exact', head: true })
                .in('id', leadIds.map(l => l.lead_id));
              
              if (dateRange?.from) {
                leadsQuery = leadsQuery.gte('created_at', dateRange.from.toISOString());
              }
              if (dateRange?.to) {
                leadsQuery = leadsQuery.lte('created_at', dateRange.to.toISOString());
              }
              
              const { count: getLeadCount } = await leadsQuery;
              
              // Continue with other queries for these filtered leads
              const { data: filteredLeads } = await supabase
                .from('leads')
                .select('id')
                .in('id', leadIds.map(l => l.lead_id))
                .gte('created_at', dateRange?.from?.toISOString() || '')
                .lte('created_at', dateRange?.to?.toISOString() || '');
              
              const filteredLeadIds = filteredLeads?.map(l => l.id) || [];
              
              return await getStatsForLeads(userId, filteredLeadIds, getLeadCount || 0);
            }
            return await getStatsForLeads(userId, [], 0);
          } else {
            // Filter by processing date
            if (dateRange?.from) {
              getLeadQuery = getLeadQuery.gte('created_at', dateRange.from.toISOString());
            }
            if (dateRange?.to) {
              getLeadQuery = getLeadQuery.lte('created_at', dateRange.to.toISOString());
            }
            
            const { count: getLeadCount } = await getLeadQuery;
            
            // Get lead IDs for this time period
            const { data: historyData } = await supabase
              .from('lead_history')
              .select('lead_id')
              .eq('new_assigned_to', userId)
              .not('old_assigned_to', 'eq', userId)
              .gte('created_at', dateRange?.from?.toISOString() || '')
              .lte('created_at', dateRange?.to?.toISOString() || '');
            
            const leadIds = historyData?.map(h => h.lead_id) || [];
            
            return await getStatsForLeads(userId, leadIds, getLeadCount || 0);
          }
        })
      );

      return stats.sort((a, b) => b.l6Count - a.l6Count);
    },
  });

  const getStatsForLeads = async (userId: string, leadIds: string[], getLeadCount: number) => {
    // Get unique leads handled (processed) by this agent
    let handledQuery = supabase
      .from('leads')
      .select('id, status, call_duration_seconds', { count: 'exact', head: false })
      .eq('assigned_to', userId)
      .not('processed_at', 'is', null);
    
    if (dateFilterType === 'processing' && dateRange?.from) {
      handledQuery = handledQuery.gte('processed_at', dateRange.from.toISOString());
    }
    if (dateFilterType === 'processing' && dateRange?.to) {
      handledQuery = handledQuery.lte('processed_at', dateRange.to.toISOString());
    }
    
    const { data: handledLeads } = await handledQuery;
    const leadsHandled = handledLeads?.length || 0;
    
    // Count status breakdown
    const statusCounts = (handledLeads || []).reduce((acc, lead) => {
      if (lead && lead.status) {
        acc[lead.status] = (acc[lead.status] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const l1Count = statusCounts['L1-Call back'] || 0;
    const l2Count = statusCounts['L2-Call reschedule'] || 0;
    const l3Count = statusCounts['L3-Cancelled'] || 0;
    const l4Count = statusCounts['L4-Blacklisted'] || 0;
    const l5Count = statusCounts['L5-Thinking'] || 0;
    const l6Count = statusCounts['L6-Appointment set'] || 0;

    // Calculate average call time from handled leads
    const totalCallTime = (handledLeads || []).reduce((sum, lead) => sum + (lead.call_duration_seconds || 0), 0);
    const avgCallTime = leadsHandled > 0 ? Math.round(totalCallTime / leadsHandled) : 0;

    // Get confirmed appointments
    let confirmedQuery = supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .eq('confirmation_status', 'confirmed');
    
    if (dateFilterType === 'processing' && dateRange?.from) {
      confirmedQuery = confirmedQuery.gte('confirmed_at', dateRange.from.toISOString());
    }
    if (dateFilterType === 'processing' && dateRange?.to) {
      confirmedQuery = confirmedQuery.lte('confirmed_at', dateRange.to.toISOString());
    }
    
    const { count: confirmedCount } = await confirmedQuery;

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    // Conversion rate = L6 / (Leads Handled - L4)
    const conversionBase = leadsHandled - l4Count;
    const conversionRate = conversionBase > 0 ? ((l6Count / conversionBase) * 100).toFixed(1) : '0';
    const confirmationRate = l6Count > 0 ? ((confirmedCount || 0) / l6Count * 100).toFixed(1) : '0';

    return {
      userId,
      name: profile?.full_name || 'Unknown',
      email: profile?.email || '',
      getLeadCount,
      leadsHandled,
      l1Count,
      l2Count,
      l3Count,
      l4Count,
      l5Count,
      l6Count,
      confirmedCount: confirmedCount || 0,
      conversionRate,
      confirmationRate,
      avgCallTime,
      statusCounts,
    };
  };

  // Get agent status for all telesales users
  const { data: agentStatuses } = useQuery({
    queryKey: ['agent-statuses'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_status')
        .select('user_id, status, status_started_at');
      
      return data || [];
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const getAgentStatusDisplay = (userId: string) => {
    const status = agentStatuses?.find(s => s.user_id === userId);
    if (!status) return <Badge variant="secondary">Unknown</Badge>;

    const now = new Date();
    const startedAt = new Date(status.status_started_at);
    const diffMs = now.getTime() - startedAt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    
    const timeStr = diffMins > 0 ? `${diffMins}m ${diffSecs}s` : `${diffSecs}s`;

    if (status.status === 'in_call') {
      return <Badge variant="default">In call for {timeStr}</Badge>;
    } else {
      return <Badge variant="secondary">Idled for {timeStr}</Badge>;
    }
  };

  const formatCallTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const { data: unassignedLeads } = useQuery({
    queryKey: ['unassigned-leads'],
    queryFn: async () => {
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'L0-Fresh Lead')
        .is('assigned_to', null);
      return count || 0;
    },
  });

  const totalTeam = telesalesStats?.reduce((sum, stat) => sum + stat.getLeadCount, 0) || 0;
  const totalL6 = telesalesStats?.reduce((sum, stat) => sum + stat.l6Count, 0) || 0;
  const totalConfirmed = telesalesStats?.reduce((sum, stat) => sum + stat.confirmedCount, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Telesales Report</h2>
        <div className="flex items-center gap-4">
          <Select value={dateFilterType} onValueChange={(v) => setDateFilterType(v as DateFilterType)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="generation">Lead Generation Date</SelectItem>
              <SelectItem value="processing">Lead Processing Date</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[280px] justify-start text-left font-normal")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Get Lead</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTeam}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">L6 Appointments</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalL6}</div>
            <p className="text-xs text-muted-foreground">
              {totalTeam ? ((totalL6 / totalTeam) * 100).toFixed(1) : 0}% conversion
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmed by CS</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalConfirmed}</div>
            <p className="text-xs text-muted-foreground">
              {totalL6 ? ((totalConfirmed / totalL6) * 100).toFixed(1) : 0}% confirmation rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">L0 Unassigned</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unassignedLeads}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Individual Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Get Lead Count</TableHead>
                <TableHead>Leads Handled</TableHead>
                <TableHead>L6 Booked</TableHead>
                <TableHead>Conversion Rate</TableHead>
                <TableHead>CS Confirmed</TableHead>
                <TableHead>Confirmation Rate</TableHead>
                <TableHead>Avg Call Time</TableHead>
                <TableHead>Agent Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {telesalesStats?.map((stat) => (
                <>
                  <TableRow key={stat.userId}>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRow(stat.userId)}
                        className="h-8 w-8 p-0"
                      >
                        {expandedRows.has(stat.userId) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{stat.name}</TableCell>
                    <TableCell>{stat.getLeadCount}</TableCell>
                    <TableCell>{stat.leadsHandled}</TableCell>
                    <TableCell>{stat.l6Count}</TableCell>
                    <TableCell>{stat.conversionRate}%</TableCell>
                    <TableCell>{stat.confirmedCount}</TableCell>
                    <TableCell>{stat.confirmationRate}%</TableCell>
                    <TableCell>{formatCallTime(stat.avgCallTime)}</TableCell>
                    <TableCell>{getAgentStatusDisplay(stat.userId)}</TableCell>
                  </TableRow>
                  {expandedRows.has(stat.userId) && (
                    <TableRow>
                      <TableCell colSpan={10} className="bg-muted/50">
                        <div className="py-4 px-8">
                          <h4 className="font-semibold mb-3 text-sm">Status Breakdown</h4>
                          <div className="grid grid-cols-5 gap-4">
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground mb-1">L1</div>
                              <div className="text-lg font-bold">{stat.l1Count}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground mb-1">L2</div>
                              <div className="text-lg font-bold">{stat.l2Count}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground mb-1">L3</div>
                              <div className="text-lg font-bold">{stat.l3Count}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground mb-1">L4</div>
                              <div className="text-lg font-bold">{stat.l4Count}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground mb-1">L5</div>
                              <div className="text-lg font-bold">{stat.l5Count}</div>
                            </div>
                          </div>
                          <div className="mt-3 text-xs text-muted-foreground text-center">
                            Total: L1-L6 = {stat.l1Count + stat.l2Count + stat.l3Count + stat.l4Count + stat.l5Count + stat.l6Count} 
                            (should equal Leads Handled: {stat.leadsHandled})
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}