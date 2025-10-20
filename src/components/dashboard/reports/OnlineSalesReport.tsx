import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, TrendingUp, Users, CheckCircle, XCircle, Clock, CalendarDays } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export function OnlineSalesReport() {
  const { user } = useAuth();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Fetch leads created by the online sales user (messenger leads)
  const { data: myLeads, isLoading: leadsLoading } = useQuery({
    queryKey: ['online-sales-leads', user?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!user?.id) return [];
      
      let query = supabase
        .from('leads')
        .select(`
          *,
          assigned_to_profile:profiles!leads_assigned_to_fkey(nickname),
          created_by_profile:profiles!leads_created_by_fkey(nickname)
        `)
        .eq('created_by', user.id);

      // Apply date range filter if dates are selected
      if (dateFrom) {
        query = query.gte('created_at', dateFrom.toISOString());
      }
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endOfDay.toISOString());
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch appointments for my leads
  const { data: appointments, isLoading: appointmentsLoading } = useQuery({
    queryKey: ['online-sales-appointments', user?.id],
    queryFn: async () => {
      if (!user?.id || !myLeads) return [];
      
      const leadIds = myLeads.map(lead => lead.id);
      
      if (leadIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .in('lead_id', leadIds);

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!myLeads && myLeads.length > 0,
  });

  const totalLeads = myLeads?.length || 0;
  const totalAppointments = appointments?.length || 0;
  const completedAppointments = appointments?.filter(apt => apt.is_completed).length || 0;
  const totalRevenue = appointments?.reduce((sum, apt) => sum + (Number(apt.revenue) || 0), 0) || 0;

  // Status breakdown
  const statusCounts = myLeads?.reduce((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const getStatusBadgeVariant = (status: string) => {
    if (status.includes('L0') || status.includes('Fresh')) return 'default';
    if (status.includes('L1')) return 'secondary';
    if (status.includes('L2') || status.includes('Booked')) return 'outline';
    if (status.includes('L3') || status.includes('Success')) return 'default';
    if (status.includes('L4') || status.includes('No Show')) return 'destructive';
    return 'secondary';
  };

  if (leadsLoading || appointmentsLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Date Range Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">From Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'PPP') : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">To Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'PPP') : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    disabled={(date) => dateFrom ? date < dateFrom : false}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setDateFrom(undefined);
                  setDateTo(undefined);
                }}
              >
                Clear Dates
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads Ingested</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
            <p className="text-xs text-muted-foreground">Messenger leads created by you</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Appointments Booked</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAppointments}</div>
            <p className="text-xs text-muted-foreground">
              {totalLeads > 0 ? `${((totalAppointments / totalLeads) * 100).toFixed(1)}%` : '0%'} conversion rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Appointments</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedAppointments}</div>
            <p className="text-xs text-muted-foreground">
              {totalAppointments > 0 ? `${((completedAppointments / totalAppointments) * 100).toFixed(1)}%` : '0%'} show rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">From completed appointments</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Lead Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>
                </div>
                <div className="text-2xl font-bold">{count}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Leads */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {myLeads && myLeads.length > 0 ? (
              myLeads.slice(0, 10).map((lead) => (
                <div key={lead.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{lead.first_name} {lead.last_name}</div>
                    <div className="text-sm text-muted-foreground">{lead.phone}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Created: {format(new Date(lead.created_at), 'PPp')}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={getStatusBadgeVariant(lead.status)}>{lead.status}</Badge>
                    {lead.assigned_to_profile && (
                      <div className="text-xs text-muted-foreground">
                        Assigned to: {lead.assigned_to_profile.nickname}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No leads ingested yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Appointments Overview */}
      {appointments && appointments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Appointments Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {appointments.slice(0, 10).map((apt) => {
                const lead = myLeads?.find(l => l.id === apt.lead_id);
                return (
                  <div key={apt.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">
                        {lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(apt.appointment_date), 'PPp')}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {apt.is_completed ? (
                        <Badge variant="default">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Completed
                        </Badge>
                      ) : apt.check_in_status === 'no-show' ? (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 mr-1" />
                          No Show
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                      {apt.revenue && (
                        <div className="text-sm font-medium">₱{Number(apt.revenue).toFixed(2)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
