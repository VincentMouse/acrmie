import { useEffect } from 'react';
import { useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { LeadManagement } from '@/components/dashboard/LeadManagement';
import { UserManagement } from '@/components/dashboard/UserManagement';
import { LeadIngestion } from '@/components/dashboard/LeadIngestion';
import { AppointmentManagement } from '@/components/dashboard/AppointmentManagement';

export default function Dashboard() {
  const { user, loading } = useAuth();
  const { isCustomerService, isViewOnly, isLoading: rolesLoading } = useUserRole();
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
  const defaultRoute = (isCustomerService || isViewOnly) ? "/dashboard/appointments" : "/dashboard/leads";

  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Navigate to={defaultRoute} replace />} />
        <Route path="/leads" element={<LeadManagement />} />
        <Route path="/ingestion" element={<LeadIngestion />} />
        <Route path="/appointments" element={<AppointmentManagement />} />
        <Route path="/users" element={<UserManagement />} />
      </Routes>
    </DashboardLayout>
  );
}
