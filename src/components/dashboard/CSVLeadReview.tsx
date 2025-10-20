import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { validatePhoneNumber } from '@/lib/phoneValidation';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface ParsedLead {
  phone: string;
  customerName: string;
  email?: string;
  address?: string;
  serviceProduct: string;
  campaignName: string;
  marketerName: string;
  marketerNotes?: string;
}

interface EnrichedLead extends ParsedLead {
  id: string;
  phoneValidation: ReturnType<typeof validatePhoneNumber>;
  isDuplicate: boolean;
  duplicateOf?: { id: string; name: string };
  lastProcessed?: {
    time: string;
    by: string;
    status: string;
  };
  eligible: boolean;
}

interface CSVLeadReviewProps {
  leads: ParsedLead[];
  onComplete: () => void;
  onCancel: () => void;
}

export function CSVLeadReview({ leads, onComplete, onCancel }: CSVLeadReviewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enrichedLeads, setEnrichedLeads] = useState<EnrichedLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    enrichLeads();
  }, [leads]);

  const enrichLeads = async () => {
    setLoading(true);
    
    const enriched: EnrichedLead[] = await Promise.all(
      leads.map(async (lead, index) => {
        const phoneValidation = validatePhoneNumber(lead.phone);
        
        // Check for duplicates using normalized phone
        const { data: duplicates } = await supabase
          .from('leads')
          .select('id, first_name, last_name, status, updated_at, assigned_to, profiles!leads_assigned_to_fkey(nickname)')
          .eq('phone', phoneValidation.normalized)
          .order('updated_at', { ascending: false })
          .limit(1);

        const isDuplicate = duplicates && duplicates.length > 0;
        const duplicate = duplicates?.[0];

        return {
          ...lead,
          id: `temp-${index}`,
          phoneValidation,
          isDuplicate,
          duplicateOf: duplicate ? {
            id: duplicate.id,
            name: `${duplicate.first_name} ${duplicate.last_name}`
          } : undefined,
          lastProcessed: duplicate ? {
            time: new Date(duplicate.updated_at).toLocaleString(),
            by: (duplicate.profiles as any)?.nickname || 'Unknown',
            status: duplicate.status
          } : undefined,
          eligible: phoneValidation.isValid, // Only eligible if phone is valid
        };
      })
    );

    setEnrichedLeads(enriched);
    setLoading(false);
  };

  const updateLead = (id: string, updates: Partial<EnrichedLead>) => {
    setEnrichedLeads(prev => prev.map(lead => {
      if (lead.id === id) {
        const updated = { ...lead, ...updates };
        
        // Re-validate phone if it changed
        if (updates.phone) {
          const phoneValidation = validatePhoneNumber(updates.phone);
          updated.phoneValidation = phoneValidation;
          updated.eligible = phoneValidation.isValid;
        }
        
        return updated;
      }
      return lead;
    }));
  };

  const createLeadsMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const eligibleLeads = enrichedLeads.filter(lead => lead.eligible && lead.phoneValidation.isValid);
      
      if (eligibleLeads.length === 0) {
        throw new Error('No eligible leads to import. Please fix phone number errors.');
      }

      const results = { success: 0, failed: 0, skipped: enrichedLeads.length - eligibleLeads.length };
      
      for (const lead of eligibleLeads) {
        try {
          const [firstName, ...lastNameParts] = lead.customerName.trim().split(' ');
          const lastName = lastNameParts.join(' ') || firstName;

          const leadData = {
            first_name: firstName,
            last_name: lastName,
            phone: lead.phoneValidation.normalized,
            email: lead.email || null,
            address: lead.address || null,
            service_product: lead.serviceProduct,
            campaign_name: lead.campaignName,
            marketer_name: lead.marketerName,
            notes: lead.marketerNotes || null,
            status: 'L0-Fresh Lead' as const,
            created_by: user.id,
            funnel_id: null,
            is_duplicate: lead.isDuplicate,
            duplicate_of: lead.duplicateOf?.id || null,
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
      
      toast({
        title: 'CSV Import Complete',
        description: `Imported ${results.success} leads. ${results.skipped > 0 ? `${results.skipped} skipped (ineligible). ` : ''}${results.failed > 0 ? `${results.failed} failed.` : ''}`,
        variant: results.failed > 0 ? 'destructive' : 'default',
      });
      
      onComplete();
    },
    onError: (error: any) => {
      toast({
        title: 'Import failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const validCount = enrichedLeads.filter(l => l.phoneValidation.isValid && l.eligible).length;
  const invalidCount = enrichedLeads.filter(l => !l.phoneValidation.isValid).length;
  const ineligibleCount = enrichedLeads.filter(l => l.phoneValidation.isValid && !l.eligible).length;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Review Imported Leads</h3>
            <p className="text-sm text-muted-foreground">
              Verify and fix any issues before importing
            </p>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>{validCount} Valid</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <span>{invalidCount} Invalid</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <span>{ineligibleCount} Ineligible</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Phone</TableHead>
                <TableHead className="w-[180px]">Customer Name</TableHead>
                <TableHead className="w-[180px]">Email</TableHead>
                <TableHead className="w-[200px]">Address</TableHead>
                <TableHead className="w-[150px]">Service/Product</TableHead>
                <TableHead className="w-[120px]">Duplicate</TableHead>
                <TableHead className="w-[200px]">Last Processed</TableHead>
                <TableHead className="w-[120px]">Eligible</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrichedLeads.map((lead) => (
                <TableRow key={lead.id} className={!lead.phoneValidation.isValid ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                  <TableCell>
                    <Input
                      value={lead.phone}
                      onChange={(e) => updateLead(lead.id, { phone: e.target.value })}
                      className={!lead.phoneValidation.isValid ? 'border-red-500 bg-red-100 dark:bg-red-950 font-semibold' : ''}
                      title={lead.phoneValidation.error || ''}
                    />
                    {!lead.phoneValidation.isValid && (
                      <span className="text-xs text-red-600 font-semibold">{lead.phoneValidation.error}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={lead.customerName}
                      onChange={(e) => updateLead(lead.id, { customerName: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={lead.email || ''}
                      onChange={(e) => updateLead(lead.id, { email: e.target.value })}
                      placeholder="Optional"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={lead.address || ''}
                      onChange={(e) => updateLead(lead.id, { address: e.target.value })}
                      placeholder="Optional"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={lead.serviceProduct}
                      onChange={(e) => updateLead(lead.id, { serviceProduct: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    {lead.isDuplicate ? (
                      <div className="space-y-1">
                        <Badge variant="destructive">Duplicate</Badge>
                        <p className="text-xs text-muted-foreground">{lead.duplicateOf?.name}</p>
                      </div>
                    ) : (
                      <Badge variant="outline">New</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {lead.lastProcessed ? (
                      <div className="text-xs space-y-1">
                        <p className="font-semibold">{lead.lastProcessed.by}</p>
                        <p className="text-muted-foreground">{lead.lastProcessed.time}</p>
                        <Badge variant="outline" className="text-xs">{lead.lastProcessed.status}</Badge>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Never processed</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={lead.eligible ? 'yes' : 'no'}
                      onValueChange={(value) => updateLead(lead.id, { eligible: value === 'yes' })}
                      disabled={!lead.phoneValidation.isValid}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={() => createLeadsMutation.mutate()}
          disabled={createLeadsMutation.isPending || validCount === 0}
        >
          {createLeadsMutation.isPending ? 'Importing...' : `Import ${validCount} Leads`}
        </Button>
      </div>
    </div>
  );
}
