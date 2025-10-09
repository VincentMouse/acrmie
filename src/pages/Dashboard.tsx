import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { LeadManagement } from '@/components/dashboard/LeadManagement';
import { UserManagement } from '@/components/dashboard/UserManagement';
import { LeadIngestion } from '@/components/dashboard/LeadIngestion';
import { AppointmentManagement } from '@/components/dashboard/AppointmentManagement';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Dashboard() {
  const { user, loading } = useAuth();
  const { isAdmin, isSalesManager, isTeleSales, isCustomerService, isLoading: rolesLoading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading || rolesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Sales Pipeline Dashboard</h1>
        
        <Tabs defaultValue="leads" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="leads">Leads</TabsTrigger>
            {(isAdmin || isSalesManager) && (
              <TabsTrigger value="ingestion">Lead Ingestion</TabsTrigger>
            )}
            {(isTeleSales || isCustomerService || isAdmin || isSalesManager) && (
              <TabsTrigger value="appointments">Appointments</TabsTrigger>
            )}
            {isAdmin && <TabsTrigger value="users">User Management</TabsTrigger>}
          </TabsList>

          <TabsContent value="leads">
            <LeadManagement />
          </TabsContent>

          {(isAdmin || isSalesManager) && (
            <TabsContent value="ingestion">
              <LeadIngestion />
            </TabsContent>
          )}

          {(isTeleSales || isCustomerService || isAdmin || isSalesManager) && (
            <TabsContent value="appointments">
              <AppointmentManagement />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="users">
              <UserManagement />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
