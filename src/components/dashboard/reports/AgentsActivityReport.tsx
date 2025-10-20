import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type AgentStatus = {
  userId: string;
  fullName: string;
  status: 'in_call' | 'idle' | 'offline';
  statusDuration: string;
  lastActivity: Date | null;
};

export function AgentsActivityReport() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Get all CS and telesales agents
  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['tele_sales', 'customer_service']);

      if (!roles || roles.length === 0) return [];

      const userIds = [...new Set(roles.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nickname')
        .in('id', userIds);

      return profiles?.map(p => ({
        userId: p.id,
        fullName: p.nickname,
        role: roles.find(r => r.user_id === p.id)?.role || 'tele_sales'
      })) || [];
    }
  });

  // Real-time agent status
  const { data: agentStatuses, refetch: refetchStatuses } = useQuery({
    queryKey: ['agent-statuses'],
    queryFn: async () => {
      if (!agents) return [];

      const { data: statuses } = await supabase
        .from('agent_status')
        .select('user_id, status, status_started_at, updated_at')
        .in('user_id', agents.map(a => a.userId));

      const now = new Date();
      
      return agents.map(agent => {
        const status = statuses?.find(s => s.user_id === agent.userId);
        
        if (!status) {
          return {
            userId: agent.userId,
            fullName: agent.fullName,
            status: 'offline' as const,
            statusDuration: '-',
            lastActivity: null
          };
        }

        const startTime = new Date(status.status_started_at);
        const diffMs = now.getTime() - startTime.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        return {
          userId: agent.userId,
          fullName: agent.fullName,
          status: status.status as 'in_call' | 'idle' | 'offline',
          statusDuration: duration,
          lastActivity: new Date(status.updated_at)
        };
      });
    },
    enabled: !!agents,
    refetchInterval: 5000 // Refresh every 5 seconds
  });

  // Heat map data for selected date - showing current/recent status only
  const { data: heatmapData } = useQuery({
    queryKey: ['agent-heatmap', selectedDate, agents],
    queryFn: async () => {
      if (!agents) return [];

      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      const now = new Date();

      // Get current status for all agents
      const { data: currentStatuses } = await supabase
        .from('agent_status')
        .select('user_id, status, status_started_at, updated_at')
        .in('user_id', agents.map(a => a.userId));

      // Create 30-minute interval grid (48 intervals per day)
      const intervals = Array.from({ length: 48 }, (_, i) => i);
      
      return agents.map(agent => {
        const agentStatus = currentStatuses?.find(s => s.user_id === agent.userId);
        
        const intervalStatus = intervals.map(interval => {
          const hour = Math.floor(interval / 2);
          const minute = (interval % 2) * 30;
          
          const intervalStart = new Date(selectedDate);
          intervalStart.setHours(hour, minute, 0, 0);
          const intervalEnd = new Date(selectedDate);
          intervalEnd.setHours(hour, minute + 29, 59, 999);

          // If no status record, agent is offline
          if (!agentStatus) {
            return { interval, hour, minute, status: 'offline' };
          }

          const statusStart = new Date(agentStatus.status_started_at);
          
          // For current day, show status if it started before this interval and hasn't ended
          const isToday = selectedDate.toDateString() === now.toDateString();
          if (isToday && statusStart <= intervalEnd && intervalEnd <= now) {
            return { interval, hour, minute, status: agentStatus.status };
          }
          
          // For past dates, only show if status started during the selected date
          const statusStartedToday = statusStart >= startOfDay && statusStart <= endOfDay;
          if (!isToday && statusStartedToday && statusStart <= intervalEnd) {
            return { interval, hour, minute, status: agentStatus.status };
          }

          return { interval, hour, minute, status: 'offline' };
        });

        return {
          userId: agent.userId,
          fullName: agent.fullName,
          intervalStatus
        };
      });
    },
    enabled: !!agents,
    refetchInterval: 30000 // Refresh every 30 seconds for today's heat map
  });

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('agent-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_status'
        },
        () => {
          refetchStatuses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchStatuses]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_call':
        return 'bg-green-500 hover:bg-green-600';
      case 'idle':
        return 'bg-yellow-500 hover:bg-yellow-600';
      case 'offline':
        return 'bg-gray-400 hover:bg-gray-500';
      default:
        return 'bg-gray-400 hover:bg-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'in_call':
        return 'Calling';
      case 'idle':
        return 'Idled';
      case 'offline':
        return 'Offline';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      {/* Real-time Agent Status */}
      <Card>
        <CardHeader>
          <CardTitle>Current Agent Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agentStatuses?.map((agent) => (
              <div
                key={agent.userId}
                className="p-4 border rounded-lg space-y-2"
              >
                <div className="font-semibold">{agent.fullName}</div>
                <Badge className={cn(getStatusColor(agent.status), 'text-white')}>
                  {agent.status === 'in_call' && `Calling for ${agent.statusDuration}`}
                  {agent.status === 'idle' && `Idled for ${agent.statusDuration}`}
                  {agent.status === 'offline' && 'Offline'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Heat Map */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Activity Heat Map</CardTitle>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, 'PPP')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {/* Time header */}
            <div className="flex items-center gap-1">
              <div className="w-32 flex-shrink-0 text-xs font-semibold">Agent</div>
              <div className="flex gap-0.5 flex-1 overflow-x-auto">
                {Array.from({ length: 24 }, (_, i) => (
                  <div
                    key={`hour-${i}`}
                    className="flex-shrink-0 w-8 text-xs text-center text-muted-foreground"
                  >
                    {i}h
                  </div>
                ))}
              </div>
            </div>

            {/* Agent rows */}
            {heatmapData?.map((agent) => (
              <div key={`agent-${agent.userId}`} className="flex items-center gap-1">
                <div className="w-32 flex-shrink-0 text-sm truncate font-medium" title={agent.fullName}>
                  {agent.fullName}
                </div>
                <div className="flex gap-0.5 flex-1 overflow-x-auto">
                  {agent.intervalStatus.map((intervalData) => (
                    <div
                      key={`${agent.userId}-interval-${intervalData.interval}`}
                      className={cn(
                        'flex-shrink-0 w-4 h-8 rounded border border-border',
                        getStatusColor(intervalData.status)
                      )}
                      title={`${intervalData.hour}:${intervalData.minute.toString().padStart(2, '0')} - ${getStatusLabel(intervalData.status)}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-6 pt-4 border-t">
            <span className="text-sm font-semibold">Legend:</span>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-500"></div>
              <span className="text-sm">In Call</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-yellow-500"></div>
              <span className="text-sm">Idle</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-400"></div>
              <span className="text-sm">Offline</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
