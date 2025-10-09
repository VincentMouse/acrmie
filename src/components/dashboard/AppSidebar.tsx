import { NavLink, useLocation } from 'react-router-dom';
import { Users, UserPlus, FileText, Calendar, Building2, Building } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { isAdmin, isSalesManager, isTeleSales, isCustomerService, isViewOnly } = useUserRole();
  
  const isCollapsed = state === 'collapsed';
  
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'bg-muted text-primary font-medium' : 'hover:bg-muted/50';

  const menuItems = [
    { title: 'Lead Ingestion', url: '/dashboard/ingestion', icon: UserPlus, show: isAdmin || isSalesManager },
    { title: 'Leads Management', url: '/dashboard/leads', icon: FileText, show: isAdmin || isSalesManager || isViewOnly },
    { title: 'My Assigned Leads', url: '/dashboard/lead-management', icon: FileText, show: isAdmin || isTeleSales },
    { title: 'Appointments', url: '/dashboard/appointments', icon: Calendar, show: isTeleSales || isCustomerService || isAdmin || isSalesManager || isViewOnly },
    { title: 'Customers', url: '/dashboard/customers', icon: Building2, show: true },
    { title: 'Branch Management', url: '/dashboard/branches', icon: Building, show: isAdmin || isSalesManager },
    { title: 'User Management', url: '/dashboard/users', icon: Users, show: isAdmin },
  ];

  const visibleItems = menuItems.filter(item => item.show);

  return (
    <Sidebar
      collapsible="icon"
      className="z-50"
    >
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
            Dashboard
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className={getNavCls}>
                      <item.icon className={isCollapsed ? 'h-5 w-5' : 'mr-3 h-5 w-5'} />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
