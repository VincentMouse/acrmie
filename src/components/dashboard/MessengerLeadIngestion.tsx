import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { validatePhoneNumber } from '@/lib/phoneValidation';

const newLeadSchema = z.object({
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits'),
  customerName: z.string().trim().min(1, 'Customer name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  serviceProduct: z.string().trim().min(1, 'Service/Product is required'),
  campaignName: z.string().optional(),
  marketerName: z.string().trim().min(1, 'Marketer name is required'),
  branchId: z.string().trim().min(1, 'Branch is required'),
});

const bookingSchema = z.object({
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits'),
  customerName: z.string().trim().min(1, 'Customer name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().optional(),
  serviceProduct: z.string().trim().min(1, 'Service/Product is required'),
  marketerName: z.string().trim().min(1, 'Marketer name is required'),
  branchId: z.string().trim().min(1, 'Branch is required'),
  appointmentDate: z.string().trim().min(1, 'Appointment date is required'),
  appointmentTime: z.string().trim().min(1, 'Appointment time is required'),
  marketerNotes: z.string().optional(),
});

export function MessengerLeadIngestion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [leadType, setLeadType] = useState<'booking' | 'new_lead'>('new_lead');
  const [formData, setFormData] = useState({
    phone: '',
    customerName: '',
    email: '',
    address: '',
    serviceProduct: '',
    campaignName: '',
    marketerName: '',
    branchId: '',
    appointmentDate: '',
    appointmentTime: '',
    marketerNotes: '',
  });

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
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

      // Validate and normalize phone
      const phoneValidation = validatePhoneNumber(data.phone);
      if (!phoneValidation.isValid) {
        throw new Error(`Invalid phone number: ${phoneValidation.error}`);
      }

      // Check for duplicates using normalized phone
      const duplicates = await checkDuplicateMutation.mutateAsync(phoneValidation.normalized);
      
      const [firstName, ...lastNameParts] = data.customerName.trim().split(' ');
      const lastName = lastNameParts.join(' ') || firstName;

      const leadData = {
        first_name: firstName,
        last_name: lastName,
        phone: phoneValidation.normalized,
        email: data.email || null,
        address: data.address || null,
        service_product: data.serviceProduct,
        campaign_name: data.campaignName || null,
        marketer_name: data.marketerName,
        notes: data.marketerNotes || null,
        status: leadType === 'booking' ? 'L6-Appointment set' as const : 'L0-Fresh Lead' as const,
        created_by: user.id,
        funnel_id: null,
        is_duplicate: duplicates && duplicates.length > 0,
        duplicate_of: duplicates && duplicates.length > 0 ? duplicates[0].id : null,
      };

      const { data: insertedLead, error: leadError } = await supabase
        .from('leads')
        .insert([leadData])
        .select()
        .single();
      
      if (leadError) throw leadError;

      // If booking, create appointment
      if (leadType === 'booking' && insertedLead) {
        const appointmentDateTime = new Date(`${data.appointmentDate}T${data.appointmentTime}`);
        
        const appointmentData = {
          lead_id: insertedLead.id,
          assigned_to: user.id,
          branch_id: data.branchId,
          appointment_date: appointmentDateTime.toISOString(),
          service_product: data.serviceProduct,
          notes: data.marketerNotes || null,
          created_by: user.id,
        };

        const { error: appointmentError } = await supabase
          .from('appointments')
          .insert([appointmentData]);
        
        if (appointmentError) throw appointmentError;
      }
      
      return { isDuplicate: duplicates && duplicates.length > 0, duplicateOf: duplicates?.[0], isBooking: leadType === 'booking' };
    },
    onSuccess: ({ isDuplicate, duplicateOf, isBooking }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (isBooking) {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
      }
      
      if (isDuplicate && duplicateOf) {
        toast({
          title: `Messenger ${isBooking ? 'booking' : 'lead'} created with duplicate flag`,
          description: `This phone number matches existing lead: ${duplicateOf.first_name} ${duplicateOf.last_name}`,
          variant: 'destructive',
        });
      } else {
        toast({ 
          title: `Messenger ${isBooking ? 'booking' : 'lead'} created`,
          description: isBooking ? 'Lead with appointment has been added' : 'New lead has been added to the pipeline',
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
        branchId: '',
        appointmentDate: '',
        appointmentTime: '',
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
      const schema = leadType === 'booking' ? bookingSchema : newLeadSchema;
      const validated = schema.parse(formData);
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
              Add leads from messenger conversations - bookings or new leads.
            </p>
          </div>

          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Leads
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Messenger Leads</DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Lead Type *</Label>
                  <Tabs value={leadType} onValueChange={(v) => setLeadType(v as 'booking' | 'new_lead')}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="new_lead">New Lead</TabsTrigger>
                      <TabsTrigger value="booking">Booking</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

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
                  <Label htmlFor="messenger-branch">Branch *</Label>
                  <Select
                    value={formData.branchId}
                    onValueChange={(value) => setFormData({ ...formData, branchId: value })}
                  >
                    <SelectTrigger id="messenger-branch">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches?.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Label htmlFor="messenger-campaignName">Campaign Name {leadType === 'new_lead' && '(Optional)'}</Label>
                  <Input
                    id="messenger-campaignName"
                    value={formData.campaignName}
                    onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                  />
                </div>

                {leadType === 'booking' && (
                  <>
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
                      <Label htmlFor="messenger-appointmentDate">Appointment Date *</Label>
                      <Input
                        id="messenger-appointmentDate"
                        type="date"
                        value={formData.appointmentDate}
                        onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="messenger-appointmentTime">Appointment Time *</Label>
                      <Input
                        id="messenger-appointmentTime"
                        type="time"
                        value={formData.appointmentTime}
                        onChange={(e) => setFormData({ ...formData, appointmentTime: e.target.value })}
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
                  </>
                )}

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={createLeadMutation.isPending}
                >
                  {createLeadMutation.isPending ? 'Creating...' : `Create ${leadType === 'booking' ? 'Booking' : 'Lead'}`}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Card>
  );
}
