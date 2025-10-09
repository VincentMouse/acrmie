import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Building2, Plus, Clock, Upload, Package, Trash2 } from 'lucide-react';
import Papa from 'papaparse';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function BranchManagement() {
  const [isAddBranchOpen, setIsAddBranchOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [newBranch, setNewBranch] = useState({ name: '', address: '' });
  const [workingHours, setWorkingHours] = useState<Record<number, { start: string; end: string; active: boolean }>>({});
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const queryClient = useQueryClient();

  // Fetch branches
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch working hours for selected branch
  const { data: branchWorkingHours } = useQuery({
    queryKey: ['branch_working_hours', selectedBranch],
    queryFn: async () => {
      if (!selectedBranch) return [];
      const { data, error } = await supabase
        .from('branch_working_hours')
        .select('*')
        .eq('branch_id', selectedBranch);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBranch,
  });

  // Fetch services and products
  const { data: servicesProducts } = useQuery({
    queryKey: ['services_products', selectedBranch],
    queryFn: async () => {
      if (!selectedBranch) return [];
      const { data, error } = await supabase
        .from('services_products')
        .select('*')
        .eq('branch_id', selectedBranch)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBranch,
  });

  // Create branch mutation
  const createBranchMutation = useMutation({
    mutationFn: async (branch: { name: string; address: string }) => {
      const { data, error } = await supabase
        .from('branches')
        .insert([{ ...branch, created_by: (await supabase.auth.getUser()).data.user?.id }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setIsAddBranchOpen(false);
      setNewBranch({ name: '', address: '' });
      toast.success('Branch created successfully');
    },
    onError: () => {
      toast.error('Failed to create branch');
    },
  });

  // Save working hours mutation
  const saveWorkingHoursMutation = useMutation({
    mutationFn: async (hours: Record<number, { start: string; end: string; active: boolean }>) => {
      if (!selectedBranch) return;

      // Delete existing hours
      await supabase.from('branch_working_hours').delete().eq('branch_id', selectedBranch);

      // Insert new hours
      const hoursToInsert = Object.entries(hours)
        .filter(([_, h]) => h.active && h.start && h.end)
        .map(([day, h]) => ({
          branch_id: selectedBranch,
          day_of_week: parseInt(day),
          start_time: h.start,
          end_time: h.end,
          is_active: true,
        }));

      if (hoursToInsert.length > 0) {
        const { error } = await supabase.from('branch_working_hours').insert(hoursToInsert);
        if (error) throw error;
      }

      // Generate time slots
      const { error: rpcError } = await supabase.rpc('generate_time_slots_for_branch', {
        _branch_id: selectedBranch,
        _days_ahead: 15,
      });
      if (rpcError) throw rpcError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch_working_hours'] });
      toast.success('Working hours saved and time slots generated');
    },
    onError: () => {
      toast.error('Failed to save working hours');
    },
  });

  // Upload CSV mutation
  const uploadCsvMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedBranch) return;

      return new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          complete: async (results) => {
            try {
              const data = results.data
                .filter((row: any) => row.Code && row.Name)
                .map((row: any) => ({
                  branch_id: selectedBranch,
                  code: row.Code,
                  name: row.Name,
                  price: row.Price ? parseFloat(row.Price.toString().replace(/,/g, '')) : 0,
                  number_of_treatments: parseInt(row['Number of treatment']) || null,
                  type: row.Type || '',
                  category: row['Service/Product'] === 'Service' ? 'Service' : 'Product',
                }));

              const { error } = await supabase.from('services_products').insert(data);
              if (error) throw error;
              resolve(data);
            } catch (error) {
              reject(error);
            }
          },
          error: (error) => {
            reject(error);
          },
        });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services_products'] });
      setCsvFile(null);
      toast.success('Services and products uploaded successfully');
    },
    onError: () => {
      toast.error('Failed to upload CSV');
    },
  });

  // Delete all services/products mutation
  const deleteAllServicesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBranch) return;
      const { error } = await supabase
        .from('services_products')
        .delete()
        .eq('branch_id', selectedBranch);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services_products'] });
      toast.success('All services and products deleted');
    },
    onError: () => {
      toast.error('Failed to delete services and products');
    },
  });

  const handleSaveWorkingHours = () => {
    saveWorkingHoursMutation.mutate(workingHours);
  };

  const handleUploadCsv = () => {
    if (csvFile) {
      uploadCsvMutation.mutate(csvFile);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Branch Management</h1>
          <p className="text-muted-foreground">Manage clinic branches and their configurations</p>
        </div>
        <Dialog open={isAddBranchOpen} onOpenChange={setIsAddBranchOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Branch
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Branch</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Branch Name</Label>
                <Input
                  id="name"
                  value={newBranch.name}
                  onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                  placeholder="Main Clinic"
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={newBranch.address}
                  onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
                  placeholder="123 Medical Street, City"
                />
              </div>
              <Button
                onClick={() => createBranchMutation.mutate(newBranch)}
                disabled={!newBranch.name || !newBranch.address}
                className="w-full"
              >
                Create Branch
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {branches?.map((branch) => (
          <Card
            key={branch.id}
            className={`cursor-pointer transition-colors ${
              selectedBranch === branch.id ? 'border-primary' : ''
            }`}
            onClick={() => setSelectedBranch(branch.id)}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {branch.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{branch.address}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedBranch && (
        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="working-hours">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="working-hours">
                  <Clock className="mr-2 h-4 w-4" />
                  Working Hours
                </TabsTrigger>
                <TabsTrigger value="services">
                  <Package className="mr-2 h-4 w-4" />
                  Services & Products
                </TabsTrigger>
                <TabsTrigger value="upload">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload CSV
                </TabsTrigger>
              </TabsList>

              <TabsContent value="working-hours" className="space-y-4">
                <div className="space-y-4">
                  {DAYS.map((day, index) => {
                    const existing = branchWorkingHours?.find((wh) => wh.day_of_week === index);
                    const currentHours = workingHours[index] || {
                      start: existing?.start_time || '09:00',
                      end: existing?.end_time || '17:00',
                      active: existing?.is_active ?? false,
                    };

                    return (
                      <div key={day} className="flex items-center gap-4 p-4 border rounded-lg">
                        <div className="w-32">
                          <Label>{day}</Label>
                        </div>
                        <div className="flex items-center gap-4 flex-1">
                          <Input
                            type="time"
                            value={currentHours.start}
                            onChange={(e) =>
                              setWorkingHours({
                                ...workingHours,
                                [index]: { ...currentHours, start: e.target.value },
                              })
                            }
                            disabled={!currentHours.active}
                          />
                          <span>to</span>
                          <Input
                            type="time"
                            value={currentHours.end}
                            onChange={(e) =>
                              setWorkingHours({
                                ...workingHours,
                                [index]: { ...currentHours, end: e.target.value },
                              })
                            }
                            disabled={!currentHours.active}
                          />
                          <Button
                            variant={currentHours.active ? 'default' : 'outline'}
                            onClick={() =>
                              setWorkingHours({
                                ...workingHours,
                                [index]: { ...currentHours, active: !currentHours.active },
                              })
                            }
                          >
                            {currentHours.active ? 'Active' : 'Inactive'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button onClick={handleSaveWorkingHours} className="w-full">
                  Save Working Hours & Generate Time Slots
                </Button>
              </TabsContent>

              <TabsContent value="services" className="space-y-4">
                <div className="flex items-center gap-4 mb-4">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {Array.from(new Set(servicesProducts?.map(item => item.type).filter(type => type !== '') || [])).map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="destructive"
                    onClick={() => deleteAllServicesMutation.mutate()}
                    disabled={!servicesProducts?.length}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete All
                  </Button>
                </div>
                <div className="space-y-2">
                  {servicesProducts
                    ?.filter(item => typeFilter === 'all' || item.type === typeFilter)
                    .map((item) => (
                      <div key={item.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold">
                              {item.code} - {item.name}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {item.category} | {item.type} | ₱{item.price.toLocaleString()}
                              {item.number_of_treatments &&
                                ` | ${item.number_of_treatments} treatments`}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  {!servicesProducts?.length && (
                    <p className="text-center text-muted-foreground py-8">
                      No services or products yet. Upload a CSV to add them.
                    </p>
                  )}
                  {servicesProducts?.length && typeFilter !== 'all' && 
                   servicesProducts.filter(item => item.type === typeFilter).length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No services or products found for this type.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="upload" className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">Upload CSV File</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    CSV should include: Code, Name, Price, Number of treatment, Type, Service/Product
                  </p>
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                    className="mt-4"
                  />
                  {csvFile && (
                    <div className="mt-4">
                      <p className="text-sm">Selected: {csvFile.name}</p>
                      <Button onClick={handleUploadCsv} className="mt-2">
                        Upload & Import
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
