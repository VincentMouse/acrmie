import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function CreateUsers() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const createUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-initial-users');
      
      if (error) throw error;
      
      console.log('Users created:', data);
      toast({
        title: 'Success',
        description: 'Users created successfully!',
      });
    } catch (error: any) {
      console.error('Error creating users:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <Card className="p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4">Create Initial Users</h1>
        <p className="text-muted-foreground mb-6">
          Click the button below to create the two initial user accounts:
        </p>
        <ul className="list-disc list-inside mb-6 text-sm space-y-2">
          <li>hoangnguyen040796@gmail.com</li>
          <li>alex.obsidiandigital@gmail.com</li>
        </ul>
        <p className="text-sm text-muted-foreground mb-6">
          Password for both: <code className="bg-muted px-2 py-1 rounded">Test11</code>
        </p>
        <Button onClick={createUsers} disabled={loading} className="w-full">
          {loading ? 'Creating Users...' : 'Create Users'}
        </Button>
      </Card>
    </div>
  );
}
