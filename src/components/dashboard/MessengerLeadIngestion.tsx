import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertTriangle, Plus } from 'lucide-react';
import { z } from 'zod';

const messengerLeadSchema = z.object({
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits'),
  customerName: z.string().trim().min(1, 'Customer name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().optional(),
  serviceProduct: z.string().trim().min(1, 'Service/Product is required'),
  campaignName: z.string().trim().min(1, 'Campaign name is required'),
  marketerName: z.string().trim().min(1, 'Marketer name is required'),
  marketerNotes: z.string().optional(),
});

export function MessengerLeadIngestion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    phone: '',
    customerName: '',
    email: '',
    address: '',
    serviceProduct: '',
    campaignName: '',
    marketerName: '',
    marketerNotes: '',
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
        email: data.email || null,
        address: data.address || null,
        service_product: data.serviceProduct,
        campaign_name: data.campaignName,
        marketer_name: data.marketerName,
        notes: data.marketerNotes || null,
        status: 'status_1' as const, // Messenger leads start at status_1 (appointment scheduled)
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
          title: 'Messenger lead created with duplicate flag',
          description: `This phone number matches existing lead: ${duplicateOf.first_name} ${duplicateOf.last_name}`,
          variant: 'destructive',
        });
      } else {
        toast({ 
          title: 'Messenger lead created',
          description: 'Lead with appointment has been added to the pipeline',
        });
      }
      
      setIsOpen(false);
      setFormData({ 
        phone: '', 
        customerName: '', 
        email: '', 
        address: '', 
        serviceProduct: '', 
        campaignName: '', 
        marketerName: '', 
        marketerNotes: '' 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create messenger lead',
        description: error.message,
        variant: 'destructive'
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const validated = messengerLeadSchema.parse(formData);
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
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Messenger Lead Ingestion</h2>
            <p className="text-muted-foreground mt-1">
              Add leads from messenger conversations who have appointments scheduled.
            </p>
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
                <DialogTitle>Add Messenger Leads</DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <Alert variant="destructive" className="bg-red-50 border-red-200 dark:bg-red-950/20">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-red-800 dark:text-red-200">
                    <strong>Important:</strong> These leads must have an appointment booked.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="messenger-leadGenDate">Lead Generation Date</Label>
                  <Input
                    id="messenger-leadGenDate"
                    value={new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
                    readOnly
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-marketerName">Marketer Name *</Label>
                  <Input
                    id="messenger-marketerName"
                    value={formData.marketerName}
                    onChange={(e) => setFormData({ ...formData, marketerName: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-phone">Phone Number *</Label>
                  <Input
                    id="messenger-phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-customerName">Customer Name *</Label>
                  <Input
                    id="messenger-customerName"
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-email">Email Address</Label>
                  <Input
                    id="messenger-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="customer@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-address">Home Address</Label>
                  <Input
                    id="messenger-address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="123 Street Name, City"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-serviceProduct">Service/Product *</Label>
                  <Input
                    id="messenger-serviceProduct"
                    value={formData.serviceProduct}
                    onChange={(e) => setFormData({ ...formData, serviceProduct: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-campaignName">Campaign Name *</Label>
                  <Input
                    id="messenger-campaignName"
                    value={formData.campaignName}
                    onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messenger-marketerNotes">Marketer Notes</Label>
                  <Input
                    id="messenger-marketerNotes"
                    value={formData.marketerNotes}
                    onChange={(e) => setFormData({ ...formData, marketerNotes: e.target.value })}
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={createLeadMutation.isPending}
                >
                  {createLeadMutation.isPending ? 'Creating...' : 'Create Messenger Lead'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Alert variant="destructive" className="bg-red-50 border-red-200 dark:bg-red-950/20">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            <strong>Important:</strong> These leads must have an appointment booked.
          </AlertDescription>
        </Alert>
      </div>
    </Card>
  );
}
