import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Clock, Upload, Package } from 'lucide-react';
import Papa from 'papaparse';

interface Branch {
  id: string;
  name: string;
  address: string;
  created_at: string;
}

interface WorkingHour {
  id: string;
  branch_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface ServiceProduct {
  id: string;
  code: string;
  name: string;
  price: number;
  number_of_treatments: number | null;
  type: string;
  category: string;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function BranchManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [isNewBranchOpen, setIsNewBranchOpen] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', address: '' });
  const [workingHours, setWorkingHours] = useState<Record<number, { start: string; end: string; active: boolean }>>({});

  // Fetch branches
  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Branch[];
    },
  });

  // Fetch working hours for selected branch
  const { data: branchWorkingHours = [] } = useQuery({
    queryKey: ['branch_working_hours', selectedBranchId],
    queryFn: async () => {
      if (!selectedBranchId) return [];
      const { data, error } = await supabase
        .from('branch_working_hours')
        .select('*')
        .eq('branch_id', selectedBranchId)
        .order('day_of_week');
      if (error) throw error;
      return data as WorkingHour[];
    },
    enabled: !!selectedBranchId,
  });

  // Fetch services/products for selected branch
  const { data: servicesProducts = [] } = useQuery({
    queryKey: ['services_products', selectedBranchId],
    queryFn: async () => {
      if (!selectedBranchId) return [];
      const { data, error } = await supabase
        .from('services_products')
        .select('*')
        .eq('branch_id', selectedBranchId)
        .order('code');
      if (error) throw error;
      return data as ServiceProduct[];
    },
    enabled: !!selectedBranchId,
  });

  // Create branch mutation
  const createBranchMutation = useMutation({
    mutationFn: async () => {
      const { data: branchData, error: branchError } = await supabase
        .from('branches')
        .insert([{ name: newBranch.name, address: newBranch.address }])
        .select()
        .single();

      if (branchError) throw branchError;

      // Insert working hours
      const workingHoursData = Object.entries(workingHours)
        .filter(([_, hours]) => hours.active)
        .map(([day, hours]) => ({
          branch_id: branchData.id,
          day_of_week: parseInt(day),
          start_time: hours.start,
          end_time: hours.end,
          is_active: true,
        }));

      if (workingHoursData.length > 0) {
        const { error: hoursError } = await supabase
          .from('branch_working_hours')
          .insert(workingHoursData);
        if (hoursError) throw hoursError;

        // Generate time slots
        const { error: slotsError } = await supabase.rpc('generate_time_slots_for_branch', {
          _branch_id: branchData.id,
          _days_ahead: 15,
        });
        if (slotsError) throw slotsError;
      }

      return branchData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast({ title: 'Branch created successfully' });
      setIsNewBranchOpen(false);
      setNewBranch({ name: '', address: '' });
      setWorkingHours({});
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating branch', description: error.message, variant: 'destructive' });
    },
  });

  // Upload CSV mutation
  const uploadCSVMutation = useMutation({
    mutationFn: async (data: any[]) => {
      if (!selectedBranchId) throw new Error('No branch selected');

      const items = data.map(row => ({
        branch_id: selectedBranchId,
        code: row.Code,
        name: row.Name,
        price: parseFloat(row.Price),
        number_of_treatments: row['Number of treatment'] ? parseInt(row['Number of treatment']) : null,
        type: row.Type,
        category: row['Service/Product'],
      }));

      const { error } = await supabase.from('services_products').insert(items);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services_products', selectedBranchId] });
      toast({ title: 'CSV uploaded successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error uploading CSV', description: error.message, variant: 'destructive' });
    },
  });

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        uploadCSVMutation.mutate(results.data);
      },
      error: (error: Error) => {
        toast({ title: 'Error parsing CSV', description: error.message, variant: 'destructive' });
      },
    });
  };

  const handleCreateBranch = () => {
    if (!newBranch.name || !newBranch.address) {
      toast({ title: 'Please fill in all branch details', variant: 'destructive' });
      return;
    }

    const hasWorkingHours = Object.values(workingHours).some(h => h.active);
    if (!hasWorkingHours) {
      toast({ title: 'Please set at least one working day', variant: 'destructive' });
      return;
    }

    createBranchMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Branch Management</h1>
          <p className="text-muted-foreground">Manage clinic branches and their configurations</p>
        </div>
        <Dialog open={isNewBranchOpen} onOpenChange={setIsNewBranchOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Branch
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Branch</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="branch-name">Branch Name</Label>
                  <Input
                    id="branch-name"
                    value={newBranch.name}
                    onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                    placeholder="Downtown Clinic"
                  />
                </div>
                <div>
                  <Label htmlFor="branch-address">Address</Label>
                  <Textarea
                    id="branch-address"
                    value={newBranch.address}
                    onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
                    placeholder="123 Main Street, City"
                    rows={3}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <Label>Working Hours</Label>
                {DAYS_OF_WEEK.map((day, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className="w-28 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={workingHours[index]?.active || false}
                        onChange={(e) =>
                          setWorkingHours({
                            ...workingHours,
                            [index]: {
                              start: workingHours[index]?.start || '09:00',
                              end: workingHours[index]?.end || '17:00',
                              active: e.target.checked,
                            },
                          })
                        }
                        className="rounded"
                      />
                      <span className="text-sm">{day}</span>
                    </div>
                    {workingHours[index]?.active && (
                      <>
                        <Input
                          type="time"
                          value={workingHours[index]?.start || '09:00'}
                          onChange={(e) =>
                            setWorkingHours({
                              ...workingHours,
                              [index]: { ...workingHours[index], start: e.target.value, active: true },
                            })
                          }
                          className="w-32"
                        />
                        <span className="text-sm">to</span>
                        <Input
                          type="time"
                          value={workingHours[index]?.end || '17:00'}
                          onChange={(e) =>
                            setWorkingHours({
                              ...workingHours,
                              [index]: { ...workingHours[index], end: e.target.value, active: true },
                            })
                          }
                          className="w-32"
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>

              <Button onClick={handleCreateBranch} disabled={createBranchMutation.isPending}>
                {createBranchMutation.isPending ? 'Creating...' : 'Create Branch'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {branchesLoading ? (
          <div>Loading branches...</div>
        ) : branches.length === 0 ? (
          <Card className="md:col-span-3">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No branches yet. Create your first branch to get started.</p>
            </CardContent>
          </Card>
        ) : (
          branches.map((branch) => (
            <Card
              key={branch.id}
              className={`cursor-pointer transition-all ${
                selectedBranchId === branch.id ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => setSelectedBranchId(branch.id)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {branch.name}
                </CardTitle>
                <CardDescription>{branch.address}</CardDescription>
              </CardHeader>
            </Card>
          ))
        )}
      </div>

      {selectedBranchId && (
        <Tabs defaultValue="working-hours" className="space-y-4">
          <TabsList>
            <TabsTrigger value="working-hours">
              <Clock className="h-4 w-4 mr-2" />
              Working Hours
            </TabsTrigger>
            <TabsTrigger value="services">
              <Package className="h-4 w-4 mr-2" />
              Services & Products
            </TabsTrigger>
          </TabsList>

          <TabsContent value="working-hours">
            <Card>
              <CardHeader>
                <CardTitle>Working Hours</CardTitle>
                <CardDescription>View working hours for this branch</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Start Time</TableHead>
                      <TableHead>End Time</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branchWorkingHours.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No working hours configured
                        </TableCell>
                      </TableRow>
                    ) : (
                      branchWorkingHours.map((hour) => (
                        <TableRow key={hour.id}>
                          <TableCell className="font-medium">{DAYS_OF_WEEK[hour.day_of_week]}</TableCell>
                          <TableCell>{hour.start_time}</TableCell>
                          <TableCell>{hour.end_time}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                hour.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {hour.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="services">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Services & Products</CardTitle>
                    <CardDescription>Upload CSV to add services and products</CardDescription>
                  </div>
                  <div>
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={handleCSVUpload}
                      className="hidden"
                      id="csv-upload"
                    />
                    <Label htmlFor="csv-upload" className="cursor-pointer">
                      <Button asChild>
                        <span>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload CSV
                        </span>
                      </Button>
                    </Label>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Treatments</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {servicesProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No services or products yet. Upload a CSV to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      servicesProducts.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{item.code}</TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell>${item.price.toFixed(2)}</TableCell>
                          <TableCell>{item.number_of_treatments || '-'}</TableCell>
                          <TableCell>{item.type}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                item.category === 'Service'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {item.category}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
