import { ReactNode, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useRoleView } from '@/hooks/useRoleView';
import { Button } from '@/components/ui/button';
import { LogOut, User, ChevronDown, KeyRound } from 'lucide-react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, signOut } = useAuth();
  const { roles, actualRoles, isAdmin } = useUserRole();
  const { viewAsRole, setViewAsRole, isViewingAsRole } = useRoleView();
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);

  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    sales_manager: 'Sales Manager',
    tele_sales: 'Tele Sales',
    customer_service: 'Customer Service',
    online_sales: 'Online Sales',
    view_only: 'View Only',
  };

  const allPossibleRoles = ['admin', 'sales_manager', 'tele_sales', 'customer_service', 'online_sales', 'view_only'];

  // Check if user needs to change password on first login
  useEffect(() => {
    const checkPasswordStatus = async () => {
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('password_changed')
          .eq('id', user.id)
          .single();

        if (profile && !profile.password_changed) {
          setNeedsPasswordChange(true);
        }
      }
    };

    checkPasswordStatus();
  }, [user]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <header className="bg-card border-b border-border sticky top-0 z-40">
            <div className="px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <h1 className="text-2xl font-bold text-primary">Sales Pipeline CRM</h1>
              </div>
              
              <div className="flex items-center gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <div className="text-left">
                        <div className="text-sm font-medium">{user?.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {isViewingAsRole && <span className="text-primary">Viewing as: </span>}
                          {roles.map(r => roleLabels[r] || r).join(', ')}
                        </div>
                      </div>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-popover z-50">
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsChangePasswordOpen(true)}>
                      <KeyRound className="w-4 h-4 mr-2" />
                      Change Password
                    </DropdownMenuItem>
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>View Dashboard As</DropdownMenuLabel>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setViewAsRole(null);
                          }}
                          className={!isViewingAsRole ? 'bg-accent font-semibold' : ''}
                        >
                          ✓ My Actual Role{actualRoles.length > 0 && ` (${actualRoles.map(r => roleLabels[r]).join(', ')})`}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {allPossibleRoles.map((role) => (
                          <DropdownMenuItem 
                            key={role}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setViewAsRole(role as any);
                            }}
                            className={viewAsRole === role ? 'bg-accent font-semibold' : ''}
                          >
                            {viewAsRole === role && '✓ '}{roleLabels[role]}
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut}>
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>
          
          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </div>

      {/* Password change dialogs */}
      <ChangePasswordDialog 
        open={needsPasswordChange || isChangePasswordOpen} 
        onOpenChange={(open) => {
          setIsChangePasswordOpen(open);
          if (!open && needsPasswordChange) {
            setNeedsPasswordChange(false);
          }
        }}
        isFirstLogin={needsPasswordChange}
      />
    </SidebarProvider>
  );
}
