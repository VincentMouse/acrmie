import { BarChart3, Users, HeadphonesIcon, TrendingUp } from 'lucide-react';
import { TelesalesReport } from './reports/TelesalesReport';
import { CustomerServiceReport } from './reports/CustomerServiceReport';
import { MarketingReport } from './reports/MarketingReport';
import { OverallReport } from './reports/OverallReport';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export function Reports() {
  const reportSections = [
    {
      value: 'overall',
      title: 'Overall',
      description: 'Complete overview of all departments',
      icon: BarChart3,
      color: 'text-blue-500',
      component: <OverallReport />,
    },
    {
      value: 'telesales',
      title: 'Telesales',
      description: 'Team performance and conversion rates',
      icon: Users,
      color: 'text-green-500',
      component: <TelesalesReport />,
    },
    {
      value: 'customer_service',
      title: 'Customer Service',
      description: 'Appointment confirmations and check-ins',
      icon: HeadphonesIcon,
      color: 'text-purple-500',
      component: <CustomerServiceReport />,
    },
    {
      value: 'marketing',
      title: 'Marketing',
      description: 'Lead distribution and marketer performance',
      icon: TrendingUp,
      color: 'text-orange-500',
      component: <MarketingReport />,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports & Analytics</h1>
        <p className="text-muted-foreground mt-1">Expand a report type to view detailed metrics</p>
      </div>

      <Accordion type="single" collapsible className="w-full space-y-4">
        {reportSections.map((section) => {
          const Icon = section.icon;
          return (
            <AccordionItem key={section.value} value={section.value} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-4">
                  <Icon className={`h-6 w-6 ${section.color}`} />
                  <div className="text-left">
                    <div className="font-semibold">{section.title}</div>
                    <div className="text-sm text-muted-foreground">{section.description}</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                {section.component}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
