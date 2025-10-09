import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

export function Customers() {
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [emailValue, setEmailValue] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Customer[];
    },
  });

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

  const handleEmailSave = (customerId: string) => {
    if (emailValue.trim()) {
      updateEmailMutation.mutate({ customerId, email: emailValue.trim() });
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
      status_0: 'bg-gray-500',
      status_1: 'bg-blue-500',
      status_2: 'bg-yellow-500',
      status_3: 'bg-green-500',
      status_4: 'bg-red-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Customers</h2>
        <Badge variant="outline">{customers?.length || 0} Total Customers</Badge>
      </div>

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
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="text-left flex-1 min-w-0">
                        <div className="flex items-center gap-4">
                          <h3 className="font-semibold text-sm">{customer.name}</h3>
                          <p className="text-sm text-muted-foreground">{customer.phone}</p>
                          {customer.email ? (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {customer.email}
                            </p>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No email</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary" className="flex-shrink-0">{customerLeads.length} Leads</Badge>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t p-4 space-y-4">
                    {!customer.email && (
                      <div className="bg-muted/30 p-3 rounded-lg">
                        <Label htmlFor={`email-${customer.id}`} className="text-sm font-medium mb-2 block">
                          Add Email Address
                        </Label>
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
                      </div>
                    )}
                    
                    {customerLeads.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Service/Product</TableHead>
                            <TableHead>Campaign</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customerLeads.map((lead) => (
                            <TableRow key={lead.id}>
                              <TableCell>
                                {lead.first_name} {lead.last_name}
                              </TableCell>
                              <TableCell>{lead.service_product}</TableCell>
                              <TableCell>{lead.campaign_name || '-'}</TableCell>
                              <TableCell>
                                <Badge className={getStatusColor(lead.status)}>
                                  {lead.status.replace('status_', 'Status ')}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {new Date(lead.created_at).toLocaleDateString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="p-4 text-center text-muted-foreground">
                        No leads found for this customer
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}

        {!customers?.length && (
          <div className="text-center py-8 text-muted-foreground">
            No customers found. Customers will be created automatically when leads are ingested.
          </div>
        )}
      </div>
    </Card>
  );
}
