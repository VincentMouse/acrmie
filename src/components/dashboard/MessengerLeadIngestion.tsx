import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

export function MessengerLeadIngestion() {
  const { toast } = useToast();

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Messenger Lead Ingestion</h2>
          <p className="text-muted-foreground mt-1">
            Add leads from messenger conversations who already have appointments scheduled.
          </p>
        </div>

        <Alert variant="destructive" className="bg-red-50 border-red-200 dark:bg-red-950/20">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            <strong>Important:</strong> These leads must have an appointment already booked before ingestion.
          </AlertDescription>
        </Alert>

        <div className="text-sm text-muted-foreground">
          <p>Messenger lead ingestion functionality coming soon...</p>
        </div>
      </div>
    </Card>
  );
}
