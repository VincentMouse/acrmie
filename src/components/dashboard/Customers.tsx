import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Mail, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  created_at: string;
};

type Lead = {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  service_product: string;
  created_at: string;
  campaign_name: string | null;
};

type Appointment = {
  id: string;
  lead_id: string;
  appointment_date: string;
  confirmation_status: string;
  check_in_status: string | null;
  service_product: string | null;
  revenue: number | null;
  notes: string | null;
};

export function Customers() {
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [emailValue, setEmailValue] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isTeleSales, isLoading: isRoleLoading } = useUserRole();

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', searchQuery, isTeleSales],
    queryFn: async () => {
      // For Tele Sales, only fetch if there's a search query
      if (isTeleSales && !searchQuery) {
        return [];
      }

      let query = supabase
        .from('customers')
        .select('*');

      // If tele sales is searching, filter by exact phone match
      if (isTeleSales && searchQuery) {
        query = query.eq('phone', searchQuery);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data as Customer[];
    },
    enabled: !isRoleLoading,
  });

  const handlePhoneSearch = () => {
    setSearchQuery(phoneSearch.trim());
  };

  const { data: leadsMap } = useQuery({
    queryKey: ['customer-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group leads by phone number
      const grouped = (data as Lead[]).reduce((acc, lead) => {
        const phone = (lead as any).phone;
        if (!acc[phone]) {
          acc[phone] = [];
        }
        acc[phone].push(lead);
        return acc;
      }, {} as Record<string, Lead[]>);

      return grouped;
    },
  });

  const { data: appointmentsMap } = useQuery({
    queryKey: ['customer-appointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: false });

      if (error) throw error;

      // Group appointments by lead_id
      const grouped = (data as any[]).reduce((acc, appointment) => {
        const leadId = appointment.lead_id;
        if (!acc[leadId]) {
          acc[leadId] = [];
        }
        acc[leadId].push({
          id: appointment.id,
          lead_id: appointment.lead_id,
          appointment_date: appointment.appointment_date,
          confirmation_status: appointment.confirmation_status,
          check_in_status: appointment.check_in_status,
          service_product: appointment.service_product,
          revenue: appointment.revenue,
          notes: appointment.notes,
        });
        return acc;
      }, {} as Record<string, Appointment[]>);

      return grouped;
    },
  });

  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [addressValue, setAddressValue] = useState('');

  const updateEmailMutation = useMutation({
    mutationFn: async ({ customerId, email }: { customerId: string; email: string }) => {
      const { error } = await supabase
        .from('customers')
        .update({ email })
        .eq('id', customerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Email updated',
        description: 'Customer email has been updated successfully.',
      });
      setEditingEmail(null);
      setEmailValue('');
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update email. Please try again.',
        variant: 'destructive',
      });
      console.error('Error updating email:', error);
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: async ({ customerId, address }: { customerId: string; address: string }) => {
      const { error } = await supabase
        .from('customers')
        .update({ address })
        .eq('id', customerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Address updated',
        description: 'Customer address has been updated successfully.',
      });
      setEditingAddress(null);
      setAddressValue('');
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update address. Please try again.',
        variant: 'destructive',
      });
      console.error('Error updating address:', error);
    },
  });

  const handleEmailSave = (customerId: string) => {
    if (emailValue.trim()) {
      updateEmailMutation.mutate({ customerId, email: emailValue.trim() });
    }
  };

  const handleAddressSave = (customerId: string) => {
    if (addressValue.trim()) {
      updateAddressMutation.mutate({ customerId, address: addressValue.trim() });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'L0-Fresh Lead': 'bg-gray-500',
      'L1-Call back': 'bg-blue-500',
      'L2-Call reschedule': 'bg-yellow-500',
      'L3-Cancelled': 'bg-green-500',
      'L4-Blacklisted': 'bg-red-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Customers</h2>
        <Badge variant="outline">{customers?.length || 0} Total Customers</Badge>
      </div>

      {isTeleSales && (
        <div className="mb-6">
          <Label htmlFor="phone-search" className="text-sm font-medium mb-2 block">
            Search Customer by Phone Number
          </Label>
          <div className="flex gap-2">
            <Input
              id="phone-search"
              placeholder="Enter exact phone number"
              value={phoneSearch}
              onChange={(e) => setPhoneSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePhoneSearch()}
              className="flex-1"
            />
            <Button onClick={handlePhoneSearch}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {customers?.map((customer) => {
          const customerLeads = leadsMap?.[customer.phone] || [];
          const isExpanded = expandedCustomer === customer.id;

          return (
            <Collapsible
              key={customer.id}
              open={isExpanded}
              onOpenChange={(open) => setExpandedCustomer(open ? customer.id : null)}
            >
              <Card className="overflow-hidden">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center flex-1 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 mr-3" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mr-3" />
                      )}
                      <div className="flex items-center gap-8 flex-1 min-w-0">
                        <h3 className="font-semibold text-sm w-48 truncate">{customer.name}</h3>
                        <p className="text-sm text-muted-foreground w-32 flex-shrink-0">{customer.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground ml-4 flex-shrink-0">
                      {customer.email ? (
                        <>
                          <Mail className="h-3 w-3" />
                          <span className="truncate max-w-[200px]">{customer.email}</span>
                        </>
                      ) : (
                        <span className="text-xs italic">No email</span>
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-muted/30 p-3 rounded-lg">
                        <Label htmlFor={`email-${customer.id}`} className="text-sm font-medium mb-2 block">
                          {customer.email ? 'Email Address' : 'Add Email Address'}
                        </Label>
                        {customer.email ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-4 w-4" />
                            {customer.email}
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              id={`email-${customer.id}`}
                              type="email"
                              placeholder="Enter email address"
                              value={editingEmail === customer.id ? emailValue : ''}
                              onChange={(e) => {
                                setEditingEmail(customer.id);
                                setEmailValue(e.target.value);
                              }}
                              className="flex-1"
                            />
                            <button
                              onClick={() => handleEmailSave(customer.id)}
                              disabled={!emailValue.trim() || updateEmailMutation.isPending}
                              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="bg-muted/30 p-3 rounded-lg">
                        <Label htmlFor={`address-${customer.id}`} className="text-sm font-medium mb-2 block">
                          {customer.address ? 'Home Address' : 'Add Home Address'}
                        </Label>
                        {customer.address ? (
                          <div className="text-sm text-muted-foreground">
                            {customer.address}
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              id={`address-${customer.id}`}
                              placeholder="Enter home address"
                              value={editingAddress === customer.id ? addressValue : ''}
                              onChange={(e) => {
                                setEditingAddress(customer.id);
                                setAddressValue(e.target.value);
                              }}
                              className="flex-1"
                            />
                            <button
                              onClick={() => handleAddressSave(customer.id)}
                              disabled={!addressValue.trim() || updateAddressMutation.isPending}
                              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-3 text-sm">Leads</h4>
                      {customerLeads.length > 0 ? (
                        <div className="space-y-4">
                          {customerLeads.map((lead) => {
                            const leadAppointments = appointmentsMap?.[lead.id] || [];
                            return (
                              <div key={lead.id} className="border rounded-lg overflow-hidden">
                                <div className="bg-muted/30 p-3">
                                  <div className="grid grid-cols-5 gap-4 text-sm">
                                    <div>
                                      <span className="font-medium">Name:</span>
                                      <p className="text-muted-foreground">{lead.first_name} {lead.last_name}</p>
                                    </div>
                                    <div>
                                      <span className="font-medium">Service/Product:</span>
                                      <p className="text-muted-foreground">{lead.service_product}</p>
                                    </div>
                                    <div>
                                      <span className="font-medium">Campaign:</span>
                                      <p className="text-muted-foreground">{lead.campaign_name || '-'}</p>
                                    </div>
                                    <div>
                                      <span className="font-medium">Status:</span>
                                      <div className="mt-1">
                                        <Badge className={getStatusColor(lead.status)}>
                                          {lead.status}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div>
                                      <span className="font-medium">Date:</span>
                                      <p className="text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</p>
                                    </div>
                                  </div>
                                </div>
                                
                                {leadAppointments.length > 0 && (
                                  <div className="p-3 bg-background border-t">
                                    <h5 className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Appointments for this lead</h5>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="text-xs">Appointment Date</TableHead>
                                          <TableHead className="text-xs">Service/Product</TableHead>
                                          <TableHead className="text-xs">Confirmation</TableHead>
                                          <TableHead className="text-xs">Check-in</TableHead>
                                          <TableHead className="text-xs">Revenue</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {leadAppointments.map((appointment) => (
                                          <TableRow key={appointment.id}>
                                            <TableCell className="text-xs">
                                              {new Date(appointment.appointment_date).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-xs">{appointment.service_product || '-'}</TableCell>
                                            <TableCell>
                                              <Badge variant={appointment.confirmation_status === 'confirmed' ? 'default' : 'secondary'} className="text-xs">
                                                {appointment.confirmation_status}
                                              </Badge>
                                            </TableCell>
                                            <TableCell>
                                              {appointment.check_in_status ? (
                                                <Badge className="text-xs">{appointment.check_in_status}</Badge>
                                              ) : (
                                                <span className="text-xs text-muted-foreground">-</span>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                              {appointment.revenue ? `$${appointment.revenue}` : '-'}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          No leads found for this customer
                        </div>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}

        {!customers?.length && (
          <div className="text-center py-8 text-muted-foreground">
            {isTeleSales && !searchQuery
              ? 'Enter a phone number to search for a customer'
              : 'No customers found. Customers will be created automatically when leads are ingested.'}
          </div>
        )}
      </div>
    </Card>
  );
}
