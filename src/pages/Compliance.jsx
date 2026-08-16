import React, { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SuppressionsTab from '@/components/compliance/SuppressionsTab';
import AuditLogTab from '@/components/compliance/AuditLogTab';
import { TableSkeleton } from '@/components/common/Skeletons';

export default function Compliance() {
  const [data, setData] = useState(null);

  useEffect(() => {
    Promise.all([
      api.entities.Suppression.list('-created_at', 500),
      api.entities.AuditLog.list('-timestamp', 500)
    ]).then(([suppressions, logs]) => setData({ suppressions, logs }));
  }, []);

  if (!data) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-base font-semibold text-slate-900">Compliance</h1>
        <TableSkeleton rows={10} columns={6} />
      </div>
    );
  }

  const now = Date.now();
  const active = data.suppressions.filter((s) => !s.expires_at || new Date(s.expires_at).getTime() > now);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-base font-semibold text-slate-900">Compliance</h1>
      <Tabs defaultValue="suppressions">
        <TabsList className="bg-white border border-slate-200 h-9">
          <TabsTrigger value="suppressions" className="text-xs data-[state=active]:bg-slate-100">Suppressions</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs data-[state=active]:bg-slate-100">Audit Log</TabsTrigger>
        </TabsList>
        <TabsContent value="suppressions" className="mt-4"><SuppressionsTab suppressions={active} /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditLogTab logs={data.logs} /></TabsContent>
      </Tabs>
    </div>
  );
}