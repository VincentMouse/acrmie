import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Pencil } from 'lucide-react';
import { z } from 'zod';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'sales_manager', label: 'Sales Manager' },
  { value: 'tele_sales', label: 'Tele Sales' },
  { value: 'customer_service', label: 'Customer Service' },
  { value: 'view_only', label: 'View Only' },
];

const userSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters'),
  role: z.enum(['admin', 'sales_manager', 'tele_sales', 'customer_service', 'view_only']),
});

export function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'tele_sales',
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          user_roles(role)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      // Check for duplicate email first
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('email')
        .eq('email', data.email)
        .single();

      if (existingUser) {
        throw new Error('A user with this email already exists');
      }

      // Call edge function to create user without signing in
      const { data: result, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: data.email,
          password: data.password,
          fullName: data.fullName,
          role: data.role,
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to create user');
      }
      
      if (!result?.success) {
        throw new Error(result?.error || 'User creation failed');
      }
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ 
        title: 'User created',
        description: 'New user has been successfully created',
      });
      setIsOpen(false);
      setFormData({ email: '', password: '', fullName: '', role: 'tele_sales' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create user',
        description: error.message,
        variant: 'destructive'
      });
    },
  });

  const updateRolesMutation = useMutation({
    mutationFn: async ({ userId, roles }: { userId: string; roles: string[] }) => {
      // First, delete all existing roles for the user
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Then insert the new roles
      if (roles.length > 0) {
        const { error: insertError } = await supabase
          .from('user_roles')
          .insert(roles.map(role => ({ 
            user_id: userId, 
            role: role as 'admin' | 'sales_manager' | 'tele_sales' | 'customer_service' | 'view_only'
          })));

        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ 
        title: 'Roles updated',
        description: 'User roles have been successfully updated',
      });
      setEditingUser(null);
      setSelectedRoles([]);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update roles',
        description: error.message,
        variant: 'destructive'
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const validated = userSchema.parse(formData);
      createUserMutation.mutate(validated);
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

  const handleEditRoles = (user: any) => {
    setEditingUser(user);
    setSelectedRoles(user.user_roles?.map((ur: any) => ur.role) || []);
  };

  const handleSaveRoles = () => {
    if (editingUser) {
      updateRolesMutation.mutate({
        userId: editingUser.id,
        roles: selectedRoles,
      });
    }
  };

  const toggleRole = (role: string) => {
    setSelectedRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading users...</div>;
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-muted-foreground mt-1">
            Create and manage staff accounts with role-based permissions
          </p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">User Role *</Label>
                <Select 
                  value={formData.role} 
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending ? 'Creating...' : 'Create User'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.full_name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {user.user_roles?.map((ur: any, idx: number) => (
                      <Badge key={idx} variant="secondary">
                        {ur.role.replace('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditRoles(user)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Roles for {editingUser?.full_name}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Roles</Label>
              <div className="space-y-2">
                {ROLE_OPTIONS.map((role) => (
                  <div key={role.value} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`role-${role.value}`}
                      checked={selectedRoles.includes(role.value)}
                      onChange={() => toggleRole(role.value)}
                      className="h-4 w-4"
                    />
                    <Label htmlFor={`role-${role.value}`} className="cursor-pointer">
                      {role.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSaveRoles}
                disabled={updateRolesMutation.isPending}
                className="flex-1"
              >
                {updateRolesMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditingUser(null)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
