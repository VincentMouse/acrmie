import { useParams, Navigate } from 'react-router-dom';
import { TelesalesReport } from './reports/TelesalesReport';
import { CustomerServiceReport } from './reports/CustomerServiceReport';
import { MarketingReport } from './reports/MarketingReport';
import { OverallReport } from './reports/OverallReport';
import { AgentsActivityReport } from './reports/AgentsActivityReport';

export function Reports() {
  const { reportType } = useParams<{ reportType: string }>();

  const reportComponents: Record<string, { component: JSX.Element; title: string }> = {
    'overall': { component: <OverallReport />, title: 'Overall Report' },
    'telesales': { component: <TelesalesReport />, title: 'Telesales Report' },
    'customer-service': { component: <CustomerServiceReport />, title: 'Customer Service Report' },
    'marketing': { component: <MarketingReport />, title: 'Marketing Report' },
    'agents-activity': { component: <AgentsActivityReport />, title: 'Agents Activity' },
  };

  if (!reportType || !reportComponents[reportType]) {
    return <Navigate to="/dashboard/reports/overall" replace />;
  }

  const { component, title } = reportComponents[reportType];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
      </div>
      {component}
    </div>
  );
}
