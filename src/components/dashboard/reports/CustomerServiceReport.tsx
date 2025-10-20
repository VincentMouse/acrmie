import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CheckCircle, Calendar as CalendarIcon, TrendingUp, Users } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

export function CustomerServiceReport() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 7)),
    to: new Date(),
  });

  const { data: csStats } = useQuery({
    queryKey: ['cs-stats', dateRange],
    queryFn: async () => {
      // Get all customer service users
      const { data: csUsers } = await supabase
        .from('user_roles')
        .select('user_id, profiles(nickname, email)')
        .eq('role', 'customer_service');

      if (!csUsers) return [];

      // Get stats for each CS user
      const stats = await Promise.all(
        csUsers.map(async (user) => {
          const userId = user.user_id;
          
          // Total appointments processed
          let processedQuery = supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('processing_by', userId);
          
          if (dateRange?.from) {
            processedQuery = processedQuery.gte('processing_at', dateRange.from.toISOString());
          }
          if (dateRange?.to) {
            processedQuery = processedQuery.lte('processing_at', dateRange.to.toISOString());
          }
          
          const { count: totalProcessed } = await processedQuery;

          // Confirmed appointments
          let confirmedQuery = supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('processing_by', userId)
            .eq('confirmation_status', 'confirmed');
          
          if (dateRange?.from) {
            confirmedQuery = confirmedQuery.gte('processing_at', dateRange.from.toISOString());
          }
          if (dateRange?.to) {
            confirmedQuery = confirmedQuery.lte('processing_at', dateRange.to.toISOString());
          }
          
          const { count: confirmed } = await confirmedQuery;

          // No show appointments
          let noShowQuery = supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('processing_by', userId)
            .eq('confirmation_status', 'no_show');
          
          if (dateRange?.from) {
            noShowQuery = noShowQuery.gte('processing_at', dateRange.from.toISOString());
          }
          if (dateRange?.to) {
            noShowQuery = noShowQuery.lte('processing_at', dateRange.to.toISOString());
          }
          
          const { count: noShow } = await noShowQuery;

          // Cancelled appointments
          let cancelledQuery = supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('processing_by', userId)
            .eq('confirmation_status', 'cancelled');
          
          if (dateRange?.from) {
            cancelledQuery = cancelledQuery.gte('processing_at', dateRange.from.toISOString());
          }
          if (dateRange?.to) {
            cancelledQuery = cancelledQuery.lte('processing_at', dateRange.to.toISOString());
          }
          
          const { count: cancelled } = await cancelledQuery;

          // Today's check-in stats
          let todayQuery = supabase
            .from('appointments')
            .select('check_in_status')
            .eq('processing_by', userId);
          
          if (dateRange?.from && dateRange?.to) {
            todayQuery = todayQuery
              .gte('appointment_date', dateRange.from.toISOString())
              .lte('appointment_date', dateRange.to.toISOString());
          } else {
            const today = format(new Date(), 'yyyy-MM-dd');
            todayQuery = todayQuery
              .gte('appointment_date', `${today}T00:00:00`)
              .lte('appointment_date', `${today}T23:59:59`);
          }
          
          const { data: todayAppointments } = await todayQuery;

          const checkedIn = todayAppointments?.filter(a => a.check_in_status === 'checked_in').length || 0;
          const totalToday = todayAppointments?.length || 0;

          return {
            userId,
            name: (user.profiles as any)?.nickname || 'Unknown',
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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Customer Service Report</h2>
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
            <CalendarComponent
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
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
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
