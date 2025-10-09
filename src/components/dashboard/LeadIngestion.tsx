import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Plus } from 'lucide-react';
import Papa from 'papaparse';
import { z } from 'zod';
import { MessengerLeadIngestion } from './MessengerLeadIngestion';

const leadSchema = z.object({
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits'),
  customerName: z.string().trim().min(1, 'Customer name is required'),
  address: z.string().optional(),
  serviceProduct: z.string().trim().min(1, 'Service/Product is required'),
  campaignName: z.string().trim().min(1, 'Campaign name is required'),
  marketerName: z.string().trim().min(1, 'Marketer name is required'),
  marketerNotes: z.string().optional(),
});

const csvLeadSchema = z.object({
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits'),
  customerName: z.string().trim().min(1, 'Customer name is required'),
  address: z.string().optional(),
  serviceProduct: z.string().trim().min(1, 'Service/Product is required'),
  campaignName: z.string().trim().min(1, 'Campaign name is required'),
  marketerName: z.string().trim().min(1, 'Marketer name is required'),
  marketerNotes: z.string().optional(),
});

export function LeadIngestion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ success: number; failed: number } | null>(null);
  const [formData, setFormData] = useState({
    phone: '',
    customerName: '',
    address: '',
    serviceProduct: '',
    campaignName: '',
    marketerName: '',
    marketerNotes: '',
  });

  const { data: funnels } = useQuery({
    queryKey: ['funnels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('funnels')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const checkDuplicateMutation = useMutation({
    mutationFn: async (phone: string) => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, first_name, last_name, phone')
        .eq('phone', phone)
        .limit(1);

      if (error) throw error;
      return data;
    },
  });

  const bulkCreateLeadsMutation = useMutation({
    mutationFn: async (leads: any[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const results = { success: 0, failed: 0 };
      
      for (const lead of leads) {
        try {
          // Check for duplicates
          const { data: duplicates } = await supabase
            .from('leads')
            .select('id, first_name, last_name, phone')
            .eq('phone', lead.phone)
            .limit(1);

          const [firstName, ...lastNameParts] = lead.customerName.trim().split(' ');
          const lastName = lastNameParts.join(' ') || firstName;

          const leadData = {
            first_name: firstName,
            last_name: lastName,
            phone: lead.phone,
            address: lead.address || null,
            service_product: lead.serviceProduct,
            campaign_name: lead.campaignName,
            marketer_name: lead.marketerName,
            notes: lead.marketerNotes || null,
            status: 'status_0' as const,
            created_by: user.id,
            funnel_id: null,
            is_duplicate: duplicates && duplicates.length > 0,
            duplicate_of: duplicates && duplicates.length > 0 ? duplicates[0].id : null,
          };

          const { error } = await supabase.from('leads').insert([leadData]);
          
          if (error) throw error;
          results.success++;
        } catch (error) {
          console.error('Failed to create lead:', error);
          results.failed++;
        }
      }
      
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setUploadResults(results);
      
      toast({
        title: 'CSV Import Complete',
        description: `Successfully imported ${results.success} leads. ${results.failed > 0 ? `${results.failed} failed.` : ''}`,
        variant: results.failed > 0 ? 'destructive' : 'default',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to import leads',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createLeadMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check for duplicates
      const duplicates = await checkDuplicateMutation.mutateAsync(data.phone);
      
      const [firstName, ...lastNameParts] = data.customerName.trim().split(' ');
      const lastName = lastNameParts.join(' ') || firstName;

      const leadData = {
        first_name: firstName,
        last_name: lastName,
        phone: data.phone,
        address: data.address || null,
        service_product: data.serviceProduct,
        campaign_name: data.campaignName,
        marketer_name: data.marketerName,
        notes: data.marketerNotes || null,
        status: 'status_0' as const,
        created_by: user.id,
        funnel_id: null,
        is_duplicate: duplicates && duplicates.length > 0,
        duplicate_of: duplicates && duplicates.length > 0 ? duplicates[0].id : null,
      };

      const { error } = await supabase.from('leads').insert([leadData]);
      if (error) throw error;
      
      return { isDuplicate: duplicates && duplicates.length > 0, duplicateOf: duplicates?.[0] };
    },
    onSuccess: ({ isDuplicate, duplicateOf }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      
      if (isDuplicate && duplicateOf) {
        toast({
          title: 'Lead created with duplicate flag',
          description: `This phone number matches existing lead: ${duplicateOf.first_name} ${duplicateOf.last_name}`,
          variant: 'destructive',
        });
      } else {
        toast({ 
          title: 'Lead created',
          description: 'New lead has been successfully added to the pipeline',
        });
      }
      
      setIsOpen(false);
      setFormData({ phone: '', customerName: '', address: '', serviceProduct: '', campaignName: '', marketerName: '', marketerNotes: '' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create lead',
        description: error.message,
        variant: 'destructive'
      });
    },
  });

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const validatedLeads = results.data.map((row: any, index: number) => {
            try {
              return csvLeadSchema.parse({
                phone: row['Phone Number'] || row['phone'],
                customerName: row['Customer Name'] || row['customerName'],
                address: row['Customer Address'] || row['address'] || '',
                serviceProduct: row['Service/Product'] || row['serviceProduct'],
                campaignName: row['Campaign Name'] || row['campaignName'],
                marketerName: row['Marketer Name'] || row['marketerName'],
                marketerNotes: row['Marketer Notes'] || row['marketerNotes'] || '',
              });
            } catch (error) {
              if (error instanceof z.ZodError) {
                throw new Error(`Row ${index + 1}: ${error.errors[0].message}`);
              }
              throw error;
            }
          });

          bulkCreateLeadsMutation.mutate(validatedLeads);
        } catch (error: any) {
          toast({
            title: 'CSV Validation Error',
            description: error.message,
            variant: 'destructive',
          });
        }
      },
      error: (error) => {
        toast({
          title: 'Failed to parse CSV',
          description: error.message,
          variant: 'destructive',
        });
      },
    });

    // Reset file input
    event.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const validated = leadSchema.parse(formData);
      createLeadMutation.mutate(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Validation error',
          description: error.errors[0].message,
          variant: 'destructive',
        });
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">New Lead Ingestion</h2>
            <div className="text-muted-foreground mt-1">
              <p>Add cold leads manually or upload via CSV spreadsheet.</p>
              <p>Duplicates will be automatically flagged.</p>
            </div>
          </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Leads
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Cold Leads</DialogTitle>
            </DialogHeader>
            
            <Tabs defaultValue="csv" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="csv">
                  <Upload className="h-4 w-4 mr-2" />
                  CSV Upload
                </TabsTrigger>
                <TabsTrigger value="manual">Manual Entry</TabsTrigger>
              </TabsList>
              
              <TabsContent value="csv" className="space-y-4">
                <div className="space-y-4">
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-semibold mb-2">Upload CSV File</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload a spreadsheet with cold lead information
                    </p>
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={handleCSVUpload}
                      className="max-w-xs mx-auto"
                    />
                  </div>

                  {uploadResults && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="font-semibold mb-2">Upload Results:</p>
                      <p className="text-sm">✓ Successfully imported: {uploadResults.success}</p>
                      {uploadResults.failed > 0 && (
                        <p className="text-sm text-destructive">✗ Failed: {uploadResults.failed}</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="font-semibold">Required CSV Columns:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Phone Number (required)</li>
                      <li>Customer Name (required)</li>
                      <li>Customer Address (optional)</li>
                      <li>Service/Product (required)</li>
                      <li>Campaign Name (required)</li>
                      <li>Marketer Name (required)</li>
                      <li>Marketer Notes (optional)</li>
                    </ul>
                    <p className="mt-3 text-xs">
                      • Lead ID will be auto-generated<br />
                      • Lead Generation Date will be set to current Vietnam time<br />
                      • Status will be auto-assigned to "New - Unassigned"
                    </p>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="manual">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customerName">Customer Name *</Label>
                    <Input
                      id="customerName"
                      value={formData.customerName}
                      onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Customer Address</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="serviceProduct">Service/Product *</Label>
                    <Input
                      id="serviceProduct"
                      value={formData.serviceProduct}
                      onChange={(e) => setFormData({ ...formData, serviceProduct: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="campaignName">Campaign Name *</Label>
                    <Input
                      id="campaignName"
                      value={formData.campaignName}
                      onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="marketerName">Marketer Name *</Label>
                    <Input
                      id="marketerName"
                      value={formData.marketerName}
                      onChange={(e) => setFormData({ ...formData, marketerName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="marketerNotes">Marketer Notes</Label>
                    <Input
                      id="marketerNotes"
                      value={formData.marketerNotes}
                      onChange={(e) => setFormData({ ...formData, marketerNotes: e.target.value })}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={createLeadMutation.isPending}
                  >
                    {createLeadMutation.isPending ? 'Creating...' : 'Create Lead'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
    </Card>

    <MessengerLeadIngestion />
    </div>
  );
}
