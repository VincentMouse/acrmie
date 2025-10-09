import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useRoleView } from './useRoleView';

export type UserRole = 'admin' | 'sales_manager' | 'tele_sales' | 'customer_service' | 'view_only';

export function useUserRole() {
  const { user } = useAuth();
  const { viewAsRole } = useRoleView();

  const { data: actualRoles, isLoading } = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) throw error;
      return data.map(r => r.role as UserRole);
    },
    enabled: !!user?.id,
  });

  // If viewing as a specific role, use that instead of actual roles
  const effectiveRoles = viewAsRole ? [viewAsRole] : (actualRoles ?? []);

  const hasRole = (role: UserRole) => effectiveRoles.includes(role);

  const isAdmin = hasRole('admin');
  const isSalesManager = hasRole('sales_manager');
  const isTeleSales = hasRole('tele_sales');
  const isCustomerService = hasRole('customer_service');
  const isViewOnly = hasRole('view_only');

  return {
    roles: effectiveRoles,
    actualRoles: actualRoles ?? [],
    hasRole,
    isAdmin,
    isSalesManager,
    isTeleSales,
    isCustomerService,
    isViewOnly,
    isLoading,
  };
}
