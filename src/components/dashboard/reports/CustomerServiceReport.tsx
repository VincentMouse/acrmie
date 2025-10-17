import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, Calendar, TrendingUp, Users } from 'lucide-react';
import { format } from 'date-fns';

export function CustomerServiceReport() {
  const { data: csStats } = useQuery({
    queryKey: ['cs-stats'],
    queryFn: async () => {
      // Get all customer service users
      const { data: csUsers } = await supabase
        .from('user_roles')
        .select('user_id, profiles(full_name, email)')
        .eq('role', 'customer_service');

      if (!csUsers) return [];

      // Get stats for each CS user
      const stats = await Promise.all(
        csUsers.map(async (user) => {
          const userId = user.user_id;
          
          // Total appointments processed
          const { count: totalProcessed } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('processing_by', userId);

          // Confirmed appointments
          const { count: confirmed } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('processing_by', userId)
            .eq('confirmation_status', 'confirmed');

          // No show appointments
          const { count: noShow } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('processing_by', userId)
            .eq('confirmation_status', 'no_show');

          // Cancelled appointments
          const { count: cancelled } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('processing_by', userId)
            .eq('confirmation_status', 'cancelled');

          // Today's check-in stats
          const today = format(new Date(), 'yyyy-MM-dd');
          const { data: todayAppointments } = await supabase
            .from('appointments')
            .select('check_in_status')
            .eq('processing_by', userId)
            .gte('appointment_date', `${today}T00:00:00`)
            .lte('appointment_date', `${today}T23:59:59`);

          const checkedIn = todayAppointments?.filter(a => a.check_in_status === 'checked_in').length || 0;
          const totalToday = todayAppointments?.length || 0;

          return {
            userId,
            name: (user.profiles as any)?.full_name || 'Unknown',
            email: (user.profiles as any)?.email || '',
            totalProcessed: totalProcessed || 0,
            confirmed: confirmed || 0,
            noShow: noShow || 0,
            cancelled: cancelled || 0,
            confirmationRate: totalProcessed ? ((confirmed || 0) / totalProcessed * 100).toFixed(1) : '0',
            checkedIn,
            totalToday,
            checkInRate: totalToday ? (checkedIn / totalToday * 100).toFixed(1) : '0',
          };
        })
      );

      return stats.sort((a, b) => b.confirmed - a.confirmed);
    },
  });

  const totalProcessed = csStats?.reduce((sum, stat) => sum + stat.totalProcessed, 0) || 0;
  const totalConfirmed = csStats?.reduce((sum, stat) => sum + stat.confirmed, 0) || 0;
  const totalCheckedIn = csStats?.reduce((sum, stat) => sum + stat.checkedIn, 0) || 0;
  const totalToday = csStats?.reduce((sum, stat) => sum + stat.totalToday, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Processed</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProcessed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalConfirmed}</div>
            <p className="text-xs text-muted-foreground">
              {totalProcessed ? ((totalConfirmed / totalProcessed) * 100).toFixed(1) : 0}% rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Appointments</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalToday}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checked In Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCheckedIn}</div>
            <p className="text-xs text-muted-foreground">
              {totalToday ? ((totalCheckedIn / totalToday) * 100).toFixed(1) : 0}% check-in rate
            </p>
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
                <TableHead>Processed</TableHead>
                <TableHead>Confirmed</TableHead>
                <TableHead>Confirmation Rate</TableHead>
                <TableHead>No Show</TableHead>
                <TableHead>Cancelled</TableHead>
                <TableHead>Today Check-In</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {csStats?.map((stat) => (
                <TableRow key={stat.userId}>
                  <TableCell className="font-medium">{stat.name}</TableCell>
                  <TableCell>{stat.totalProcessed}</TableCell>
                  <TableCell>{stat.confirmed}</TableCell>
                  <TableCell>{stat.confirmationRate}%</TableCell>
                  <TableCell>{stat.noShow}</TableCell>
                  <TableCell>{stat.cancelled}</TableCell>
                  <TableCell>
                    {stat.checkedIn}/{stat.totalToday} ({stat.checkInRate}%)
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
