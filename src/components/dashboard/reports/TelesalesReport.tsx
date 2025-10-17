import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Award, TrendingUp, Users, Target } from 'lucide-react';

export function TelesalesReport() {
  const { data: telesalesStats } = useQuery({
    queryKey: ['telesales-stats'],
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
          
          // Total assigned leads
          const { count: totalAssigned } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId);

          // Leads by status
          const { data: statusBreakdown } = await supabase
            .from('leads')
            .select('status')
            .eq('assigned_to', userId);

          // L6 appointments
          const { count: l6Count } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId)
            .eq('status', 'L6-Appointment set');

          // Confirmed appointments (from appointments table)
          const { count: confirmedCount } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId)
            .eq('confirmation_status', 'confirmed');

          const statusCounts = statusBreakdown?.reduce((acc, lead) => {
            acc[lead.status] = (acc[lead.status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>) || {};

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
