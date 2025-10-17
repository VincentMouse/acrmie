import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TelesalesReport } from './reports/TelesalesReport';
import { CustomerServiceReport } from './reports/CustomerServiceReport';
import { MarketingReport } from './reports/MarketingReport';
import { OverallReport } from './reports/OverallReport';

export function Reports() {
  const [reportType, setReportType] = useState<'telesales' | 'customer_service' | 'marketing' | 'overall'>('overall');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1">View performance metrics and insights</p>
        </div>
        <Select value={reportType} onValueChange={(value: any) => setReportType(value)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select report type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="overall">Overall</SelectItem>
            <SelectItem value="telesales">Telesales</SelectItem>
            <SelectItem value="customer_service">Customer Service</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {reportType === 'telesales' && <TelesalesReport />}
      {reportType === 'customer_service' && <CustomerServiceReport />}
      {reportType === 'marketing' && <MarketingReport />}
      {reportType === 'overall' && <OverallReport />}
    </div>
  );
}
