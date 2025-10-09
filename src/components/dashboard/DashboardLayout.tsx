import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useRoleView } from '@/hooks/useRoleView';
import { Button } from '@/components/ui/button';
import { LogOut, User, ChevronDown } from 'lucide-react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
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
  const { roles, actualRoles } = useUserRole();
  const { viewAsRole, setViewAsRole, isViewingAsRole } = useRoleView();

  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    sales_manager: 'Sales Manager',
    tele_sales: 'Tele Sales',
    customer_service: 'Customer Service',
    view_only: 'View Only',
  };

  const allPossibleRoles = ['admin', 'sales_manager', 'tele_sales', 'customer_service', 'view_only'];

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
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4" />
                  <div>
                    <div className="font-medium">{user?.email}</div>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        {isViewingAsRole && <span className="text-primary">Viewing as: </span>}
                        {roles.map(r => roleLabels[r] || r).join(', ')}
                        <ChevronDown className="w-3 h-3" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-popover z-50">
                        <DropdownMenuLabel>View Dashboard As</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => setViewAsRole(null)}
                          className={!isViewingAsRole ? 'bg-muted' : ''}
                        >
                          My Actual Role{actualRoles.length > 0 && ` (${actualRoles.map(r => roleLabels[r]).join(', ')})`}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {allPossibleRoles.map((role) => (
                          <DropdownMenuItem 
                            key={role}
                            onClick={() => setViewAsRole(role as any)}
                            className={viewAsRole === role ? 'bg-muted' : ''}
                          >
                            {roleLabels[role]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={signOut}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
          </header>
          
          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
