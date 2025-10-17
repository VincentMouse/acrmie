import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart3, Users, HeadphonesIcon, TrendingUp } from 'lucide-react';
import { TelesalesReport } from './reports/TelesalesReport';
import { CustomerServiceReport } from './reports/CustomerServiceReport';
import { MarketingReport } from './reports/MarketingReport';
import { OverallReport } from './reports/OverallReport';

export function Reports() {
  const [reportType, setReportType] = useState<'telesales' | 'customer_service' | 'marketing' | 'overall' | null>(null);

  const reportCards = [
    {
      type: 'overall' as const,
      title: 'Overall',
      description: 'Complete overview of all departments',
      icon: BarChart3,
      color: 'text-blue-500',
    },
    {
      type: 'telesales' as const,
      title: 'Telesales',
      description: 'Team performance and conversion rates',
      icon: Users,
      color: 'text-green-500',
    },
    {
      type: 'customer_service' as const,
      title: 'Customer Service',
      description: 'Appointment confirmations and check-ins',
      icon: HeadphonesIcon,
      color: 'text-purple-500',
    },
    {
      type: 'marketing' as const,
      title: 'Marketing',
      description: 'Lead distribution and marketer performance',
      icon: TrendingUp,
      color: 'text-orange-500',
    },
  ];

  if (reportType) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setReportType(null)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to Reports
          </button>
        </div>

        {reportType === 'telesales' && <TelesalesReport />}
        {reportType === 'customer_service' && <CustomerServiceReport />}
        {reportType === 'marketing' && <MarketingReport />}
        {reportType === 'overall' && <OverallReport />}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports & Analytics</h1>
        <p className="text-muted-foreground mt-1">Select a report type to view detailed metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {reportCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.type}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setReportType(card.type)}
            >
              <CardHeader className="space-y-4">
                <Icon className={`h-8 w-8 ${card.color}`} />
                <div>
                  <CardTitle>{card.title}</CardTitle>
                  <CardDescription className="mt-2">{card.description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
