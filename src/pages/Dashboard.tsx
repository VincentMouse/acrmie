import { useEffect } from 'react';
import { useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { LeadManagement } from '@/components/dashboard/LeadManagement';
import { UserManagement } from '@/components/dashboard/UserManagement';
import { LeadIngestion } from '@/components/dashboard/LeadIngestion';
import { AppointmentManagement } from '@/components/dashboard/AppointmentManagement';
import { Customers } from '@/components/dashboard/Customers';
import { BranchManagement } from '@/components/dashboard/BranchManagement';
import { Reports } from '@/components/dashboard/Reports';


export default function Dashboard() {
  const { user, loading } = useAuth();
  const { isAdmin, isSalesManager, isOnlineSales, isTeleSales, isCustomerService, isViewOnly, isLoading: rolesLoading } = useUserRole();
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

  // Determine default route based on role
  const defaultRoute = isCustomerService 
    ? "/dashboard/appointments" 
    : isTeleSales
    ? "/dashboard/lead-management"
    : (isViewOnly ? "/dashboard/lead-management" : "/dashboard/leads");

  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Navigate to={defaultRoute} replace />} />
        <Route 
          path="/leads" 
          element={
            (isAdmin || isSalesManager || isOnlineSales || isViewOnly) 
              ? <LeadManagement /> 
              : <Navigate to={defaultRoute} replace />
          } 
        />
        <Route path="/lead-management" element={<LeadManagement />} />
        <Route 
          path="/ingestion" 
          element={
            (isAdmin || isSalesManager || isOnlineSales) 
              ? <LeadIngestion /> 
              : <Navigate to={defaultRoute} replace />
          } 
        />
        <Route path="/appointments" element={<AppointmentManagement />} />
        <Route path="/customers" element={<Customers />} />
        <Route 
          path="/branches" 
          element={
            (isAdmin || isSalesManager) 
              ? <BranchManagement /> 
              : <Navigate to={defaultRoute} replace />
          } 
        />
        <Route path="/reports/:reportType" element={<Reports />} />
        <Route path="/reports" element={<Navigate to="/dashboard/reports/overall" replace />} />
        <Route 
          path="/users" 
          element={
            isAdmin 
              ? <UserManagement /> 
              : <Navigate to={defaultRoute} replace />
          } 
        />
        
      </Routes>
    </DashboardLayout>
  );
}
