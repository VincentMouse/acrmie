import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Target, CheckCircle, TrendingUp, Calendar as CalendarIcon, BarChart } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { TelesalesReport } from './TelesalesReport';
import { CustomerServiceReport } from './CustomerServiceReport';
import { MarketingReport } from './MarketingReport';

export function OverallReport() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 7)),
    to: new Date(),
  });

  const { data: overallStats } = useQuery({
    queryKey: ['overall-stats', dateRange],
    queryFn: async () => {
      // Total leads
      let totalLeadsQuery = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });
      
      if (dateRange?.from) {
        totalLeadsQuery = totalLeadsQuery.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        totalLeadsQuery = totalLeadsQuery.lte('created_at', dateRange.to.toISOString());
      }
      
      const { count: totalLeads } = await totalLeadsQuery;

      // L6 Appointments
      let l6Query = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'L6-Appointment set');
      
      if (dateRange?.from) {
        l6Query = l6Query.gte('updated_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        l6Query = l6Query.lte('updated_at', dateRange.to.toISOString());
      }
      
      const { count: l6Count } = await l6Query;

      // Total appointments
      let totalAppointmentsQuery = supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true });
      
      if (dateRange?.from) {
        totalAppointmentsQuery = totalAppointmentsQuery.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        totalAppointmentsQuery = totalAppointmentsQuery.lte('created_at', dateRange.to.toISOString());
      }
      
      const { count: totalAppointments } = await totalAppointmentsQuery;

      // Confirmed appointments
      let confirmedQuery = supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('confirmation_status', 'confirmed');
      
      if (dateRange?.from) {
        confirmedQuery = confirmedQuery.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        confirmedQuery = confirmedQuery.lte('created_at', dateRange.to.toISOString());
      }
      
      const { count: confirmedCount } = await confirmedQuery;

      // Active staff by role
      const { data: telesalesCount } = await supabase
        .from('user_roles')
        .select('user_id', { count: 'exact', head: true })
        .eq('role', 'tele_sales');

      const { data: csCount } = await supabase
        .from('user_roles')
        .select('user_id', { count: 'exact', head: true })
        .eq('role', 'customer_service');

      // Total revenue
      let revenueQuery = supabase
        .from('appointments')
        .select('revenue')
        .eq('is_completed', true);
      
      if (dateRange?.from) {
        revenueQuery = revenueQuery.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        revenueQuery = revenueQuery.lte('created_at', dateRange.to.toISOString());
      }
      
      const { data: revenueData } = await revenueQuery;

      const totalRevenue = revenueData?.reduce((sum, apt) => sum + (Number(apt.revenue) || 0), 0) || 0;

      return {
        totalLeads: totalLeads || 0,
        totalAppointments: totalAppointments || 0,
        confirmedAppointments: confirmedCount || 0,
        l6Leads: l6Count || 0,
        telesalesStaff: telesalesCount?.length || 0,
        csStaff: csCount?.length || 0,
        totalRevenue,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Overall Report</h2>
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
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats?.totalLeads}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">L6 Appointments</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats?.l6Leads}</div>
            <p className="text-xs text-muted-foreground">
              {overallStats?.totalLeads 
                ? ((overallStats.l6Leads / overallStats.totalLeads) * 100).toFixed(1) 
                : 0}% conversion
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats?.confirmedAppointments}</div>
            <p className="text-xs text-muted-foreground">
              {overallStats?.l6Leads 
                ? ((overallStats.confirmedAppointments / overallStats.l6Leads) * 100).toFixed(1) 
                : 0}% confirmation rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₱{overallStats?.totalRevenue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Telesales Staff</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats?.telesalesStaff}</div>
            <p className="text-xs text-muted-foreground">Active staff members</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CS Staff</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats?.csStaff}</div>
            <p className="text-xs text-muted-foreground">Active staff members</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detailed Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="telesales" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="telesales">Telesales</TabsTrigger>
              <TabsTrigger value="cs">Customer Service</TabsTrigger>
              <TabsTrigger value="marketing">Marketing</TabsTrigger>
            </TabsList>
            <TabsContent value="telesales" className="mt-6">
              <TelesalesReport />
            </TabsContent>
            <TabsContent value="cs" className="mt-6">
              <CustomerServiceReport />
            </TabsContent>
            <TabsContent value="marketing" className="mt-6">
              <MarketingReport />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
