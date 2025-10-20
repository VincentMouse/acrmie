import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LeadEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  lead: any;
  isSaving: boolean;
}

const STATUS_LABELS = {
  'L0-Fresh Lead': 'L0 - Fresh Lead',
  'L1-Call back': 'L1 - Call Back',
  'L2-Call reschedule': 'L2 - Call Rescheduled',
  'L3-Cancelled': 'L3 - Cancelled',
  'L4-Blacklisted': 'L4 - Blacklisted',
  'L5-Thinking': 'L5 - Thinking',
  'L6-Appointment set': 'L6 - Appointment Set',
  'hibernation': 'Hibernation',
};

export function LeadEditDialog({ isOpen, onClose, onSave, lead, isSaving }: LeadEditDialogProps) {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    address: '',
    service_product: '',
    campaign_name: '',
    marketer_name: '',
    status: '',
    notes: '',
  });

  useEffect(() => {
    if (lead && isOpen) {
      setFormData({
        first_name: lead.first_name || '',
        last_name: lead.last_name || '',
        phone: lead.phone || '',
        email: lead.email || '',
        address: lead.address || '',
        service_product: lead.service_product || '',
        campaign_name: lead.campaign_name || '',
        marketer_name: lead.marketer_name || '',
        status: lead.status || '',
        notes: lead.notes || '',
      });
    }
  }, [lead, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Lead Details</DialogTitle>
          <DialogDescription>
            Update lead information. Changes will be saved immediately.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
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
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="service_product">Service/Product</Label>
              <Input
                id="service_product"
                value={formData.service_product}
                onChange={(e) => setFormData({ ...formData, service_product: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="campaign_name">Campaign Name</Label>
                <Input
                  id="campaign_name"
                  value={formData.campaign_name}
                  onChange={(e) => setFormData({ ...formData, campaign_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="marketer_name">Marketer Name</Label>
                <Input
                  id="marketer_name"
                  value={formData.marketer_name}
                  onChange={(e) => setFormData({ ...formData, marketer_name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
