import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Award, TrendingUp, Users, Target, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

export function TelesalesReport() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 7)),
    to: new Date(),
  });

  const { data: telesalesStats } = useQuery({
    queryKey: ['telesales-stats', dateRange],
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
          
          // Total assigned leads - count from lead_history where this user was assigned
          let assignedQuery = supabase
            .from('lead_history')
            .select('lead_id', { count: 'exact', head: true })
            .eq('new_assigned_to', userId)
            .not('old_assigned_to', 'eq', userId);
          
          if (dateRange?.from) {
            assignedQuery = assignedQuery.gte('created_at', dateRange.from.toISOString());
          }
          if (dateRange?.to) {
            assignedQuery = assignedQuery.lte('created_at', dateRange.to.toISOString());
          }
          
          const { count: totalAssigned } = await assignedQuery;

          // Get distinct lead IDs for status breakdown
          let historyQuery = supabase
            .from('lead_history')
            .select('lead_id')
            .eq('new_assigned_to', userId)
            .not('old_assigned_to', 'eq', userId);
          
          if (dateRange?.from) {
            historyQuery = historyQuery.gte('created_at', dateRange.from.toISOString());
          }
          if (dateRange?.to) {
            historyQuery = historyQuery.lte('created_at', dateRange.to.toISOString());
          }
          
          const { data: historyData } = await historyQuery;
          const leadIds = historyData?.map(h => h.lead_id) || [];
          
          // Get current status of these leads
          const { data: statusBreakdown } = leadIds.length > 0 
            ? await supabase.from('leads').select('status').in('id', leadIds)
            : { data: [] };

          // L6 appointments - count from lead_history where status changed to L6 by this user
          let l6Query = supabase
            .from('lead_history')
            .select('*', { count: 'exact', head: true })
            .eq('changed_by', userId)
            .eq('new_status', 'L6-Appointment set');
          
          if (dateRange?.from) {
            l6Query = l6Query.gte('created_at', dateRange.from.toISOString());
          }
          if (dateRange?.to) {
            l6Query = l6Query.lte('created_at', dateRange.to.toISOString());
          }
          
          const { count: l6Count } = await l6Query;

          // Confirmed appointments (from appointments table)
          let confirmedQuery = supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId)
            .eq('confirmation_status', 'confirmed');
          
          if (dateRange?.from) {
            confirmedQuery = confirmedQuery.gte('created_at', dateRange.from.toISOString());
          }
          if (dateRange?.to) {
            confirmedQuery = confirmedQuery.lte('created_at', dateRange.to.toISOString());
          }
          
          const { count: confirmedCount } = await confirmedQuery;

          const statusCounts = (statusBreakdown || []).reduce((acc, lead) => {
            if (lead && lead.status) {
              acc[lead.status] = (acc[lead.status] || 0) + 1;
            }
            return acc;
          }, {} as Record<string, number>);

          return {
            userId,
            name: (user.profiles as any)?.full_name || 'Unknown',
            email: (user.profiles as any)?.email || '',
            totalAssigned: totalAssigned || 0,
            l6Count: l6Count || 0,
            confirmedCount: confirmedCount || 0,
            conversionRate: totalAssigned ? ((l6Count || 0) / totalAssigned * 100).toFixed(1) : '0',
            confirmationRate: l6Count ? ((confirmedCount || 0) / (l6Count || 1) * 100).toFixed(1) : '0',
            statusCounts,
          };
        })
      );

      return stats.sort((a, b) => b.l6Count - a.l6Count);
    },
  });

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

  const totalTeam = telesalesStats?.reduce((sum, stat) => sum + stat.totalAssigned, 0) || 0;
  const totalL6 = telesalesStats?.reduce((sum, stat) => sum + stat.l6Count, 0) || 0;
  const totalConfirmed = telesalesStats?.reduce((sum, stat) => sum + stat.confirmedCount, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Telesales Report</h2>
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assigned</CardTitle>
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
                <TableHead>Name</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>L6 Booked</TableHead>
                <TableHead>Conversion Rate</TableHead>
                <TableHead>CS Confirmed</TableHead>
                <TableHead>Confirmation Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {telesalesStats?.map((stat) => (
                <TableRow key={stat.userId}>
                  <TableCell className="font-medium">{stat.name}</TableCell>
                  <TableCell>{stat.totalAssigned}</TableCell>
                  <TableCell>{stat.l6Count}</TableCell>
                  <TableCell>{stat.conversionRate}%</TableCell>
                  <TableCell>{stat.confirmedCount}</TableCell>
                  <TableCell>{stat.confirmationRate}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
