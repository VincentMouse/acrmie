import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, Copy, TrendingUp, BarChart } from 'lucide-react';

export function MarketingReport() {
  const { data: marketerStats } = useQuery({
    queryKey: ['marketer-stats'],
    queryFn: async () => {
      // Get all unique marketers
      const { data: allLeads } = await supabase
        .from('leads')
        .select('marketer_name, status, is_duplicate');

      if (!allLeads) return [];

      // Group by marketer
      const marketerMap = new Map();

      allLeads.forEach((lead) => {
        const marketer = lead.marketer_name || 'Unknown';
        if (!marketerMap.has(marketer)) {
          marketerMap.set(marketer, {
            name: marketer,
            total: 0,
            distributed: 0,
            duplicates: 0,
            statusCounts: {},
          });
        }

        const stats = marketerMap.get(marketer);
        stats.total++;

        if (lead.is_duplicate) {
          stats.duplicates++;
        } else {
          stats.distributed++;
          stats.statusCounts[lead.status] = (stats.statusCounts[lead.status] || 0) + 1;
        }
      });

      return Array.from(marketerMap.values()).sort((a, b) => b.distributed - a.distributed);
    },
  });

  const totalLeads = marketerStats?.reduce((sum, stat) => sum + stat.total, 0) || 0;
  const totalDistributed = marketerStats?.reduce((sum, stat) => sum + stat.distributed, 0) || 0;
  const totalDuplicates = marketerStats?.reduce((sum, stat) => sum + stat.duplicates, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Distributed</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDistributed}</div>
            <p className="text-xs text-muted-foreground">
              {totalLeads ? ((totalDistributed / totalLeads) * 100).toFixed(1) : 0}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duplicates</CardTitle>
            <Copy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDuplicates}</div>
            <p className="text-xs text-muted-foreground">
              {totalLeads ? ((totalDuplicates / totalLeads) * 100).toFixed(1) : 0}% duplicate rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Marketers</CardTitle>
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{marketerStats?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Marketer Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marketer</TableHead>
                <TableHead>Total Leads</TableHead>
                <TableHead>Distributed</TableHead>
                <TableHead>Duplicates</TableHead>
                <TableHead>Duplicate Rate</TableHead>
                <TableHead>L6 Booked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marketerStats?.map((stat) => (
                <TableRow key={stat.name}>
                  <TableCell className="font-medium">{stat.name}</TableCell>
                  <TableCell>{stat.total}</TableCell>
                  <TableCell>{stat.distributed}</TableCell>
                  <TableCell>{stat.duplicates}</TableCell>
                  <TableCell>
                    {stat.total ? ((stat.duplicates / stat.total) * 100).toFixed(1) : 0}%
                  </TableCell>
                  <TableCell>{stat.statusCounts['L6-Appointment set'] || 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
