import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Target, CheckCircle, TrendingUp, Calendar, BarChart } from 'lucide-react';
import { TelesalesReport } from './TelesalesReport';
import { CustomerServiceReport } from './CustomerServiceReport';
import { MarketingReport } from './MarketingReport';

export function OverallReport() {
  const { data: overallStats } = useQuery({
    queryKey: ['overall-stats'],
    queryFn: async () => {
      // Total leads
      const { count: totalLeads } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });

      // Total appointments
      const { count: totalAppointments } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true });

      // Confirmed appointments
      const { count: confirmedAppointments } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('confirmation_status', 'confirmed');

      // L6 leads
      const { count: l6Leads } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'L6-Appointment set');

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
      const { data: revenueData } = await supabase
        .from('appointments')
        .select('revenue')
        .not('revenue', 'is', null);

      const totalRevenue = revenueData?.reduce((sum, apt) => sum + (Number(apt.revenue) || 0), 0) || 0;

      return {
        totalLeads: totalLeads || 0,
        totalAppointments: totalAppointments || 0,
        confirmedAppointments: confirmedAppointments || 0,
        l6Leads: l6Leads || 0,
        telesalesStaff: telesalesCount?.length || 0,
        csStaff: csCount?.length || 0,
        totalRevenue,
      };
    },
  });

  return (
    <div className="space-y-6">
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
              ${overallStats?.totalRevenue.toLocaleString()}
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
            <Calendar className="h-4 w-4 text-muted-foreground" />
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
