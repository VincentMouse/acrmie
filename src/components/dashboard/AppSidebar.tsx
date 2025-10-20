import { NavLink, useLocation } from 'react-router-dom';
import { Users, UserPlus, FileText, Calendar, Building2, Building, BarChart3, ChevronDown, TrendingUp, HeadphonesIcon, Activity } from 'lucide-react';
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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { isAdmin, isSalesManager, isTeleSales, isCustomerService, isOnlineSales, isViewOnly } = useUserRole();
  
  const isCollapsed = state === 'collapsed';
  
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'bg-muted text-primary font-medium' : 'hover:bg-muted/50';

  const menuItems = [
    { title: 'Lead Ingestion', url: '/dashboard/ingestion', icon: UserPlus, show: isAdmin || isSalesManager || isOnlineSales },
    { title: 'Leads Management', url: '/dashboard/leads', icon: FileText, show: isAdmin || isSalesManager || isOnlineSales || isViewOnly },
    { title: 'My Assigned Leads', url: '/dashboard/lead-management', icon: FileText, show: isAdmin || isTeleSales },
    { title: 'Appointments', url: '/dashboard/appointments', icon: Calendar, show: isTeleSales || isCustomerService || isAdmin || isSalesManager || isOnlineSales || isViewOnly },
    { title: 'Customers', url: '/dashboard/customers', icon: Building2, show: !isOnlineSales },
    { title: 'Branch Management', url: '/dashboard/branches', icon: Building, show: isAdmin || isSalesManager },
    { title: 'User Management', url: '/dashboard/users', icon: Users, show: isAdmin },
  ];

  const reportSubItems = isOnlineSales 
    ? [
        { title: 'Online Sales', url: '/dashboard/reports/online-sales', icon: UserPlus },
      ]
    : [
        { title: 'Overall', url: '/dashboard/reports/overall', icon: BarChart3 },
        { title: 'Telesales', url: '/dashboard/reports/telesales', icon: Users },
        { title: 'Customer Service', url: '/dashboard/reports/customer-service', icon: HeadphonesIcon },
        { title: 'Marketing', url: '/dashboard/reports/marketing', icon: TrendingUp },
        { title: 'Agents Activity', url: '/dashboard/reports/agents-activity', icon: Activity },
        { title: 'Online Sales', url: '/dashboard/reports/online-sales', icon: UserPlus },
      ];

  const visibleItems = menuItems.filter(item => item.show);
  const showReports = isAdmin || isSalesManager || isOnlineSales;
  const isReportsActive = location.pathname.startsWith('/dashboard/reports');

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
              
              {/* Reports Collapsible Menu */}
              {showReports && (
                <Collapsible defaultOpen={isReportsActive} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className={isReportsActive ? 'bg-muted text-primary font-medium' : ''}>
                        <BarChart3 className={isCollapsed ? 'h-5 w-5' : 'mr-3 h-5 w-5'} />
                        {!isCollapsed && <span>Reports</span>}
                        {!isCollapsed && <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    {!isCollapsed && (
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {reportSubItems.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild>
                                <NavLink to={subItem.url} className={getNavCls}>
                                  <subItem.icon className="mr-2 h-4 w-4" />
                                  <span>{subItem.title}</span>
                                </NavLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    )}
                  </SidebarMenuItem>
                </Collapsible>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>
    </Sidebar>
  );
}
