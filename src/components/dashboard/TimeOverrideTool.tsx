import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Clock, RotateCcw } from 'lucide-react';

export function TimeOverrideTool() {
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideTime, setOverrideTime] = useState('');
  const [currentOverride, setCurrentOverride] = useState<Date | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState(0);

  // Load existing override from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('timeOverride');
    if (stored) {
      const date = new Date(stored);
      setCurrentOverride(date);
      setOverrideDate(date.toISOString().split('T')[0]);
      setOverrideTime(date.toTimeString().slice(0, 5));
    }
  }, []);

  // Update current period display
  useEffect(() => {
    const updatePeriod = () => {
      const now = getEffectiveTime();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const timeInMinutes = hours * 60 + minutes;
      
      if (timeInMinutes >= 570 && timeInMinutes <= 720) setCurrentPeriod(1);
      else if (timeInMinutes >= 721 && timeInMinutes <= 1020) setCurrentPeriod(2);
      else if (timeInMinutes >= 1021 && timeInMinutes <= 1110) setCurrentPeriod(3);
      else setCurrentPeriod(0);
    };

    updatePeriod();
    const interval = setInterval(updatePeriod, 1000);
    return () => clearInterval(interval);
  }, []);

  const getEffectiveTime = (): Date => {
    const stored = localStorage.getItem('timeOverride');
    return stored ? new Date(stored) : new Date();
  };

  const handleSetOverride = () => {
    if (!overrideDate || !overrideTime) return;
    
    const [year, month, day] = overrideDate.split('-').map(Number);
    const [hours, minutes] = overrideTime.split(':').map(Number);
    
    const newDate = new Date(year, month - 1, day, hours, minutes);
    localStorage.setItem('timeOverride', newDate.toISOString());
    setCurrentOverride(newDate);
    
    // Trigger a custom event to update other components
    window.dispatchEvent(new CustomEvent('timeOverrideChanged'));
  };

  const handleReset = () => {
    localStorage.removeItem('timeOverride');
    setCurrentOverride(null);
    setOverrideDate('');
    setOverrideTime('');
    window.dispatchEvent(new CustomEvent('timeOverrideChanged'));
  };

  const handleQuickJump = (hours: number) => {
    const now = getEffectiveTime();
    now.setHours(now.getHours() + hours);
    localStorage.setItem('timeOverride', now.toISOString());
    setCurrentOverride(now);
    setOverrideDate(now.toISOString().split('T')[0]);
    setOverrideTime(now.toTimeString().slice(0, 5));
    window.dispatchEvent(new CustomEvent('timeOverrideChanged'));
  };

  const getPeriodLabel = (period: number) => {
    switch (period) {
      case 1: return 'Period 1 (9:30 AM - 12:00 PM)';
      case 2: return 'Period 2 (12:01 PM - 5:00 PM)';
      case 3: return 'Period 3 (5:01 PM - 6:30 PM)';
      default: return 'Outside calling hours';
    }
  };

  return (
    <Card className="border-2 border-primary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Time Override Tool (Testing Only)
        </CardTitle>
        <CardDescription>
          Artificially move time forward to test L1 cooldown logic
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="p-4 bg-muted/50 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Current Time:</span>
            <span className="text-sm font-mono">
              {currentOverride 
                ? currentOverride.toLocaleString('en-US', { 
                    timeZone: 'Asia/Manila',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })
                : 'Real Time'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Current Period:</span>
            <Badge variant={currentPeriod > 0 ? 'default' : 'secondary'}>
              {getPeriodLabel(currentPeriod)}
            </Badge>
          </div>
        </div>

        {/* Quick Jump Buttons */}
        <div className="space-y-2">
          <Label>Quick Time Jump</Label>
          <div className="grid grid-cols-4 gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleQuickJump(1)}
            >
              +1 Hour
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleQuickJump(3)}
            >
              +3 Hours
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleQuickJump(6)}
            >
              +6 Hours
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleQuickJump(24)}
            >
              +1 Day
            </Button>
          </div>
        </div>

        {/* Manual Override */}
        <div className="space-y-4">
          <Label>Set Specific Time</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="override-date" className="text-xs">Date</Label>
              <Input
                id="override-date"
                type="date"
                value={overrideDate}
                onChange={(e) => setOverrideDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="override-time" className="text-xs">Time</Label>
              <Input
                id="override-time"
                type="time"
                value={overrideTime}
                onChange={(e) => setOverrideTime(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleSetOverride}
              disabled={!overrideDate || !overrideTime}
              className="flex-1"
            >
              Set Override
            </Button>
            <Button 
              variant="outline"
              onClick={handleReset}
              disabled={!currentOverride}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Real Time
            </Button>
          </div>
        </div>

        {/* Info */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs space-y-1">
          <p className="font-semibold">L1 Cooldown Logic:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>6 total calls (2 per period)</li>
            <li>Skip current + next period after each call</li>
            <li>Period 1 → Period 3 (same day)</li>
            <li>Period 2 → Period 1 (next day)</li>
            <li>Period 3 → Period 2 (next day)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
