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
import { z } from 'zod';

const leadSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits'),
  funnelId: z.string().uuid('Please select a funnel'),
});

export function LeadIngestion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    funnelId: '',
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

  const createLeadMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check for duplicates
      const duplicates = await checkDuplicateMutation.mutateAsync(data.phone);
      
      const leadData = {
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email || null,
        phone: data.phone,
        funnel_id: data.funnelId,
        created_by: user.id,
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
      setFormData({ firstName: '', lastName: '', email: '', phone: '', funnelId: '' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create lead',
        description: error.message,
        variant: 'destructive'
      });
    },
  });

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
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Lead Ingestion</h2>
          <p className="text-muted-foreground mt-1">
            Add new leads from your marketing funnels. Duplicates will be automatically flagged.
          </p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>Add New Lead</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Lead</DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="funnel">Marketing Funnel *</Label>
                <Select 
                  value={formData.funnelId} 
                  onValueChange={(value) => setFormData({ ...formData, funnelId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select funnel" />
                  </SelectTrigger>
                  <SelectContent>
                    {funnels?.map((funnel) => (
                      <SelectItem key={funnel.id} value={funnel.id}>
                        {funnel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={createLeadMutation.isPending}
              >
                {createLeadMutation.isPending ? 'Creating...' : 'Create Lead'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="text-sm text-muted-foreground">
        <p>• Leads will be created with status "New - Unassigned" (Status 0)</p>
        <p>• Duplicate detection is automatic based on phone number</p>
        <p>• All leads start in the unassigned pool for Tele Sales to pick up</p>
      </div>
    </Card>
  );
}
