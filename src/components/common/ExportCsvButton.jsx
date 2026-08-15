import React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { exportCsv } from '@/lib/csv';

export default function ExportCsvButton({ filename, columns, rows }) {
  const { toast } = useToast();

  const run = () => {
    if (!rows.length) {
      toast({ title: 'Nothing to export', description: 'No rows match the current filters.' });
      return;
    }
    const n = exportCsv(filename, columns, rows);
    toast({ title: 'Export ready', description: `${n} rows written to ${filename}.csv` });
  };

  return (
    <Button size="sm" variant="outline" className="h-8 text-xs bg-white" onClick={run}>
      <Download className="w-3.5 h-3.5" /> Export CSV
    </Button>
  );
}