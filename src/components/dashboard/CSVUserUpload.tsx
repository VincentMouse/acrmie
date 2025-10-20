import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Download } from 'lucide-react';
import Papa from 'papaparse';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const ALLOWED_ROLES = ['tele_sales', 'customer_service', 'online_sales', 'marketer', 'view_only'];

interface CSVUser {
  email: string;
  password: string;
  full_name: string;
  roles: string;
}

export function CSVUserUpload() {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<CSVUser[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const batchCreateMutation = useMutation({
    mutationFn: async (users: CSVUser[]) => {
      const results = { success: 0, failed: 0, errors: [] as string[] };

      for (const user of users) {
        try {
          const roles = user.roles.split(',').map(r => r.trim().toLowerCase());
          
          // Validate no admin or sales_manager roles
          if (roles.some(r => r === 'admin' || r === 'sales_manager')) {
            results.failed++;
            results.errors.push(`${user.email}: Cannot create admin or sales manager via CSV`);
            continue;
          }

          // Validate roles are in allowed list
          if (!roles.every(r => ALLOWED_ROLES.includes(r))) {
            results.failed++;
            results.errors.push(`${user.email}: Invalid role(s). Allowed: ${ALLOWED_ROLES.join(', ')}`);
            continue;
          }

          // Check for duplicate email
          const { data: existingUser } = await supabase
            .from('profiles')
            .select('email')
            .eq('email', user.email)
            .single();

          if (existingUser) {
            results.failed++;
            results.errors.push(`${user.email}: User already exists`);
            continue;
          }

          // Create user
          const { error } = await supabase.functions.invoke('create-user', {
            body: {
              email: user.email,
              password: user.password,
              fullName: user.full_name,
              role: roles[0], // Use first role as primary
            }
          });

          if (error) {
            results.failed++;
            results.errors.push(`${user.email}: ${error.message}`);
            continue;
          }

          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push(`${user.email}: ${error.message}`);
        }
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      
      toast({
        title: 'Batch creation completed',
        description: `Success: ${results.success}, Failed: ${results.failed}`,
        variant: results.failed > 0 ? 'destructive' : 'default',
      });

      if (results.errors.length > 0) {
        console.error('Batch creation errors:', results.errors);
      }

      setIsOpen(false);
      setFile(null);
      setParsedData([]);
    },
    onError: (error: any) => {
      toast({
        title: 'Batch creation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseCSV(selectedFile);
    }
  };

  const parseCSV = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as CSVUser[];
        
        // Validate required fields
        const valid = data.every(user => 
          user.email && user.password && user.full_name && user.roles
        );

        if (!valid) {
          toast({
            title: 'Invalid CSV',
            description: 'CSV must contain: email, password, full_name, roles columns',
            variant: 'destructive',
          });
          setFile(null);
          return;
        }

        setParsedData(data);
      },
      error: (error) => {
        toast({
          title: 'CSV parsing failed',
          description: error.message,
          variant: 'destructive',
        });
        setFile(null);
      },
    });
  };

  const handleUpload = () => {
    if (parsedData.length === 0) {
      toast({
        title: 'No data',
        description: 'Please select a valid CSV file',
        variant: 'destructive',
      });
      return;
    }

    batchCreateMutation.mutate(parsedData);
  };

  const downloadTemplate = () => {
    const template = 'email,password,full_name,roles\nexample@email.com,SecurePass123,John Doe,tele_sales\n';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'user_upload_template.csv';
    a.click();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="w-4 h-4 mr-2" />
          Batch Upload CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batch Create Users from CSV</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Button 
              variant="outline" 
              onClick={downloadTemplate}
              className="w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              Download CSV Template
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Required columns: email, password, full_name, roles
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Allowed roles: {ALLOWED_ROLES.join(', ')}
            </p>
            <p className="text-xs text-destructive mt-1">
              Note: Cannot create admin or sales_manager roles via CSV
            </p>
          </div>

          <div>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90"
            />
          </div>

          {parsedData.length > 0 && (
            <div className="rounded border p-3">
              <p className="text-sm font-medium">
                {parsedData.length} user(s) ready to upload
              </p>
            </div>
          )}

          <Button 
            onClick={handleUpload}
            disabled={!file || parsedData.length === 0 || batchCreateMutation.isPending}
            className="w-full"
          >
            {batchCreateMutation.isPending ? 'Creating Users...' : 'Upload and Create Users'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
